"""
Renders the tutor's lines to audio files, ahead of time.

Why ahead of time: saying a line with the Mac's `say` command costs about a
second of silence before any sound comes out, every single line. Over a
fifty-step lesson that is a minute of dead air and it sounds like stuttering.
A rendered file starts instantly, sounds the same every run, and needs no
network while the lesson is being taught.

Voices come from Microsoft's neural set, which includes Nigerian English
(en-NG-AbeoNeural, en-NG-EzinneNeural). No account or API key is needed.

Files are content-addressed: the name is a hash of voice + rate + text, so
re-rendering a lesson only pays for the lines that actually changed.

Run:  echo '{"voice": "...", "lines": ["..."]}' | python3 tts.py
      (server.py does this for you, through `uv run --with edge-tts`)

Output: one JSON object per line on stdout, so the caller can show progress.
"""
import asyncio
import hashlib
import json
import sys
from pathlib import Path

AUDIO_DIR = Path(__file__).parent / "audio"
CONCURRENCY = 6          # Microsoft's endpoint is fine with this; more gets throttled


def key(voice: str, rate: str, text: str) -> str:
    return hashlib.sha1(f"{voice}|{rate}|{text}".encode("utf-8")).hexdigest()[:20]


def path_for(voice: str, rate: str, text: str) -> Path:
    return AUDIO_DIR / voice / f"{key(voice, rate, text)}.mp3"


def marks_for(voice: str, rate: str, text: str) -> Path:
    """Where the word timings for a line live, beside its audio."""
    return AUDIO_DIR / voice / f"{key(voice, rate, text)}.json"


def emit(**obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


async def render_one(edge_tts, voice, rate, text, semaphore):
    out = path_for(voice, rate, text)
    marks = marks_for(voice, rate, text)
    # Already rendered, timings and all: nothing to pay for.
    if out.exists() and out.stat().st_size > 0 and marks.exists():
        emit(event="have", key=out.stem, url=f"/audio/{voice}/{out.name}")
        return True

    out.parent.mkdir(parents=True, exist_ok=True)
    async with semaphore:
        for attempt in range(3):
            try:
                comm = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
                # Stream rather than save, because the stream also reports when
                # each word is spoken. Those timings are what let the tutor
                # point at a thing exactly as it says its name, instead of
                # sweeping along on a guessed timer.
                audio = bytearray()
                words = []
                async for chunk in comm.stream():
                    if chunk["type"] == "audio":
                        audio.extend(chunk["data"])
                    elif chunk["type"].endswith("Boundary"):
                        words.append({
                            # edge-tts reports in 100-nanosecond ticks.
                            "at": round(chunk["offset"] / 10000),
                            "ms": round(chunk["duration"] / 10000),
                            "word": chunk["text"]
                        })
                if not audio:
                    raise RuntimeError("empty audio")
                # Write to a temporary name so a half-written file is never
                # mistaken for a cached one on the next run.
                tmp = out.with_suffix(".part")
                tmp.write_bytes(bytes(audio))
                tmp.replace(out)
                marks.write_text(json.dumps(words), encoding="utf-8")
                emit(event="made", key=out.stem, url=f"/audio/{voice}/{out.name}")
                return True
            except Exception as err:                      # noqa: BLE001
                if attempt == 2:
                    emit(event="failed", key=out.stem, text=text[:60], error=str(err))
                    return False
                await asyncio.sleep(0.6 * (attempt + 1))
    return False


async def main():
    try:
        import edge_tts
    except ImportError:
        emit(event="error", error="edge-tts is not installed; falling back to the Mac voice")
        return 1

    request = json.load(sys.stdin)
    voice = request.get("voice") or "en-NG-AbeoNeural"
    rate = request.get("rate") or "+0%"
    lines = [t for t in request.get("lines", []) if isinstance(t, str) and t.strip()]

    # The same line often appears twice in a script (a prompt read after the
    # tutor's own words). Render it once.
    unique = list(dict.fromkeys(lines))
    emit(event="start", voice=voice, rate=rate, total=len(unique))

    semaphore = asyncio.Semaphore(CONCURRENCY)
    results = await asyncio.gather(*(render_one(edge_tts, voice, rate, t, semaphore) for t in unique))
    emit(event="done", ok=sum(1 for r in results if r), total=len(unique))
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()) or 0)
