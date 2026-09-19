"""
Tiny local server for the Tutor demo.

- Serves the app files (index.html, app.js, ...).
- POST /say   speaks the text with the Mac's own voice (the `say` command) and
              replies when it has finished speaking. This avoids browser speech bugs.
- POST /stop  stops speaking immediately.

Run:  python3 server.py      (start.command does this for you)
"""
import subprocess
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8321
VOICE = "Daniel"      # British English. List voices with:  say -v '?'
RATE = "175"          # words per minute

current = None        # the `say` process that is speaking right now
lock = threading.Lock()


def stop_speaking():
    global current
    with lock:
        if current and current.poll() is None:
            current.terminate()
        current = None


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        global current
        if self.path == "/say":
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
            self.send_header("Cache-Control", "no-store")   # always load the latest files
        super().end_headers()

    def log_message(self, *args):
        pass                                    # keep the terminal quiet


if __name__ == "__main__":
    import os
    os.chdir(Path(__file__).parent)
    print(f"Tutor is running at http://localhost:{PORT}  (close this window to stop it)")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
