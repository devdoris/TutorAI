// ============================================================
//  TUTOR — plain JavaScript, no frameworks.
//
//  This file is the *view*. It draws the board, works the buttons, and speaks.
//  It does not decide what is taught: engine.js plays a script, generate.js
//  writes one, and this file shows the result.
//
//  1. State          what the screen remembers, and the engine wired to it
//  2. Voice          the tutor speaks (Mac voice first, browser voice second)
//  3. Scripts        opening a lesson, taking one in from outside
//  4. Answers        tap, type and drag answers, hints, "show me", questions
//  5. Drawing        the chalkboard and the stick-figure tutor on a <canvas>
//  6. Screens        the HTML parts: lesson cards, controls, progress table
//  7. Events         wiring buttons, clicks and dragging
// ============================================================


// ---------- 1. STATE ----------

const E = TutorEngineLib;
const G = TutorGenerate;

const EMPTY = {
  scriptId: "", title: "", subject: "", objective: "", level: 2, concept: "", source: "", faq: [],
  board: { kind: "blank", heading: "", sub: "", picture: "", objects: [], slots: [], tray: [], panels: [], layout: null, stage: null },
  caption: "", focus: [], mood: "idle", question: "", ask: null, transition: null,
  status: "idle", cursor: -1, total: 0, interjecting: false, returnTo: ""
};

const state = {
  screen: "lessons",        // "lessons" | "board" | "progress"
  curriculum: "NERDC",
  lessonId: null,           // the lesson being taught (not a generated answer)
  engine: EMPTY,            // the last picture the engine pushed to us
  flash: "",                // a line the tutor said that is not in the script
  nod: false,               // brief "that's right" body language
  usedHint: false,
  placements: {},           // drag answers: { cardId: slotId }
  selectedCard: null,
  feedback: {},             // { id: "right" | "wrong" } to colour answers
  voiceOn: true,
  askOpen: false,
  intakeOpen: false,
  received: [],             // scripts that arrived from outside
  progress: loadProgress()
};

function findThing(id) {
  const b = state.engine.board;
  const hit = b.objects.concat(b.slots).filter(o => o.id === id)[0];
  if (hit) return hit;
  // A panel of a divided board can be pointed at like anything else; its
  // centre is where the arm aims.
  const panels = b.panels || [];
  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    if (p.id === id || p.name === id || String(i + 1) === id) return { id: p.id, label: p.title, panel: true, x: p.cx, y: p.cy };
  }
  return null;
}

function loadProgress() {
  try { return JSON.parse(localStorage.getItem("tutor-progress")) || {}; } catch { return {}; }
}
function saveProgress() {
  try { localStorage.setItem("tutor-progress", JSON.stringify(state.progress)); } catch { /* private mode */ }
}

// Add to the learner's record. Recorded against the lesson, never against a
// generated answer script.
function record(changes) {
  const p = state.progress[state.lessonId] || { asks: 0, independent: 0, guided: 0, hints: 0, reveals: 0, wrong: 0 };
  for (const key in changes) p[key] += changes[key];
  state.progress[state.lessonId] = p;
  saveProgress();
}

// Mastery = right answers WITHOUT help, not lessons finished.
function statusOf(lessonId) {
  const p = state.progress[lessonId];
  if (!p || !p.asks) return { key: "none", label: "Not started" };
  if (p.independent >= 2 && !p.reveals && !p.hints && !p.wrong) return { key: "mastered", label: "Mastered" };
  if (p.independent + p.guided >= 1 && p.reveals <= 1) return { key: "developing", label: "Developing" };
  return { key: "support", label: "Needs support" };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// The execution layer, wired to this screen. Everything it needs from a
// browser — a voice, a clock, a place to draw — is handed to it here, and
// nothing else passes between them.
const runner = new E.ScriptRunner({
  onState: function (snap) {
    // A line the tutor said outside the script — marking an answer, giving a
    // hint — stays up until the script itself says something new.
    if (snap.caption !== state.engine.caption) state.flash = "";
    state.engine = snap;
    renderBoardScreen();
  },
  speak: text => speak(text),
  silence: () => stopVoice(),
  wait: ms => sleep(ms),
  duration: text => lineDuration(text),
  marks: text => lineMarks(text),
  onAsk: function (ask) {
    state.usedHint = false;
    state.feedback = {};
    state.nod = false;
    if (ask.type === "place") state.placements = {};
    const input = document.getElementById("answer-input");
    if (input) input.value = "";
  },
  onFinish: function () {
    record({});
    flash("That is the whole objective. Your progress is recorded by what you did without help.");
  }
});


// ---------- 2. VOICE ----------
// Three ways to say a line, best first:
//
//  1. A rendered file. server.py renders every line of a lesson ahead of time
//     with a Nigerian English voice, and the browser plays the file. It starts
//     instantly, sounds identical every run, and needs no network while
//     teaching.
//  2. The Mac's own voice, through server.py. Reliable, but it costs about a
//     second of silence before each line, which is what made the lesson sound
//     like it was stuttering.
//  3. The browser's speech engine, when the page was opened without the server.

let speaking = false;
let speechId = 0;

const player = new Audio();
player.preload = "auto";

const voice = {
  server: false,                  // is server.py there?
  id: "",                         // which rendered voice
  rate: "-8%",
  list: [],
  urls: Object.create(null),      // line -> audio url
  preparing: false,
  note: ""
};

function voiceNote(message) {
  voice.note = message || "";
  setVoiceNote(voice.note);
}
function setVoiceNote(message) {
  const el = document.getElementById("voice-note");
  if (el) el.textContent = message;
}

// Rough time a sentence takes to say, used when there is no voice at all.
function readingTime(text) {
  return 400 + String(text).split(" ").length * 440;
}

// Ask the server which voices it can render. Without a server (the page was
// opened straight from disk) this quietly fails and the browser voice is used.
fetch("/voices")
  .then(r => (r.ok ? r.json() : null))
  .then(function (info) {
    if (!info) return;
    voice.server = true;
    voice.list = info.voices || [];
    voice.rate = info.rate || voice.rate;
    let saved = "";
    try { saved = localStorage.getItem("tutor-voice") || ""; } catch { /* private mode */ }
    voice.id = (voice.list.some(v => v.id === saved) && saved) || info.default;
    renderVoicePicker();
    prepareCurrent();
  })
  .catch(() => {});

function renderVoicePicker() {
  const el = document.getElementById("voice-pick");
  if (!el || !voice.list.length) return;
  el.innerHTML = voice.list.map(v => `<option value="${v.id}">${escapeHtml(v.label)}</option>`).join("");
  el.value = voice.id;
  el.closest(".voice-pick-wrap").classList.remove("hidden");
}

// What the tutor could say while teaching a script — worked out in
// voice-lines.js, which prepare-voice.mjs uses too so the two never drift.
const linesFor = script => TutorVoiceLines.linesFor(script);
const introFor = script => TutorVoiceLines.introFor(script);

// Render a set of lines and remember where each one landed.
function prepare(lines, label) {
  if (!voice.server || !lines.length) return Promise.resolve();
  // The same line can appear twice in a script (a prompt the tutor reads after
  // its own words). Count it once, or the reply looks like a failure.
  const missing = lines.filter((t, i) => t && !voice.urls[t] && lines.indexOf(t) === i);
  if (!missing.length) return Promise.resolve();
  voice.preparing = true;
  voiceNote((label || "Preparing the tutor's voice") + "…");
  return fetch("/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voice: voice.id, rate: voice.rate, lines: missing })
  })
    .then(r => r.json())
    .then(function (res) {
      Object.assign(voice.urls, res.urls || {});
      voice.preparing = false;
      learnDurations(missing);
      const short = missing.length - Object.keys(res.urls || {}).length;
      if (res.error) {
        voiceNote("Could not render the voice (" + res.error + "). Using the Mac voice instead.");
      } else if (res.recorded) {
        // Your own voice: say how much of the lesson is actually you.
        const mine = Object.values(voice.urls).filter(u => u.indexOf("/audio/" + voice.id + "/") === 0).length;
        const all = Object.keys(voice.urls).length;
        voiceNote(mine === all ? "" : mine + " of " + all + " lines are in your voice; the rest use the Nigerian voice.");
      } else {
        voiceNote(short ? short + " line(s) could not be rendered; those will use the Mac voice." : "");
      }
    })
    .catch(function (err) {
      voice.preparing = false;
      voiceNote("Could not reach the voice renderer (" + err.message + "). Using the Mac voice.");
    });
}

// Warm up whatever is on the board now.
function prepareCurrent() {
  if (!runner.script) return Promise.resolve();
  return prepare(linesFor(runner.script));
}

// Warm up every lesson in the library. Worth doing once before a demo.
function prepareEverything() {
  if (!voice.server) { voiceNote("No local server, so there is nothing to render."); return; }
  const unique = TutorVoiceLines.allLines(G.LIBRARY);
  voiceNote("Rendering " + unique.length + " lines for every lesson. This takes a minute, once.");
  G.LIBRARY.forEach(warmIcons);
  prepare(unique, "Rendering every lesson").then(() => {
    if (!voice.note) voiceNote("Every lesson is ready. The voice will not need the network again.");
  });
}

// How long a line will take to say. Known exactly for a rendered file, which is
// what lets the engine match the tutor's pointing to the words. Zero means "no
// idea", and the engine falls back to the script's own timings.
const durations = Object.create(null);

function lineDuration(text) {
  if (!state.voiceOn) return Promise.resolve(0);
  const url = voice.urls[text];
  if (!url) return Promise.resolve(0);
  if (durations[url] !== undefined) return Promise.resolve(durations[url]);
  return new Promise(function (resolve) {
    let settled = false;
    const done = function (ms) {
      if (settled) return;
      settled = true;
      durations[url] = ms;
      resolve(ms);
    };
    const probe = new Audio();
    probe.preload = "metadata";
    probe.onloadedmetadata = () => done(isFinite(probe.duration) ? Math.round(probe.duration * 1000) : 0);
    probe.onerror = () => done(0);
    probe.src = url;
    // Never hold a lesson up to find this out.
    setTimeout(() => done(0), 500);
  });
}

