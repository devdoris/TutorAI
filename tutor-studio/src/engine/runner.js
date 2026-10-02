// ─────────────────────────────────────────────────────────────────────────────
// THE EXECUTION LAYER.
//
// This file takes a script and renders it: it moves the tutor, changes the
// board, speaks, and stops to wait for the learner. It has no idea what a
// curriculum is, where a script came from, or whether a person or a model wrote
// it. Hand it a script and it will play it. That is the only contract.
//
// It imports ./script.js (the format) and nothing else.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeScript, boardFromScript, applyToBoard, moodFor, clone, arr } from "./script.js";

// Digits are written as figures on the board but spoken as words, so "4" has to
// be recognised in "Four." when lining the pointing up with the voice.
const SPOKEN = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five",
  "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten"
};
const tokenise = phrase => String(phrase || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
// Board labels are often a name and then its working ("Ada:  2 oranges  =  1300").
// The name is what gets said out loud, so it is worth trying on its own.
const firstWord = label => tokenise(label)[0] || "";

// The ways a phrase might have been said: as written, and with figures read out.
function phrasings(phrase) {
  const plain = tokenise(phrase);
  if (!plain.length) return [];
  const spoken = plain.map(t => SPOKEN[t] || t);
  return spoken.join(" ") === plain.join(" ") ? [plain] : [plain, spoken];
}

// The spoken line as a flat run of words, so a phrase matches however it was
// chopped up: "Ten thousands" arrives as two words, "thirty-two" as one holding
// two.
function streamOf(words) {
  const out = [];
  words.forEach(w => tokenise(w.word).forEach(tok => out.push({ tok, at: w.at })));
  return out;
}

// Where in the spoken line a phrase begins, searching from token `from`.
function findPhrase(toks, phrase, from) {
  const wants = phrasings(phrase);
  if (!wants.length) return null;
  for (let i = from; i < toks.length; i++) {
    for (const want of wants) {
      let ok = true;
      for (let k = 0; k < want.length; k++) {
        if (!toks[i + k] || toks[i + k].tok !== want[k]) { ok = false; break; }
      }
      if (ok) return { at: toks[i].at, next: i + want.length };
    }
  }
  return null;
}

// A cooperative cancellation token. Every await inside the loop is followed by a
// halt check, so pausing stops the tutor mid-sentence rather than at the end of
// the step.
class Halt {
  constructor() { this.stopped = false; }
  stop() { this.stopped = true; }
}

export class ScriptRunner {
  /**
   * @param io.onState  (snapshot) => void   engine pushes, the view renders
   * @param io.speak    (text) => Promise    resolves when spoken or cancelled
   * @param io.silence  () => void           cancel whatever is being spoken
   * @param io.wait     (ms) => Promise      honours the teacher's pace setting
   * @param io.onAsk    (ask, ctx) => void   the view puts the question up
   * @param io.onFinish (script) => void
   */
  constructor(io) {
    this.io = io;
    this.script = null;
    this.steps = [];
    this.board = { kind: "blank", heading: "", sub: "", objects: [], slots: [], tray: [] };
    this.cursor = -1;
    // Whether the step at `cursor` has already been performed. Seeking or
    // pausing leaves it false, so both Play and Next step re-run that step
    // rather than one of them silently skipping it.
    this.executed = false;
    this.status = "idle";     // idle | playing | paused | asking | done
    this.caption = "";
    this.focus = [];
    this.pending = [];   // on the board, but not written up yet
    this.mood = "idle";
    this.question = "";
    this.ask = null;
    this.stack = [];          // saved frames, one per active interjection
    this.halt = new Halt();
    this.pendingAnswer = null;
    this.readHalt = null;     // set while the tutor is reading a question out
  }

  // ── What the view sees ─────────────────────────────────────────────────────
  snapshot() {
    const s = this.script;
    return {
      scriptId: s ? s.id : "",
      title: s ? s.title : "",
      subject: s ? s.subject : "",
      objective: s ? s.objective : "",
      level: s ? s.level : 2,
      concept: s ? s.concept : "",
      source: s ? s.meta.source : "",
      faq: s ? s.faq : [],
      board: this.board,
      caption: this.caption,
      focus: this.focus,
      pending: this.pending,
      mood: this.mood,
      question: this.question,
      ask: this.ask,
      status: this.status,
      cursor: this.cursor,
      total: this.steps.length,
      // Non-empty while an answer script (or a simpler explanation) is playing
      // over the top of the lesson. The view uses it to show "Back to step N".
      interjecting: this.stack.length > 0,
      returnTo: this.stack.length ? this.stack[this.stack.length - 1].label : ""
    };
  }
  emit() { if (this.io.onState) this.io.onState(this.snapshot()); }

  // ── Loading ────────────────────────────────────────────────────────────────
  load(raw, opts) {
    const o = opts || {};
    this.stopAll();
    this.script = normalizeScript(raw);
    this.steps = this.script.steps;
    this.board = boardFromScript(this.script);
    this.cursor = -1;
    this.executed = false;
    this.status = "idle";
    this.caption = o.caption || "";
    this.focus = []; this.mood = "idle"; this.question = ""; this.ask = null; this.pending = [];
    this.stack = [];
    this.emit();
    if (o.autoplay) this.play();
    return this.script;
  }

  stopAll() {
    this.halt.stop();
    this.halt = new Halt();
    if (this.io.silence) this.io.silence();
    this.resolveAsk({ aborted: true });
  }

  // ── Transport ──────────────────────────────────────────────────────────────
  play() {
    if (!this.script) return;
    if (this.status === "playing" || this.status === "asking") return;
    // Finished, and asked to play again: start over.
    const from = this.status === "done" ? 0 : this.nextIndex();
    this.runFrom(from);
  }

  // The step that should run next: the one under the cursor if it was cut
  // short, otherwise the one after it.
  nextIndex() {
    if (this.cursor < 0) return 0;
    return this.executed ? Math.min(this.cursor + 1, this.steps.length) : this.cursor;
  }

  pause() {
    if (this.status !== "playing" && this.status !== "asking") return;
    this.stopAll();
    this.executed = false;
    this.status = "paused";
    this.mood = "idle";
    this.emit();
  }

  toggle() {
    if (this.status === "playing" || this.status === "asking") this.pause();
    else this.play();
  }

  // Run exactly one step and stop — the "Next step" button.
  async step() {
    if (!this.script) return;
    // Pressing it mid-step means "skip ahead"; pressing it while stopped on a
    // step means "do this one".
    const skipping = this.status === "playing" || this.status === "asking";
    this.stopAll();
    const i = Math.min(this.steps.length - 1, skipping ? this.cursor + 1 : this.nextIndex());
    const halt = this.halt;
    this.status = "playing"; this.emit();
    await this.exec(i, halt);
    if (halt.stopped) return;
    this.executed = true;
    this.status = "paused";
    this.emit();
  }

  seek(i) {
    if (!this.script) return;
    this.stopAll();
    // Rebuild the board from the start so jumping backwards is truthful: the
    // board shows what it would have shown had the script played to here.
    this.board = boardFromScript(this.script);
    for (let k = 0; k < i && k < this.steps.length; k++) this.board = applyToBoard(this.board, this.steps[k]);
    this.cursor = i;
    this.executed = false;
    this.status = "paused";
    this.focus = []; this.question = ""; this.ask = null; this.pending = []; this.mood = "idle"; this.pending = [];
    this.emit();
  }

  // ── The loop ───────────────────────────────────────────────────────────────
  async runFrom(from) {
    const halt = this.halt;
    this.status = "playing";
    this.emit();
    for (let i = from; i < this.steps.length; i++) {
      await this.exec(i, halt);
      if (halt.stopped) return;
      this.executed = true;
      await this.io.wait(320);
      if (halt.stopped) return;
    }
    this.status = "done";
    this.mood = "idle";
    this.focus = [];
    this.emit();
    if (this.io.onFinish) this.io.onFinish(this.script);
  }

  async exec(i, halt) {
    const step = this.steps[i];
    if (!step) return;
    this.cursor = i;
    this.executed = false;

    // 1. Persistent board change first, so the tutor points at something that
    //    is already there.
    this.board = applyToBoard(this.board, step);

    // 2. Transient state.
    this.mood = moodFor(step);
    this.focus = arr(step.at);
    this.pending = [];
    this.question = step.do === "ask" ? (step.ask.prompt || "") : "";
    this.ask = null;
    this.caption = step.text || (step.do === "ask" ? step.ask.prompt : this.caption);
    this.emit();

    switch (step.do) {
      case "wait":
        await this.io.wait(step.ms || 700);
        return;

      case "trace": {
        // Sweep across the targets in time with the words that name them. On a
        // fixed timer the pointer races ahead of the voice, and the tutor looks
        // like it is talking about one thing and pointing at another.
        const ids = arr(step.at);
        const plan = await this.cuePlan(step);
        if (plan) { this.focus = []; this.emit(); }
        const gap = plan ? 0 : await this.pace(step.text, ids.length, step.gap || 850);
        const sweep = (async () => {
          let elapsed = 0;
          for (let k = 0; k < ids.length; k++) {
            const due = plan ? Math.max(0, plan[k] - elapsed) : (k ? gap : 0);
            if (due) await this.io.wait(due);
            if (halt.stopped) return;
            elapsed += due;
            this.focus = [ids[k]];
            this.emit();
          }
        })();
        await Promise.all([this.say(step.text), sweep]);
        return;
      }

      case "compare": {
        const ids = arr(step.at);
        const plan = await this.cuePlan(step);
        const moves = plan ? plan.length : (step.times || 4);
        if (plan) { this.focus = []; this.emit(); }
        const gap = plan ? 0 : await this.pace(step.text, moves, step.gap || 700);
        const flip = (async () => {
          let elapsed = 0;
          for (let k = 0; k < moves; k++) {
            const due = plan ? Math.max(0, plan[k] - elapsed) : (k ? gap : 0);
            if (due) await this.io.wait(due);
            if (halt.stopped) return;
            elapsed += due;
            this.focus = [ids[k % ids.length]];
            this.emit();
          }
          if (!halt.stopped) { this.focus = ids; this.emit(); }
        })();
        await Promise.all([this.say(step.text), flip]);
        return;
      }

      case "ask": {
        // The question goes live before the tutor has finished reading it. The
        // prompt is already on the board, so a learner who knows the answer and
        // taps straight away must be credited, not ignored.
        this.status = "asking";
        this.ask = step.ask;
        this.emit();
        if (this.io.onAsk) this.io.onAsk(step.ask, { cursor: i });

        const answered = new Promise(res => { this.pendingAnswer = res; });
        const readHalt = new Halt();
        this.readHalt = readHalt;
        // The tutor says its line, then reads the question itself, so a learner
        // who is not reading still hears what is being asked.
        const reading = (async () => {
          await this.say(step.text);
          if (halt.stopped || readHalt.stopped) return;
          if (step.text && step.ask.prompt && step.text !== step.ask.prompt) {
            await this.io.wait(220);
            if (halt.stopped || readHalt.stopped) return;
            await this.say(step.ask.prompt);
          }
        })();

        const result = await answered;
        this.stopReading();        // answered early: stop reading the question out
        await reading;
        this.readHalt = null;
        this.pendingAnswer = null;
        if (result && result.aborted) return;
        this.ask = null;
        this.question = "";
        this.status = "playing";
        this.emit();
        await this.io.wait(result && result.ok ? 700 : 500);
        return;
      }

      case "show": {
        // Everything is on the board already, because where an object lands can
        // depend on how many there are. What is held back is the writing of it:
        // each one appears as the tutor says its name, so the learner's eye is
        // on the thing being talked about instead of reading ahead.
        const objs = arr(step.objects).filter(o => o && o.id);
        const plan = objs.length >= 2 ? await this.writePlan(step, objs) : null;
        if (!plan) { await this.say(step.text); return; }
        this.pending = objs.map(o => o.id);
        this.emit();
        const writing = (async () => {
          let elapsed = 0;
          for (let k = 0; k < objs.length; k++) {
            const due = Math.max(0, plan[k] - elapsed);
            if (due) await this.io.wait(due);
            if (halt.stopped) return;
            elapsed += due;
            this.pending = this.pending.filter(id => id !== objs[k].id);
            this.emit();
          }
        })();
        await Promise.all([this.say(step.text), writing]);
        // Paused, seeked or finished, the board must read the same either way.
        this.pending = [];
        this.emit();
        return;
      }

      case "praise":
        await this.say(step.text);
        if (!halt.stopped) await this.io.wait(700);
        return;

      default:
        await this.say(step.text);
        return;
    }
  }

  // When to make each move of a step that has several, so the tutor points at a
  // thing exactly as it says its name. Reads the word timings the renderer
  // captured and matches each target to the words that name it — the object's
  // place ("Tens"), its label ("4" heard as "four"), or a `cues` list the script
  // gives outright. Returns null when it cannot line every target up, because a
  // plan right about some and guessing about the rest looks worse than an even
  // sweep.
  async cuePlan(step) {
    const ids = arr(step.at);
    if (ids.length < 2) return null;
    const things = this.board.objects.concat(this.board.slots);
    const cues = arr(step.cues);
    return this.cueTimes(step.text, ids.map((id, i) => {
      const thing = things.find(o => o.id === id) || {};
      return cues[i] ? [cues[i]] : [thing.sub, thing.label, firstWord(thing.label)];
    }));
  }

  // The same question for a `show`: when is each of these objects named? The
  // script can say outright with `cues`, or an object can carry its own `cue`.
  async writePlan(step, objs) {
    const cues = arr(step.cues);
    return this.cueTimes(step.text, objs.map((o, i) => (
      cues[i] ? [cues[i]] : [o.cue, o.sub, o.label, firstWord(o.label)]
    )));
  }

  /**
   * When each of a line's targets is spoken. `wants[i]` holds the phrasings to
   * try for target i, best first. Null when any one of them cannot be found:
   * a plan that is right about some and guessing about the rest looks worse
   * than an even sweep, and worse than not trying at all.
   */
  async cueTimes(text, wants) {
    if (!text || !wants.length || !this.io.marks) return null;
    let words = [];
    try { words = (await this.io.marks(text)) || []; } catch { return null; }
    if (!words.length) return null;

    const toks = streamOf(words);
    const times = [];
    let from = 0;
    for (const phrasings of wants) {
      let hit = null;
      for (const phrase of phrasings) {
        if (!phrase) continue;
        hit = findPhrase(toks, phrase, from);
        if (hit) break;
      }
      if (!hit) return null;
      times.push(hit.at);
      from = hit.next;
    }
    return times;
  }

  // How long to leave between moves when there is nothing to line them up with:
  // spread them so the last lands near the end of the sentence.
  async pace(text, moves, fallback) {
    if (moves < 2) return fallback;
    let total = 0;
    if (text && this.io.duration) {
      try { total = Number(await this.io.duration(text)) || 0; } catch { total = 0; }
    }
    if (!total) return fallback;
    // The last move happens after moves-1 gaps, not moves of them.
    return Math.max(260, (total * 0.88) / (moves - 1));
  }

  // Stop reading the question aloud. The view calls this the moment a learner
  // submits an answer, so that the tutor does not carry on asking over the top
  // of its own reply. Doing nothing when the reading has already stopped is
  // what keeps it from cutting off the reply itself.
  stopReading() {
    if (!this.readHalt || this.readHalt.stopped) return;
    this.readHalt.stop();
    if (this.io.silence) this.io.silence();
  }

  async say(text) {
    if (!text) return;
    this.caption = text;
    this.emit();
    await this.io.speak(text);
  }

  // The view calls this when the learner has answered (or the answer was shown).
  resolveAsk(result) {
    const r = this.pendingAnswer;
    this.pendingAnswer = null;
    if (r) r(result || { ok: false });
  }
  answered(ok) { this.resolveAsk({ ok: !!ok }); }

  // ── Interjection ───────────────────────────────────────────────────────────
  // "When the student pauses and asks the question, we generate the script to
  //  answer that question." The answer is a script like any other, so the same
  //  engine plays it — over the top of the lesson, on its own board — and then
  //  puts the lesson back exactly as it was.
  async interject(raw, opts) {
    if (!this.script) return;
    const o = opts || {};
    this.stopAll();

    const frame = {
      script: this.script,
      steps: this.steps,
      board: clone(this.board),
      cursor: this.cursor,
      executed: this.executed,
      caption: this.caption,
      status: this.status === "done" ? "done" : "paused",
      label: o.label || (this.cursor >= 0 ? "step " + (this.cursor + 1) : "the start")
    };
    this.stack.push(frame);

    let sub;
    try {
      sub = normalizeScript(raw);
    } catch (e) {
      this.stack.pop();
      this.caption = "I could not put that answer together: " + e.message;
      this.emit();
      return;
    }

    this.script = sub;
    this.steps = sub.steps;
    // An answer script may start from a blank board, or carry the lesson's board
    // forward so the tutor can point at what the learner was just looking at.
    this.board = sub.board.inherit ? clone(frame.board) : boardFromScript(sub);
    if (sub.board.inherit) {
      // Still allow the answer script to add its own heading.
      if (sub.board.heading) this.board.heading = sub.board.heading;
      if (sub.board.sub) this.board.sub = sub.board.sub;
      this.board.objects = this.board.objects.concat(clone(sub.objects || []));
    }
    this.cursor = -1;
    this.executed = false;
    this.focus = []; this.question = ""; this.ask = null; this.pending = [];
    this.emit();
    await this.runFrom(0);
  }

  // Put the lesson back exactly where it was interrupted.
  resume() {
    if (!this.stack.length) { this.play(); return; }
    this.stopAll();
    const frame = this.stack.pop();
    this.script = frame.script;
    this.steps = frame.steps;
    this.board = frame.board;
    this.cursor = frame.cursor;
    this.executed = frame.executed;
    this.caption = frame.caption;
    this.status = frame.status;
    this.focus = []; this.question = ""; this.ask = null; this.pending = []; this.mood = "idle"; this.pending = [];
    this.emit();
  }

  // Resume and carry straight on playing.
  resumeAndPlay() {
    this.resume();
    if (this.status !== "done") this.play();
  }

  currentStep() { return this.steps[this.cursor] || null; }
}
