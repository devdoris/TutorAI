import { Component } from "react";
import { CURRICULA, KINDS, VERBS, DEMO } from "./data/lessons.js";
import PlantCell, { CELL_LEADERS } from "./PlantCell.jsx";

const STORE = "tutor-studio-v3";
const norm = s => String(s).toLowerCase().replace(/[\s,]/g, "").trim();
const clone = o => JSON.parse(JSON.stringify(o));
const BX = x => 252 + (x / 100) * 708;
const BY = y => 42 + (y / 100) * 534;

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
    screen: "picker", curriculum: "NERDC", voiceNote: "",
    lessons: clone(DEMO), lessonId: "place-value",
    stepIdx: -1, mode: "idle", target: null, caption: "", question: "",
    placements: {}, typed: "", selectedChip: null, feedback: {},
    askOpen: false, askText: "", askReply: "", awaiting: null,
    progress: {}, panelOpen: false, playing: false,
    pace: 1, rate: 0.82, guide: true, voice: true, voiceChosen: false, showSub: true, voiceName: "", voices: [], speaking: false, listeningMic: false,
    drag: null, jsonText: "", jsonError: "", addVerb: "point"
  };
  waitSeq = 0; playSeq = 0; stepSeq = 0; inPlay = false;

  componentDidMount() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || "null");
      if (s) { if (s.voice === false && !s.voiceChosen) delete s.voice; this.setState(s); }
    } catch { /* storage unavailable */ }
    this.loadVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => this.loadVoices();
      [250, 800, 1800].forEach(ms => setTimeout(() => this.loadVoices(), ms));
    } else {
      this.setState({ voiceNote: "This browser has no speech engine, so the tutor cannot speak here." });
    }
    // Browsers only allow speech after a user gesture.
    this.unlock = () => {
      if (this.unlocked || !window.speechSynthesis) return;
      this.unlocked = true;
      try {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        window.speechSynthesis.speak(u);
      } catch { /* ignore */ }
      this.loadVoices();
      const t = this.pendingSpeech;
      this.pendingSpeech = null;
      if (t) this.speak(t);
    };
    window.addEventListener("pointerdown", this.unlock, true);
    window.addEventListener("keydown", this.unlock, true);
  }

  componentDidUpdate(_, prev) {
    if (prev.screen !== this.state.screen) window.scrollTo(0, 0);
  }

  componentWillUnmount() {
    this.stop(); this.endDrag(true);
    if (this.unlock) { window.removeEventListener("pointerdown", this.unlock, true); window.removeEventListener("keydown", this.unlock, true); }
  }

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

  estimate(text) {
    const words = String(text).trim().split(/\s+/).length;
    return Math.min(6000, 280 + words * (380 / Math.max(0.5, this.state.rate)));
  }

  speak(text) { return this.speakAsync(text); }

  speakAsync(text) {
    if (!this.state.voice || !text) return Promise.resolve();
    const synth = window.speechSynthesis;
    if (!synth) { this.setState({ voiceNote: "This browser has no speech engine, so the tutor cannot speak here." }); return Promise.resolve(); }
    if (!this.unlocked) { this.pendingSpeech = text; this.setState({ voiceNote: "Tap anywhere once to let the browser start the tutor's voice." }); return Promise.resolve(); }
    return new Promise(resolve => {
      let settled = false;
      const done = () => { if (settled) return; settled = true; this.setState({ speaking: false }); resolve(); };
      this.speakNow(text, done);
      setTimeout(done, this.estimate(text) * 1.6 + 1200);
    });
  }

  speakNow(text, done) {
    const synth = window.speechSynthesis;
    try {
      synth.cancel();
      if (synth.paused) synth.resume();
      const u = new SpeechSynthesisUtterance(text);
      const list = synth.getVoices();
      const v = list.find(x => x.name === this.state.voiceName) || list.find(x => /^en/i.test(x.lang));
      if (v) { u.voice = v; u.lang = v.lang; }
      u.volume = 1;
      u.rate = this.state.rate;
      u.pitch = 1.02;
      u.onstart = () => { this.spoke = true; this.setState({ speaking: true, voiceNote: "" }); };
      u.onend = () => { this.setState({ speaking: false }); if (done) done(); };
      u.onerror = e => {
        const reason = (e && e.error) || "";
        this.setState({ speaking: false });
        if (!this.spoke && reason !== "canceled" && reason !== "interrupted") {
          this.setState({ voiceNote: "The browser blocked the voice — check the tab is not muted." });
        }
        if (done) done();
      };
      synth.speak(u);
      setTimeout(() => {
        if (!this.spoke && !synth.speaking && !synth.pending) {
          this.setState({ voiceNote: "No sound yet. Check the tab is not muted and your system volume is up." });
        }
      }, 2600);
    } catch (e) {
      this.setState({ voiceNote: "Voice failed to start: " + e.message });
      if (done) done();
    }
  }

  async sayAndWait(text, extra) {
    this.setState(Object.assign({ caption: text }, extra || {}));
    if (this.state.voice && window.speechSynthesis && this.unlocked) await this.speakAsync(text);
    else await this.wait(this.estimate(text));
  }

  repeat = () => { this.unlocked = true; this.speak(this.state.caption); };
  testVoice = () => {
    this.unlocked = true;
    this.set({ voice: true, voiceChosen: true });
    setTimeout(() => this.speak("Hello. I am your tutor, and this is the voice I will teach with."), 0);
  };

  micAnswer = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    const v = this.state.voices.find(x => x.name === this.state.voiceName);
    r.lang = (v && v.lang) || "en-GB";
    r.interimResults = false;
    r.maxAlternatives = 3;
    this.setState({ listeningMic: true, mode: "listen" });
    r.onresult = e => {
      const said = e.results[0][0].transcript;
      this.setState({ typed: said, listeningMic: false });
      setTimeout(() => this.submitTyped(), 150);
    };
    r.onerror = () => { this.setState({ listeningMic: false }); this.say("I did not catch that — you can type it instead."); };
    r.onend = () => this.setState({ listeningMic: false });
    r.start();
  };

  persist(patch) {
    const s = Object.assign({}, this.state, patch || {});
    const keep = { lessons: s.lessons, progress: s.progress, curriculum: s.curriculum, pace: s.pace, guide: s.guide, voice: s.voice, voiceChosen: s.voiceChosen, voiceName: s.voiceName, rate: s.rate, showSub: s.showSub, panelOpen: s.panelOpen };
    try { localStorage.setItem(STORE, JSON.stringify(keep)); } catch { /* storage unavailable */ }
  }
  set(patch) { this.setState(patch); this.persist(patch); }

  lesson() { return this.state.lessons.find(l => l.id === this.state.lessonId) || this.state.lessons[0]; }
  editLesson(fn) {
    const lessons = clone(this.state.lessons);
    const l = lessons.find(x => x.id === this.state.lessonId);
    fn(l);
    this.set({ lessons, jsonText: "", jsonError: "" });
  }
  nodeById(id) {
    const l = this.lesson();
    return (l.objects || []).concat(l.slots || []).find(o => o.id === id) || null;
  }

  wait(ms) { return new Promise(res => setTimeout(res, Math.max(16, ms / this.state.pace))); }
  stop() {
    this.playSeq++; this.inPlay = false; this.waitSeq++; this.stepSeq++;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    this.answerResolve = null;
    this.setState({ playing: false, speaking: false });
  }
  say(text, extra) {
    this.setState(Object.assign({ caption: text }, extra || {}));
    this.speak(text);
  }

  openLesson(id) {
    this.stop();
    this.setState({
      screen: "board", lessonId: id, stepIdx: -1, mode: "idle", target: null, question: "",
      placements: {}, typed: "", feedback: {}, selectedChip: null, awaiting: null,
      askOpen: false, askReply: "", askText: "", jsonText: "", jsonError: "",
      caption: ""
    });
    this.persist({ lessonId: id });
    const l = this.state.lessons.find(x => x.id === id);
    const gen = this.playSeq;
    this.sayAndWait("Let us learn " + ((l && l.title) || "this objective").toLowerCase() + ". I will teach it aloud, and stop whenever you want to answer or ask.").then(() => {
      if (gen === this.playSeq && this.state.screen === "board" && this.state.lessonId === id && this.state.stepIdx < 0) this.play();
    });
  }

  record(patch) {
    const id = this.state.lessonId;
    const progress = Object.assign({}, this.state.progress);
    const p = Object.assign({ asks: 0, independent: 0, guided: 0, hints: 0, reveals: 0, wrong: 0, done: false }, progress[id]);
    Object.keys(patch).forEach(k => { p[k] = typeof patch[k] === "number" ? p[k] + patch[k] : patch[k]; });
    progress[id] = p;
    this.set({ progress });
  }

  async runStep(i) {
    const l = this.lesson();
    const step = l.steps[i];
    if (!step) return;
    const gen = ++this.stepSeq;
    const isAsk = step.verb === "ask" && step.ask;
    this.setState({
      stepIdx: i, target: step.target || null, feedback: {},
      mode: isAsk ? "quiz" : step.verb === "praise" ? "celebrate" : step.verb === "listen" ? "listen" : step.verb === "explain" ? "idle" : step.verb,
      question: isAsk ? step.ask.prompt : "",
      typed: "", placements: isAsk && step.ask.type === "place" ? {} : this.state.placements,
      awaiting: isAsk ? { type: step.ask.type, usedHint: false } : null
    });
    if (step.verb === "trace" || step.verb === "compare") {
      const ids = [].concat(step.target || []);
      ids.forEach((id, k) => setTimeout(() => { if (gen === this.stepSeq) this.setState({ target: id }); }, k * 900));
    }
    await this.sayAndWait(step.say || step.ask.prompt);
    if (gen !== this.stepSeq) return;
    if (isAsk) {
      if (step.say && step.ask.prompt && step.say !== step.ask.prompt) {
        await this.wait(260);
        if (gen !== this.stepSeq) return;
        await this.sayAndWait(step.ask.prompt);
        if (gen !== this.stepSeq) return;
      }
      return new Promise(res => { this.answerResolve = res; });
    }
    await this.wait(step.verb === "praise" ? 900 : 550);
  }

  next = async () => {
    const l = this.lesson();
    const i = this.state.stepIdx + 1;
    if (i >= l.steps.length) { this.say("That is the end of this objective. Open the progress view, or pick another lesson."); return; }
    this.stop();
    await this.runStep(i);
  };

  play = async () => {
    if (this.state.playing) { this.stop(); this.say("Paused. Press play when you are ready."); return; }
    this.stop();
    const id = ++this.playSeq;
    this.inPlay = true;
    this.setState({ playing: true });
    const alive = () => { if (id === this.playSeq) return true; this.inPlay = false; return false; };
    const l = this.lesson();
    const from = this.state.stepIdx + 1 >= l.steps.length ? 0 : this.state.stepIdx + 1;
    for (let i = from; i < l.steps.length; i++) {
      if (!alive()) return;
      await this.runStep(i);
      if (!alive()) return;
      await this.wait(400);
      if (!alive()) return;
    }
    this.inPlay = false;
    this.setState({ playing: false });
    this.record({ done: true });
    this.say("That is the whole objective. Your progress is recorded by what you did without help.");
  };

  finishAsk(ok) {
    const r = this.answerResolve;
    this.answerResolve = null;
    this.setState({ awaiting: null, question: "" });
    if (r) setTimeout(r, ok ? 1300 : 900);
  }

  tapObject(id) {
    const a = this.state.awaiting;
    const step = this.lesson().steps[this.state.stepIdx];
    if (!a || a.type !== "select") {
      const n = this.nodeById(id);
      this.setState({ target: id, mode: "point" });
      if (n) this.say(n.sub ? (n.label ? n.label + " — " : "") + n.sub : "This one is " + (n.label || "here") + ".");
      return;
    }
    const expect = [].concat(step.ask.expect);
    const ok = expect.indexOf(id) >= 0;
    const n = this.nodeById(id);
    if (ok) {
      this.setState({ target: id, mode: "nod", feedback: { [id]: "right" } });
      this.say("Correct. " + (n && n.sub && n.label ? n.label + " is in the " + n.sub.toLowerCase() + "." : "That is the one."));
      this.record(a.usedHint ? { asks: 1, guided: 1 } : { asks: 1, independent: 1 });
      this.finishAsk(true);
    } else {
      this.setState({ target: id, mode: "quiz", feedback: { [id]: "wrong" } });
      this.say((n && n.sub && n.label ? "That is " + n.sub.toLowerCase() + ". " : "Not that one. ") + (step.ask.hint || "Look again at what the question is asking."));
      this.record({ wrong: 1 });
    }
  }

  submitTyped = () => {
    const a = this.state.awaiting;
    const step = this.lesson().steps[this.state.stepIdx];
    if (!a || a.type !== "type") return;
    const ok = [].concat(step.ask.expect).some(e => norm(e) === norm(this.state.typed));
    if (ok) {
      this.setState({ mode: "nod" });
      this.say("Yes — " + this.state.typed.trim() + " is right.");
      this.record(a.usedHint ? { asks: 1, guided: 1 } : { asks: 1, independent: 1 });
      this.finishAsk(true);
    } else {
      this.setState({ mode: "quiz" });
      this.say("Not yet. " + (step.ask.hint || "Try working it out one step at a time."));
      this.record({ wrong: 1 });
    }
  };

  check = () => {
    const a = this.state.awaiting;
    const step = this.lesson().steps[this.state.stepIdx];
    if (!a || a.type !== "place") return;
    const expect = step.ask.expect;
    const fb = {};
    let right = 0, total = 0;
    Object.keys(expect).forEach(chip => {
      total++;
      const got = this.state.placements[chip];
      if (got === expect[chip]) { right++; fb[chip] = "right"; } else if (got) fb[chip] = "wrong";
    });
    this.setState({ feedback: fb });
    if (right === total) {
      this.setState({ mode: "nod" });
      this.say("All placed correctly.");
      this.record(a.usedHint ? { asks: 1, guided: 1 } : { asks: 1, independent: 1 });
      this.finishAsk(true);
    } else {
      this.setState({ mode: "quiz" });
      this.say(right + " of " + total + " are in the right place. " + (step.ask.hint || "Move the ones that do not fit."));
      this.record({ wrong: 1 });
    }
  };

  hint = () => {
    const step = this.lesson().steps[this.state.stepIdx];
    const a = this.state.awaiting;
    if (!step) { this.say("Press play and I will start the lesson."); return; }
    const text = (step.ask && step.ask.hint) || "Ask yourself what the idea is for before applying the rule.";
    if (a) this.setState({ awaiting: Object.assign({}, a, { usedHint: true }) });
    this.record({ hints: 1 });
    this.say("A hint, not the answer: " + text);
  };

  reveal = () => {
    const step = this.lesson().steps[this.state.stepIdx];
    if (!step || !step.ask) return;
    const ask = step.ask;
    if (ask.type === "place") {
      this.setState({ placements: Object.assign({}, ask.expect), feedback: {} });
      this.say("Here is how they belong. We will come back to this one so you can do it yourself.");
    } else if (ask.type === "select") {
      const id = [].concat(ask.expect)[0];
      const n = this.nodeById(id);
      this.setState({ target: id, mode: "point" });
      this.say("This is the one — " + ((n && (n.sub || n.label)) || "here") + ". We will return to it later.");
    } else {
      this.setState({ typed: [].concat(ask.expect)[0] });
      this.say("The answer is " + [].concat(ask.expect)[0] + ". Marked as needing another go.");
    }
    this.record({ reveals: 1, asks: 1 });
    this.finishAsk(false);
  };

  askSend = () => {
    const q = this.state.askText.trim();
    if (!q) return;
    const l = this.lesson();
    const hit = (l.faq || []).find(f => f.k.some(k => norm(q).indexOf(norm(k)) >= 0));
    const reply = hit ? hit.a
      : "That is outside what this objective covers, so I will not guess. Let us finish this idea, and I will flag it for your teacher.";
    this.setState({ mode: "listen", askReply: reply });
    this.say(hit ? "Good question. " + reply : "Honest answer: that is beyond this lesson. I will flag it for your teacher.");
  };

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
    this.setState({ placements, feedback: fb, selectedChip: null, target: slotId, mode: "point" });
  }

  statusOf(id) {
    const p = this.state.progress[id];
    if (!p || !p.asks) return { key: "untouched", label: "Not started" };
    if (p.independent >= 2 && !p.reveals && p.hints === 0 && p.wrong === 0) return { key: "mastered", label: "Mastered" };
    if (p.independent + p.guided >= 1 && p.reveals <= 1) return { key: "developing", label: "Developing" };
    return { key: "support", label: "Needs support" };
  }

  applyLessonJson(parsed, replaceCurrent) {
    if (!parsed.id || !parsed.steps) throw new Error("A lesson needs an id and steps.");
    let lessons = clone(this.state.lessons);
    if (replaceCurrent) lessons[lessons.findIndex(x => x.id === this.state.lessonId)] = parsed;
    else lessons = lessons.filter(x => x.id !== parsed.id).concat([parsed]);
    this.stop();
    this.set({ lessons, lessonId: parsed.id, jsonText: "", jsonError: "", stepIdx: -1, placements: {}, feedback: {}, question: "", awaiting: null, target: null, mode: "idle" });
  }

  downloadLesson(l) {
    const blob = new Blob([JSON.stringify(l, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = l.id + ".lesson.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  uploadLesson(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(String(r.result));
        this.applyLessonJson(parsed, false);
        this.say("Loaded " + parsed.title + ". Press play to teach it.");
      } catch (err) { this.setState({ jsonError: "Could not read that file: " + err.message }); }
    };
    r.readAsText(file);
    e.target.value = "";
  }

  render() {
    const st = this.state;
    const l = this.lesson();
    const cur = CURRICULA.find(c => c.id === st.curriculum) || CURRICULA[0];
    const step = l.steps[st.stepIdx];
    const a = st.awaiting;
    const objects = l.objects || [];
    const slots = l.slots || [];
    const boardSlots = slots.filter(s => s.place === "board");
    const rowSlots = slots.filter(s => s.place !== "board");

    // tutor geometry
    const tNode = st.target ? this.nodeById([].concat(st.target)[0]) : null;
    const SX = 150, SY = 402;
    let rightArm = SX + "," + SY + " " + (SX + 46) + "," + (SY + 40) + " " + (SX + 58) + "," + (SY + 58);
    let leftArm = SX + "," + SY + " " + (SX - 46) + "," + (SY + 40) + " " + (SX - 58) + "," + (SY + 58);
    let handX = SX + 58, handY = SY + 58, tx = handX, ty = handY;
    const pointing = !!tNode && ["point", "trace", "compare", "nod", "reveal", "quiz"].indexOf(st.mode) >= 0;
    if (pointing) {
      tx = BX(tNode.x); ty = BY(tNode.y);
      const ang = Math.atan2(ty - SY, tx - SX), eAng = ang - 0.35;
      const ex = SX + 62 * Math.cos(eAng), ey = SY + 62 * Math.sin(eAng);
      handX = ex + 66 * Math.cos(ang); handY = ey + 66 * Math.sin(ang);
      rightArm = SX + "," + SY + " " + ex.toFixed(1) + "," + ey.toFixed(1) + " " + handX.toFixed(1) + "," + handY.toFixed(1);
    } else if (st.mode === "celebrate") {
      rightArm = SX + "," + SY + " " + (SX + 52) + "," + (SY - 34) + " " + (SX + 66) + "," + (SY - 82);
      leftArm = SX + "," + SY + " " + (SX - 52) + "," + (SY - 34) + " " + (SX - 66) + "," + (SY - 82);
    }
    const mouth = st.speaking ? "M132 344 q18 14 36 0 q-18 8 -36 0" : st.mode === "celebrate" ? "M132 346 q18 18 36 0" : st.mode === "listen" ? "M136 348 q14 -6 28 0" : "M134 346 q16 10 32 0";
    const headStyle = st.mode === "nod"
      ? "animation: tutor-nod 1s ease-in-out; transform-origin: 150px 370px;"
      : "transform: rotate(" + (st.mode === "listen" ? -7 : st.mode === "quiz" ? 5 : 0) + "deg); transform-origin: 150px 372px; transition: transform .4s ease;";
    const listening = st.mode === "listen" || st.mode === "quiz" || st.listeningMic;

    // board decor
    const line = (x1, y1, x2, y2, w, color, dash) => ({ x1: BX(x1), y1: BY(y1), x2: BX(x2), y2: BY(y2), w: w || 3, color: color || "rgba(243,236,220,0.5)", dash: dash || "0" });
    const kind = l.board.kind;
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
      const base = "position: absolute; left: " + ob.x + "%; top: " + ob.y + "%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.4cqw; box-sizing: border-box; cursor: pointer; pointer-events: auto; transition: all .3s ease; border-style: solid; border-color: " + ring + "; background: " + fill + "; ";
      if (ob.shape === "circle") return base + "width: 17cqw; height: 17cqw; border-radius: 999px; border-width: " + (state === "target" ? 4 : 2) + "px;";
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
      const size = ob.shape === "circle" ? 7 : ob.shape === "tile" ? 3 : ob.shape === "node" ? 2 : ob.shape === "point" ? 2.4 : 3;
      return "font-family: " + (ob.shape === "circle" ? "var(--font-heading)" : "var(--font-body)") + "; font-size: " + size + "cqw; line-height: 1; color: " + ink + ";";
    };

    const targetIds = [].concat(st.target || []);
    const boardObjects = objects.map(ob => {
      const state = targetIds.indexOf(ob.id) >= 0 && pointing ? "target" : st.feedback[ob.id] || "";
      const sub = ob.shape === "node" ? ob.sub : st.showSub ? ob.sub : "";
      // Point labels sit beside the dot so they don't cover the grid.
      const pointLabel = ob.shape === "point" || ob.shape === "note";
      return {
        id: ob.id, label: ob.label, sub: pointLabel ? "" : sub || "",
        side: pointLabel ? (ob.shape === "point" ? ob.label : sub) : "",
        style: objStyle(ob, state), textStyle: objText(ob, state),
        subStyle: "font-size: " + (ob.shape === "node" ? 2 : 2.2) + "cqw; max-width: 22cqw; text-align: center; color: " + (state === "target" ? "#2c332d" : "#a9b79b") + ";",
        ob
      };
    });

    const chipFor = slotId => {
      const chip = (l.tray || []).find(c => st.placements[c.id] === slotId);
      return chip ? chip.label : "";
    };
    const placing = !!(a && a.type === "place");
    const slotStyleBoard = (s, hot) => "position: absolute; left: " + s.x + "%; top: " + s.y + "%; transform: translate(-50%, -50%); width: 22cqw; min-height: 8cqw; padding: 1cqw; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.4cqw; border: 2px dashed " + (hot ? "var(--color-accent-2)" : "rgba(243,236,220,0.5)") + "; border-radius: 2cqw; background: rgba(44,51,45,0.72); pointer-events: auto; text-align: center; cursor: pointer;" + (hot ? " animation: tutor-invite 1.6s ease-in-out infinite;" : "");

    const trayChips = (l.tray || []).filter(c => !st.placements[c.id]);
    const tapSlot = id => { if (st.selectedChip) this.placeChip(st.selectedChip, id); };

    const lessonCards = st.lessons.map(x => {
      const ok = x.curricula.indexOf(st.curriculum) >= 0;
      const status = this.statusOf(x.id);
      return {
        x, ok, status,
        meta: ((KINDS.find(k => k.value === x.board.kind) || {}).label || x.board.kind) + " · " + x.steps.length + " steps",
        statusClass: status.key === "mastered" ? "tag tag-accent-2" : status.key === "untouched" ? "tag tag-outline" : "tag tag-accent"
      };
    });

    const counts = { mastered: 0, developing: 0, support: 0 };
    st.lessons.forEach(x => { const k = this.statusOf(x.id).key; if (counts[k] !== undefined) counts[k]++; });

    const targetOptions = [{ value: "", label: "no target" }].concat(
      objects.map(o => ({ value: o.id, label: (o.label || o.sub || o.id) + " (object)" })),
      slots.map(s => ({ value: s.id, label: s.label + " (slot)" }))
    );

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
            <select className="input" value={st.curriculum} onChange={e => this.set({ curriculum: e.target.value })}>
              {CURRICULA.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
        </header>

        {st.screen === "picker" && (
          <section className="page">
            <div className="page-head">
              <span className="tag tag-accent-2" style={{ alignSelf: "flex-start" }}>{cur.label}</span>
              <h1 style={{ fontSize: 40, margin: 0, lineHeight: 1.05 }}>Pick an objective to teach</h1>
              <p className="lede">The same board, tutor and practice loop teach every one of these. What changes is the representation on the board and the objective behind it — never the teaching experience.</p>
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
                    <button className="btn btn-primary" onClick={() => ok && this.openLesson(x.id)} disabled={!ok}>{ok ? "Teach this" : "Not yet available"}</button>
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
                <span className="tag tag-neutral" style={{ alignSelf: "flex-start" }}>{l.subject + " · " + cur.stage}</span>
                <h1 style={{ fontSize: 32, margin: 0, lineHeight: 1.08 }}>{l.title}</h1>
                <p className="lede" style={{ fontSize: 15 }}>{l.objective}</p>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span className="tag tag-outline">{st.stepIdx < 0 ? "Not started" : "Step " + (st.stepIdx + 1) + " of " + l.steps.length}</span>
                <button className="btn btn-ghost" onClick={() => this.set({ panelOpen: !st.panelOpen })}>{st.panelOpen ? "Hide teacher setup" : "Teacher setup"}</button>
              </div>
            </div>

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

                      <g style={css(st.mode === "celebrate" ? "animation: tutor-jump .9s ease-in-out infinite;" : "")}>
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
                        {st.mode === "celebrate" && (
                          <g fill="var(--color-accent)" style={{ animation: "tutor-spark 1.1s ease-out infinite" }}>
                            <circle cx="72" cy="286" r="7" />
                            <circle cx="228" cy="268" r="9" />
                            <circle cx="120" cy="238" r="6" />
                          </g>
                        )}
                      </g>

                      <line x1={handX} y1={handY} x2={pointing ? tx : handX} y2={pointing ? ty : handY} stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray="3 12" opacity={st.guide && pointing ? 0.9 : 0} className="arm" />
                    </svg>

                    <div className="board-surface">
                      {l.board.photo && (
                        <div className="board-photo">
                          <PlantCell />
                        </div>
                      )}
                      {l.board.photo && l.id === "cell" && (
                        <svg className="board-leaders" viewBox="0 0 100 100" preserveAspectRatio="none">
                          {CELL_LEADERS.map(ld => (
                            <g key={ld.pin}>
                              <line x1={ld.x} y1={ld.y} x2={(slots.find(s => s.id === ld.pin) || {}).x - 11} y2={(slots.find(s => s.id === ld.pin) || {}).y} stroke="rgba(243,236,220,0.7)" strokeWidth="2" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
                            </g>
                          ))}
                        </svg>
                      )}
                      {l.board.photo && l.id === "cell" && CELL_LEADERS.map(ld => (
                        <span key={"dot" + ld.pin} className="leader-dot" style={{ left: ld.x + "%", top: ld.y + "%" }} />
                      ))}

                      <div className="board-heading">{l.board.heading}</div>
                      <div className="board-sub">{st.showSub ? l.board.sub : ""}</div>
                      <div className="board-question">{st.question}</div>

                      {boardSlots.map(s => (
                        <div key={s.id} data-slot={s.id} style={css(slotStyleBoard(s, placing))} onClick={() => tapSlot(s.id)}>
                          <span style={{ fontSize: "2cqw", color: "#a9b79b" }}>{chipFor(s.id) ? "" : s.label}</span>
                          <span style={{ fontSize: "2.4cqw", color: "#f3ecdc" }}>{chipFor(s.id)}</span>
                        </div>
                      ))}

                      {boardObjects.map(ob => (
                        <div key={ob.id} style={css(ob.style)} onClick={() => this.tapObject(ob.id)}>
                          <span style={css(ob.textStyle)}>{ob.ob.shape === "point" ? "" : ob.label}</span>
                          {ob.sub && <span style={css(ob.subStyle)}>{ob.sub}</span>}
                          {ob.side && <span className="side-label">{ob.side}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {(l.tray || []).length > 0 && (
                  <div className="card" style={{ padding: 16, gap: 14 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <span className="card-kicker">{step && step.ask && step.ask.mode === "order" ? "Put these in order" : "Cards to place"}</span>
                      <span style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>Drag a card into place — or tap a card, then tap where it belongs.</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, minHeight: 44 }}>
                      {trayChips.map(c => (
                        <button key={c.id} className={"chip" + (st.selectedChip === c.id ? " chip-selected" : "")}
                          onPointerDown={e => this.startDrag(c.id, e)} onClick={() => this.setState({ selectedChip: c.id })}>{c.label}</button>
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
                    <div style={{ fontSize: 17, lineHeight: 1.35, minHeight: 46 }}>{st.caption || "Press play and I will start the lesson."}</div>
                    {st.voiceNote && <div style={{ fontSize: 13, color: "var(--color-accent-700)" }}>{st.voiceNote}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-primary" onClick={this.play}>{st.playing ? "Pause" : st.stepIdx < 0 ? "Play lesson" : "Continue"}</button>
                    <button className="btn btn-secondary" onClick={this.next}>Next step</button>
                    <button className="btn btn-secondary" onClick={this.hint}>Hint</button>
                    <button className="btn btn-secondary" onClick={this.repeat}>Say that again</button>
                    <button className="btn btn-secondary" onClick={() => {
                      const on = !st.voice;
                      this.set({ voice: on, voiceChosen: true });
                      if (!on && window.speechSynthesis) window.speechSynthesis.cancel();
                      else setTimeout(() => this.speak(st.caption || "Voice on."), 0);
                    }} style={st.voice ? { background: "var(--color-accent-2-100)", borderColor: "var(--color-accent-2)" } : undefined}>{st.voice ? "Voice on" : "Voice off"}</button>
                    <button className="btn btn-secondary" onClick={() => this.setState({ askOpen: !st.askOpen, mode: st.askOpen ? st.mode : "listen" })}>Ask the tutor</button>
                    {placing && <button className="btn btn-primary" onClick={this.check}>Check my answer</button>}
                    {!!a && <button className="btn btn-ghost" onClick={this.reveal}>Show me</button>}
                  </div>
                </div>

                {a && a.type === "type" && (
                  <form className="card inline-form" onSubmit={e => { e.preventDefault(); this.submitTyped(); }}>
                    <div className="field" style={{ flex: "1 1 220px" }}>
                      <label htmlFor="ts-answer">Your answer</label>
                      <input id="ts-answer" className="input" autoFocus autoComplete="off" value={st.typed} onChange={e => this.setState({ typed: e.target.value })} placeholder="Type it here" />
                    </div>
                    <button type="submit" className="btn btn-primary">Send to the tutor</button>
                    {!!(window.SpeechRecognition || window.webkitSpeechRecognition) && (
                      <button type="button" className="btn btn-secondary" onClick={this.micAnswer}>{st.listeningMic ? "Listening…" : "Answer out loud"}</button>
                    )}
                  </form>
                )}

                {st.askOpen && (
                  <div className="card" style={{ padding: "16px 18px", gap: 12 }}>
                    <div className="card-kicker">Your question — the lesson holds its place</div>
                    <form className="inline-form" style={{ padding: 0 }} onSubmit={e => { e.preventDefault(); this.askSend(); }}>
                      <div className="field" style={{ flex: "1 1 260px" }}>
                        <label htmlFor="ts-ask">Ask about this lesson</label>
                        <input id="ts-ask" className="input" autoFocus autoComplete="off" value={st.askText} onChange={e => this.setState({ askText: e.target.value })} placeholder="e.g. why does the place matter?" />
                      </div>
                      <button type="submit" className="btn btn-primary">Ask</button>
                    </form>
                    {st.askReply && (
                      <div className="ask-reply">
                        <div style={{ fontSize: 16, lineHeight: 1.4 }}>{st.askReply}</div>
                        <button className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => {
                          this.setState({ askOpen: false, askReply: "", askText: "", mode: st.awaiting ? "quiz" : "idle" });
                          this.say(step ? (st.awaiting && step.ask ? step.ask.prompt : step.say || "") : "Let us pick the lesson up again.");
                        }}>{st.stepIdx < 0 ? "Start the lesson" : "Back to step " + (st.stepIdx + 1)}</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {st.panelOpen && (
                <aside className="card elev-lg setup-panel">
                  <div>
                    <div className="card-kicker">Teacher setup</div>
                    <div className="card-title" style={{ margin: "2px 0 0" }}>Author this lesson</div>
                  </div>

                  <div className="field">
                    <label htmlFor="ts-title">Lesson title</label>
                    <input id="ts-title" className="input" value={l.title} onChange={e => { const v = e.target.value; this.editLesson(x => { x.title = v; }); }} />
                  </div>
                  <div className="field">
                    <label htmlFor="ts-obj">Objective</label>
                    <input id="ts-obj" className="input" value={l.objective} onChange={e => { const v = e.target.value; this.editLesson(x => { x.objective = v; }); }} />
                  </div>
                  <div className="field">
                    <label htmlFor="ts-kind">Board representation</label>
                    <select id="ts-kind" className="input" value={l.board.kind} onChange={e => { const v = e.target.value; this.editLesson(x => { x.board.kind = v; }); }}>
                      {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </select>
                  </div>

                  <div className="panel-group">
                    {sectionLabel("Board objects")}
                    {objects.map((ob, i) => (
                      <div key={ob.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input className="input input-sm" value={ob.label} onChange={e => { const v = e.target.value; this.editLesson(x => { x.objects[i].label = v; }); }} style={{ flex: "1 1 60px" }} />
                        <input className="input input-sm" value={String(ob.x)} title="Across %" onChange={e => { const v = Number(e.target.value) || 0; this.editLesson(x => { x.objects[i].x = v; }); }} style={{ width: 62 }} />
                        <input className="input input-sm" value={String(ob.y)} title="Down %" onChange={e => { const v = Number(e.target.value) || 0; this.editLesson(x => { x.objects[i].y = v; }); }} style={{ width: 62 }} />
                        <button className="btn btn-ghost" title="Remove" style={{ padding: "4px 10px" }} onClick={() => this.editLesson(x => { x.objects.splice(i, 1); })}>✕</button>
                      </div>
                    ))}
                    <button className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => this.editLesson(x => {
                      const n = (x.objects || []).length + 1;
                      x.objects = (x.objects || []).concat([{ id: "o" + Date.now(), label: "New " + n, x: 50, y: 50, shape: x.board.kind === "tiles" ? "tile" : x.board.kind === "circles" ? "circle" : "label" }]);
                    })}>Add object</button>
                  </div>

                  <div className="panel-group">
                    {sectionLabel("Teaching steps")}
                    {l.steps.map((s, i) => (
                      <div key={i} className="step-row" style={{ background: i === st.stepIdx ? "var(--color-accent-2-100)" : "var(--color-neutral-100)" }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span className="step-n">{i + 1}</span>
                          <select className="input input-xs" value={s.verb} onChange={e => { const v = e.target.value; this.editLesson(x => { x.steps[i].verb = v; }); }}>
                            {VERBS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                          </select>
                          <select className="input input-xs" value={[].concat(s.target || [""])[0]} onChange={e => { const v = e.target.value; this.editLesson(x => { x.steps[i].target = v || null; }); }}>
                            {targetOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <button className="btn btn-ghost" title="Move up" style={{ padding: "2px 8px" }} onClick={() => { if (!i) return; this.editLesson(x => { const t = x.steps[i - 1]; x.steps[i - 1] = x.steps[i]; x.steps[i] = t; }); }}>↑</button>
                          <button className="btn btn-ghost" title="Remove" style={{ padding: "2px 8px" }} onClick={() => this.editLesson(x => { x.steps.splice(i, 1); })}>✕</button>
                        </div>
                        <input className="input input-xs" value={s.say || ""} placeholder="What the tutor says" onChange={e => { const v = e.target.value; this.editLesson(x => { x.steps[i].say = v; }); }} />
                        <input className="input input-xs" value={(s.ask && s.ask.prompt) || ""} placeholder="Question on the board (leave blank for none)" style={{ opacity: s.ask ? 1 : 0.45 }}
                          onChange={e => { const v = e.target.value; this.editLesson(x => { if (!x.steps[i].ask) x.steps[i].ask = { type: "type", expect: [""] }; x.steps[i].ask.prompt = v; }); }} />
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8 }}>
                      <select className="input" value={st.addVerb} onChange={e => this.setState({ addVerb: e.target.value })} style={{ flex: 1, fontSize: 13 }}>
                        {VERBS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                      </select>
                      <button className="btn btn-secondary" onClick={() => this.editLesson(x => {
                        const v = st.addVerb;
                        x.steps = x.steps.concat([v === "ask"
                          ? { verb: "ask", say: "Your turn.", ask: { type: "type", prompt: "New question", expect: [""], hint: "Add a hint here." } }
                          : { verb: v, say: "New " + v + " step.", target: ((x.objects || [])[0] || {}).id || null }]);
                      })}>Add step</button>
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
                    {st.voices.length > 0 && (
                      <div className="field">
                        <label htmlFor="ts-voice">Tutor voice</label>
                        <select id="ts-voice" className="input" value={st.voiceName} onChange={e => { this.set({ voiceName: e.target.value }); setTimeout(() => { this.unlocked = true; this.speak("This is the voice I will teach with."); }, 60); }}>
                          {st.voices.map(v => <option key={v.name} value={v.name}>{v.name} — {v.lang}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="field">
                      <label htmlFor="ts-rate">Voice speed — {st.rate <= 0.72 ? "slow and clear" : st.rate >= 1.0 ? "quick" : "measured"}</label>
                      <input id="ts-rate" type="range" min="0.6" max="1.15" step="0.05" value={st.rate} className="range"
                        onChange={e => this.set({ rate: Number(e.target.value) })}
                        onPointerUp={() => setTimeout(() => { this.unlocked = true; this.speak("This is how fast I will speak."); }, 60)} />
                    </div>
                    <div className="field">
                      <label htmlFor="ts-pace">Teaching pace — {st.pace < 0.9 ? "unhurried" : st.pace > 1.3 ? "brisk" : "steady"}</label>
                      <input id="ts-pace" type="range" min="0.6" max="1.8" step="0.2" value={st.pace} className="range" onChange={e => this.set({ pace: Number(e.target.value) })} />
                    </div>
                    <button className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={this.testVoice}>Test voice</button>
                  </div>

                  <div className="panel-group">
                    {sectionLabel("Lesson file")}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn btn-secondary" onClick={() => this.downloadLesson(l)}>Download JSON</button>
                      <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
                        <span>Load JSON</span>
                        <input type="file" accept=".json,application/json" onChange={e => this.uploadLesson(e)} style={{ display: "none" }} />
                      </label>
                      <button className="btn btn-ghost" onClick={() => {
                        const demo = DEMO.find(x => x.id === st.lessonId);
                        if (demo) this.applyLessonJson(clone(demo), true);
                      }}>Restore demo</button>
                    </div>
                    <textarea className="input json-box" spellCheck="false" value={st.jsonText || JSON.stringify(l, null, 2)} onChange={e => this.setState({ jsonText: e.target.value })} />
                    <button className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => {
                      try { this.applyLessonJson(JSON.parse(st.jsonText || JSON.stringify(l)), true); }
                      catch (err) { this.setState({ jsonError: "Could not apply: " + err.message }); }
                    }}>Apply JSON</button>
                    {st.jsonError && <span style={{ fontSize: 13, color: "var(--color-accent-700)" }}>{st.jsonError}</span>}
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
                  {st.lessons.map(x => {
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
            {((l.tray || []).find(c => c.id === st.drag.id) || {}).label}
          </div>
        )}
      </div>
    );
  }
}
