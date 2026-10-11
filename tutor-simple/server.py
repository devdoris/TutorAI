"""
Tiny local server for the Tutor demo.

- Serves the app files (index.html, app.js, ...) and the rendered audio.
- POST /prepare  renders the tutor's lines to audio files ahead of time and
                 returns a line -> url map. This is what makes the lesson
                 sound fluent: a rendered file starts instantly, where the
                 Mac's `say` command costs about a second of silence per line.
- GET  /voices   the voices available: Nigerian English first, then any voice
                 you have recorded yourself.
- POST /record   saves one line recorded in your own voice (record.html), under
                 the same content-addressed name the renderer would have used,
                 so the app plays it without knowing the difference.
- POST /say      fallback: speaks with the Mac's own voice and replies when it
                 has finished. Used when a line has not been rendered yet.
- GET  /icon     ?ref=collection:name — an SVG icon from Iconify's collections
                 (simple-icons, mdi, tabler, …), fetched once and kept under
                 icons/ so a lesson never needs the network for it again.
- POST /stop     stops speaking immediately.

Run:  python3 server.py      (start.command does this for you)
"""
import json
import subprocess
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8321
HERE = Path(__file__).parent

# The Mac fallback voice. Tessa is South African — the nearest thing macOS
# ships to a Nigerian voice. The rendered voices below are the real ones.
VOICE = "Tessa"
RATE = "175"          # words per minute

# Microsoft's neural voices, which need no account or API key. Nigerian English
# first, because that is what this is for.
RENDERED_VOICES = [
    {"id": "en-NG-EzinneNeural", "label": "Ezinne — Nigerian English (female)"},
    {"id": "en-NG-AbeoNeural", "label": "Abeo — Nigerian English (male)"},
    {"id": "en-KE-ChilembaNeural", "label": "Chilemba — Kenyan English (male)"},
    {"id": "en-KE-AsiliaNeural", "label": "Asilia — Kenyan English (female)"},
    {"id": "en-ZA-LukeNeural", "label": "Luke — South African English (male)"},
    {"id": "en-ZA-LeahNeural", "label": "Leah — South African English (female)"},
    {"id": "en-GB-RyanNeural", "label": "Ryan — British English (male)"},
]
DEFAULT_VOICE = "en-NG-EzinneNeural"
DEFAULT_RATE = "-8%"          # a touch slower than default; this is a tutor

AUDIO = HERE / "audio"
ICONS = HERE / "icons"
ICON_API = "https://api.iconify.design"
# A recorded voice is a folder of audio named the same way the renderer names
# its files, with a marker beside them. Nothing else in the app needs to know
# the difference between a voice that was rendered and one that was spoken.
RECORDED_MARK = ".recorded"


def recorded_voices():
    out = []
    if not AUDIO.exists():
        return out
    for folder in sorted(AUDIO.iterdir()):
        if folder.is_dir() and (folder / RECORDED_MARK).exists():
            name = (folder / RECORDED_MARK).read_text(encoding="utf-8").strip() or folder.name
            count = len(list(folder.glob("*.mp3")))
            out.append({"id": folder.name, "label": f"{name} — your own voice ({count} lines)", "recorded": True})
    return out


def is_recorded(voice):
    return (AUDIO / voice / RECORDED_MARK).exists()

current = None        # the `say` process that is speaking right now
lock = threading.Lock()
render_lock = threading.Lock()


def stop_speaking():
    global current
    with lock:
        if current and current.poll() is None:
            current.terminate()
        current = None


def render(voice, rate, lines):
    """Render any lines not already on disk. Returns (made, total, error)."""
    request = json.dumps({"voice": voice, "rate": rate, "lines": lines})
    # `uv run --with edge-tts` keeps this a no-install app: nothing is added to
    # the system Python, and the dependency is fetched once and cached.
    for command in (["uv", "run", "--quiet", "--with", "edge-tts", "python3", "tts.py"],
                    ["python3", "tts.py"]):
        try:
            proc = subprocess.run(command, input=request, capture_output=True,
                                  text=True, cwd=str(HERE), timeout=600)
        except FileNotFoundError:
            continue
        except subprocess.TimeoutExpired:
            return 0, len(lines), "rendering took too long"

        made = failed = 0
        error = ""
        for row in proc.stdout.splitlines():
            try:
                event = json.loads(row)
            except ValueError:
                continue
            if event.get("event") in ("made", "have"):
                made += 1
            elif event.get("event") == "failed":
                failed += 1
            elif event.get("event") == "error":
                error = event.get("error", "")
        if error:
            return made, len(lines), error
        if made or not failed:
            return made, len(lines), ""
        return made, len(lines), (proc.stderr or "").strip()[:200] or "rendering failed"
    return 0, len(lines), "neither uv nor edge-tts is available"