// When each word of a line is spoken, captured by the renderer and saved beside
// the audio. This is what lets the tutor point at a thing exactly as it names
// it, instead of sweeping along on a guessed timer.
const marks = Object.create(null);

function lineMarks(text) {
  const url = voice.urls[text];
  if (!url) return Promise.resolve([]);
  if (marks[url] !== undefined) return Promise.resolve(marks[url]);
  const json = url.replace(/\.mp3$/, ".json");
  return fetch(json)
    .then(r => (r.ok ? r.json() : []))
    .catch(() => [])
    .then(function (words) {
      marks[url] = Array.isArray(words) ? words : [];
      return marks[url];
    });
}

// Reading the length of a file is quick, but doing it mid-step would still show.
// Once a lesson is prepared, learn them all quietly in the background.
function learnDurations(lines) {
  const urls = lines.map(t => voice.urls[t]).filter(u => u && durations[u] === undefined);
  let i = 0;
  const next = () => {
    if (i >= lines.length) return;
    const text = lines[i++];
    Promise.all([lineDuration(text), lineMarks(text)]).then(() => setTimeout(next, 0));
  };
  for (let k = 0; k < 4 && k < urls.length; k++) next();
}

function speak(text) {
  if (!state.voiceOn || !text) return sleep(readingTime(text || ""));
  const id = ++speechId;
  const url = voice.urls[text];
  if (url) return playFile(url, id);
  if (voice.server) return renderThenSpeak(text, id);
  return speakWithBrowser(text);
}

