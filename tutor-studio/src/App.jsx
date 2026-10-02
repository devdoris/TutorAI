import { Component } from "react";
import { CURRICULA, KINDS } from "./data/lessons.js";
import PlantCell, { CELL_LEADERS } from "./PlantCell.jsx";
import { markPath, markColour, MARK_W } from "./board/chalk.js";
import { ICONS } from "./board/icons.js";

// ── The two layers ───────────────────────────────────────────────────────────
// Execution: takes a script and renders it. Knows nothing about curricula.
import { ScriptRunner } from "./engine/runner.js";
import { Intake } from "./engine/intake.js";
import { DIRECTIVES } from "./engine/script.js";
// Generation: produces scripts. Never imported by the engine.
import { LIBRARY, catalogue, byId } from "./generate/library.js";
import { generateAnswerScript, explainAtLevel, breakDownStep, isConfusion } from "./generate/answers.js";
// How a line is spoken (a rendered Nigerian voice, or the browser's own).
import { Voice, linesFor, introFor } from "./voice.js";

const STORE = "tutor-studio-v4";
const norm = s => String(s).toLowerCase().replace(/[\s,]/g, "").trim();
const BX = x => 252 + (x / 100) * 708;
const BY = y => 42 + (y / 100) * 534;

const EMPTY = {
  scriptId: "", title: "", subject: "", objective: "", level: 2, concept: "", source: "", faq: [],
  board: { kind: "blank", heading: "", sub: "", photo: false, objects: [], slots: [], tray: [] },
  caption: "", focus: [], mood: "idle", question: "", ask: null,
  status: "idle", cursor: -1, total: 0, interjecting: false, returnTo: ""
};

// A mark draws itself on over its own length. The length is only knowable once
// the path is in the document, and a dash set in the stylesheet cannot know it:
// a fixed one repeats across a long stroke and cuts it into pieces.
function drawOn(el) {
  if (!el || el.dataset.drawn) return;      // marks outlive many renders; draw once
  el.dataset.drawn = "1";
  const len = el.getTotalLength();
  el.style.strokeDasharray = len;
  el.style.strokeDashoffset = len;
  el.getBoundingClientRect();               // let the browser see where it started
  el.style.transition = "stroke-dashoffset .62s ease-out";
  el.style.strokeDashoffset = "0";
}