def ask_model(request):
    """One call to whichever model is connected (see llm.py). Claude needs the
    Anthropic SDK, so it runs llm.py under uv, as render() does for edge-tts;
    every other provider is plain HTTP and runs here. Returns llm.py's reply,
    or {"error": ...}."""
    import llm
    cfg = llm.normalise(request["config"]) if request.get("config") else llm.load_config()
    if not cfg or cfg["provider"] != "anthropic":
        return llm.ask(request)
    for command in (["uv", "run", "--quiet", "--with", "anthropic", "python3", "llm.py"],
                    ["python3", "llm.py"]):
        try:
            proc = subprocess.run(command, input=json.dumps(request), capture_output=True,
                                  text=True, cwd=str(HERE), timeout=120)
        except FileNotFoundError:
            continue
        except subprocess.TimeoutExpired:
            return {"error": "the model took too long"}
        for row in reversed(proc.stdout.splitlines()):
            try:
                return json.loads(row)
            except ValueError:
                continue
        return {"error": (proc.stderr or "no reply from llm.py").strip()[-300:]}
    return {"error": "neither uv nor the anthropic package is available"}


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        global current
        if self.path == "/prepare":
            self.do_prepare()
        elif self.path == "/record":
            self.do_record()
        elif self.path == "/llm":
            self.do_llm()
        elif self.path == "/llm/key":
            self.do_llm_key()
        elif self.path == "/say":
            length = int(self.headers.get("Content-Length", 0))
            text = self.rfile.read(length).decode("utf-8")[:1000]
            stop_speaking()
            with lock:
                current = subprocess.Popen(["say", "-v", VOICE, "-r", RATE, text])
                process = current
            process.wait()                      # reply only when the sentence is finished
            self.reply(200, "done")
        elif self.path == "/stop":
            stop_speaking()
            self.reply(200, "stopped")
        else:
            self.reply(404, "not found")

    def do_GET(self):
        if self.path == "/voices":
            self.json_reply(200, {
                "voices": RENDERED_VOICES + recorded_voices(),
                "default": DEFAULT_VOICE,
                "rate": DEFAULT_RATE,
                "fallback": VOICE
            })
            return
        if self.path.startswith("/recorded?"):
            self.do_recorded()
            return
        if self.path == "/llm":
            import llm
            self.json_reply(200, llm.status())
            return
        if self.path.startswith("/icon?"):
            self.do_icon()
            return
        super().do_GET()

    def from_this_machine(self):
        """The model routes spend money and hold a key, so only a page served
        from this machine may use them. Every response here carries
        Access-Control-Allow-Origin: *, so without this check any website open
        in the same browser could post to localhost and run up the bill."""
        origin = self.headers.get("Origin")
        if origin is None:
            return True                     # curl, or the page itself on some browsers
        host = origin.split("://", 1)[-1].split(":", 1)[0]
        if host in ("localhost", "127.0.0.1"):
            return True
        self.json_reply(403, {"error": "only pages on this machine may use the model"})
        return False

    def do_llm_key(self):
        """Connect a model from the app: {provider, model, base_url, key}, or
        {remove: true}. It is tried with one tiny call and only saved if that
        works. The key is never sent back to the browser."""
        import llm
        if not self.from_this_machine():
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            req = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except ValueError:
            self.json_reply(400, {"error": "not JSON"})
            return
        if req.get("remove"):
            llm.remove_config()
            self.json_reply(200, llm.status())
            return
        cfg = llm.normalise({k: req.get(k) for k in ("provider", "model", "base_url", "key")})
        # Changing the model but not retyping the key keeps the saved key, as
        # long as it is the same provider.
        saved = llm.load_config()
        if not cfg["key"] and saved and saved["provider"] == cfg["provider"]:
            cfg["key"] = saved["key"]
        if any(c.isspace() for c in cfg["key"]):
            self.json_reply(400, {"error": "the key has spaces in it; paste it again"})
            return
        if cfg["provider"] == "anthropic" and cfg["key"] and not cfg["key"].startswith("sk-ant-"):
            self.json_reply(400, {"error": "that does not look like an Anthropic key (they start sk-ant-)"})
            return
        why = llm.problem(cfg)
        if why:
            self.json_reply(400, {"error": why})
            return
        res = ask_model({"system": "Reply with a JSON object: {\"ok\": true}", "prompt": "Are you there?",
                         "effort": "low", "max_tokens": 400, "config": cfg})
        # A reply, or an empty one, proves the key and model name work. Anything
        # else (refused key, unknown model, no network) is reported and not saved.
        if "text" not in res and not str(res.get("error", "")).startswith("empty reply"):
            self.json_reply(400, {"error": "that did not work: " + res.get("error", "no reply")})
            return
        llm.save_config(cfg)
        self.json_reply(200, llm.status())

    def do_llm(self):
        """One question to the model, for the question pipeline in pipeline.js.
        The key stays here; the browser only ever sees the reply."""
        if not self.from_this_machine():
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            req = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except ValueError:
            self.json_reply(400, {"error": "not JSON"})
            return
        res = ask_model({k: req.get(k) for k in ("system", "prompt", "effort", "max_tokens")})
        self.json_reply(200 if "text" in res else 503, res)

    def do_icon(self):
        """An icon from a collection on the internet, kept on disk once seen."""
        import re
        import urllib.parse
        import urllib.request
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        ref = (query.get("ref") or [""])[0].strip().lower()
        m = re.fullmatch(r"([a-z0-9-]+):([a-z0-9-]+)", ref)
        if not m:
            self.json_reply(400, {"error": "an icon is named collection:name, like simple-icons:whatsapp"})
            return
        prefix, name = m.group(1), m.group(2)
        path = ICONS / prefix / (name + ".svg")
        if not path.exists():
            try:
                # The collection refuses Python's default user agent.
                req = urllib.request.Request(f"{ICON_API}/{prefix}/{name}.svg",
                                             headers={"User-Agent": "tutor-simple/1 (+local lesson board)", "Accept": "image/svg+xml"})
                with urllib.request.urlopen(req, timeout=10) as res:
                    body = res.read()
            except Exception as err:          # offline, or no such icon
                self.json_reply(502, {"error": f"could not fetch {ref}: {err}"})
                return
            if not body.lstrip().startswith(b"<svg"):
                self.json_reply(404, {"error": f"no icon called {ref} in that collection"})
                return
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(body)
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "image/svg+xml; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_prepare(self):
        """Render a lesson's lines, and answer with a line -> url map."""
        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except ValueError as err:
            self.json_reply(400, {"error": "bad request: " + str(err)})
            return

        voice = body.get("voice") or DEFAULT_VOICE
        rate = body.get("rate") or DEFAULT_RATE
        lines = [t for t in body.get("lines", []) if isinstance(t, str) and t.strip()]
        if not lines:
            self.json_reply(200, {"urls": {}, "made": 0, "total": 0})
            return

        import tts
        urls = {}
        made = 0
        error = ""
        spoken = 0

        if is_recorded(voice):
            # Your own recordings come first. Anything you have not recorded yet
            # falls back to the rendered voice, so a half-recorded lesson still
            # plays all the way through.
            missing = []
            for text in lines:
                path = tts.path_for(voice, "", text)
                if path.exists() and path.stat().st_size > 0:
                    urls[text] = "/audio/{}/{}".format(voice, path.name)
                    spoken += 1
                else:
                    missing.append(text)
            if missing:
                with render_lock:
                    made, _, error = render(DEFAULT_VOICE, DEFAULT_RATE, missing[:400])
                for text in missing:
                    path = tts.path_for(DEFAULT_VOICE, DEFAULT_RATE, text)
                    if path.exists() and path.stat().st_size > 0:
                        urls[text] = "/audio/{}/{}".format(DEFAULT_VOICE, path.name)
        else:
            # One render at a time. Two lessons preparing at once would fight
            # over the same files and the same bandwidth.
            with render_lock:
                made, _, error = render(voice, rate, lines[:400])
            for text in lines:
                path = tts.path_for(voice, rate, text)
                if path.exists() and path.stat().st_size > 0:
                    urls[text] = "/audio/{}/{}".format(voice, path.name)

        self.json_reply(200, {
            "urls": urls, "made": made, "total": len(lines),
            "spoken": spoken, "recorded": is_recorded(voice), "error": error
        })

    def do_recorded(self):
        """Which of these lines are already in your own voice?"""
        from urllib.parse import urlparse, parse_qs
        import tts
        query = parse_qs(urlparse(self.path).query)
        voice = (query.get("voice") or [""])[0]
        if not voice:
            self.json_reply(400, {"error": "which voice?"})
            return
        folder = AUDIO / voice
        self.json_reply(200, {
            "voice": voice,
            "recorded": is_recorded(voice),
            "count": len(list(folder.glob("*.mp3"))) if folder.exists() else 0,
            "key": tts.key(voice, "", "")       # so the page can check its own hashing
        })

    def do_record(self):
        """Save one line spoken in your own voice."""
        length = int(self.headers.get("Content-Length", 0))
        if length > 8 * 1024 * 1024:
            self.json_reply(413, {"error": "that clip is too long"})
            return
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except ValueError as err:
            self.json_reply(400, {"error": "bad request: " + str(err)})
            return

        import base64
        import tempfile
        import tts
        voice = (body.get("voice") or "").strip()
        label = (body.get("label") or voice).strip()
        text = body.get("text") or ""
        audio = body.get("audio") or ""
        if not voice or not text or not audio:
            self.json_reply(400, {"error": "need a voice, a line and some audio"})
            return
        # Keep the folder name to something safe to put on disk.
        if not all(c.isalnum() or c in "-_" for c in voice):
            self.json_reply(400, {"error": "voice name can only use letters, numbers, - and _"})
            return

        folder = AUDIO / voice
        folder.mkdir(parents=True, exist_ok=True)
        (folder / RECORDED_MARK).write_text(label, encoding="utf-8")

        raw = base64.b64decode(audio.split(",")[-1])
        # Browsers record webm or mp4; everything downstream expects mp3, so
        # convert once here rather than teaching the rest of the app about it.
        out = tts.path_for(voice, "", text)
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            tmp.write(raw)
            tmp_name = tmp.name
        try:
            proc = subprocess.run(
                ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", tmp_name,
                 "-af", "silenceremove=start_periods=1:start_silence=0.1:start_threshold=-45dB,"
                        "areverse,silenceremove=start_periods=1:start_silence=0.2:start_threshold=-45dB,areverse,"
                        "loudnorm=I=-16:TP=-1.5:LRA=11",
                 "-c:a", "libmp3lame", "-b:a", "96k", str(out)],
                capture_output=True, text=True, timeout=60)
        except FileNotFoundError:
            self.json_reply(500, {"error": "ffmpeg is not installed, so the clip cannot be converted"})
            return
        except subprocess.TimeoutExpired:
            self.json_reply(500, {"error": "converting the clip took too long"})
            return
        finally:
            Path(tmp_name).unlink(missing_ok=True)

        if not out.exists() or out.stat().st_size == 0:
            self.json_reply(500, {"error": (proc.stderr or "could not convert the clip").strip()[:200]})
            return
        self.json_reply(200, {"url": "/audio/{}/{}".format(voice, out.name), "bytes": out.stat().st_size})

    def json_reply(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def reply(self, code, text):
        body = text.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        if self.command == "GET":
            if self.path.startswith("/audio/") or self.path.startswith("/icon?"):
                # Rendered audio never changes: its name is a hash of the words.
                # Letting the browser keep it is what makes replaying a lesson
                # instant. The same goes for an icon fetched from a collection.
                self.send_header("Cache-Control", "public, max-age=604800, immutable")
            else:
                self.send_header("Cache-Control", "no-store")   # always load the latest files
        # The React build (../tutor-studio) talks to this server too.
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, *args):
        pass                                    # keep the terminal quiet


if __name__ == "__main__":
    import os
    os.chdir(HERE)
    print(f"Tutor is running at http://localhost:{PORT}  (close this window to stop it)")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