function playFile(url, id) {
  return new Promise(function (resolve) {
    let settled = false;
    const done = function () {
      if (settled) return;
      settled = true;
      player.onended = null;
      player.onerror = null;
      if (id === speechId) speaking = false;
      resolve();
    };
    player.onended = done;
    player.onerror = done;
    try {
      player.src = url;
      player.currentTime = 0;
      player.onloadedmetadata = () => {
        if (isFinite(player.duration)) durations[url] = Math.round(player.duration * 1000);
      };
      speaking = true;
      const started = player.play();
      if (started && started.catch) {
        started.catch(function () {
          // Chrome will not play audio until the page has been clicked once.
          voiceNote("Click anywhere on the page once to let the browser play the tutor's voice.");
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
function renderThenSpeak(text, id) {
  return prepare([text])
    .then(function () {
      if (id !== speechId) return;
      const url = voice.urls[text];
      return url ? playFile(url, id) : speakWithMac(text);
    })
    .catch(() => speakWithMac(text));
}

// The Mac's own voice. Reliable, but slow to start, so it is only the fallback.
function speakWithMac(text) {
  const id = ++speechId;
  speaking = true;
  return fetch("/say", { method: "POST", body: text })
    .catch(() => sleep(readingTime(text)))
    .then(() => { if (id === speechId) speaking = false; });
}

// Browser speech. Chrome on Mac sometimes never sends its "start"/"end" events,
// or gets stuck "speaking" forever, so we also watch the engine directly.
function speakWithBrowser(text) {
  return new Promise(function (resolve) {
    const expected = readingTime(text);
    if (!state.voiceOn || !window.speechSynthesis) { setTimeout(resolve, expected); return; }

    const id = ++speechId;
    let done = false;
    const finish = function () {
      if (done) return;
      done = true;
      if (id === speechId) speaking = false;
      resolve();
    };

    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = 0.92;
      u.onstart = () => { speaking = true; };
      u.onend = finish;
      u.onerror = finish;
      speechSynthesis.speak(u);
      speaking = true;
    } catch (err) {
      voiceNote("The browser voice failed to start: " + err.message);
      setTimeout(finish, expected);
      return;
    }

    // A generous backstop: long enough that it never cuts a sentence short,
    // which is what used to make the lesson skip.
    setTimeout(finish, expected * 2.5 + 2500);
    setTimeout(function () {
      if (!done && !speechSynthesis.speaking && !speechSynthesis.pending) {
        voiceNote("No sound yet. Check the tab is not muted, or open the app with start.command.");
      }
    }, 2500);
  });
}

function pickVoice() {
  const voices = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
  for (const lang of ["en-NG", "en-ZA", "en-GB", "en-US"]) {
    const v = voices.find(v => v.lang && v.lang.replace("_", "-") === lang);
    if (v) return v;
  }
  return voices.find(v => /^en/i.test(v.lang)) || null;
}

function stopVoice() {
  speechId++;
  try { player.pause(); } catch { /* nothing playing */ }
  if (voice.server) fetch("/stop", { method: "POST" }).catch(() => {});
  if (window.speechSynthesis) speechSynthesis.cancel();
  speaking = false;
}

// A line the tutor says that is not part of the script.
function flash(text) {
  state.flash = text;
  renderBoardScreen();
  return speak(text);
}


// ---------- 3. SCRIPTS ----------

// Start teaching one of the library's lessons.
function openLesson(id) {
  const script = G.byId(id) || state.received.filter(s => s.id === id)[0];
  if (!script) return;
  Object.assign(state, {
    screen: "board", lessonId: id, placements: {}, feedback: {},
    selectedCard: null, askOpen: false, usedHint: false, nod: false
  });
  runner.load(script);
  render();
  warmIcons(script);

  // Render the opening lines first so the lesson can start within a couple of
  // seconds, then fill in the rest while the tutor is already talking. On a
  // warm cache both are instant.
  const intro = introFor(script);
  const head = [intro].concat(linesFor(script).slice(1, 7));
  prepare(head).then(function () {
    if (state.lessonId !== id) return;
    prepareCurrent();
    flash(intro).then(function () {
      if (state.lessonId === id && state.engine.cursor < 0) runner.play();
    });
  });
}

// Everything that arrives from outside funnels through the intake, is checked
// against the format, and lands here. meta.mode decides whether it takes over
// the board or plays over the top of the lesson already running.
const intake = new E.Intake({
  onScript: function (script, source) {
    state.received = [script].concat(state.received.filter(s => s.id !== script.id)).slice(0, 10);
    state.screen = "board";
    if (script.meta.mode === "interject" && state.engine.scriptId) {
      interjectWith(script);
    } else {
      state.lessonId = script.id;
      runner.load(script, { caption: "Loaded " + script.title + " from " + source + ". Press play." });
    }
    render();
    prepareCurrent();
    warmIcons(script);
  },
  onReject: errors => { setIntakeError(errors.join(" ")); },
  onNote: () => renderIntake()
});

function stepLabel() {
  return state.engine.cursor >= 0 ? "step " + (state.engine.cursor + 1) : "the start";
}


// ---------- 4. ANSWERS ----------

const normalise = s => String(s).toLowerCase().replace(/[\s,]/g, "");

// The learner has answered: stop the tutor reading the question out before
// saying anything back, or the rest of the question lands on top of the reply.
function answering() {
  runner.stopReading();
}

// Show the right answer briefly as a nod, then let the script carry on.
function nodThen(fn) {
  state.nod = true;
  setTimeout(function () { state.nod = false; if (fn) fn(); }, 900);
}

// Learner tapped something on the board.
function tapThing(id) {
  const ask = state.engine.ask;
  answering();
  const thing = findThing(id);

  if (!ask || ask.type !== "select") {
    // Not a question. A thing that can be looked at closer comes forward;
    // anything else, the tutor just names.
    if (thing && thing.explain) { lookCloser(thing); return; }
    flash(thing && thing.sub ? (thing.label ? thing.label + ": " : "") + thing.sub : "This one is " + ((thing && thing.label) || "here") + ".");
    return;
  }

  const correct = [].concat(ask.expect).includes(id);
  if (correct) {
    state.feedback = { [id]: "right" };
    flash("Correct. " + (thing && thing.label && thing.sub ? thing.label + " is in the " + thing.sub.toLowerCase() + "." : "That is the one."));
    record(state.usedHint ? { asks: 1, guided: 1 } : { asks: 1, independent: 1 });
    nodThen(() => runner.answered(true));
  } else {
    state.feedback = { [id]: "wrong" };
    flash((thing && thing.label && thing.sub ? "That is the " + thing.sub.toLowerCase() + ". " : "Not that one. ") + (ask.hint || "Look again at what the question is asking."));
    record({ wrong: 1 });
  }
}

// Learner typed an answer.
function submitTyped(text) {
  const ask = state.engine.ask;
  if (!ask || ask.type !== "type") return;
  answering();
  const correct = [].concat(ask.expect).some(e => normalise(e) === normalise(text));
  if (correct) {
    flash("Yes, " + text.trim() + " is right.");
    record(state.usedHint ? { asks: 1, guided: 1 } : { asks: 1, independent: 1 });
    nodThen(() => runner.answered(true));
  } else {
    flash("Not yet. " + (ask.hint || "Try working it out one step at a time."));
    record({ wrong: 1 });
  }
}

// Put a card into a slot (drag-and-drop answers).
function placeCard(cardId, slotId) {
  for (const c in state.placements) if (state.placements[c] === slotId) delete state.placements[c];
  state.placements[cardId] = slotId;
  delete state.feedback[cardId];
  state.selectedCard = null;
  renderBoardScreen();
}

function checkPlacements() {
  const ask = state.engine.ask;
  if (!ask || ask.type !== "place") return;
  answering();
  const expect = ask.expect;
  const cards = Object.keys(expect);
  let right = 0;
  state.feedback = {};
  cards.forEach(function (card) {
    if (state.placements[card] === expect[card]) { right++; state.feedback[card] = "right"; }
    else if (state.placements[card]) state.feedback[card] = "wrong";
  });
  if (right === cards.length) {
    flash("All placed correctly.");
    record(state.usedHint ? { asks: 1, guided: 1 } : { asks: 1, independent: 1 });
    nodThen(() => runner.answered(true));
  } else {
    flash(right + " of " + cards.length + " are in the right place. " + (ask.hint || "Move the ones that do not fit."));
    record({ wrong: 1 });
  }
}

function giveHint() {
  const ask = state.engine.ask;
  state.usedHint = true;
  record({ hints: 1 });
  flash("A hint, not the answer: " + ((ask && ask.hint) || "Think about what the idea is for before applying the rule."));
}

// "Show me": the tutor gives the answer, and it counts as needing support.
function reveal() {
  const ask = state.engine.ask;
  if (!ask) return;
  answering();
  if (ask.type === "place") {
    state.placements = Object.assign({}, ask.expect);
    state.feedback = {};
    flash("Here is where they belong. We will come back to this so you can do it yourself.");
  } else if (ask.type === "select") {
    const id = [].concat(ask.expect)[0];
    const thing = findThing(id);
    state.feedback = { [id]: "right" };
    flash("This is the one" + (thing && thing.sub ? ", the " + thing.sub.toLowerCase() : "") + ". We will come back to it later.");
  } else {
    document.getElementById("answer-input").value = [].concat(ask.expect)[0];
    flash("The answer is " + [].concat(ask.expect)[0] + ". We will try this again later.");
  }
  record({ reveals: 1, asks: 1 });
  setTimeout(() => runner.answered(false), 1200);
}

// What the generator needs to know to answer a question about this board.
function answerContext() {
  const e = state.engine;
  return {
    faq: e.faq, board: e.board, focus: e.focus, concept: e.concept, level: e.level,
    objective: e.objective, scriptId: e.scriptId, step: runner.currentStep()
  };
}

// The learner asks a question. The answer is a script, which the same engine
// plays on the same board, before putting the lesson back where it was.
function askTutor(question) {
  const ctx = answerContext();
  const goWith = script => interjectWith(script);

  // "I don't understand" is a request for a simpler explanation, not a question.
  if (G.isConfusion(question)) {
    const lower = G.explainAtLevel((ctx.level || 2) - 1, ctx, G.LIBRARY);
    if (lower) { goWith(lower); return; }
  }
  G.generateAnswerScript(question, ctx).then(goWith);
}

// Play a script over the top of the lesson, with its voice ready first. The
// lines are usually already on disk, so this costs a round trip, not a render.
function interjectWith(script) {
  return prepare(linesFor(script)).then(() => runner.interject(script, { label: stepLabel() }));
}

// The learner tapped something that can be looked at closer. It comes forward
// on its own, the rest steps back, and the tutor goes through it: a script
// played over the lesson, so "Back to step N" returns to exactly where the
// lesson was. Tapping another one swaps it in rather than stacking looks on
// top of each other.
function lookCloser(thing) {
  if (state.engine.interjecting && runner.script && runner.script.meta.kind === "focus") runner.resume();
  const script = G.focusScript(thing, answerContext());
  if (script) interjectWith(script);
}

function explainSimpler() {
  const ctx = answerContext();
  const script = G.explainAtLevel((ctx.level || 2) - 1, ctx, G.LIBRARY) || G.breakDownStep(ctx.step, ctx);
  if (!script) { flash("This is already as simple as I can make it. Let us try it a different way."); return; }
  interjectWith(script);
}

function goDeeper() {
  const ctx = answerContext();
  const script = G.explainAtLevel((ctx.level || 2) + 1, ctx, G.LIBRARY);
  if (!script) { flash("There is nothing deeper than this for now."); return; }
  interjectWith(script);
}


// ---------- 5. DRAWING (canvas) ----------
// The canvas is 1000 x 620 units. The chalkboard sits on the right;
// the tutor stands on the left. A script's x / y values are % of the chalkboard.

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

const BOARD = { x: 252, y: 42, w: 708, h: 534 };
const BX = pct => BOARD.x + pct / 100 * BOARD.w;
const BY = pct => BOARD.y + pct / 100 * BOARD.h;
const U = BOARD.w / 100;   // 1% of the board's width

const C = {
  ink: "#201e1d", paper: "#f5ead8", chalkboard: "#2c332d", frame: "#8c491a",
  chalk: "#f3ecdc", faint: "rgba(243,236,220,0.45)", sage: "#a9b79b",
  accent: "#c67139", accentLight: "#ffc6a5", green: "#7a8a5e"
};
// Everything written on the board is chalk in a hand. Both names are kept
// because a heading is still written larger than the working under it.
const CHALK = '"Chalkboard SE", "Chalkboard", "Bradley Hand", "Segoe Print", "Comic Sans MS", "Marker Felt", system-ui, sans-serif';
const HEADING = CHALK;
const BODY = CHALK;
// Light colours are chalk and carry dust; dark ink on a highlight does not.
const DUSTY = ["#f3ecdc", "#a9b79b", "#ffc6a5", "#cfd8c4", "rgba(243,236,220,0.45)"];

let hitAreas = [];  // rebuilt every frame: what can be clicked on the canvas

// Tutor's current arm position; it glides toward where it should be.
const arm = { elbowX: 196, elbowY: 442, handX: 208, handY: 460 };
let stride = 0;   // how far she has stepped in toward the board

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * ratio;
  canvas.height = canvas.clientWidth * 0.62 * ratio;
}

function text(str, x, y, size, color, font = BODY, align = "center") {
  ctx.font = size + "px " + font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  const dusty = DUSTY.indexOf(color) >= 0;
  if (dusty) { ctx.shadowColor = "rgba(243,236,220,0.38)"; ctx.shadowBlur = 6; }
  ctx.fillText(str, x, y);
  if (dusty) { ctx.shadowBlur = 0; ctx.shadowColor = "transparent"; }
}

function wrapText(str, x, y, maxWidth, size, color) {
  ctx.font = size + "px " + BODY;
  const words = String(str).split(" ");
  let line = "";
  const lines = [];
  for (const w of words) {
    if (ctx.measureText(line + w).width > maxWidth && line) { lines.push(line.trim()); line = ""; }
    line += w + " ";
  }
  lines.push(line.trim());
  lines.forEach((l, i) => text(l, x, y + i * size * 1.25, size, color, BODY, "center"));
}

function roundRect(x, y, w, h, r, fill, stroke, lineWidth = 2, dashed = false) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) {
    ctx.setLineDash(dashed ? [8, 6] : []);
    ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke();
    ctx.setLineDash([]);
  }
}

function circle(x, y, r, fill, stroke, lineWidth = 2) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function line(x1, y1, x2, y2, color, width, dash = []) {
  ctx.beginPath();
  ctx.setLineDash(dash);
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round";
  ctx.stroke();
  ctx.setLineDash([]);
}

// Main drawing function, called ~60 times a second. It reads the board the
// engine last handed us, and nothing else.
function draw(now) {
  requestAnimationFrame(draw);
  if (state.screen !== "board" || !canvas.clientWidth) return;
  if (canvas.width !== Math.round(canvas.clientWidth * (window.devicePixelRatio || 1))) resizeCanvas();

  const scale = canvas.width / 1000;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, 1000, 620);
  hitAreas = [];

  const b = state.engine.board;
  roundRect(236, 26, 740, 566, 30, C.frame);
  roundRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h, 20, C.chalkboard);
  drawBoardLines(b.kind);
  if (b.picture === "plant-cell") drawPlantCell(b);
  drawPanels(b);

  text(b.heading, BX(3), BY(6), 4.4 * U, C.chalk, HEADING, "left");
  text(b.sub, BX(3), BY(14), 2.5 * U, "#cfd8c4", BODY, "left");
  if (state.engine.question) text(state.engine.question, BX(3), BY(95), 2.6 * U, C.accentLight, BODY, "left");

  b.slots.filter(s => s.place === "board").forEach(drawBoardSlot);
  // Objects the engine is still writing up are on the board but not in the
  // chalk yet; they arrive as the tutor says their names.
  const unwritten = state.engine.pending || [];
  b.objects.forEach(function (ob) { if (unwritten.indexOf(ob.id) < 0) drawObject(ob, now); });
  forgetGone(b, now);
  drawGhosts(now);
  drawMarks(b, now);
  drawRough(b, now);

  // A board emptied of a good deal of work was rubbed out, not stepped past.
  const count = b.objects.length + b.slots.length;
  if (lastCount >= 2 && count === 0) wipeAt = now;
  lastCount = count;
  if (now - wipeAt < WIPE_MS) drawWipe((now - wipeAt) / WIPE_MS);
  drawTransition(now);

  drawTutor(now);

  // Remember where everything landed, so next frame can write a new thing on
  // inside its own box, and so a thing that leaves can fade from where it was.
  prevAreas = Object.create(null);
  hitAreas.forEach(function (a) { prevAreas[a.id] = a; });
}

let prevAreas = Object.create(null);   // id -> hit area, from the last frame

// ---------- movement ----------
// Things glide to where the engine put them rather than jumping, so a row
// being re-spaced, a panel filling up, or something coming forward to centre
// stage is a movement the eye can follow. Things faded by the stage fade
// rather than vanish, and things taken off the board leave rather than blink.

const objPos = Object.create(null);    // id -> { x, y, s, a } where it is drawn now
const lastOb = Object.create(null);    // id -> the object as last drawn, for its ghost
const ghosts = Object.create(null);    // id -> { ob, at } things on their way out
const GLIDE = 0.16;
const GHOST_MS = 380;

function goalOf(ob) {
  const staged = ob.staged && ob.sx !== undefined;
  return {
    x: BX(staged ? ob.sx : ob.x), y: BY(staged ? ob.sy : ob.y),
    s: staged ? (ob.scale || 1.5) : 1,
    a: ob.hidden ? 0 : 1
  };
}

function settle(ob) {
  const g = goalOf(ob);
  let p = objPos[ob.id];
  if (!p) { p = objPos[ob.id] = { x: g.x, y: g.y, s: g.s, a: g.a }; return p; }
  p.x += (g.x - p.x) * GLIDE;
  p.y += (g.y - p.y) * GLIDE;
  p.s += (g.s - p.s) * GLIDE;
  p.a += (g.a - p.a) * 0.14;
  return p;
}

// Where a thing is drawn right now, for the arm to aim at: mid-glide, that is
// not yet where the engine put it.
function posOf(id) {
  const p = objPos[id];
  if (p) return { x: p.x, y: p.y };
  const t = findThing(id);
  return t ? { x: BX(t.x), y: BY(t.y) } : null;
}

// Anything taken off the board becomes a ghost that fades from where it was,
// and is then forgotten, so that if it is ever written up again it is written,
// not faded in halfway through.
function forgetGone(board, now) {
  const live = Object.create(null);
  board.objects.forEach(function (o) { live[o.id] = true; });
  for (const id in objBorn) if (!live[id]) delete objBorn[id];
  for (const id in objPos) {
    if (live[id]) continue;
    if (lastOb[id] && objPos[id].a > 0.5) ghosts[id] = { ob: lastOb[id], at: now, from: objPos[id] };
    delete objPos[id];
    delete lastOb[id];
  }
}

function drawGhosts(now) {
  for (const id in ghosts) {
    const g = ghosts[id];
    const t = (now - g.at) / GHOST_MS;
    if (t >= 1 || objPos[id]) { delete ghosts[id]; continue; }
    const s = g.from.s * (1 - 0.18 * t);
    ctx.save();
    ctx.globalAlpha = (1 - t) * (1 - t) * g.from.a;
    ctx.translate(g.from.x, g.from.y - 10 * t);
    ctx.scale(s, s);
    ctx.translate(-g.from.x, -g.from.y);
    const before = hitAreas.length;
    drawObjectBody(g.ob, g.from.x, g.from.y);
    hitAreas.splice(before);           // a ghost cannot be tapped
    ctx.restore();
  }
}

// ---------- the division of the board ----------
// A divided board shows its parts as faint chalk boxes, each with its title
// in the corner. They fade back while something is on centre stage, and a
// part the tutor is pointing at lights up like anything else.

let panelAlpha = 1;

function drawPanels(b) {
  const panels = b.panels || [];
  if (!panels.length) return;
  panelAlpha += ((b.stage ? 0.16 : 1) - panelAlpha) * 0.14;
  ctx.save();
  ctx.globalAlpha = panelAlpha;
  panels.forEach(function (p) {
    const x = BX(p.x), y = BY(p.y), w = p.w / 100 * BOARD.w, h = p.h / 100 * BOARD.h;
    const pointed = isPointing() && pointedId() === p.id;
    roundRect(x, y, w, h, 12,
      pointed ? "rgba(198,113,57,0.16)" : "rgba(243,236,220,0.035)",
      pointed ? C.accent : "rgba(243,236,220,0.28)", pointed ? 3 : 2, !pointed);
    if (p.title) text(p.title, x + 2 * U, y + 3.6 * U, 2.4 * U, pointed ? C.accentLight : C.sage, HEADING, "left");
    // So a mark can ring a whole part, and the arm can aim at it.
    if (!b.stage) hitAreas.push({ kind: "panel", id: p.id, x: x, y: y, w: w, h: h });
  });
  ctx.restore();
}

// ---------- changes of scene ----------
// One sweep across the board, the way an arm moves with a duster; or down it;
// or the board dims and brightens. Used when a board is emptied, and whenever
// a script asks for a transition instead of a pause.
let wipeAt = -99999, lastCount = 0;
const WIPE_MS = 620;
let transSeen = 0, transAt = -99999, transKind = "wipe", transMs = 650;

function drawTransition(now) {
  const t = state.engine.transition;
  if (t && t.seq !== transSeen) { transSeen = t.seq; transAt = now; transKind = t.kind; transMs = t.ms || 650; }
  const k = (now - transAt) / transMs;
  if (k < 0 || k >= 1) return;
  if (transKind === "sweep") drawSweep(k);
  else if (transKind === "fade") drawFade(k);
  else drawWipe(k);
}

function onBoard(paint) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h, 20);
  ctx.clip();
  paint();
  ctx.restore();
}