// The design builds inline styles as CSS strings; this turns them into React style objects.
const styleCache = new Map();
function css(str) {
  if (!str) return undefined;
  let out = styleCache.get(str);
  if (out) return out;
  out = {};
  str.split(";").forEach(decl => {
    const i = decl.indexOf(":");
    if (i < 0) return;
    const prop = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    if (!prop) return;
    out[prop.startsWith("--") ? prop : prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = val;
  });
  if (styleCache.size > 2000) styleCache.clear();
  styleCache.set(str, out);
  return out;
}

export default class App extends Component {
  state = {
    screen: "picker", curriculum: "NERDC",
    lessonId: "numbers-read-l2",
    engine: EMPTY, flash: "", nod: false,
    progress: {}, received: [],
    typed: "", placements: {}, selectedChip: null, feedback: {}, usedHint: false,
    askOpen: false, askText: "", thinking: false, drag: null,
    panelOpen: false, consoleOpen: false, jsonText: "", jsonError: "", intake: [],
    voiceNote: "", pace: 1, rate: 0.82, guide: true, voice: true, voiceChosen: false,
    showSub: true, voiceName: "", voices: [], speaking: false, listeningMic: false,
    renderedVoices: [], renderedVoice: "",
    roughPad: null, wiping: false
  };

  componentDidMount() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORE) || "null");
      if (saved) { if (saved.voice === false && !saved.voiceChosen) delete saved.voice; this.setState(saved); }
    } catch { /* storage unavailable */ }

    // ── The tutor's voice ────────────────────────────────────────────────────
    this.voice = new Voice({
      onNote: note => this.setState({ voiceNote: note }),
      onSpeaking: on => this.setState({ speaking: on }),
      settings: () => ({
        enabled: this.state.voice,
        rate: this.state.rate,
        pace: this.state.pace,
        browserVoiceName: this.state.voiceName
      })
    });
    this.voice.discover().then(found => {
      if (!found) return;
      this.setState({ renderedVoices: this.voice.list, renderedVoice: this.voice.id });
      this.prepareCurrent();
    });

    // ── Wire the execution layer to this view ────────────────────────────────
    this.runner = new ScriptRunner({
      // A line the tutor said outside the script — marking an answer, giving a
      // hint — stays up until the script itself says something new. Clearing it
      // on every emit would wipe "Correct!" the moment the engine ticked.
      onState: snap => this.setState(prev => ({
        engine: snap,
        flash: snap.caption !== prev.engine.caption ? "" : prev.flash
      })),
      speak: text => this.voice.speak(text),
      silence: () => this.voice.stop(),
      wait: ms => this.wait(ms),
      duration: text => this.voice.duration(text),
      marks: text => this.voice.marks(text),
      onAsk: ask => this.setState({
        typed: "", feedback: {}, usedHint: false, nod: false,
        placements: ask.type === "place" ? {} : this.state.placements
      }),
      onFinish: () => {
        this.record({ done: true });
        this.flash("That is the whole objective. Your progress is recorded by what you did without help.");
      }
    });

    // ── Open every channel a script can arrive on ────────────────────────────
    this.intake = new Intake({
      onScript: (script, source) => this.receiveScript(script, source),
      onReject: errors => this.setState({ jsonError: errors.join(" ") }),
      onNote: () => this.setState({ intake: this.intake.log.slice() })
    });
    this.intake.open();

    // A script that arrived from outside and was left open last time is still
    // the one to reopen, so look through what was received as well.
    const wanted = (saved && saved.lessonId) || this.state.lessonId;
    const start = byId(wanted)
      || ((saved && saved.received) || []).find(s => s.id === wanted)
      || LIBRARY[0];
    this.runner.load(start, { caption: "Press play and I will start the lesson." });
    this.setState({ lessonId: start.id, jsonText: "" });

    this.loadVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => this.loadVoices();
      [250, 800, 1800].forEach(ms => setTimeout(() => this.loadVoices(), ms));
    } else {
      this.setState({ voiceNote: "This browser has no speech engine, so the tutor cannot speak here." });
    }
    // Browsers only allow sound after a user gesture.
    this.unlock = () => this.voice.unlock();
    window.addEventListener("pointerdown", this.unlock, true);
    window.addEventListener("keydown", this.unlock, true);
  }

  componentDidUpdate(_, prev) {
    if (prev.screen !== this.state.screen) window.scrollTo(0, 0);
    this.trackBoard(prev);
  }

  // Two things have to outlive the board state that ended them: the rough-work
  // pad slides away rather than vanishing, and rubbing the board out is a sweep
  // of the arm, which takes time the engine does not wait for.
  trackBoard(prev) {
    const now = this.state.engine.board || {};
    const was = prev.engine.board || {};
    const nowR = now.rough || { open: false }, wasR = was.rough || { open: false };
    const lines = r => (r.lines || []).join("\u0001");
    const changed = nowR.title !== wasR.title || lines(nowR) !== lines(wasR);
    if (nowR.open && (!wasR.open || changed)) {
      clearTimeout(this._roughTimer);
      this.setState({ roughPad: { title: nowR.title, lines: nowR.lines || [], open: true } });
    } else if (!nowR.open && wasR.open) {
      clearTimeout(this._roughTimer);
      this.setState(st => ({ roughPad: st.roughPad ? Object.assign({}, st.roughPad, { open: false }) : null }));
      this._roughTimer = setTimeout(() => this.setState({ roughPad: null }), 460);
    }

    // A board emptied of a good deal of work was rubbed out, not stepped past.
    const count = bd => (bd.objects || []).length + (bd.slots || []).length;
    if (count(was) >= 2 && count(now) === 0 && !this.state.wiping) {
      this.setState({ wiping: true });
      clearTimeout(this._wipeTimer);
      this._wipeTimer = setTimeout(() => this.setState({ wiping: false }), 640);
    }
  }

  componentWillUnmount() {
    if (this.runner) this.runner.stopAll();
    if (this.intake) this.intake.close();
    this.endDrag(true);
    if (this.unlock) { window.removeEventListener("pointerdown", this.unlock, true); window.removeEventListener("keydown", this.unlock, true); }
  }

  // ── Voice ──────────────────────────────────────────────────────────────────
  loadVoices() {
    if (!window.speechSynthesis) return;
    const all = window.speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
    if (!all.length) return;
    const pref = ["en-NG", "en-GB", "en-ZA", "en-IN", "en-US"];
    let chosen = this.state.voiceName;
    if (!chosen || !all.some(v => v.name === chosen)) {
      chosen = "";
      for (const p of pref) { const hit = all.find(v => v.lang === p); if (hit) { chosen = hit.name; break; } }
      if (!chosen) chosen = all[0].name;
    }
    this.setState({ voiceNote: "", voices: all.map(v => ({ name: v.name, lang: v.lang })), voiceName: chosen });
  }

  estimate(text) { return this.voice.estimate(text); }
  speak(text) { return this.voice.speak(text); }
  speakAsync(text) { return this.voice.speak(text); }

  // Render the lines of whatever is loaded, so playback is instant.
  prepareCurrent() {
    if (!this.runner || !this.runner.script) return Promise.resolve();
    return this.voice.prepare(linesFor(this.runner.script));
  }

  wait(ms) { return new Promise(res => setTimeout(res, Math.max(16, ms / this.state.pace))); }

  // A line the tutor says that is not part of the script — marking an answer,
  // giving a hint. It is shown until the script's next line replaces it.
  flash(text, extra) {
    this.setState(Object.assign({ flash: text }, extra || {}));
    return this.speak(text);
  }

  // ── Persistence ────────────────────────────────────────────────────────────
  persist(patch) {
    const s = Object.assign({}, this.state, patch || {});
    const keep = {
      progress: s.progress, received: s.received, curriculum: s.curriculum, lessonId: s.lessonId,
      pace: s.pace, guide: s.guide, voice: s.voice, voiceChosen: s.voiceChosen,
      voiceName: s.voiceName, rate: s.rate, showSub: s.showSub
    };
    try { localStorage.setItem(STORE, JSON.stringify(keep)); } catch { /* storage unavailable */ }
  }
  set(patch) { this.setState(patch); this.persist(patch); }

  // ── Script intake ──────────────────────────────────────────────────────────
  // Anything that arrives from outside lands here. `meta.mode` decides whether
  // it takes over the board or plays over the top of the current lesson.
  receiveScript(script, source) {
    const received = [script].concat(this.state.received.filter(s => s.id !== script.id)).slice(0, 10);
    this.set({ received, jsonError: "", intake: this.intake.log.slice() });
    const interject = script.meta && script.meta.mode === "interject";
    this.setState({ screen: "board" });
    if (interject && this.state.engine.scriptId) {
      this.runner.interject(script, { label: this.stepLabel() });
    } else {
      this.setState({ lessonId: script.id });
      this.runner.load(script, { caption: "Loaded " + script.title + " from " + source + ". Press play." });
    }
    this.prepareCurrent();
  }

  stepLabel() {
    const e = this.state.engine;
    return e.cursor >= 0 ? "step " + (e.cursor + 1) : "the start";
  }

  openScript(id) {
    const s = byId(id) || this.state.received.find(x => x.id === id);
    if (!s) return;
    this.setState({
      screen: "board", lessonId: id, typed: "", placements: {}, feedback: {},
      selectedChip: null, askOpen: false, askText: "", jsonText: "", jsonError: "", nod: false
    });
    this.persist({ lessonId: id });
    this.runner.load(s);
    // Render the opening lines first so the lesson starts within a second or
    // two, then fill in the rest while the tutor is already talking. On a warm
    // cache both are instant.
    const intro = introFor(s);
    const head = [intro].concat(linesFor(s).slice(1, 7));
    this.voice.prepare(head).then(() => {
      if (this.state.lessonId !== id) return;
      this.prepareCurrent();
      // A short introduction, then the script itself takes over.
      this.flash(intro).then(() => {
        if (this.state.lessonId === id && this.state.engine.cursor < 0) this.runner.play();
      });
    });
  }

  // ── Progress ───────────────────────────────────────────────────────────────
  // Recorded against the lesson, not against a generated answer script.
  record(patch) {
    const id = this.state.lessonId;
    const progress = Object.assign({}, this.state.progress);
    const p = Object.assign({ asks: 0, independent: 0, guided: 0, hints: 0, reveals: 0, wrong: 0, done: false }, progress[id]);
    Object.keys(patch).forEach(k => { p[k] = typeof patch[k] === "number" ? p[k] + patch[k] : patch[k]; });
    progress[id] = p;
    this.set({ progress });
  }

  statusOf(id) {
    const p = this.state.progress[id];
    if (!p || !p.asks) return { key: "untouched", label: "Not started" };
    if (p.independent >= 2 && !p.reveals && p.hints === 0 && p.wrong === 0) return { key: "mastered", label: "Mastered" };
    if (p.independent + p.guided >= 1 && p.reveals <= 1) return { key: "developing", label: "Developing" };
    return { key: "support", label: "Needs support" };
  }

  // The learner has answered: stop the tutor reading the question out before
  // saying anything back, or the rest of the question lands on top of the reply.
  answering() { this.runner.stopReading(); }

  nodThen(fn) {
    this.setState({ nod: true });
    setTimeout(() => { this.setState({ nod: false }); if (fn) fn(); }, 900);
  }

  nodeById(id) {
    const b = this.state.engine.board;
    return b.objects.concat(b.slots).find(o => o.id === id) || null;
  }

  // ── Answering ──────────────────────────────────────────────────────────────
  tapObject(id) {
    const ask = this.state.engine.ask;
    this.answering();
    const n = this.nodeById(id);
    if (!ask || ask.type !== "select") {
      this.flash(n && n.sub ? (n.label ? n.label + " — " : "") + n.sub : "This one is " + ((n && n.label) || "here") + ".");
      return;
    }
    const ok = [].concat(ask.expect).indexOf(id) >= 0;
    if (ok) {
      this.setState({ feedback: { [id]: "right" } });
      this.flash("Correct. " + (n && n.sub && n.label ? n.label + " is in the " + n.sub.toLowerCase() + "." : "That is the one."));
      this.record(this.state.usedHint ? { asks: 1, guided: 1 } : { asks: 1, independent: 1 });
      this.nodThen(() => this.runner.answered(true));
    } else {
      this.setState({ feedback: { [id]: "wrong" } });
      this.flash((n && n.sub && n.label ? "That is the " + n.sub.toLowerCase() + ". " : "Not that one. ") + (ask.hint || "Look again at what the question is asking."));
      this.record({ wrong: 1 });
    }
  }

  submitTyped = () => {
    const ask = this.state.engine.ask;
    if (!ask || ask.type !== "type") return;
    this.answering();
    const ok = [].concat(ask.expect).some(e => norm(e) === norm(this.state.typed));
    if (ok) {
      this.flash("Yes — " + this.state.typed.trim() + " is right.");
      this.record(this.state.usedHint ? { asks: 1, guided: 1 } : { asks: 1, independent: 1 });
      this.nodThen(() => this.runner.answered(true));
    } else {
      this.flash("Not yet. " + (ask.hint || "Try working it out one step at a time."));
      this.record({ wrong: 1 });
    }
  };

  check = () => {
    const ask = this.state.engine.ask;
    if (!ask || ask.type !== "place") return;
    this.answering();
    const expect = ask.expect;
    const fb = {};
    let right = 0, total = 0;
    Object.keys(expect).forEach(chip => {
      total++;
      const got = this.state.placements[chip];
      if (got === expect[chip]) { right++; fb[chip] = "right"; } else if (got) fb[chip] = "wrong";
    });
    this.setState({ feedback: fb });
    if (right === total) {
      this.flash("All placed correctly.");
      this.record(this.state.usedHint ? { asks: 1, guided: 1 } : { asks: 1, independent: 1 });
      this.nodThen(() => this.runner.answered(true));
    } else {
      this.flash(right + " of " + total + " are in the right place. " + (ask.hint || "Move the ones that do not fit."));
      this.record({ wrong: 1 });
    }
  };

  hint = () => {
    const ask = this.state.engine.ask;
    const text = (ask && ask.hint) || "Ask yourself what the idea is for before applying the rule.";
    this.setState({ usedHint: true });
    this.record({ hints: 1 });
    this.flash("A hint, not the answer: " + text);
  };

  reveal = () => {
    const ask = this.state.engine.ask;
    if (!ask) return;
    this.answering();
    if (ask.type === "place") {
      this.setState({ placements: Object.assign({}, ask.expect), feedback: {} });
      this.flash("Here is how they belong. We will come back to this one so you can do it yourself.");
    } else if (ask.type === "select") {
      const id = [].concat(ask.expect)[0];
      const n = this.nodeById(id);
      this.setState({ feedback: { [id]: "right" } });
      this.flash("This is the one — " + ((n && (n.sub || n.label)) || "here") + ". We will return to it later.");
    } else {
      this.setState({ typed: [].concat(ask.expect)[0] });
      this.flash("The answer is " + [].concat(ask.expect)[0] + ". Marked as needing another go.");
    }
    this.record({ reveals: 1, asks: 1 });
    setTimeout(() => this.runner.answered(false), 1200);
  };

  // ── Asking the tutor ───────────────────────────────────────────────────────
  // The question does not get a paragraph back. It gets a script, and the same
  // engine plays it on the same board — then puts the lesson back where it was.
  answerContext() {
    const e = this.state.engine;
    return {
      faq: e.faq, board: e.board, focus: e.focus, concept: e.concept, level: e.level,
      objective: e.objective, scriptId: e.scriptId, step: this.runner.currentStep()
    };
  }

  askSend = async () => {
    const q = this.state.askText.trim();
    if (!q) return;
    const ctx = this.answerContext();
    this.setState({ thinking: true });
    let script = null;
    // "I don't understand" is not a question to answer — it is a request for a
    // lower level of explanation.
    if (isConfusion(q)) script = explainAtLevel((ctx.level || 2) - 1, ctx, LIBRARY);
    if (!script) script = await generateAnswerScript(q, ctx);
    this.setState({ thinking: false, askOpen: false, askText: "" });
    this.runner.interject(script, { label: this.stepLabel() });
  };

  explainSimpler = () => {
    const ctx = this.answerContext();
    const script = explainAtLevel((ctx.level || 2) - 1, ctx, LIBRARY) || breakDownStep(ctx.step, ctx);
    if (!script) { this.flash("This is already as simple as I can make it. Let us try it a different way."); return; }
    this.runner.interject(script, { label: this.stepLabel() });
  };

  goDeeper = () => {
    const ctx = this.answerContext();
    const script = explainAtLevel((ctx.level || 2) + 1, ctx, LIBRARY);
    if (!script) { this.flash("There is nothing deeper than this for now."); return; }
    this.runner.interject(script, { label: this.stepLabel() });
  };

  micAnswer = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    const v = this.state.voices.find(x => x.name === this.state.voiceName);
    r.lang = (v && v.lang) || "en-GB";
    r.interimResults = false;
    r.maxAlternatives = 3;
    this.setState({ listeningMic: true });
    r.onresult = e => {
      const said = e.results[0][0].transcript;
      this.setState({ typed: said, listeningMic: false });
      setTimeout(() => this.submitTyped(), 150);
    };
    r.onerror = () => { this.setState({ listeningMic: false }); this.flash("I did not catch that — you can type it instead."); };
    r.onend = () => this.setState({ listeningMic: false });
    r.start();
  };

  // ── Drag and drop ──────────────────────────────────────────────────────────
  startDrag(chipId, e) {
    e.preventDefault();
    this.setState({ drag: { id: chipId, x: e.clientX, y: e.clientY }, selectedChip: chipId });
    this.moveHandler = ev => this.setState({ drag: { id: chipId, x: ev.clientX, y: ev.clientY } });
    this.upHandler = ev => {
      this.endDrag();
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const slotEl = el && el.closest ? el.closest("[data-slot]") : null;
      if (slotEl) this.placeChip(chipId, slotEl.getAttribute("data-slot"));
    };
    window.addEventListener("pointermove", this.moveHandler);
    window.addEventListener("pointerup", this.upHandler, { once: true });
  }
  endDrag(silent) {
    if (this.moveHandler) window.removeEventListener("pointermove", this.moveHandler);
    this.moveHandler = null;
    if (!silent) this.setState({ drag: null });
  }
  placeChip(chipId, slotId) {
    const placements = Object.assign({}, this.state.placements);
    Object.keys(placements).forEach(k => { if (placements[k] === slotId) delete placements[k]; });
    placements[chipId] = slotId;
    const fb = Object.assign({}, this.state.feedback);
    delete fb[chipId];
    this.setState({ placements, feedback: fb, selectedChip: null });
  }

  // ── Script file in / out ───────────────────────────────────────────────────
  downloadScript() {
    const s = this.runner.script;
    if (!s) return;
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = s.id + ".script.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  uploadScript(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => this.intake.acceptText(String(r.result), "file");
    r.readAsText(file);
    e.target.value = "";
  }

  runPasted(mode) {
    const text = this.state.jsonText.trim();
    if (!text) { this.setState({ jsonError: "Paste a script first." }); return; }
    let raw;
    try { raw = JSON.parse(text); }
    catch (err) { this.setState({ jsonError: "Not valid JSON: " + err.message }); return; }
    raw.meta = Object.assign({}, raw.meta, { mode });
    this.intake.accept(raw, "paste");
  }

  render() {
    const st = this.state;
    const e = st.engine;
    const b = e.board;
    const cur = CURRICULA.find(c => c.id === st.curriculum) || CURRICULA[0];
    const ask = e.ask;
    const objects = b.objects || [];
    const slots = b.slots || [];
    const boardSlots = slots.filter(s => s.place === "board");
    const rowSlots = slots.filter(s => s.place !== "board");
    const playing = e.status === "playing" || e.status === "asking";
    const caption = st.flash || e.caption;

    // ── Tutor geometry ───────────────────────────────────────────────────────
    const mood = st.nod ? "nod" : e.mood;
    const tNode = (e.focus || []).length ? this.nodeById(e.focus[0]) : null;
    const SX = 150, SY = 402;
    let rightArm = SX + "," + SY + " " + (SX + 46) + "," + (SY + 40) + " " + (SX + 58) + "," + (SY + 58);
    let leftArm = SX + "," + SY + " " + (SX - 46) + "," + (SY + 40) + " " + (SX - 58) + "," + (SY + 58);
    let handX = SX + 58, handY = SY + 58, tx = handX, ty = handY;
    const pointing = !!tNode && ["point", "trace", "compare", "nod", "quiz"].indexOf(mood) >= 0;
    // A teacher does not point from where she was standing: she steps in to the
    // board, points, and steps back out to explain. The whole figure shifts by
    // `stride`, so the arm has to aim at where the target sits from there.
    const stride = pointing ? 40 : 0;
    if (pointing) {
      tx = BX(tNode.x); ty = BY(tNode.y);
      const ang = Math.atan2(ty - SY, tx - stride - SX), eAng = ang - 0.35;
      const ex = SX + 62 * Math.cos(eAng), ey = SY + 62 * Math.sin(eAng);
      handX = ex + 66 * Math.cos(ang); handY = ey + 66 * Math.sin(ang);
      rightArm = SX + "," + SY + " " + ex.toFixed(1) + "," + ey.toFixed(1) + " " + handX.toFixed(1) + "," + handY.toFixed(1);
    } else if (mood === "celebrate") {
      rightArm = SX + "," + SY + " " + (SX + 52) + "," + (SY - 34) + " " + (SX + 66) + "," + (SY - 82);
      leftArm = SX + "," + SY + " " + (SX - 52) + "," + (SY - 34) + " " + (SX - 66) + "," + (SY - 82);
    }
    const mouth = st.speaking ? "M132 344 q18 14 36 0 q-18 8 -36 0" : mood === "celebrate" ? "M132 346 q18 18 36 0" : mood === "listen" ? "M136 348 q14 -6 28 0" : "M134 346 q16 10 32 0";
    const headStyle = mood === "nod"
      ? "animation: tutor-nod 1s ease-in-out; transform-origin: 150px 370px;"
      : "transform: rotate(" + (mood === "listen" ? -7 : mood === "quiz" ? 5 : 0) + "deg); transform-origin: 150px 372px; transition: transform .4s ease;";
    const listening = mood === "listen" || mood === "quiz" || st.listeningMic;

    // ── Board decoration ─────────────────────────────────────────────────────
    const line = (x1, y1, x2, y2, w, color, dash) => ({ x1: BX(x1), y1: BY(y1), x2: BX(x2), y2: BY(y2), w: w || 3, color: color || "rgba(243,236,220,0.5)", dash: dash || "0" });
    const kind = b.kind;
    const decorLines = [];
    const decorText = [];
    if (kind === "numberline") {
      decorLines.push(line(4, 50, 96, 50, 4, "#eae2cf"));
      for (let i = 0; i <= 10; i++) { const x = 4 + i * 9.2; decorLines.push(line(x, 46, x, 54, i % 5 === 0 ? 4 : 2, "#cfd8c4")); }
    } else if (kind === "axes") {
      decorLines.push(line(12, 82, 94, 82, 4, "#eae2cf"));
      decorLines.push(line(12, 82, 12, 12, 4, "#eae2cf"));
      for (let i = 1; i <= 8; i++) { const x = 12 + i * 10; decorLines.push(line(x, 12, x, 82, 1.5, "rgba(243,236,220,0.18)")); decorText.push({ x, y: 88, t: i }); }
      for (let i = 1; i <= 7; i++) { const y = 82 - i * 10; decorLines.push(line(12, y, 94, y, 1.5, "rgba(243,236,220,0.18)")); if (i <= 6) decorText.push({ x: 8, y, t: i }); }
      decorText.push({ x: 8, y: 88, t: 0 });
    } else if (kind === "stave") {
      for (let i = 0; i < 5; i++) decorLines.push(line(10, 28 + i * 9, 92, 28 + i * 9, 3, "#eae2cf"));
    } else if (kind === "timeline") {
      decorLines.push(line(6, 44, 96, 44, 4, "#eae2cf"));
    } else if (kind === "bars") {
      decorLines.push(line(2, 30, 98, 30, 2, "rgba(243,236,220,0.35)", "10 10"));
      decorLines.push(line(2, 50, 98, 50, 2, "rgba(243,236,220,0.35)", "10 10"));
    }

    const objStyle = (ob, state) => {
      const ring = state === "target" ? "#f3ecdc" : state === "right" ? "var(--color-accent-2)" : state === "wrong" ? "var(--color-accent-300)" : "rgba(243,236,220,0.45)";
      const fill = state === "target" ? "var(--color-accent)" : state === "right" ? "var(--color-accent-2)" : "rgba(243,236,220,0.07)";
      const base = "position: absolute; left: " + ob.x + "%; top: " + ob.y + "%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.4cqw; box-sizing: border-box; cursor: pointer; pointer-events: auto; transition: all .3s ease; border-style: solid; border-color: " + ring + "; background: " + fill + "; animation: tutor-appear .45s ease-out; ";
      if (ob.shape === "circle") return base + "width: 15cqw; height: 15cqw; border-radius: 999px; border-width: " + (state === "target" ? 4 : 2) + "px;";
      if (ob.shape === "tile") return base + "padding: 1.4cqw 2.4cqw; border-radius: 999px; border-width: 2px;";
      if (ob.shape === "bar") return base + "width: " + (ob.w || 10) + "%; height: 14cqw; border-radius: 1.6cqw; border-width: 2px; background: " + (state === "target" ? "var(--color-accent)" : ob.on ? "var(--color-accent-2)" : "rgba(243,236,220,0.07)") + ";";
      if (ob.shape === "note") return base + "width: 6cqw; height: 6cqw; border-radius: 999px; border-width: 2px; background: " + (state === "target" ? "var(--color-accent)" : "#f3ecdc") + ";";
      if (ob.shape === "point") return base + "width: 4.5cqw; height: 4.5cqw; border-radius: 999px; border-width: 2px; background: " + (state === "target" ? "var(--color-accent)" : "#f3ecdc") + ";";
      if (ob.shape === "node") return base + "width: 5cqw; height: 5cqw; border-radius: 999px; border-width: 3px;";
      if (ob.shape === "pin") return base + "padding: 1cqw 2cqw; border-radius: 999px; border-width: 2px; background: " + (state === "target" ? "var(--color-accent)" : "var(--color-accent-700)") + ";";
      return base + "padding: 0.8cqw 1.6cqw; border-radius: 1.2cqw; border-width: 0; background: " + (state === "target" ? "var(--color-accent)" : "transparent") + ";";
    };
    const objText = (ob, state) => {
      const ink = state === "target" || state === "right" ? "#2c332d" : "#f3ecdc";
      // A script can set its own size — the comma needs to read as a comma.
      // When a thing is drawn, `size` belongs to the drawing; its caption is a caption.
      const size = ob.icon ? (ob.labelSize || 2.6)
        : ob.size || (ob.shape === "circle" ? 6.4 : ob.shape === "tile" ? 3 : ob.shape === "node" ? 2 : ob.shape === "point" ? 2.4 : 3);
      return "font-family: var(--font-chalk); font-size: " + size + "cqw; line-height: 1; color: " + ink + "; white-space: nowrap;";
    };

    // The engine names what is ringed or crossed out; where that lands on the
    // board is this layer's business alone.
    const chalkMarks = (b.marks || []).map(m => {
      const d = markPath(b, m);
      return d ? { id: m.id, d, colour: markColour(m) } : null;
    }).filter(Boolean);

    // Objects the engine is still writing up are on the board but not yet in
    // the chalk; they arrive as the tutor says their names.
    const notYetWritten = new Set(e.pending || []);

    const focusIds = e.focus || [];
    // A picture of a thing, repeated as many times as the script asks for: six
    // sweets is six sweets, not the numeral 6 with a sweet beside it.
    const iconOf = ob => {
      const paths = ICONS[ob.icon];
      if (!paths) return null;                       // an icon nobody drew: fall back to the label
      const size = (ob.size || 9);
      const many = Math.max(1, Math.min(12, ob.count || 1));
      return (
        <span style={{ display: "flex", gap: size * 0.12 + "cqw", alignItems: "center", justifyContent: "center",
                       flexWrap: "wrap", maxWidth: "62cqw" }}>
          {Array.from({ length: many }, (_, i) => (
            <svg key={i} viewBox="0 0 100 100" className="chalk-icon"
              style={{ width: size + "cqw", height: size + "cqw" }}>
              {paths.map((d, k) => <path key={k} d={d} />)}
            </svg>
          ))}
        </span>
      );
    };

    const boardObjects = objects.filter(ob => !notYetWritten.has(ob.id)).map(ob => {
      const state = focusIds.indexOf(ob.id) >= 0 && pointing ? "target" : st.feedback[ob.id] || "";
      const sub = ob.shape === "node" ? ob.sub : st.showSub ? ob.sub : "";
      const pointLabel = ob.shape === "point" || ob.shape === "note";
      // A digit's place name goes under the circle; squeezed inside it, a long
      // name like "Ten thousands" spills over the edge.
      const underneath = ob.shape === "circle";
      return {
        id: ob.id, label: ob.label, state,
        sub: pointLabel || underneath ? "" : sub || "",
        under: underneath ? sub || "" : "",
        side: pointLabel ? (ob.shape === "point" ? ob.label : sub) : "",
        icon: iconOf(ob),
        style: objStyle(ob, state), textStyle: objText(ob, state),
        subStyle: "font-size: " + (ob.shape === "node" ? 2 : 2.2) + "cqw; max-width: 22cqw; text-align: center; color: " + (state === "target" ? "#2c332d" : "#a9b79b") + ";",
        ob
      };
    });

    const chipFor = slotId => {
      const chip = (b.tray || []).find(c => st.placements[c.id] === slotId);
      return chip ? chip.label : "";
    };
    const placing = !!(ask && ask.type === "place");
    const slotStyleBoard = (s, hot) => "position: absolute; left: " + s.x + "%; top: " + s.y + "%; transform: translate(-50%, -50%); width: 22cqw; min-height: 8cqw; padding: 1cqw; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.4cqw; border: 2px dashed " + (hot ? "var(--color-accent-2)" : "rgba(243,236,220,0.5)") + "; border-radius: 2cqw; background: rgba(44,51,45,0.72); pointer-events: auto; text-align: center; cursor: pointer;" + (hot ? " animation: tutor-invite 1.6s ease-in-out infinite;" : "");

    const trayChips = (b.tray || []).filter(c => !st.placements[c.id]);
    const tapSlot = id => { if (st.selectedChip) this.placeChip(st.selectedChip, id); };

    const lessonCards = catalogue().concat(st.received.filter(r => r.level === 2 && !byId(r.id))).map(x => {
      const ok = x.curricula.indexOf(st.curriculum) >= 0;
      const status = this.statusOf(x.id);
      return {
        x, ok, status,
        meta: ((KINDS.find(k => k.value === x.board.kind) || {}).label || x.board.kind) + " · " + x.steps.length + " steps",
        statusClass: status.key === "mastered" ? "tag tag-accent-2" : status.key === "untouched" ? "tag tag-outline" : "tag tag-accent"
      };
    });

    const counts = { mastered: 0, developing: 0, support: 0 };
    catalogue().forEach(x => { const k = this.statusOf(x.id).key; if (counts[k] !== undefined) counts[k]++; });

    const toggles = [
      ["guide", "Chalk pointer guide", st.guide, "shown", "hidden"],
      ["showSub", "Labels under objects", st.showSub, "shown", "hidden"],
      ["voice", "Speak the narration aloud", st.voice, "on", "off"]
    ];

    const tab = (label, screen) => (
      <button key={screen} className="btn btn-ghost" onClick={() => this.setState({ screen })}
        style={st.screen === screen ? { background: "var(--color-accent-2-100)" } : undefined}>{label}</button>
    );
    const sectionLabel = text => <span className="section-label">{text}</span>;

    return (
      <div className="app">
        <header className="nav app-nav">
          <span className="nav-brand" style={{ fontSize: 22, marginRight: 0 }}>Tutor</span>
          <nav style={{ display: "flex", gap: 8 }}>
            {tab("Lessons", "picker")}
            {tab("Board", "board")}
            {tab("Progress", "report")}
          </nav>
          <div style={{ flex: "1 1 20px" }} />
          <label className="curriculum-picker">
            <span>Curriculum</span>
            <select className="input" value={st.curriculum} onChange={ev => this.set({ curriculum: ev.target.value })}>
              {CURRICULA.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        </header>

        {st.screen === "picker" && (
          <section className="page">
            <div className="page-head">
              <span className="tag tag-accent-2" style={{ alignSelf: "flex-start" }}>{cur.label}</span>
              <h1 style={{ fontSize: 40, margin: 0, lineHeight: 1.05 }}>Pick an objective to teach</h1>
              <p className="lede">Every one of these is a script. The tutor, the board and the practice loop are a single engine that plays whatever script it is handed — from this library, from a file, or generated on the spot to answer a question.</p>
            </div>
            <div className="lesson-grid">
              {lessonCards.map(({ x, ok, status, meta, statusClass }) => (
                <article key={x.id} className="card elev-sm" style={{ padding: 20, gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span className="card-kicker">{x.subject}</span>
                    <span className={statusClass}>{status.label}</span>
                  </div>
                  <div className="card-title" style={{ fontSize: 21 }}>{x.title}</div>
                  <div className="card-body" style={{ fontSize: 15, color: "var(--color-neutral-700)" }}>{x.objective}</div>
                  <div className="card-meta" style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>{meta}</div>
                  <div style={{ marginTop: "auto", paddingTop: 8 }}>
                    <button className="btn btn-primary" onClick={() => ok && this.openScript(x.id)} disabled={!ok}>{ok ? "Teach this" : "Not yet available"}</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {st.screen === "board" && (
          <section className="page page-board">
            <div className="board-head">
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <span className="tag tag-neutral" style={{ alignSelf: "flex-start" }}>{(e.subject || "Script") + " · " + cur.stage}</span>
                <h1 style={{ fontSize: 32, margin: 0, lineHeight: 1.08 }}>{e.title}</h1>
                <p className="lede" style={{ fontSize: 15 }}>{e.objective}</p>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span className="tag tag-outline">{e.cursor < 0 ? "Not started" : "Step " + (e.cursor + 1) + " of " + e.total}</span>
                <span className="tag tag-outline" title="Which layer produced the script now playing">{"source: " + (e.source || "—")}</span>
                <button className="btn btn-ghost" onClick={() => this.setState({ panelOpen: !st.panelOpen, consoleOpen: false })}>{st.panelOpen ? "Hide script" : "Script"}</button>
                <button className="btn btn-ghost" onClick={() => this.setState({ consoleOpen: !st.consoleOpen, panelOpen: false })}>{st.consoleOpen ? "Hide intake" : "Script intake"}</button>
              </div>
            </div>

            {e.interjecting && (
              <div className="page-width interject-bar">
                <span>Answering your question — the lesson is holding its place at {e.returnTo}.</span>
                <button className="btn btn-primary" onClick={() => this.runner.resumeAndPlay()}>Back to {e.returnTo}</button>
              </div>
            )}

            <div className="board-row">
              <div className="board-main">
                <div className="board-frame">
                  <div style={{ position: "relative", width: "100%" }}>
                    <svg viewBox="0 0 1000 620" style={{ width: "100%", height: "auto", display: "block" }}>
                      <rect x="236" y="26" width="740" height="566" rx="30" fill="var(--color-accent-700)" />
                      <rect x="252" y="42" width="708" height="534" rx="20" fill="#2c332d" />
                      {decorLines.map((d, i) => (
                        <line key={i} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke={d.color} strokeWidth={d.w} strokeDasharray={d.dash} strokeLinecap="round" />
                      ))}
                      {decorText.map((d, i) => (
                        <text key={"t" + i} x={BX(d.x)} y={BY(d.y)} fill="#a9b79b" fontSize="18" textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-body)">{d.t}</text>
                      ))}

                      <g className="tutor-body" style={css((mood === "celebrate" ? "animation: tutor-jump .9s ease-in-out infinite;" : "")
                        + " transform: translateX(" + stride + "px);")}>
                        <line x1="150" y1="498" x2="112" y2="588" stroke="var(--color-text)" strokeWidth="9" strokeLinecap="round" />
                        <line x1="150" y1="498" x2="192" y2="588" stroke="var(--color-text)" strokeWidth="9" strokeLinecap="round" />
                        <line x1="150" y1="378" x2="150" y2="500" stroke="var(--color-text)" strokeWidth="10" strokeLinecap="round" />
                        <polyline points={leftArm} fill="none" stroke="var(--color-text)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" className="arm" />
                        <polyline points={rightArm} fill="none" stroke="var(--color-text)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" className="arm" />
                        <g style={css(headStyle)}>
                          <circle cx="150" cy="332" r="38" fill="var(--color-bg)" stroke="var(--color-text)" strokeWidth="9" />
                          <circle cx="137" cy="326" r="4.5" fill="var(--color-text)" />
                          <circle cx="163" cy="326" r="4.5" fill="var(--color-text)" />
                          <path d={mouth} fill="none" stroke="var(--color-text)" strokeWidth="5" strokeLinecap="round" style={{ transition: "all .3s ease" }} />
                        </g>
                        {listening && <circle cx="150" cy="332" r="60" fill="none" stroke="var(--color-accent-2)" strokeWidth="4" style={{ animation: "tutor-pulse 1.4s ease-in-out infinite" }} />}
                        {mood === "celebrate" && (
                          <g fill="var(--color-accent)" style={{ animation: "tutor-spark 1.1s ease-out infinite" }}>
                            <circle cx="72" cy="286" r="7" />
                            <circle cx="228" cy="268" r="9" />
                            <circle cx="120" cy="238" r="6" />
                          </g>
                        )}
                      </g>

                      <line x1={handX + stride} y1={handY} x2={pointing ? tx : handX + stride} y2={pointing ? ty : handY} stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray="3 12" opacity={st.guide && pointing ? 0.9 : 0} className="arm" />
                    </svg>

                    <div className="board-surface">
                      {b.photo && (
                        <div className="board-photo">
                          <PlantCell />
                        </div>
                      )}
                      {b.photo && e.scriptId === "cell" && (
                        <svg className="board-leaders" viewBox="0 0 100 100" preserveAspectRatio="none">
                          {CELL_LEADERS.map(ld => (
                            <g key={ld.pin}>
                              <line x1={ld.x} y1={ld.y} x2={(slots.find(s => s.id === ld.pin) || {}).x - 11} y2={(slots.find(s => s.id === ld.pin) || {}).y} stroke="rgba(243,236,220,0.7)" strokeWidth="2" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
                            </g>
                          ))}
                        </svg>
                      )}
                      {b.photo && e.scriptId === "cell" && CELL_LEADERS.map(ld => (
                        <span key={"dot" + ld.pin} className="leader-dot" style={{ left: ld.x + "%", top: ld.y + "%" }} />
                      ))}

                      <div className="board-heading">{b.heading}</div>
                      <div className="board-sub">{st.showSub ? b.sub : ""}</div>
                      <div className="board-question">{e.question}</div>

                      {boardSlots.map(s => (
                        <div key={s.id} data-slot={s.id} style={css(slotStyleBoard(s, placing))} onClick={() => tapSlot(s.id)}>
                          <span style={{ fontSize: "2cqw", color: "#a9b79b" }}>{chipFor(s.id) ? "" : s.label}</span>
                          <span style={{ fontSize: "2.4cqw", color: "#f3ecdc" }}>{chipFor(s.id)}</span>
                        </div>
                      ))}

                      {boardObjects.map(ob => (
                        <div key={ob.id} className="board-obj" data-state={ob.state || ""} style={css(ob.style)} onClick={() => this.tapObject(ob.id)}>
                          {ob.icon}
                          <span className="chalk-text" style={css(ob.textStyle)}>
                            {ob.ob.shape === "point" || (ob.icon && !ob.ob.label) ? "" : ob.label}
                          </span>
                          {ob.sub && <span style={css(ob.subStyle)}>{ob.sub}</span>}
                          {ob.under && <span className={"under-label" + (ob.state === "target" ? " under-label-on" : "")}>{ob.under}</span>}
                          {ob.side && <span className="side-label">{ob.side}</span>}
                        </div>
                      ))}

                      {chalkMarks.length > 0 && (
                        <svg className="chalk-marks" viewBox={"0 0 " + MARK_W.toFixed(2) + " 100"}
                          preserveAspectRatio="none">
                          {chalkMarks.map(m => (
                            <path key={m.id} className="chalk-mark" d={m.d} stroke={m.colour}
                              strokeWidth="0.75" ref={drawOn} />
                          ))}
                        </svg>
                      )}

                      {st.roughPad && (
                        <div className={"rough-pad " + (st.roughPad.open ? "rough-pad-in" : "rough-pad-out")}>
                          {st.roughPad.title && <div className="rough-title">{st.roughPad.title}</div>}
                          {(st.roughPad.lines || []).map((ln, i) => (
                            <div key={i} className="rough-line" style={{ animationDelay: (i * 150) + "ms" }}>{ln}</div>
                          ))}
                        </div>
                      )}

                      {st.wiping && <div className="board-wipe" />}
                    </div>
                  </div>
                </div>

                {(b.tray || []).length > 0 && (
                  <div className="card" style={{ padding: 16, gap: 14 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <span className="card-kicker">{ask && ask.mode === "order" ? "Put these in order" : "Cards to place"}</span>
                      <span style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>Drag a card into place — or tap a card, then tap where it belongs.</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, minHeight: 44 }}>
                      {trayChips.map(c => (
                        <button key={c.id} className={"chip" + (st.selectedChip === c.id ? " chip-selected" : "")}
                          onPointerDown={ev => this.startDrag(c.id, ev)} onClick={() => this.setState({ selectedChip: c.id })}>{c.label}</button>
                      ))}
                      {!trayChips.length && <span style={{ fontSize: 14, color: "var(--color-neutral-600)", alignSelf: "center" }}>All cards placed.</span>}
                    </div>
                    {rowSlots.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                        {rowSlots.map(s => {
                          const fbKey = Object.keys(st.feedback).find(k => st.placements[k] === s.id);
                          const mark = fbKey ? st.feedback[fbKey] : "";
                          const filled = chipFor(s.id);
                          return (
                            <div key={s.id} data-slot={s.id} onClick={() => tapSlot(s.id)} className={"row-slot" + (placing && !filled ? " row-slot-hot" : "")}
                              style={{
                                borderStyle: filled ? "solid" : "dashed",
                                borderColor: mark === "right" ? "var(--color-accent-2)" : mark === "wrong" ? "var(--color-accent)" : "var(--color-neutral-300)",
                                background: mark === "right" ? "var(--color-accent-2-100)" : "var(--color-neutral-100)"
                              }}>
                              <span className="row-slot-label">{s.label}</span>
                              <span style={{ fontSize: 16 }}>{filled || "—"}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="card controls">
                  <div style={{ flex: "1 1 auto", minWidth: 260 }}>
                    <div className="card-kicker">Tutor says</div>
                    <div style={{ fontSize: 17, lineHeight: 1.35, minHeight: 46 }}>{caption || "Press play and I will start the lesson."}</div>
                    {st.voiceNote && <div style={{ fontSize: 13, color: "var(--color-accent-700)" }}>{st.voiceNote}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-primary" onClick={() => this.runner.toggle()}>
                      {playing ? "Pause" : e.cursor < 0 ? "Play lesson" : e.status === "done" ? "Play again" : "Resume from step " + (e.cursor + 1)}
                    </button>
                    <button className="btn btn-secondary" onClick={() => this.runner.step()}>Next step</button>
                    <button className="btn btn-secondary" onClick={this.hint}>Hint</button>
                    <button className="btn btn-secondary" onClick={() => { this.voice.unlock(); this.speak(caption); }}>Say that again</button>
                    <button className="btn btn-secondary" onClick={this.explainSimpler}>Explain it simpler</button>
                    <button className="btn btn-secondary" onClick={this.goDeeper}>Go deeper</button>
                    <button className="btn btn-secondary" onClick={() => {
                      const on = !st.voice;
                      this.set({ voice: on, voiceChosen: true });
                      if (!on && window.speechSynthesis) window.speechSynthesis.cancel();
                      else setTimeout(() => this.speak(caption || "Voice on."), 0);
                    }} style={st.voice ? { background: "var(--color-accent-2-100)", borderColor: "var(--color-accent-2)" } : undefined}>{st.voice ? "Voice on" : "Voice off"}</button>
                    <button className="btn btn-secondary" onClick={() => this.setState({ askOpen: !st.askOpen })}>Ask the tutor</button>
                    {placing && <button className="btn btn-primary" onClick={this.check}>Check my answer</button>}
                    {!!ask && <button className="btn btn-ghost" onClick={this.reveal}>Show me</button>}
                  </div>
                </div>

                {ask && ask.type === "type" && (
                  <form className="card inline-form" onSubmit={ev => { ev.preventDefault(); this.submitTyped(); }}>
                    <div className="field" style={{ flex: "1 1 220px" }}>
                      <label htmlFor="ts-answer">Your answer</label>
                      <input id="ts-answer" className="input" autoFocus autoComplete="off" value={st.typed} onChange={ev => this.setState({ typed: ev.target.value })} placeholder="Type it here" />
                    </div>
                    <button type="submit" className="btn btn-primary">Send to the tutor</button>
                    {!!(window.SpeechRecognition || window.webkitSpeechRecognition) && (
                      <button type="button" className="btn btn-secondary" onClick={this.micAnswer}>{st.listeningMic ? "Listening…" : "Answer out loud"}</button>
                    )}
                  </form>
                )}

                {st.askOpen && (
                  <div className="card" style={{ padding: "16px 18px", gap: 12 }}>
                    <div className="card-kicker">Your question — the tutor writes a script to answer it, then comes back here</div>
                    <form className="inline-form" style={{ padding: 0 }} onSubmit={ev => { ev.preventDefault(); this.askSend(); }}>
                      <div className="field" style={{ flex: "1 1 260px" }}>
                        <label htmlFor="ts-ask">Ask about this lesson</label>
                        <input id="ts-ask" className="input" autoFocus autoComplete="off" value={st.askText} onChange={ev => this.setState({ askText: ev.target.value })} placeholder="e.g. why is there a comma?" />
                      </div>
                      <button type="submit" className="btn btn-primary" disabled={st.thinking}>{st.thinking ? "Writing a script…" : "Ask"}</button>
                    </form>
                  </div>
                )}
              </div>

              {/* ── The script now playing, step by step ───────────────────── */}
              {st.panelOpen && (
                <aside className="card elev-lg setup-panel">
                  <div>
                    <div className="card-kicker">Execution layer</div>
                    <div className="card-title" style={{ margin: "2px 0 0" }}>The script now playing</div>
                    <div style={{ fontSize: 13, color: "var(--color-neutral-600)", marginTop: 4 }}>
                      {e.total} steps · level {e.level} · from {e.source}. Click a step to jump the tutor there.
                    </div>
                  </div>

                  <div className="panel-group">
                    {sectionLabel("Steps")}
                    <div className="step-list">
                      {(this.runner && this.runner.steps ? this.runner.steps : []).map((s, i) => (
                        <button key={i} className="step-row step-row-btn" onClick={() => this.runner.seek(i)}
                          style={{ background: i === e.cursor ? "var(--color-accent-2-100)" : "var(--color-neutral-100)" }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span className="step-n">{i + 1}</span>
                            <span className="tag tag-outline" style={{ fontSize: 11, padding: "1px 7px" }}>{s.do}</span>
                            {!!(s.at || []).length && <span style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>→ {(s.at || []).join(", ")}</span>}
                          </div>
                          <div style={{ fontSize: 13, lineHeight: 1.3, textAlign: "left" }}>{s.text || (s.ask && s.ask.prompt) || ""}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="panel-group">
                    {sectionLabel("Board options")}
                    {toggles.map(([key, label, on, onText, offText]) => (
                      <button key={key} className={"toggle" + (on ? " toggle-on" : "")}
                        onClick={() => { this.set(key === "voice" ? { voice: !on, voiceChosen: true } : { [key]: !on }); if (key === "voice" && on && window.speechSynthesis) window.speechSynthesis.cancel(); }}>
                        <span>{label}</span>
                        <span className="toggle-state">{on ? onText : offText}</span>
                      </button>
                    ))}
                    {st.renderedVoices.length > 0 && (
                      <div className="field">
                        <label htmlFor="ts-rendered">Tutor voice — rendered ahead of time</label>
                        <select id="ts-rendered" className="input" value={st.renderedVoice} onChange={ev => {
                          const id = ev.target.value;
                          this.voice.setVoice(id);
                          this.setState({ renderedVoice: id });
                          this.runner.pause();
                          this.prepareCurrent().then(() => { this.voice.unlock(); this.speak("This is the voice I will teach with."); });
                        }}>
                          {st.renderedVoices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </select>
                      </div>
                    )}
                    {st.renderedVoices.length === 0 && st.voices.length > 0 && (
                      <div className="field">
                        <label htmlFor="ts-voice">Tutor voice</label>
                        <select id="ts-voice" className="input" value={st.voiceName} onChange={ev => { this.set({ voiceName: ev.target.value }); setTimeout(() => { this.voice.unlock(); this.speak("This is the voice I will teach with."); }, 60); }}>
                          {st.voices.map(v => <option key={v.name} value={v.name}>{v.name} — {v.lang}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="field">
                      <label htmlFor="ts-rate">{st.renderedVoices.length
                        ? "Voice speed — only affects the fallback voice; the rendered one is fixed when it is made"
                        : "Voice speed — " + (st.rate <= 0.72 ? "slow and clear" : st.rate >= 1.0 ? "quick" : "measured")}</label>
                      <input id="ts-rate" type="range" min="0.6" max="1.15" step="0.05" value={st.rate} className="range"
                        onChange={ev => this.set({ rate: Number(ev.target.value) })}
                        onPointerUp={() => setTimeout(() => { this.voice.unlock(); this.speak("This is how fast I will speak."); }, 60)} />
                    </div>
                    <div className="field">
                      <label htmlFor="ts-pace">Teaching pace — {st.pace < 0.9 ? "unhurried" : st.pace > 1.3 ? "brisk" : "steady"}</label>
                      <input id="ts-pace" type="range" min="0.6" max="1.8" step="0.2" value={st.pace} className="range" onChange={ev => this.set({ pace: Number(ev.target.value) })} />
                    </div>
                    <button className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => {
                      this.voice.unlock();
                      this.set({ voice: true, voiceChosen: true });
                      setTimeout(() => this.speak("Hello. I am your tutor, and this is the voice I will teach with."), 0);
                    }}>Test voice</button>
                  </div>
                </aside>
              )}

              {/* ── Everything the engine will accept, and from where ──────── */}
              {st.consoleOpen && (
                <aside className="card elev-lg setup-panel">
                  <div>
                    <div className="card-kicker">Intake</div>
                    <div className="card-title" style={{ margin: "2px 0 0" }}>Send the engine a script</div>
                    <div style={{ fontSize: 13, color: "var(--color-neutral-600)", marginTop: 4 }}>
                      The engine will render any script that matches the format, whoever wrote it and whenever it turns up.
                    </div>
                  </div>

                  <div className="panel-group">
                    {sectionLabel("Paste a script")}
                    <textarea className="input json-box" spellCheck="false" placeholder='{ "title": "…", "steps": [ { "do": "say", "text": "Hello" } ] }'
                      value={st.jsonText} onChange={ev => this.setState({ jsonText: ev.target.value, jsonError: "" })} />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn btn-primary" onClick={() => this.runPasted("replace")}>Run it</button>
                      <button className="btn btn-secondary" onClick={() => this.runPasted("interject")}>Run over this lesson</button>
                      <button className="btn btn-ghost" onClick={() => this.setState({ jsonText: JSON.stringify(this.runner.script, null, 2) })}>Load current</button>
                    </div>
                    {st.jsonError && <span style={{ fontSize: 13, color: "var(--color-accent-700)" }}>{st.jsonError}</span>}
                  </div>

                  <div className="panel-group">
                    {sectionLabel("Other channels")}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
                        <span>Upload .json</span>
                        <input type="file" accept=".json,application/json" onChange={ev => this.uploadScript(ev)} style={{ display: "none" }} />
                      </label>
                      <button className="btn btn-secondary" onClick={() => this.downloadScript()}>Download this script</button>
                    </div>
                    <div className="channel-note">
                      <div>Drop a <code>.json</code> file anywhere on this page.</div>
                      <div>From another window: <code>win.postMessage({"{"} type: "tutor:script", script {"}"}, "*")</code></div>
                      <div>From the console: <code>TutorEngine.run(script)</code></div>
                      <div>From a service: <code>?script=https://…/lesson.json</code></div>
                    </div>
                  </div>

                  <div className="panel-group">
                    {sectionLabel("What has arrived")}
                    {!st.intake.length && <span style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>Nothing yet.</span>}
                    {st.intake.map((row, i) => (
                      <div key={i} className="intake-row">
                        <span className={row.ok ? "tag tag-accent-2" : "tag tag-accent"}>{row.source}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14 }}>{row.title}</div>
                          <div style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>{row.at} · {row.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="panel-group">
                    {sectionLabel("Directives the engine understands")}
                    {DIRECTIVES.map(d => (
                      <div key={d.do} style={{ fontSize: 12.5, lineHeight: 1.35 }}>
                        <code>{d.do}</code> — {d.note}
                      </div>
                    ))}
                  </div>
                </aside>
              )}
            </div>
          </section>
        )}

        {st.screen === "report" && (
          <section className="page">
            <div className="page-head">
              <span className="tag tag-accent-2" style={{ alignSelf: "flex-start" }}>{cur.label}</span>
              <h1 style={{ fontSize: 38, margin: 0, lineHeight: 1.05 }}>Progress by objective</h1>
              <p className="lede">Not lessons completed — what the learner can do without help. Guided success and independent success are recorded separately.</p>
            </div>

            <div className="summary-grid">
              {[
                { label: "Mastered", count: counts.mastered, color: "var(--color-accent-2-700)", note: "Right without help, twice" },
                { label: "Developing", count: counts.developing, color: "var(--color-accent-700)", note: "Right with hints or after a slip" },
                { label: "Needs support", count: counts.support, color: "var(--color-neutral-700)", note: "Answer was shown, or repeated errors" }
              ].map(s => (
                <div key={s.label} className="card" style={{ padding: 18, gap: 4 }}>
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: 38, lineHeight: 1, color: s.color }}>{s.count}</span>
                  <span style={{ fontSize: 15 }}>{s.label}</span>
                  <span style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>{s.note}</span>
                </div>
              ))}
            </div>

            <div className="page-width" style={{ overflowX: "auto" }}>
              <table className="table" style={{ minWidth: 760 }}>
                <thead>
                  <tr>
                    <th>Objective</th><th>Status</th><th>Independent</th><th>Guided</th><th>Hints</th><th>Work on next</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogue().map(x => {
                    const p = st.progress[x.id] || {};
                    const s = this.statusOf(x.id);
                    return (
                      <tr key={x.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{x.title}</div>
                          <div style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>{x.subject + " · " + cur.stage}</div>
                        </td>
                        <td><span className={s.key === "mastered" ? "tag tag-accent-2" : s.key === "developing" ? "tag tag-accent" : s.key === "support" ? "tag tag-neutral" : "tag tag-outline"}>{s.label}</span></td>
                        <td>{p.independent || 0}</td>
                        <td>{p.guided || 0}</td>
                        <td>{p.hints || 0}</td>
                        <td style={{ fontSize: 14, color: "var(--color-neutral-700)" }}>
                          {s.key === "mastered" ? "Move on to the next objective." : s.key === "developing" ? "Repeat independently, without hints." : s.key === "support" ? "Reteach from the visual model." : "Not attempted yet."}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="page-width" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn-secondary" onClick={() => this.setState({ screen: "picker" })}>Back to lessons</button>
              <button className="btn btn-ghost" onClick={() => this.set({ progress: {} })}>Clear this learner's record</button>
            </div>
          </section>
        )}

        {st.drag && (
          <div className="drag-ghost" style={{ left: st.drag.x, top: st.drag.y }}>
            {((b.tray || []).find(c => c.id === st.drag.id) || {}).label}
          </div>
        )}
      </div>
    );
  }
}
