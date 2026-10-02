// ─────────────────────────────────────────────────────────────────────────────
// THE INTAKE CHANNEL.
//
// "The end goal is the execution engine is able to receive any script at any
//  time and render it."
//
// Every way a script can arrive from outside this app funnels through here, gets
// validated against the format, and is handed to the runner. The generating side
// can be a file, another window, a URL, or a service we have not built yet — the
// engine does not change when a new source appears, only this file does.
// ─────────────────────────────────────────────────────────────────────────────

import { validateScript } from "./script.js";

export const SOURCES = ["file", "postMessage", "url", "api", "paste", "drop", "generator"];

export class Intake {
  /**
   * @param onScript (script, source) => void   accepted, normalized script
   * @param onReject (errors, source) => void
   * @param onNote   (text) => void             human-readable log line
   */
  constructor({ onScript, onReject, onNote }) {
    this.onScript = onScript;
    this.onReject = onReject || (() => {});
    this.onNote = onNote || (() => {});
    this.log = [];
    this.bound = false;
  }

  // The single door. Everything below calls this.
  accept(raw, source) {
    const res = validateScript(raw);
    const stamp = new Date().toLocaleTimeString();
    if (!res.ok) {
      this.record({ at: stamp, source, ok: false, title: (raw && raw.title) || "—", detail: res.errors.join(" ") });
      this.onReject(res.errors, source);
      return null;
    }
    res.script.meta = Object.assign({}, res.script.meta, { source, generatedAt: new Date().toISOString() });
    this.record({
      at: stamp, source, ok: true, title: res.script.title,
      detail: res.script.steps.length + " steps" + (res.warnings.length ? " · " + res.warnings.length + " warning(s)" : "")
    });
    res.warnings.forEach(w => this.onNote(w));
    this.onScript(res.script, source);
    return res.script;
  }

  acceptText(text, source) {
    try {
      return this.accept(JSON.parse(text), source);
    } catch (e) {
      this.record({ at: new Date().toLocaleTimeString(), source, ok: false, title: "—", detail: "Not valid JSON: " + e.message });
      this.onReject(["Not valid JSON: " + e.message], source);
      return null;
    }
  }

  record(entry) {
    this.log = [entry].concat(this.log).slice(0, 25);
    this.onNote("");
  }

  // ── Channels ───────────────────────────────────────────────────────────────
  open() {
    if (this.bound || typeof window === "undefined") return;
    this.bound = true;

    // 1. Another window or an embedding page:
    //    target.postMessage({ type: "tutor:script", script: {...} }, "*")
    this.onMessage = e => {
      const d = e && e.data;
      if (!d || d.type !== "tutor:script" || !d.script) return;
      this.accept(d.script, "postMessage");
    };
    window.addEventListener("message", this.onMessage);

    // 2. A console or another script on the page:
    //    TutorEngine.run({...})
    window.TutorEngine = {
      run: script => this.accept(script, "api"),
      runJSON: text => this.acceptText(text, "api"),
      fromUrl: url => this.fromUrl(url),
      version: "tutor-script/1"
    };

    // 3. Drop a .json file anywhere on the page.
    this.onDragOver = e => { e.preventDefault(); };
    this.onDrop = e => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      e.preventDefault();
      const r = new FileReader();
      r.onload = () => this.acceptText(String(r.result), "drop");
      r.readAsText(file);
    };
    window.addEventListener("dragover", this.onDragOver);
    window.addEventListener("drop", this.onDrop);

    // 4. ?script=<url> on the address bar — how a curriculum service would hand
    //    a generated lesson to a learner's tab.
    const q = new URLSearchParams(window.location.search).get("script");
    if (q) this.fromUrl(q);
  }

  async fromUrl(url) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return this.accept(await r.json(), "url");
    } catch (e) {
      this.record({ at: new Date().toLocaleTimeString(), source: "url", ok: false, title: url, detail: e.message });
      this.onReject([String(e.message)], "url");
      return null;
    }
  }

  close() {
    if (!this.bound) return;
    window.removeEventListener("message", this.onMessage);
    window.removeEventListener("dragover", this.onDragOver);
    window.removeEventListener("drop", this.onDrop);
    delete window.TutorEngine;
    this.bound = false;
  }
}