function drawWipe(t) {
  const band = BOARD.w * 0.42;
  const cx = BOARD.x - band + (BOARD.w + band * 2) * t;
  const g = ctx.createLinearGradient(cx - band / 2, 0, cx + band / 2, 0);
  g.addColorStop(0, "rgba(233,238,228,0)");
  g.addColorStop(0.5, "rgba(233,238,228,0.34)");
  g.addColorStop(1, "rgba(233,238,228,0)");
  onBoard(function () { ctx.fillStyle = g; ctx.fillRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h); });
}

function drawSweep(t) {
  const band = BOARD.h * 0.5;
  const cy = BOARD.y - band + (BOARD.h + band * 2) * t;
  const g = ctx.createLinearGradient(0, cy - band / 2, 0, cy + band / 2);
  g.addColorStop(0, "rgba(233,238,228,0)");
  g.addColorStop(0.5, "rgba(233,238,228,0.3)");
  g.addColorStop(1, "rgba(233,238,228,0)");
  onBoard(function () { ctx.fillStyle = g; ctx.fillRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h); });
}

function drawFade(t) {
  const a = Math.sin(t * Math.PI) * 0.55;
  onBoard(function () { ctx.fillStyle = "rgba(20,24,20," + a.toFixed(3) + ")"; ctx.fillRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h); });
}

// Background lines that depend on the kind of board.
function drawBoardLines(kind) {
  const chalkLine = (x1, y1, x2, y2, w, color = "#eae2cf", dash) => line(BX(x1), BY(y1), BX(x2), BY(y2), color, w, dash);
  if (kind === "numberline") {
    chalkLine(4, 50, 96, 50, 4);
    for (let i = 0; i <= 10; i++) chalkLine(4 + i * 9.2, 46, 4 + i * 9.2, 54, i % 5 === 0 ? 4 : 2, "#cfd8c4");
  } else if (kind === "axes") {
    for (let i = 1; i <= 8; i++) { chalkLine(12 + i * 10, 22, 12 + i * 10, 82, 1.5, "rgba(243,236,220,0.18)"); text(String(i), BX(12 + i * 10), BY(88), 18, C.sage); }
    for (let i = 1; i <= 6; i++) { chalkLine(12, 82 - i * 10, 94, 82 - i * 10, 1.5, "rgba(243,236,220,0.18)"); text(String(i), BX(8), BY(82 - i * 10), 18, C.sage); }
    chalkLine(12, 82, 94, 82, 4);
    chalkLine(12, 82, 12, 20, 4);
    text("0", BX(8), BY(88), 18, C.sage);
  } else if (kind === "stave") {
    for (let i = 0; i < 5; i++) chalkLine(10, 28 + i * 9, 92, 28 + i * 9, 3);
  } else if (kind === "timeline") {
    chalkLine(6, 44, 96, 44, 4);
  } else if (kind === "bars") {
    chalkLine(2, 30, 98, 30, 2, "rgba(243,236,220,0.35)", [10, 10]);
    chalkLine(2, 50, 98, 50, 2, "rgba(243,236,220,0.35)", [10, 10]);
  }
}

// Draw one thing on the board, coloured by whether it is pointed at, right, or wrong.
// Each thing is written on left to right rather than appearing whole. The box
// comes from the last frame, which already measured it; on the very first
// frame it is drawn invisibly, just to be measured.
const objBorn = Object.create(null);
const WRITE_MS = 460;

function drawObject(ob, now) {
  const at = typeof now === "number" ? now : performance.now();
  const p = settle(ob);
  lastOb[ob.id] = ob;
  if (ob.hidden && p.a < 0.03) return;         // faded right out: not drawn, not tappable
  if (objBorn[ob.id] === undefined) objBorn[ob.id] = at;
  const t = Math.min(1, (at - objBorn[ob.id]) / WRITE_MS);
  const box = t < 1 ? prevAreas[ob.id] : null;

  ctx.save();
  ctx.globalAlpha = t < 1 && !box ? 0 : p.a;
  if (box) {
    ctx.beginPath();
    ctx.rect(box.x - 4, box.y - 12, (box.w + 8) * t, box.h + 24);
    ctx.clip();
  }
  if (Math.abs(p.s - 1) > 0.001) { ctx.translate(p.x, p.y); ctx.scale(p.s, p.s); ctx.translate(-p.x, -p.y); }
  const before = hitAreas.length;
  drawObjectBody(ob, p.x, p.y);
  ctx.restore();

  // The hit box was measured before the stage scale; scale it too, and take
  // it away altogether from anything mostly faded.
  for (let i = before; i < hitAreas.length; i++) {
    const a = hitAreas[i];
    a.x = p.x + (a.x - p.x) * p.s; a.y = p.y + (a.y - p.y) * p.s; a.w *= p.s; a.h *= p.s;
  }
  if (p.a < 0.5) hitAreas.splice(before);
}

// ---------- pictures from the internet ----------
// An icon from a collection (icons.js says which), tinted to chalk and drawn
// like the hand-drawn ones; or a photo at a URL. Each is fetched once and kept:
// the local server keeps icons on disk, and the browser keeps the SVG text in
// its own storage, so a lesson opened once needs no network for its pictures.

const remoteImgs = Object.create(null);   // key -> { img, ready, failed }
const svgTexts = Object.create(null);     // ref -> Promise<string|null>

