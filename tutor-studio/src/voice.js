// ─────────────────────────────────────────────────────────────────────────────
// THE TUTOR'S VOICE.
//
// Three ways to say a line, best first:
//
//  1. A rendered file. The local renderer (../tutor-simple/server.py, reached
//     through the dev server's proxy) renders every line of a lesson ahead of
//     time with a Nigerian English voice. Playback starts in milliseconds and
//     sounds identical every run.
//  2. The Mac's own voice, through the same server. Reliable, but it costs
//     about a second of silence before each line — which is what made the
//     lesson sound like it was stuttering.
//  3. The browser's speech engine, when no renderer is running.
//
// This is view-side: it decides how a line is spoken, never what is said.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeScript, boardFromScript, applyToBoard } from "./engine/script.js";

// Every line the tutor could say while teaching this script — including the
// replies to the expected answers, so marking an answer is as instant as the
// rest of the lesson. Must stay in step with the feedback wording in App.jsx.
export function linesFor(raw) {
  const s = normalizeScript(raw);
  const out = [introFor(s)];
  let board = boardFromScript(s);
  for (const step of s.steps) {
    board = applyToBoard(board, step);
    if (step.text) out.push(step.text);
    if (step.do !== "ask") continue;
    const a = step.ask;
    if (a.prompt) out.push(a.prompt);
    if (a.hint) {
      out.push("Not yet. " + a.hint);
      out.push("A hint, not the answer: " + a.hint);
    }
    const first = [].concat(a.expect)[0];
    if (a.type === "type") out.push("Yes — " + String(first).trim() + " is right.");
    if (a.type === "place") out.push("All placed correctly.");
    if (a.type === "select") {
      const thing = board.objects.concat(board.slots).find(o => o.id === first);
      out.push(thing && thing.sub && thing.label
        ? "Correct. " + thing.label + " is in the " + thing.sub.toLowerCase() + "."
        : "Correct. That is the one.");
    }
  }
  return out;
}

export function introFor(script) {
  return "Let us learn " + String(script.title || "this objective").toLowerCase() +
    ". I will teach it aloud, and stop whenever you want to answer or ask.";
}

const sleep = ms => new Promise(r => setTimeout(r, Math.max(16, ms)));

export class Voice {
  /**
   * @param onNote    (text) => void   something the person should know
   * @param settings  () => ({ enabled, rate, browserVoiceName, pace })
   */
  constructor({ onNote, settings, onSpeaking }) {
    this.onNote = onNote || (() => {});
    // Drives the tutor's mouth, so it only moves while there is sound.
    this.onSpeaking = onSpeaking || (() => {});
    this.settings = settings || (() => ({ enabled: true, rate: 0.85, pace: 1 }));
    this.server = false;          // is the renderer there?
    this.id = "";                 // which rendered voice
    this.serverRate = "-8%";
    this.list = [];
    this.urls = Object.create(null);
    // How long each line takes, and when each of its words is spoken. The
    // renderer saves the timings beside the audio; they are what let the engine
    // point at a thing exactly as it names it.
    this.lengths = Object.create(null);
    this.words = Object.create(null);
    this.seq = 0;
    this.unlocked = false;        // browsers need one click before any sound
    this.player = typeof Audio === "undefined" ? null : new Audio();
    if (this.player) this.player.preload = "auto";
  }

  // Is there a local renderer? Without one everything falls back to the
  // browser's own speech engine, and nothing else changes.
  async discover() {
    try {
      const r = await fetch("/voices");
      if (!r.ok) return false;
      const info = await r.json();
      this.server = true;
      this.list = info.voices || [];
      this.serverRate = info.rate || this.serverRate;
      let saved = "";
      try { saved = localStorage.getItem("tutor-voice") || ""; } catch { /* storage off */ }
      this.id = (this.list.some(v => v.id === saved) && saved) || info.default;
      return true;
    } catch {
      return false;
    }
  }

  setVoice(id) {
    this.id = id;
    try { localStorage.setItem("tutor-voice", id); } catch { /* storage off */ }
    // Rendered files are per voice, and so are their timings.
    this.urls = Object.create(null);
    this.lengths = Object.create(null);
    this.words = Object.create(null);
  }

  // How long a line takes to say, in milliseconds. Zero means "no idea".
  duration(text) {
    const url = this.urls[text];
    if (!url || typeof Audio === "undefined") return Promise.resolve(0);
    if (this.lengths[url] !== undefined) return Promise.resolve(this.lengths[url]);
    return new Promise(resolve => {
      let settled = false;
      const done = ms => { if (settled) return; settled = true; this.lengths[url] = ms; resolve(ms); };
      const probe = new Audio();
      probe.preload = "metadata";
      probe.onloadedmetadata = () => done(isFinite(probe.duration) ? Math.round(probe.duration * 1000) : 0);
      probe.onerror = () => done(0);
      probe.src = url;
      setTimeout(() => done(0), 500);   // never hold a lesson up for this
    });
  }