function svgFor(ref) {
  if (svgTexts[ref]) return svgTexts[ref];
  const key = "tutor-icon:" + ref;
  let kept = "";
  try { kept = localStorage.getItem(key) || ""; } catch { /* private mode */ }
  if (kept) return (svgTexts[ref] = Promise.resolve(kept));
  const url = TutorIconSource.urlFor(ref, voice.server);
  if (!url) return (svgTexts[ref] = Promise.resolve(null));
  svgTexts[ref] = fetch(url)
    .then(r => (r.ok ? r.text() : ""))
    .then(function (svg) {
      if (!/^\s*<svg/i.test(svg)) return null;
      try { localStorage.setItem(key, svg); } catch { /* full, or private mode */ }
      return svg;
    })
    .catch(() => null);
  return svgTexts[ref];
}

function remoteIcon(ref, colour) {
  const key = "icon|" + ref + "|" + colour;
  let r = remoteImgs[key];
  if (r) return r.ready ? r.img : null;
  r = remoteImgs[key] = { img: null, ready: false, failed: false };
  svgFor(ref).then(function (svg) {
    if (!svg) { r.failed = true; return; }
    const img = new Image();
    img.onload = () => { r.img = img; r.ready = true; };
    img.onerror = () => { r.failed = true; };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(TutorIconSource.tint(svg, colour));
  });
  return null;
}

function remotePhoto(url) {
  const key = "photo|" + url;
  let r = remoteImgs[key];
  if (r) return r.ready ? r.img : null;
  r = remoteImgs[key] = { img: null, ready: false, failed: false };
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => { r.img = img; r.ready = true; };
  img.onerror = () => { r.failed = true; };
  img.src = url;
  return null;
}

const isRemoteIcon = ob => !!ob.icon && !iconPaths(ob.icon) && TutorIconSource.isRemote(ob.icon);
// An icon that could not be fetched falls back to its written label.
const iconFailed = ref => ["icon|" + ref + "|" + C.chalk, "icon|" + ref + "|" + C.chalkboard].some(k => remoteImgs[k] && remoteImgs[k].failed);

// Start fetching every picture a script will need, so none is still loading
// when the tutor gets to it.
function warmIcons(script) {
  let s;
  try { s = E.normaliseScript(script); } catch { return; }
  const objs = s.objects.slice();
  s.steps.forEach(step => (step.objects || []).forEach(o => objs.push(o)));
  objs.forEach(function (o) {
    if (!o) return;
    if (isRemoteIcon(o)) { remoteIcon(o.icon, C.chalk); remoteIcon(o.icon, C.chalkboard); }
    if (o.image) remotePhoto(o.image);
  });
}

function drawRemoteIcon(ob, x, y, ink) {
  const m = measureIcon(ob);
  const size = m.size, many = m.many, label = m.label, row = m.row;
  const gap = size * 0.12;
  const top = y - m.h / 2;
  const img = remoteIcon(ob.icon, ink);
  ctx.save();
  if (ink === C.chalk) { ctx.shadowColor = "rgba(243,236,220,0.35)"; ctx.shadowBlur = 5; }
  for (let i = 0; i < many; i++) {
    const ix = x - row / 2 + i * (size + gap);
    if (img) ctx.drawImage(img, ix, top, size, size);
    else roundRect(ix + size * 0.1, top + size * 0.1, size * 0.8, size * 0.8, size * 0.16, null, C.faint, 2, true);   // still loading
  }
  ctx.restore();
  if (ob.label) text(ob.label, x, top + size + label * 0.8, label, ink);
  return m;
}

// A photo is drawn as a card with rounded corners; its label goes underneath.
function measurePhoto(ob) {
  const w = (ob.w || 26) * U, h = (ob.h || 18) * U;
  const label = ob.label ? (ob.labelSize || 2.6) * U : 0;
  return { w: w + 2 * U, h: h + (label ? label + 1.2 * U : 0), pw: w, ph: h, label: label };
}