  // When each word of a line is spoken.
  marks(text) {
    const url = this.urls[text];
    if (!url) return Promise.resolve([]);
    if (this.words[url] !== undefined) return Promise.resolve(this.words[url]);
    return fetch(url.replace(/\.mp3$/, ".json"))
      .then(r => (r.ok ? r.json() : []))
      .catch(() => [])
      .then(words => {
        this.words[url] = Array.isArray(words) ? words : [];
        return this.words[url];
      });
  }

  // Render any of these lines that are not already on disk.
  async prepare(lines, label) {
    if (!this.server || !lines || !lines.length) return;
    // The same line can appear twice in a script (a prompt the tutor reads
    // after its own words). Count it once.
    const missing = lines.filter((t, i) => t && !this.urls[t] && lines.indexOf(t) === i);
    if (!missing.length) return;
    this.onNote((label || "Preparing the tutor's voice") + "…");
    try {
      const r = await fetch("/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: this.id, rate: this.serverRate, lines: missing })
      });
      const res = await r.json();
      Object.assign(this.urls, res.urls || {});
      const short = missing.length - Object.keys(res.urls || {}).length;
      this.onNote(res.error
        ? "Could not render the voice (" + res.error + "). Using the browser voice instead."
        : short > 0 ? short + " line(s) could not be rendered; those will use the browser voice." : "");
    } catch (err) {
      this.onNote("Could not reach the voice renderer (" + err.message + "). Using the browser voice.");
    }
  }

  estimate(text) {
    const { rate } = this.settings();
    const words = String(text).trim().split(/\s+/).length;
    return Math.min(12000, 280 + words * (380 / Math.max(0.5, rate || 0.85)));
  }

  speak(text) {
    const { enabled } = this.settings();
    if (!text) return Promise.resolve();
    if (!enabled) return sleep(this.estimate(text) / (this.settings().pace || 1));
    const id = ++this.seq;
    const url = this.urls[text];
    if (url) return this.playFile(url);
    if (this.server) return this.renderThenSpeak(text, id);
    return this.speakWithBrowser(text, id);
  }

  playFile(url) {
    const player = this.player;
    if (!player) return sleep(this.estimate(""));
    return new Promise(resolve => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        player.onended = null;
        player.onerror = null;
        this.onSpeaking(false);
        resolve();
      };
      player.onended = done;
      player.onerror = done;
      try {
        player.src = url;
        player.currentTime = 0;
        this.onSpeaking(true);
        const started = player.play();
        if (started && started.catch) {
          started.catch(() => {
            this.onNote("Click anywhere on the page once to let the browser play the tutor's voice.");
            done();
          });
        }
      } catch {
        done();
      }
    });
  }

  // A line nobody rendered yet — usually feedback with the learner's own words
  // in it. Render it now so it is in the right voice, and keep it for next time.
  async renderThenSpeak(text, id) {
    await this.prepare([text]);
    if (id !== this.seq) return;
    const url = this.urls[text];
    if (url) return this.playFile(url);
    return this.speakWithBrowser(text, id);
  }

  speakWithBrowser(text, id) {
    const synth = typeof window !== "undefined" && window.speechSynthesis;
    const { rate, browserVoiceName } = this.settings();
    if (!synth) return sleep(this.estimate(text));
    if (!this.unlocked) {
      this.pending = text;
      this.onNote("Tap anywhere once to let the browser start the tutor's voice.");
      return sleep(this.estimate(text));
    }
    return new Promise(resolve => {
      let done = false;
      const finish = () => { if (done) return; done = true; this.onSpeaking(false); resolve(); };
      try {
        const u = new SpeechSynthesisUtterance(text);
        const list = synth.getVoices();
        const v = list.find(x => x.name === browserVoiceName) || list.find(x => /^en/i.test(x.lang));
        if (v) { u.voice = v; u.lang = v.lang; }
        u.volume = 1;
        u.rate = rate || 0.85;
        u.pitch = 1.02;
        u.onstart = () => this.onSpeaking(true);
        u.onend = finish;
        u.onerror = finish;
        // No synth.cancel() here: cancelling immediately before speaking is
        // what clipped the first syllable of every other line on Chrome.
        synth.speak(u);
      } catch (e) {
        this.onNote("Voice failed to start: " + e.message);
        setTimeout(finish, this.estimate(text));
        return;
      }
      // A generous backstop. It must never fire while a sentence is still being
      // spoken, because the next line would then talk over this one — that was
      // the skipping.
      setTimeout(() => { if (id === this.seq) finish(); }, this.estimate(text) * 2.5 + 2500);
    });
  }

  // Browsers only allow sound after a gesture. Called on the first click.
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    const synth = typeof window !== "undefined" && window.speechSynthesis;
    if (synth) {
      try {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        synth.speak(u);
      } catch { /* ignore */ }
    }
    const t = this.pending;
    this.pending = null;
    if (t) this.speak(t);
  }

  stop() {
    this.seq++;
    this.onSpeaking(false);
    try { if (this.player) this.player.pause(); } catch { /* nothing playing */ }
    if (this.server) fetch("/stop", { method: "POST" }).catch(() => {});
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  }
}