function drawPhoto(ob, x, y, ink) {
  const m = measurePhoto(ob);
  const top = y - m.h / 2, left = x - m.pw / 2;
  const img = remotePhoto(ob.image);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(left, top, m.pw, m.ph, 10);
  ctx.clip();
  if (img) {
    // Cover the card, keeping the picture's shape.
    const k = Math.max(m.pw / img.width, m.ph / img.height);
    const dw = img.width * k, dh = img.height * k;
    ctx.drawImage(img, left + (m.pw - dw) / 2, top + (m.ph - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = "rgba(243,236,220,0.08)";
    ctx.fillRect(left, top, m.pw, m.ph);
  }
  ctx.restore();
  roundRect(left, top, m.pw, m.ph, 10, null, ink === C.chalk ? C.faint : ink, 2);
  if (ob.label) text(ob.label, x, top + m.ph + m.label * 0.8, m.label, ink);
  return m;
}

// A thing drawn rather than written: the same chalk paths the studio uses, run
// through Path2D. `count` repeats it, because six sweets is six sweets.
const ICON_CACHE = Object.create(null);
function iconPaths(name) {
  if (ICON_CACHE[name] === undefined) {
    const paths = TUTOR_ICONS[name];
    ICON_CACHE[name] = paths ? paths.map(function (d) { return new Path2D(d); }) : null;
  }
  return ICON_CACHE[name];
}

// How much room a row of drawings takes, caption included.
function measureIcon(ob) {
  const size = (ob.size || 9) * U;
  const many = Math.max(1, Math.min(12, ob.count || 1));
  const row = many * size + (many - 1) * size * 0.12;
  const label = ob.label ? (ob.labelSize || 2.6) * U : 0;
  let text = 0;
  if (ob.label) { ctx.font = label + "px " + BODY; text = ctx.measureText(ob.label).width; }
  return { size: size, many: many, label: label, row: row,
           w: Math.max(row, text) + 2 * U, h: size + (label ? label + 1.2 * U : 0) };
}

function drawIcon(ob, x, y, ink) {
  const paths = iconPaths(ob.icon);
  if (!paths) return null;                       // an icon nobody drew: write the label instead
  const m = measureIcon(ob);
  const size = m.size, many = m.many, label = m.label, row = m.row;
  const gap = size * 0.12;
  const top = y - m.h / 2;

  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (ink === C.chalk) { ctx.shadowColor = "rgba(243,236,220,0.35)"; ctx.shadowBlur = 5; }
  for (let i = 0; i < many; i++) {
    ctx.save();
    ctx.translate(x - row / 2 + i * (size + gap), top);
    ctx.scale(size / 100, size / 100);
    ctx.lineWidth = 4.5;                          // in the icon's own 100-unit space
    paths.forEach(function (path) { ctx.stroke(path); });
    ctx.restore();
  }
  ctx.restore();

  if (ob.label) text(ob.label, x, top + size + label * 0.8, label, ink);
  return m;
}

function drawObjectBody(ob, x, y) {
  if (x === undefined) { x = BX(ob.x); y = BY(ob.y); }
  const pointedAt = isPointing() && pointedId() === ob.id;
  const look = pointedAt ? "target" : state.feedback[ob.id] || "";
  const ring = look === "target" ? C.chalk : look === "right" ? C.green : look === "wrong" ? C.accentLight : C.faint;
  const fill = look === "target" ? C.accent : look === "right" ? C.green : "rgba(243,236,220,0.07)";
  const ink = look === "target" || look === "right" ? C.chalkboard : C.chalk;
  let w, h;

  if (ob.image) {
    const box = measurePhoto(ob);
    if (look) roundRect(x - box.w / 2, y - box.h / 2, box.w, box.h, 12, fill);
    drawPhoto(ob, x, y, ink);
    hitAreas.push({ kind: "object", id: ob.id, x: x - box.w / 2, y: y - box.h / 2, w: box.w, h: box.h });
    return;
  }

  if (isRemoteIcon(ob) && !iconFailed(ob.icon)) {
    const box = measureIcon(ob);
    if (look) roundRect(x - box.w / 2, y - box.h / 2, box.w, box.h, 10, fill);
    drawRemoteIcon(ob, x, y, ink);
    hitAreas.push({ kind: "object", id: ob.id, x: x - box.w / 2, y: y - box.h / 2, w: box.w, h: box.h });
    return;
  }

  if (ob.icon && iconPaths(ob.icon)) {
    // Measure first: drawing it, covering it with the highlight and drawing it
    // again leaves a ghost of the first pass around the edges.
    const box = measureIcon(ob);
    if (look) roundRect(x - box.w / 2, y - box.h / 2, box.w, box.h, 10, fill);
    drawIcon(ob, x, y, ink);
    hitAreas.push({ kind: "object", id: ob.id, x: x - box.w / 2, y: y - box.h / 2, w: box.w, h: box.h });
    return;
  }

  switch (ob.shape) {
    case "circle": {                        // place-value digit
      const r = 7.6 * U;
      circle(x, y, r, fill, ring, look === "target" ? 4 : 2);
      text(ob.label, x, y, 6.2 * U, ink, HEADING);
      // The place name goes UNDER the circle. Squeezed inside it, a long name
      // like "Ten thousands" spills straight over the edge.
      if (ob.sub) text(ob.sub, x, y + r + 2.4 * U, 2.1 * U, look === "target" ? C.chalk : C.sage);
      w = h = r * 2;
      break;
    }
    case "tile": {                          // word in a sentence
      ctx.font = 3 * U + "px " + BODY;
      w = ctx.measureText(ob.label).width + 4.8 * U; h = 5.8 * U;
      roundRect(x - w / 2, y - h / 2, w, h, h / 2, fill, ring);
      text(ob.label, x, y, 3 * U, ink);
      break;
    }
    case "bar": {                           // one part of a fraction bar
      w = (ob.w || 10) * U; h = 14 * U;
      roundRect(x - w / 2, y - h / 2, w, h, 11, look === "target" ? C.accent : ob.on ? C.green : "rgba(243,236,220,0.07)", ring);
      break;
    }
    case "note": {                          // note on a stave
      circle(x, y, 3 * U, look === "target" ? C.accent : look === "right" ? C.green : C.chalk, ring);
      w = h = 6 * U;
      break;
    }
    case "point": {                         // point on a graph
      circle(x, y, 2.3 * U, look === "target" ? C.accent : look === "right" ? C.green : C.chalk, ring);
      text(ob.label, x + 4 * U, y, 2.6 * U, C.chalk, HEADING);
      w = h = 6 * U;
      break;
    }
    case "node": {                          // event on a timeline
      circle(x, y, 2.5 * U, fill, ring, 3);
      text(ob.label, x, y - 5 * U, 2.6 * U, C.chalk, HEADING);
      wrapText(ob.sub, x, y + 5 * U, 18 * U, 2 * U, C.sage);
      w = h = 6 * U;
      break;
    }
    case "pin": {                           // marked number on a number line
      ctx.font = 3 * U + "px " + BODY;
      w = ctx.measureText(ob.label).width + 4 * U; h = 5 * U;
      roundRect(x - w / 2, y - h / 2, w, h, h / 2, look === "target" ? C.accent : C.frame, ring);
      text(ob.label, x, y, 3 * U, C.chalk);
      break;
    }
    default: {                              // plain label; a script can set its
      const size = (ob.size || 3) * U;      // own size — a comma needs to read as a comma
      ctx.font = size + "px " + BODY;
      w = ctx.measureText(ob.label).width + 3 * U; h = size + 2 * U;
      if (look) roundRect(x - w / 2, y - h / 2, w, h, 10, fill);
      text(ob.label, x, y, size, ink);
      if (ob.sub) text(ob.sub, x, y + h / 2 + 1.8 * U, 2.1 * U, C.sage);
    }
  }
  hitAreas.push({ kind: "object", id: ob.id, x: x - w / 2, y: y - h / 2, w, h });
}

// ---------- the rough-work pad ----------
// A teacher does the arithmetic in the corner, not across the middle of the
// lesson. The pad floats above the board with its own background, so working
// can never land on top of the thing being worked on, and it slides away when
// the sum is done.

let roughShown = 0;      // when the pad opened
let roughClosing = 0;    // when the tutor started putting it away
let roughLast = null;    // what was on it, so it can be drawn while it closes
const ROUGH = { x: 9, w: 82, bottom: 97, maxLines: 4, openMs: 260, closeMs: 420 };

function drawRough(board, now) {
  const pad = board.rough;
  if (pad && pad.open) {
    roughClosing = 0;
    roughLast = pad;
    if (!roughShown) roughShown = now;
    drawPad(pad, Math.min(1, (now - roughShown) / ROUGH.openMs), 0);
    return;
  }
  // Just closed. The tutor takes it away rather than it blinking out of
  // existence, and it is still there to be pointed at while it goes.
  if (roughShown && roughLast) { roughClosing = now; roughShown = 0; }
  if (!roughClosing || !roughLast) return;
  const t = (now - roughClosing) / ROUGH.closeMs;
  if (t >= 1) { roughClosing = 0; roughLast = null; return; }
  drawPad(roughLast, 1, t);
}

// `opening` runs 0 to 1 as it arrives; `closing` runs 0 to 1 as it leaves.
function drawPad(pad, opening, closing) {
  // The pad grows downwards from its own title as working is added, and is
  // pinned to the bottom of the board, so one line of arithmetic takes a small
  // pad and four lines take a taller one.
  const rows = Math.min((pad.lines || []).length, ROUGH.maxLines);
  const hPct = 11.5 + rows * 5.4;
  const x = BX(ROUGH.x), y = BY(ROUGH.bottom - hPct);
  const w = ROUGH.w / 100 * BOARD.w, h = hPct / 100 * BOARD.h;

  ctx.save();
  // Slides up into place as it opens, and drops away as it is put aside.
  ctx.translate(0, (1 - opening) * 18 + closing * closing * (h + 30));
  ctx.globalAlpha = Math.min(opening, 1 - closing * 0.75);
  roundRect(x, y, w, h, 16, "#3c463c", C.accent, 3);
  text(pad.title || "rough work", x + 3.2 * U, y + 4.2 * U, 2.6 * U, C.accentLight, BODY, "left");
  line(x + 3 * U, y + 6.6 * U, x + w - 3 * U, y + 6.6 * U, "rgba(243,236,220,0.22)", 2);
  (pad.lines || []).slice(0, ROUGH.maxLines).forEach(function (row, i) {
    text(row, x + 3.2 * U, y + 10 * U + i * 4.4 * U, 2.9 * U, C.chalk, BODY, "left");
  });
  ctx.restore();
  // So a step can point the tutor at the pad with at: ["rough"], including
  // while the tutor is taking it away.
  hitAreas.push({ kind: "object", id: "rough", x: x, y: y, w: w, h: h });
}

// ---------- chalk the tutor draws ----------
// A mark is fastened to an object rather than to a spot, so it stays put when
// the thing it marks moves. Each one draws itself on over a few hundred
// milliseconds, the way a hand would, instead of appearing all at once.

const markBorn = Object.create(null);
const DRAW_MS = 520;

// Where an object ended up this frame. hitAreas is rebuilt as the board is
// drawn, so it already knows the real size of every label and circle.
function areaOf(id) {
  for (let i = 0; i < hitAreas.length; i++) if (hitAreas[i].id === id) return hitAreas[i];
  return null;
}

// The box around everything a mark covers.
function boxOf(ids) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  ids.forEach(function (id) {
    const a = areaOf(id);
    if (!a) return;
    x1 = Math.min(x1, a.x); y1 = Math.min(y1, a.y);
    x2 = Math.max(x2, a.x + a.w); y2 = Math.max(y2, a.y + a.h);
  });
  if (x1 === Infinity) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
}

function drawMarks(board, now) {
  const live = {};
  (board.marks || []).forEach(function (m) {
    live[m.id] = true;
    if (markBorn[m.id] === undefined) markBorn[m.id] = now;
    const t = Math.min(1, (now - markBorn[m.id]) / DRAW_MS);
    const box = boxOf(m.at);
    if (!box) return;
    ctx.save();
    ctx.lineCap = "round";
    // Pale chalk rather than the accent colour: a mark often lands on the very
    // thing the tutor is pointing at, and that is already accent-coloured.
    ctx.strokeStyle = C.accentLight;
    ctx.lineWidth = 4.5;
    if (m.kind === "cross") drawCross(box, t);
    else if (m.kind === "underline") drawUnderline(box, t);
    else if (m.kind === "arrow") drawArrow(box, boxOf([m.to]), t);
    else drawRing(box, t);
    ctx.restore();
  });
  // Forget anything that has been rubbed out, so drawing it again starts over.
  for (const id in markBorn) if (!live[id]) delete markBorn[id];
}

function drawCross(box, t) {
  const pad = 10;
  const x1 = box.x - pad, y1 = box.y - pad, x2 = box.x + box.w + pad, y2 = box.y + box.h + pad;
  // First stroke, then the second, so it reads as two movements of a hand.
  const a = Math.min(1, t * 2), b = Math.max(0, t * 2 - 1);
  line(x1, y1, x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, C.accentLight, 4.5);
  if (b > 0) line(x2, y1, x2 - (x2 - x1) * b, y1 + (y2 - y1) * b, C.accentLight, 4.5);
}

function drawUnderline(box, t) {
  const y = box.y + box.h + 7;
  line(box.x - 4, y, box.x - 4 + (box.w + 8) * t, y, C.accentLight, 4.5);
}

function drawRing(box, t) {
  const rx = box.w / 2 + 12, ry = box.h / 2 + 9;
  ctx.beginPath();
  // Start at the top and come round, the way you would draw a circle by hand.
  ctx.ellipse(box.cx, box.cy, rx, ry, 0.08, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
  ctx.stroke();
}

function drawArrow(from, to, t) {
  if (!to) return;
  // Leave from the side of one row and arrive at the side of the other.
  const x1 = from.cx, y1 = from.y + from.h + 4;
  const x2 = to.cx, y2 = to.y - 4;
  const bend = 34;
  const mx = (x1 + x2) / 2 - bend;
  const px = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2;
  const py = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * ((y1 + y2) / 2) + t * t * y2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(mx, (y1 + y2) / 2, px, py);
  ctx.stroke();
  if (t > 0.92) {
    const ang = Math.atan2(y2 - (y1 + y2) / 2, x2 - mx);
    line(x2, y2, x2 - 13 * Math.cos(ang - 0.45), y2 - 13 * Math.sin(ang - 0.45), C.accentLight, 4.5);
    line(x2, y2, x2 - 13 * Math.cos(ang + 0.45), y2 - 13 * Math.sin(ang + 0.45), C.accentLight, 4.5);
  }
}

// Dashed box on the board that a card can be dropped onto.
function drawBoardSlot(slot) {
  const w = 22 * U, h = 8 * U;
  const x = BX(slot.x) - w / 2, y = BY(slot.y) - h / 2;
  const waiting = state.engine.ask && state.engine.ask.type === "place";
  roundRect(x, y, w, h, 14, "rgba(44,51,45,0.85)", waiting ? C.green : C.faint, 2, true);
  const card = cardInSlot(slot.id);
  text(card ? card.label : slot.label, x + w / 2, y + h / 2, card ? 2.4 * U : 2 * U, card ? C.chalk : C.sage);
  hitAreas.push({ kind: "slot", id: slot.id, x, y, w, h });
}

function cardInSlot(slotId) {
  return state.engine.board.tray.filter(c => state.placements[c.id] === slotId)[0];
}

// A simple drawn plant cell (Science lesson), with lines to the label slots.
function drawPlantCell(b) {
  const x0 = BX(3), y0 = BY(18), w = BOARD.w * 0.5, h = BOARD.h * 0.66;
  const P = (lx, ly) => [x0 + lx / 100 * w, y0 + ly / 100 * h];   // cell-picture % -> canvas
  roundRect(x0, y0, w, h, 16, "#f4efe2");
  const [wx, wy] = P(3, 5);
  roundRect(wx, wy, w * 0.94, h * 0.9, 40, "#b9d58f", "#55702f", 8);           // cell wall
  const [mx, my] = P(7.5, 9.5);
  roundRect(mx, my, w * 0.85, h * 0.81, 30, "#e3efc9", "#86a55a", 3, true);   // membrane
  const [vx, vy] = P(17, 50);
  roundRect(vx, vy, w * 0.52, h * 0.38, 50, "#bcdde8", "#5f98ab", 5);          // vacuole
  const [nx, ny] = P(70, 32);
  circle(nx, ny, w * 0.11, "#dcb48a", "#8c5a2b", 5);                           // nucleus
  circle(nx + 8, ny - 7, w * 0.036, "#a8703d");
  [[80, 72, -0.35], [84, 52, 0.5], [26, 26, 0.25], [44, 21, -0.2], [24, 40, 0.7], [50, 36, 0]].forEach(([lx, ly, rot]) => {
    const [cx, cy] = P(lx, ly);                                                // chloroplasts
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.06, h * 0.034, rot, 0, Math.PI * 2);
    ctx.fillStyle = "#4f8a37"; ctx.fill();
    ctx.strokeStyle = "#2f5a1e"; ctx.lineWidth = 3; ctx.stroke();
  });
  // Label lines: from each part to its slot.
  const parts = { pin_wall: P(97, 12), pin_nuc: P(70, 32), pin_chl: P(80, 72), pin_vac: P(43, 70) };
  b.slots.forEach(function (slot) {
    const from = parts[slot.id];
    if (!from) return;
    line(from[0], from[1], BX(slot.x) - 11 * U, BY(slot.y), "rgba(243,236,220,0.75)", 2, [5, 6]);
    circle(from[0], from[1], 6, C.chalk, C.chalkboard, 2);
  });
}

// What the tutor is pointing at, if anything. The engine sets one target at a
// time while tracing, so the arm follows the sweep.
function pointedId() {
  return (state.engine.focus || [])[0] || null;
}
function currentMood() {
  return state.nod ? "nod" : state.engine.mood;
}
function isPointing() {
  const id = pointedId();
  return !!id && !!findThing(id) && ["point", "trace", "compare", "nod", "quiz"].includes(currentMood());
}

// The stick-figure tutor.
function drawTutor(now) {
  const SX = 150, SY = 402;   // shoulders, in her own frame
  // A teacher does not point from where she was standing. The whole figure
  // glides in toward the board, so the arm has to aim at the target as seen
  // from there.
  stride += ((isPointing() ? 40 : 0) - stride) * 0.15;
  const mood = currentMood();
  let goal = { elbowX: SX + 46, elbowY: SY + 40, handX: SX + 58, handY: SY + 58 };
  let leftUp = false;
  let target = null;

  if (isPointing()) {
    target = posOf(pointedId());
    const angle = Math.atan2(target.y - SY, target.x - stride - SX);
    const ex = SX + 62 * Math.cos(angle - 0.35), ey = SY + 62 * Math.sin(angle - 0.35);
    goal = { elbowX: ex, elbowY: ey, handX: ex + 66 * Math.cos(angle), handY: ey + 66 * Math.sin(angle) };
  } else if (mood === "celebrate") {
    goal = { elbowX: SX + 52, elbowY: SY - 34, handX: SX + 66, handY: SY - 82 };
    leftUp = true;
  }
  for (const k in arm) arm[k] += (goal[k] - arm[k]) * 0.15;   // glide smoothly

  ctx.save();
  ctx.translate(stride, 0);
  if (mood === "celebrate") ctx.translate(0, -Math.abs(Math.sin(now / 260)) * 22);   // jump

  // legs, body, arms
  line(150, 498, 112, 588, C.ink, 9);
  line(150, 498, 192, 588, C.ink, 9);
  line(150, 378, 150, 500, C.ink, 10);
  const lx = leftUp ? [SX - 52, SY - 34, SX - 66, SY - 82] : [SX - 46, SY + 40, SX - 58, SY + 58];
  polyline([[SX, SY], [lx[0], lx[1]], [lx[2], lx[3]]]);
  polyline([[SX, SY], [arm.elbowX, arm.elbowY], [arm.handX, arm.handY]]);

  // head: tilts when listening or asking, nods when right
  let tilt = mood === "listen" ? -0.12 : mood === "quiz" ? 0.09 : 0;
  if (mood === "nod") tilt = Math.sin(now / 120) * 0.12;
  ctx.save();
  ctx.translate(150, 372); ctx.rotate(tilt); ctx.translate(-150, -372);
  circle(150, 332, 38, C.paper, C.ink, 9);
  circle(137, 326, 4.5, C.ink);
  circle(163, 326, 4.5, C.ink);
  if (speaking) {
    ctx.beginPath();
    ctx.ellipse(150, 346, 12, 3 + Math.abs(Math.sin(now / 90)) * 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.ink; ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(150, 334, 16, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 5; ctx.stroke();
  }
  ctx.restore();

  // listening ring and celebration sparks
  if (mood === "quiz" || mood === "listen") {
    ctx.globalAlpha = 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(now / 220));
    circle(150, 332, 60, null, C.green, 4);
    ctx.globalAlpha = 1;
  }
  if (mood === "celebrate") {
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now / 150);
    [[72, 286, 7], [228, 268, 9], [120, 238, 6]].forEach(([x, y, r]) => circle(x, y, r, C.accent));
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // dotted chalk line from the hand to what is being pointed at
  if (target) line(arm.handX + stride, arm.handY, target.x, target.y, C.accent, 3, [3, 12]);
}

function polyline(points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
  ctx.strokeStyle = C.ink; ctx.lineWidth = 9; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.stroke();
}

// Which clickable thing is at this canvas point?
function hitTest(x, y) {
  for (let i = hitAreas.length - 1; i >= 0; i--) {
    const a = hitAreas[i];
    if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return a;
  }
  return null;
}

function canvasPoint(event) {
  const r = canvas.getBoundingClientRect();
  return { x: (event.clientX - r.left) / r.width * 1000, y: (event.clientY - r.top) / r.height * 620 };
}


// ---------- 6. SCREENS (HTML) ----------

const $ = id => document.getElementById(id);
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const statusTag = key => ({ mastered: "tag tag-accent-2", developing: "tag tag-accent", support: "tag tag-neutral", none: "tag tag-outline" })[key];

function render() {
  for (const name of ["lessons", "board", "progress"]) $("screen-" + name).classList.toggle("hidden", state.screen !== name);
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.screen === state.screen));
  const cur = CURRICULA.find(c => c.id === state.curriculum);
  document.querySelectorAll(".curriculum-label").forEach(el => { el.textContent = cur.label; });
  $("curriculum").value = state.curriculum;

  if (state.screen === "lessons") renderLessons();
  if (state.screen === "board") renderBoardScreen();
  if (state.screen === "progress") renderProgress();
}

function renderLessons() {
  const extras = state.received.filter(r => r.level === 2 && !G.byId(r.id));
  $("lesson-grid").innerHTML = G.catalogue().concat(extras).map(function (l) {
    const available = l.curricula.includes(state.curriculum);
    const status = statusOf(l.id);
    const kind = (KINDS.find(k => k.value === l.board.kind) || {}).label || l.board.kind;
    return `
      <article class="card elev-sm lesson-card">
        <div class="top"><span class="card-kicker">${escapeHtml(l.subject)}</span><span class="${statusTag(status.key)}">${status.label}</span></div>
        <div class="card-title">${escapeHtml(l.title)}</div>
        <div class="card-body">${escapeHtml(l.objective)}</div>
        <div class="card-meta">${escapeHtml(kind)} · ${l.steps.length} steps</div>
        <button class="btn btn-primary" data-open="${l.id}" ${available ? "" : "disabled"}>${available ? "Teach this" : "Not in this curriculum yet"}</button>
      </article>`;
  }).join("");
}

function renderBoardScreen() {
  if (state.screen !== "board") return;
  const e = state.engine;
  const cur = CURRICULA.find(c => c.id === state.curriculum);
  const ask = e.ask;
  const playing = e.status === "playing" || e.status === "asking";

  $("lesson-subject").textContent = (e.subject || "Script") + " · " + cur.stage;
  $("lesson-title").textContent = e.title;
  $("lesson-objective").textContent = e.objective;
  $("step-label").textContent = e.cursor < 0 ? "Not started" : "Step " + (e.cursor + 1) + " of " + e.total;
  $("source-label").textContent = "source: " + (e.source || "—");
  $("caption").textContent = state.flash || e.caption || "Press play and I will start the lesson.";

  // While an answer script is playing, say so, and offer the way back.
  $("interject-bar").classList.toggle("hidden", !e.interjecting);
  $("interject-text").textContent = "Answering your question — the lesson is holding its place at " + e.returnTo + ".";
  $("btn-back").textContent = "Back to " + e.returnTo;

  $("btn-play").textContent = playing ? "Pause"
    : e.cursor < 0 ? "Play lesson"
    : e.status === "done" ? "Play again"
    : "Resume from step " + (e.cursor + 1);
  $("btn-voice").textContent = state.voiceOn ? "Voice on" : "Voice off";
  $("btn-voice").classList.toggle("on", state.voiceOn);
  $("btn-check").classList.toggle("hidden", !(ask && ask.type === "place"));
  $("btn-reveal").classList.toggle("hidden", !ask);
  $("answer-form").classList.toggle("hidden", !(ask && ask.type === "type"));
  $("ask-box").classList.toggle("hidden", !state.askOpen);
  $("intake-box").classList.toggle("hidden", !state.intakeOpen);

  // Tray of cards + row slots (sentence parts, timeline order)
  const tray = e.board.tray || [];
  $("tray").classList.toggle("hidden", tray.length === 0);
  const loose = tray.filter(c => !state.placements[c.id]);
  $("tray-chips").innerHTML = loose.length
    ? loose.map(c => `<button class="chip ${state.selectedCard === c.id ? "selected" : ""}" data-card="${c.id}">${escapeHtml(c.label)}</button>`).join("")
    : `<span class="muted">All cards placed.</span>`;
  $("row-slots").innerHTML = e.board.slots.filter(s => s.place !== "board").map(function (s) {
    const card = cardInSlot(s.id);
    const mark = card ? state.feedback[card.id] || "" : "";
    return `<div class="row-slot ${card ? "filled" : ""} ${mark}" data-slot="${s.id}"><small>${escapeHtml(s.label)}</small><span>${card ? escapeHtml(card.label) : "—"}</span></div>`;
  }).join("");
}

function setIntakeError(message) {
  $("intake-error").textContent = message || "";
}

function renderIntake() {
  $("intake-log").innerHTML = intake.log.length
    ? intake.log.map(row => `
        <div class="intake-row">
          <span class="${row.ok ? "tag tag-accent-2" : "tag tag-accent"}">${escapeHtml(row.source)}</span>
          <div><div>${escapeHtml(row.title)}</div><div class="muted" style="margin:0">${escapeHtml(row.at)} · ${escapeHtml(row.detail)}</div></div>
        </div>`).join("")
    : `<span class="muted">Nothing yet.</span>`;
}

function renderProgress() {
  const counts = { mastered: 0, developing: 0, support: 0 };
  G.catalogue().forEach(l => { const k = statusOf(l.id).key; if (k in counts) counts[k]++; });
  $("summary").innerHTML = [
    ["Mastered", counts.mastered, "var(--color-accent-2-700)", "Right without help, twice"],
    ["Developing", counts.developing, "var(--color-accent-700)", "Right with hints or after a slip"],
    ["Needs support", counts.support, "var(--color-neutral-700)", "Answer was shown, or repeated errors"]
  ].map(([label, n, color, note]) => `
    <div class="card"><span class="count" style="color:${color}">${n}</span><span>${label}</span><span class="muted" style="margin:0">${note}</span></div>`).join("");

  const stage = CURRICULA.find(c => c.id === state.curriculum).stage;
  const next = { mastered: "Move on to the next objective.", developing: "Repeat without hints.", support: "Reteach from the picture.", none: "Not attempted yet." };
  $("progress-rows").innerHTML = G.catalogue().map(function (l) {
    const p = state.progress[l.id] || {};
    const s = statusOf(l.id);
    return `<tr>
      <td><strong>${escapeHtml(l.title)}</strong><br><span class="muted" style="margin:0">${escapeHtml(l.subject)} · ${stage}</span></td>
      <td><span class="${statusTag(s.key)}">${s.label}</span></td>
      <td>${p.independent || 0}</td><td>${p.guided || 0}</td><td>${p.hints || 0}</td>
      <td>${next[s.key]}</td></tr>`;
  }).join("");
}

function goTo(screen) {
  if (screen === "board" && !state.lessonId) openLesson(G.catalogue()[0].id);
  state.screen = screen;
  window.scrollTo(0, 0);
  render();
}


// ---------- 7. EVENTS ----------

$("curriculum").innerHTML = CURRICULA.map(c => `<option value="${c.id}">${c.label}</option>`).join("");
$("curriculum").addEventListener("change", e => { state.curriculum = e.target.value; render(); });
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => goTo(t.dataset.screen)));
$("lesson-grid").addEventListener("click", e => { const b = e.target.closest("[data-open]"); if (b) openLesson(b.dataset.open); });

$("btn-play").addEventListener("click", () => runner.toggle());
$("btn-next").addEventListener("click", () => runner.step());
$("btn-hint").addEventListener("click", giveHint);
$("btn-reveal").addEventListener("click", reveal);
$("btn-check").addEventListener("click", checkPlacements);
$("btn-repeat").addEventListener("click", () => speak(state.flash || state.engine.caption));
$("btn-simpler").addEventListener("click", explainSimpler);
$("btn-deeper").addEventListener("click", goDeeper);
$("btn-back").addEventListener("click", () => runner.resumeAndPlay());

$("btn-test-voice").addEventListener("click", () => {
  state.voiceOn = true;
  renderBoardScreen();
  const line = "Hello. I am your tutor. If you can hear me, the voice is working.";
  const named = (voice.list.filter(v => v.id === voice.id)[0] || {}).label;
  const browserVoice = pickVoice();
  voiceNote(voice.server && named ? "Using " + named + ", rendered ahead of time."
    : voice.server ? "Using the Mac's own voice."
    : browserVoice ? "Using the browser voice: " + browserVoice.name + ". For the best sound, open the app with start.command."
    : "No English voice found; using the browser's default voice.");
  speak(line);
});
$("voice-pick").addEventListener("change", function (e) {
  voice.id = e.target.value;
  try { localStorage.setItem("tutor-voice", voice.id); } catch { /* private mode */ }
  // Rendered files are per voice, so the map starts again.
  voice.urls = Object.create(null);
  Object.keys(durations).forEach(k => delete durations[k]);
  Object.keys(marks).forEach(k => delete marks[k]);
  stopVoice();
  prepareCurrent().then(() => speak("This is the voice I will teach with."));
});
$("btn-prepare-all").addEventListener("click", prepareEverything);

$("btn-voice").addEventListener("click", () => {
  state.voiceOn = !state.voiceOn;
  if (!state.voiceOn) stopVoice();
  renderBoardScreen();
});
$("btn-ask").addEventListener("click", () => {
  state.askOpen = !state.askOpen;
  renderBoardScreen();
  if (state.askOpen) $("ask-input").focus();
});
$("ask-form").addEventListener("submit", e => {
  e.preventDefault();
  const q = $("ask-input").value.trim();
  if (!q) return;
  $("ask-input").value = "";
  state.askOpen = false;
  renderBoardScreen();
  askTutor(q);
});
$("answer-form").addEventListener("submit", e => { e.preventDefault(); submitTyped($("answer-input").value); });
$("btn-clear").addEventListener("click", () => { state.progress = {}; saveProgress(); render(); });

// Script intake: paste one, upload one, or see what has arrived.
$("btn-intake").addEventListener("click", () => {
  state.intakeOpen = !state.intakeOpen;
  renderBoardScreen();
  if (state.intakeOpen) renderIntake();
});
$("btn-run-script").addEventListener("click", () => runPasted("replace"));
$("btn-run-over").addEventListener("click", () => runPasted("interject"));
$("btn-load-current").addEventListener("click", () => { $("script-json").value = JSON.stringify(runner.script, null, 2); });
$("script-file").addEventListener("change", function (e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => intake.acceptText(String(r.result), "file");
  r.readAsText(file);
  e.target.value = "";
});

function runPasted(mode) {
  const txt = $("script-json").value.trim();
  setIntakeError("");
  if (!txt) { setIntakeError("Paste a script first."); return; }
  let raw;
  try { raw = JSON.parse(txt); }
  catch (err) { setIntakeError("Not valid JSON: " + err.message); return; }
  raw.meta = Object.assign({}, raw.meta, { mode: mode });
  intake.accept(raw, "paste");
}

// Clicking on the chalkboard: tap an object, or drop a selected card into a slot.
canvas.addEventListener("click", e => {
  const p = canvasPoint(e);
  const hit = hitTest(p.x, p.y);
  if (!hit) return;
  if (hit.kind === "slot" && state.selectedCard) placeCard(state.selectedCard, hit.id);
  else if (hit.kind === "object") tapThing(hit.id);
});
canvas.addEventListener("mousemove", e => {
  const p = canvasPoint(e);
  const hit = hitTest(p.x, p.y);
  canvas.style.cursor = hit && hit.kind !== "panel" ? "pointer" : "default";
});

// Tapping a row slot with a selected card.
$("row-slots").addEventListener("click", e => {
  const slot = e.target.closest("[data-slot]");
  if (slot && state.selectedCard) placeCard(state.selectedCard, slot.dataset.slot);
});

// Dragging a card. A short press without moving counts as a tap (select it).
let drag = null;
$("tray-chips").addEventListener("pointerdown", e => {
  const chip = e.target.closest("[data-card]");
  if (!chip) return;
  e.preventDefault();
  drag = { id: chip.dataset.card, startX: e.clientX, startY: e.clientY, moved: false };
});
window.addEventListener("pointermove", e => {
  if (!drag) return;
  if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 6) drag.moved = true;
  if (!drag.moved) return;
  const ghost = $("drag-ghost");
  ghost.textContent = (state.engine.board.tray.filter(c => c.id === drag.id)[0] || {}).label;
  ghost.style.display = "block";
  ghost.style.left = e.clientX + "px";
  ghost.style.top = e.clientY + "px";
});
window.addEventListener("pointerup", e => {
  if (!drag) return;
  const { id, moved } = drag;
  drag = null;
  $("drag-ghost").style.display = "none";
  if (!moved) { state.selectedCard = id; renderBoardScreen(); return; }

  const under = document.elementFromPoint(e.clientX, e.clientY);
  if (under === canvas) {
    const p = canvasPoint(e);
    const hit = hitTest(p.x, p.y);
    if (hit && hit.kind === "slot") placeCard(id, hit.id);
  } else {
    const slot = under && under.closest("[data-slot]");
    if (slot) placeCard(id, slot.dataset.slot);
  }
});

// Voices load late in some browsers: ask for them early so they are ready.
if (window.speechSynthesis) {
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
} else {
  voiceNote("This browser has no speech engine. Use Chrome or Edge, or open the app with start.command.");
}

// Open every channel a script can arrive on, then show the first screen.
intake.open();
runner.load(G.catalogue()[0], { caption: "Press play and I will start the lesson." });

// Links like index.html#progress (from the Demo notes page) open that screen.
const startScreen = location.hash.slice(1);
if (["board", "progress"].includes(startScreen)) goTo(startScreen); else render();
requestAnimationFrame(draw);
