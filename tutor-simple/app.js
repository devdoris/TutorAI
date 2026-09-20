// ============================================================
//  TUTOR — plain JavaScript, no frameworks.
//
//  1. State          everything the app remembers
//  2. Voice          the tutor speaks with the browser's speech engine
//  3. Teaching loop  play the lesson steps one by one
//  4. Answers        tap, type and drag answers, hints, "show me"
//  5. Drawing        the chalkboard and the stick-figure tutor on a <canvas>
//  6. Screens        the HTML parts: lesson cards, controls, progress table
//  7. Events         wiring buttons, clicks and dragging
// ============================================================


// ---------- 1. STATE ----------

const state = {
  screen: "lessons",        // "lessons" | "board" | "progress"
  curriculum: "NERDC",
  lessonId: null,
  stepIndex: -1,            // which step of the lesson we are on
  mode: "idle",             // what the tutor is doing: idle, point, trace, compare, quiz, nod, celebrate, listen
  target: null,             // id of the thing the tutor is pointing at
  caption: "",              // what the tutor just said
  question: "",             // question written on the board
  waitingFor: null,         // { type: "select" | "type" | "place", usedHint } while waiting for an answer
  placements: {},           // drag answers: { cardId: slotId }
  selectedCard: null,       // card picked by tapping (instead of dragging)
  feedback: {},             // { id: "right" | "wrong" } to colour answers
  playing: false,
  voiceOn: true,
  askOpen: false,
  askReply: "",
  progress: loadProgress()  // { lessonId: { asks, independent, guided, hints, reveals, wrong } }
};

function currentLesson() {
  return LESSONS.find(l => l.id === state.lessonId) || LESSONS[0];
}
function currentStep() {
  return currentLesson().steps[state.stepIndex];
}
function findThing(id) {
  const l = currentLesson();
  return (l.objects || []).concat(l.slots || []).find(o => o.id === id) || null;
}

function loadProgress() {
  try { return JSON.parse(localStorage.getItem("tutor-progress")) || {}; } catch { return {}; }
}
function saveProgress() {
  try { localStorage.setItem("tutor-progress", JSON.stringify(state.progress)); } catch { /* private mode */ }
}

// Add to the learner's record for the current lesson.
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


// ---------- 2. VOICE ----------

let speaking = false;

function pickVoice() {
  const voices = (window.speechSynthesis && speechSynthesis.getVoices()) || [];

  const femaleVoice = voices.find(v => /female|woman|girl|samantha|zira|aria|jenny|victoria|susan|hazel|rose|karen|samantha/i.test(v.name + " " + v.lang));
  if (femaleVoice) return femaleVoice;

  for (const lang of ["en-NG", "en-GB", "en-ZA", "en-US"]) {
    const v = voices.find(v => v.lang === lang);
    if (v) return v;
  }
  return voices.find(v => /^en/i.test(v.lang)) || null;
}

// Rough time it takes to say a sentence, used when the voice is off.
function readingTime(text) {
  return 400 + text.split(" ").length * 440;
}

// Two ways to speak:
//  - Mac voice: when the app is opened with start.command, server.py speaks each line with the
//    Mac's own voice. This is the most reliable, so we use it whenever it is available.
//  - Browser voice: the fallback (e.g. when index.html is opened by double-clicking).
let macVoice = false;
let speechId = 0;
fetch("/stop", { method: "POST" }).then(r => { macVoice = r.ok; }).catch(() => {});

function speak(text) {
  if (!state.voiceOn || !text) return sleep(readingTime(text || ""));
  return macVoice ? speakWithMac(text) : speakWithBrowser(text);
}

// Resolves when the Mac has finished saying the sentence (or was stopped).
function speakWithMac(text) {
  const id = ++speechId;
  speaking = true;
  return fetch("/say", { method: "POST", body: text })
    .catch(() => sleep(readingTime(text)))
    .then(() => { if (id === speechId) speaking = false; });
}

// Browser speech. Chrome on Mac sometimes never sends its "start"/"end" events, or gets stuck "speaking" forever.
// So we also watch the speech engine directly, and never wait much longer than the sentence
// should take: the lesson always keeps moving at a natural pace.
function speakWithBrowser(text) {
  return new Promise(resolve => {
    const expected = readingTime(text);
    if (!state.voiceOn || !window.speechSynthesis) { setTimeout(resolve, expected); return; }

    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.rate = 0.9;
    u.volume = 1;
    currentUtterance = u;   // keep a reference so Chrome does not throw it away mid-sentence

    let finished = false;
    let started = false;
    let heardEngine = false;
    const t0 = Date.now();
    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(watch);
      speaking = false;
      resolve();
    };
    u.onstart = () => { started = true; setVoiceNote(""); };
    u.onend = finish;
    u.onerror = e => {
      if (e.error !== "interrupted" && e.error !== "canceled") setVoiceNote("The browser refused to speak (" + e.error + ").");
      finish();
    };

    speechSynthesis.cancel();
    speechSynthesis.resume();
    setTimeout(() => { if (!finished) speechSynthesis.speak(u); }, 80);

    const watch = setInterval(() => {
      const elapsed = Date.now() - t0;
      speaking = speechSynthesis.speaking;                        // drives the tutor's mouth
      if (speechSynthesis.speaking && elapsed > 300) heardEngine = true;
      if (heardEngine && !speechSynthesis.speaking) finish();     // engine went quiet: done
      if (elapsed > expected + 1500) {                            // engine stuck: move on anyway
        if (!started) setVoiceNote("No sound from the browser voice. Open the app with start.command so the Mac speaks instead. The lesson still works with the captions.");
        finish();
      }
    }, 100);
  });
}
let currentUtterance = null;

function setVoiceNote(message) {
  const el = document.getElementById("voice-note");
  if (el) el.textContent = message;
}

// Show the words in the caption and say them.
function say(text) {
  state.caption = text;
  renderBoardScreen();
  return speak(text);
}

function stopVoice() {
  speechId++;
  if (macVoice) fetch("/stop", { method: "POST" }).catch(() => {});
  if (window.speechSynthesis) speechSynthesis.cancel();
  speaking = false;
}


// ---------- 3. TEACHING LOOP ----------

let runId = 0;              // bumps whenever we stop, so old loops know to quit
let answerReceived = null;  // resolves the "wait for an answer" pause

const sleep = ms => new Promise(r => setTimeout(r, ms));

function stopPlaying() {
  runId++;
  state.playing = false;
  answerReceived = null;
  stopVoice();
}

function openLesson(id) {
  stopPlaying();
  Object.assign(state, {
    screen: "board", lessonId: id, stepIndex: -1, mode: "idle", target: null,
    question: "", waitingFor: null, placements: {}, feedback: {}, selectedCard: null,
    askOpen: false, askReply: "", caption: ""
  });
  render();
  const myRun = runId;
  say("Let us learn " + currentLesson().title.toLowerCase() + ". I will teach it aloud. You can stop me at any time to ask a question.")
    .then(() => { if (myRun === runId && state.stepIndex < 0) play(); });
}

// Run one step: set the pose and board, say the line, and wait for an answer if it is a question.
async function runStep(i) {
  const step = currentLesson().steps[i];
  if (!step) return;
  const myRun = runId;
  const isQuestion = step.verb === "ask";

  state.stepIndex = i;
  state.target = [].concat(step.target || [null])[0];
  state.feedback = {};
  state.question = isQuestion ? step.ask.prompt : "";
  state.waitingFor = isQuestion ? { type: step.ask.type, usedHint: false } : null;
  state.mode = isQuestion ? "quiz" : step.verb === "praise" ? "celebrate" : step.verb === "explain" ? "idle" : step.verb;
  if (isQuestion && step.ask.type === "place") state.placements = {};
  document.getElementById("answer-input").value = "";

  // "trace" and "compare" move the pointer across several things.
  if (Array.isArray(step.target)) {
    step.target.forEach((id, k) => setTimeout(() => { if (myRun === runId) state.target = id; }, k * 900));
  }

  await say(step.say);
  if (myRun !== runId) return;

  if (isQuestion) {
    if (state.waitingFor && step.ask.prompt !== step.say) await say(step.ask.prompt);
    if (myRun !== runId) return;
    if (!state.waitingFor) { await sleep(1300); return; }   // already answered while the tutor was talking
    await new Promise(resolve => { answerReceived = resolve; });
  } else {
    await sleep(600);
  }
}

async function play() {
  if (state.playing) { stopPlaying(); say("Paused. Press play when you are ready."); return; }
  stopPlaying();
  const myRun = runId;
  state.playing = true;
  const steps = currentLesson().steps;
  const start = state.stepIndex + 1 >= steps.length ? 0 : state.stepIndex + 1;

  for (let i = start; i < steps.length; i++) {
    await runStep(i);
    if (myRun !== runId) return;
    await sleep(400);
  }
  state.playing = false;
  say("That is the whole objective. Your progress is recorded by what you did without help.");
}

function nextStep() {
  const i = state.stepIndex + 1;
  if (i >= currentLesson().steps.length) { say("That is the end of this lesson. Open Progress, or pick another lesson."); return; }
  stopPlaying();
  runStep(i);
}

// Called after a question is answered (or revealed): move on after a short pause.
function finishQuestion(correct) {
  const resume = answerReceived;
  answerReceived = null;
  state.waitingFor = null;
  state.question = "";
  renderBoardScreen();
  if (resume) setTimeout(resume, correct ? 1300 : 900);
}


// ---------- 4. ANSWERS ----------

const normalise = s => String(s).toLowerCase().replace(/[\s,]/g, "");

// Learner tapped something on the board.
function tapThing(id) {
  const step = currentStep();
  const thing = findThing(id);

  if (!state.waitingFor || state.waitingFor.type !== "select") {
    // Not a question: the tutor just points at it and names it.
    state.target = id;
    state.mode = "point";
    if (thing && thing.sub) say((thing.label ? thing.label + ": " : "") + thing.sub);
    return;
  }

  const correct = [].concat(step.ask.expect).includes(id);
  state.target = id;
  if (correct) {
    state.mode = "nod";
    state.feedback = { [id]: "right" };
    say("Correct. " + (thing && thing.label && thing.sub ? thing.label + " is in the " + thing.sub.toLowerCase() + "." : "That is the one."));
    record(state.waitingFor.usedHint ? { asks: 1, guided: 1 } : { asks: 1, independent: 1 });
    finishQuestion(true);
  } else {
    state.mode = "quiz";
    state.feedback = { [id]: "wrong" };
    say("Not that one. " + step.ask.hint);
    record({ wrong: 1 });
  }
}

// Learner typed an answer.
function submitTyped(text) {
  const step = currentStep();
  if (!state.waitingFor || state.waitingFor.type !== "type") return;
  const correct = [].concat(step.ask.expect).some(e => normalise(e) === normalise(text));
  if (correct) {
    state.mode = "nod";
    say("Yes, " + text.trim() + " is right.");
    record(state.waitingFor.usedHint ? { asks: 1, guided: 1 } : { asks: 1, independent: 1 });
    finishQuestion(true);
  } else {
    state.mode = "quiz";
    say("Not yet. " + step.ask.hint);
    record({ wrong: 1 });
  }
}

// Put a card into a slot (drag-and-drop answers).
function placeCard(cardId, slotId) {
  for (const c in state.placements) if (state.placements[c] === slotId) delete state.placements[c];
  state.placements[cardId] = slotId;
  delete state.feedback[cardId];
  state.selectedCard = null;
  state.target = slotId;
  state.mode = "point";
  renderBoardScreen();
}

function checkPlacements() {
  const step = currentStep();
  if (!state.waitingFor || state.waitingFor.type !== "place") return;
  const expect = step.ask.expect;
  let right = 0;
  const cards = Object.keys(expect);
  state.feedback = {};
  cards.forEach(card => {
    if (state.placements[card] === expect[card]) { right++; state.feedback[card] = "right"; }
    else if (state.placements[card]) state.feedback[card] = "wrong";
  });
  if (right === cards.length) {
    state.mode = "nod";
    say("All placed correctly.");
    record(state.waitingFor.usedHint ? { asks: 1, guided: 1 } : { asks: 1, independent: 1 });
    finishQuestion(true);
  } else {
    state.mode = "quiz";
    say(right + " of " + cards.length + " are in the right place. " + step.ask.hint);
    record({ wrong: 1 });
  }
}

function giveHint() {
  const step = currentStep();
  if (!step) { say("Press play and I will start the lesson."); return; }
  if (state.waitingFor) state.waitingFor.usedHint = true;
  record({ hints: 1 });
  say("A hint, not the answer: " + ((step.ask && step.ask.hint) || "Think about what the idea is for."));
}

// "Show me": the tutor gives the answer, and it counts as needing support.
function reveal() {
  const step = currentStep();
  if (!step || !step.ask || !state.waitingFor) return;
  const ask = step.ask;
  if (ask.type === "place") {
    state.placements = Object.assign({}, ask.expect);
    say("Here is where they belong. We will come back to this so you can do it yourself.");
  } else if (ask.type === "select") {
    state.target = [].concat(ask.expect)[0];
    state.mode = "point";
    say("This is the one. We will come back to it later.");
  } else {
    document.getElementById("answer-input").value = [].concat(ask.expect)[0];
    say("The answer is " + [].concat(ask.expect)[0] + ". We will try this again later.");
  }
  record({ reveals: 1, asks: 1 });
  finishQuestion(false);
}

// Learner asks a question. The tutor only answers inside the lesson's scope.
function askTutor(question) {
  const faq = currentLesson().faq || [];
  const match = faq.find(f => f.k.some(word => normalise(question).includes(normalise(word))));
  state.mode = "listen";
  state.askReply = match
    ? match.a
    : "That is outside what this lesson covers, so I will not guess. Let us finish this idea, and I will flag it for your teacher.";
  say(match ? "Good question. " + match.a : "Honest answer: that is beyond this lesson. I will flag it for your teacher.");
}


// ---------- 5. DRAWING (canvas) ----------
// The canvas is 1000 x 620 units. The chalkboard sits on the right;
// the tutor stands on the left. Lesson x / y values are % of the chalkboard.

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
const HEADING = '"Caprasimo", Georgia, serif';
const BODY = '"Figtree", system-ui, sans-serif';

let hitAreas = [];  // rebuilt every frame: what can be clicked on the canvas

// Tutor's current arm position; it glides toward where it should be.
const arm = { elbowX: 196, elbowY: 442, handX: 208, handY: 460 };

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
  ctx.fillText(str, x, y);
}

function wrapText(str, x, y, maxWidth, size, color) {
  ctx.font = size + "px " + BODY;
  const words = str.split(" ");
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

// Main drawing function, called ~60 times a second.
function draw(now) {
  requestAnimationFrame(draw);
  if (state.screen !== "board" || !canvas.clientWidth) return;
  if (canvas.width !== Math.round(canvas.clientWidth * (window.devicePixelRatio || 1))) resizeCanvas();

  const scale = canvas.width / 1000;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, 1000, 620);
  hitAreas = [];

  const lesson = currentLesson();
  roundRect(236, 26, 740, 566, 30, C.frame);
  roundRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h, 20, C.chalkboard);
  drawBoardLines(lesson.board.kind);
  if (lesson.id === "cell") drawPlantCell();

  text(lesson.board.heading, BX(3), BY(6), 4.4 * U, C.chalk, HEADING, "left");
  text(lesson.board.sub, BX(3), BY(14), 2.5 * U, "#cfd8c4", BODY, "left");
  if (state.question) text(state.question, BX(3), BY(95), 2.6 * U, C.accentLight, BODY, "left");

  if (window.__boardScriptState && window.__boardScriptState.visible) drawBoardScriptText();

  (lesson.slots || []).filter(s => s.place === "board").forEach(drawBoardSlot);
  (lesson.objects || []).forEach(drawObject);

  drawTutor(now);
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
function drawObject(ob) {
  const x = BX(ob.x), y = BY(ob.y);
  const pointedAt = isPointing() && state.target === ob.id;
  const look = pointedAt ? "target" : state.feedback[ob.id] || "";
  const ring = look === "target" ? C.chalk : look === "right" ? C.green : look === "wrong" ? C.accentLight : C.faint;
  const fill = look === "target" ? C.accent : look === "right" ? C.green : "rgba(243,236,220,0.07)";
  const ink = look === "target" || look === "right" ? C.chalkboard : C.chalk;
  let w, h;

  switch (ob.shape) {
    case "circle": {                        // place-value digit
      const r = 8.5 * U;
      circle(x, y, r, fill, ring, look === "target" ? 4 : 2);
      text(ob.label, x, y - 8, 7 * U, ink, HEADING);
      text(ob.sub, x, y + 30, 2 * U, look === "target" ? C.chalkboard : C.sage);
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
    default: {                              // plain label
      ctx.font = 3 * U + "px " + BODY;
      w = ctx.measureText(ob.label).width + 3 * U; h = 5 * U;
      if (look) roundRect(x - w / 2, y - h / 2, w, h, 10, fill);
      text(ob.label, x, y, 3 * U, ink);
    }
  }
  hitAreas.push({ kind: "object", id: ob.id, x: x - w / 2, y: y - h / 2, w, h });
}

// Dashed box on the board that a card can be dropped onto.
function drawBoardSlot(slot) {
  const w = 22 * U, h = 8 * U;
  const x = BX(slot.x) - w / 2, y = BY(slot.y) - h / 2;
  const waiting = state.waitingFor && state.waitingFor.type === "place";
  roundRect(x, y, w, h, 14, "rgba(44,51,45,0.85)", waiting ? C.green : C.faint, 2, true);
  const card = cardInSlot(slot.id);
  text(card ? card.label : slot.label, x + w / 2, y + h / 2, card ? 2.4 * U : 2 * U, card ? C.chalk : C.sage);
  hitAreas.push({ kind: "slot", id: slot.id, x, y, w, h });
}

function cardInSlot(slotId) {
  return (currentLesson().tray || []).find(c => state.placements[c.id] === slotId);
}

// A simple drawn plant cell (Science lesson), with lines to the label slots.
function drawPlantCell() {
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
  (currentLesson().slots || []).forEach(slot => {
    const from = parts[slot.id];
    if (!from) return;
    line(from[0], from[1], BX(slot.x) - 11 * U, BY(slot.y), "rgba(243,236,220,0.75)", 2, [5, 6]);
    circle(from[0], from[1], 6, C.chalk, C.chalkboard, 2);
  });
}

// Is the tutor currently pointing at something?
function isPointing() {
  return !!state.target && !!findThing(state.target) && ["point", "trace", "compare", "nod", "quiz"].includes(state.mode);
}

function drawBoardScriptText() {
  const script = window.__boardScriptState || { text: '', activeWordIndex: 0, visible: false, targetX: 0, targetY: 0, lines: [] };
  if (!script.visible) return;

  const words = String(script.text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return;

  const lines = Array.isArray(script.lines) && script.lines.length ? script.lines : (() => {
    const parsed = [];
    for (let i = 0; i < words.length; i += 6) parsed.push(words.slice(i, i + 6));
    return parsed.length ? parsed : [words];
  })();

  const boardX = 252;
  const boardY = 42;
  const boardW = 708;
  const boardH = 534;
  const centerX = boardX + boardW / 2;
  const baseY = boardY + boardH * 0.44;
  const lineSpacing = 52;

  ctx.save();
  ctx.textBaseline = 'middle';

  let globalIndex = 0;
  lines.forEach((lineWords, lineIndex) => {
    let lineWidth = 0;
    lineWords.forEach((word) => {
      ctx.font = '28px "Figtree", system-ui, sans-serif';
      lineWidth += ctx.measureText(word).width + 18;
    });
    lineWidth -= 18;

    let x = centerX - lineWidth / 2;
    const y = baseY + lineIndex * lineSpacing;

    lineWords.forEach((word, index) => {
      const wordIndex = globalIndex + index;
      const active = wordIndex === script.activeWordIndex;
      ctx.font = active ? '700 28px "Figtree", system-ui, sans-serif' : '28px "Figtree", system-ui, sans-serif';
      ctx.fillStyle = active ? '#f7c37d' : '#f3ecdc';
      ctx.textAlign = 'left';
      ctx.fillText(word, x, y);
      x += ctx.measureText(word).width + 18;
    });

    globalIndex += lineWords.length;
  });

  ctx.restore();
}

// The stick-figure tutor.
function drawTutor(now) {
  const SX = 150, SY = 402;   // shoulders
  let goal = { elbowX: SX + 46, elbowY: SY + 40, handX: SX + 58, handY: SY + 58 };
  let leftUp = false;
  let target = null;

  if (window.__boardScriptState && window.__boardScriptState.visible) {
    target = { x: window.__boardScriptState.targetX || 480, y: window.__boardScriptState.targetY || 260 };
    const angle = Math.atan2(target.y - SY, target.x - SX);
    const ex = SX + 62 * Math.cos(angle - 0.35), ey = SY + 62 * Math.sin(angle - 0.35);
    goal = { elbowX: ex, elbowY: ey, handX: ex + 66 * Math.cos(angle), handY: ey + 66 * Math.sin(angle) };
  } else if (isPointing()) {
    const t = findThing(state.target);
    target = { x: BX(t.x), y: BY(t.y) };
    const angle = Math.atan2(target.y - SY, target.x - SX);
    const ex = SX + 62 * Math.cos(angle - 0.35), ey = SY + 62 * Math.sin(angle - 0.35);
    goal = { elbowX: ex, elbowY: ey, handX: ex + 66 * Math.cos(angle), handY: ey + 66 * Math.sin(angle) };
  } else if (state.mode === "celebrate") {
    goal = { elbowX: SX + 52, elbowY: SY - 34, handX: SX + 66, handY: SY - 82 };
    leftUp = true;
  }
  for (const k in arm) arm[k] += (goal[k] - arm[k]) * 0.15;   // glide smoothly

  ctx.save();
  if (state.mode === "celebrate") ctx.translate(0, -Math.abs(Math.sin(now / 260)) * 22);   // jump

  // legs, body, arms
  line(150, 498, 112, 588, C.ink, 9);
  line(150, 498, 192, 588, C.ink, 9);
  line(150, 378, 150, 500, C.ink, 10);
  const lx = leftUp ? [SX - 52, SY - 34, SX - 66, SY - 82] : [SX - 46, SY + 40, SX - 58, SY + 58];
  polyline([[SX, SY], [lx[0], lx[1]], [lx[2], lx[3]]]);
  polyline([[SX, SY], [arm.elbowX, arm.elbowY], [arm.handX, arm.handY]]);

  // head: tilts when listening or asking, nods when right
  let tilt = state.mode === "listen" ? -0.12 : state.mode === "quiz" ? 0.09 : 0;
  if (state.mode === "nod") tilt = Math.sin(now / 120) * 0.12;
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
  if (state.mode === "quiz" || state.mode === "listen") {
    ctx.globalAlpha = 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(now / 220));
    circle(150, 332, 60, null, C.green, 4);
    ctx.globalAlpha = 1;
  }
  if (state.mode === "celebrate") {
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now / 150);
    [[72, 286, 7], [228, 268, 9], [120, 238, 6]].forEach(([x, y, r]) => circle(x, y, r, C.accent));
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // dotted chalk line from the hand to what is being pointed at
  if (target) line(arm.handX, arm.handY, target.x, target.y, C.accent, 3, [3, 12]);
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
  $("lesson-grid").innerHTML = LESSONS.map(l => {
    const available = l.curricula.includes(state.curriculum);
    const status = statusOf(l.id);
    const kind = (KINDS.find(k => k.value === l.board.kind) || {}).label;
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
  const lesson = currentLesson();
  const cur = CURRICULA.find(c => c.id === state.curriculum);
  const waiting = state.waitingFor;

  $("lesson-subject").textContent = lesson.subject + " · " + cur.stage;
  $("lesson-title").textContent = lesson.title;
  $("lesson-objective").textContent = lesson.objective;
  $("step-label").textContent = state.stepIndex < 0 ? "Not started" : "Step " + (state.stepIndex + 1) + " of " + lesson.steps.length;
  $("caption").textContent = state.caption || "Press play and I will start the lesson.";

  $("btn-play").textContent = state.playing ? "Pause" : state.stepIndex < 0 ? "Play lesson" : "Continue";
  $("btn-voice").textContent = state.voiceOn ? "Voice on" : "Voice off";
  $("btn-voice").classList.toggle("on", state.voiceOn);
  $("btn-check").classList.toggle("hidden", !(waiting && waiting.type === "place"));
  $("btn-reveal").classList.toggle("hidden", !waiting);
  $("answer-form").classList.toggle("hidden", !(waiting && waiting.type === "type"));
  $("ask-box").classList.toggle("hidden", !state.askOpen);
  $("ask-reply").classList.toggle("hidden", !state.askReply);
  $("ask-reply-text").textContent = state.askReply;

  // Tray of cards + row slots (sentence parts, timeline order)
  const tray = lesson.tray || [];
  $("tray").classList.toggle("hidden", tray.length === 0);
  const loose = tray.filter(c => !state.placements[c.id]);
  $("tray-chips").innerHTML = loose.length
    ? loose.map(c => `<button class="chip ${state.selectedCard === c.id ? "selected" : ""}" data-card="${c.id}">${escapeHtml(c.label)}</button>`).join("")
    : `<span class="muted">All cards placed.</span>`;
  $("row-slots").innerHTML = (lesson.slots || []).filter(s => s.place !== "board").map(s => {
    const card = cardInSlot(s.id);
    const mark = card ? state.feedback[card.id] || "" : "";
    return `<div class="row-slot ${card ? "filled" : ""} ${mark}" data-slot="${s.id}"><small>${escapeHtml(s.label)}</small><span>${card ? escapeHtml(card.label) : "—"}</span></div>`;
  }).join("");
}

function renderProgress() {
  const counts = { mastered: 0, developing: 0, support: 0 };
  LESSONS.forEach(l => { const k = statusOf(l.id).key; if (k in counts) counts[k]++; });
  $("summary").innerHTML = [
    ["Mastered", counts.mastered, "var(--color-accent-2-700)", "Right without help, twice"],
    ["Developing", counts.developing, "var(--color-accent-700)", "Right with hints or after a slip"],
    ["Needs support", counts.support, "var(--color-neutral-700)", "Answer was shown, or repeated errors"]
  ].map(([label, n, color, note]) => `
    <div class="card"><span class="count" style="color:${color}">${n}</span><span>${label}</span><span class="muted" style="margin:0">${note}</span></div>`).join("");

  const stage = CURRICULA.find(c => c.id === state.curriculum).stage;
  const next = { mastered: "Move on to the next objective.", developing: "Repeat without hints.", support: "Reteach from the picture.", none: "Not attempted yet." };
  $("progress-rows").innerHTML = LESSONS.map(l => {
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
  if (screen === "board" && !state.lessonId) state.lessonId = LESSONS[0].id;
  state.screen = screen;
  window.scrollTo(0, 0);
  render();
}


// ---------- 7. EVENTS ----------

$("curriculum").innerHTML = CURRICULA.map(c => `<option value="${c.id}">${c.label}</option>`).join("");
$("curriculum").addEventListener("change", e => { state.curriculum = e.target.value; render(); });
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => goTo(t.dataset.screen)));
$("lesson-grid").addEventListener("click", e => { const b = e.target.closest("[data-open]"); if (b) openLesson(b.dataset.open); });

$("btn-play").addEventListener("click", play);
$("btn-next").addEventListener("click", nextStep);
$("btn-hint").addEventListener("click", giveHint);
$("btn-reveal").addEventListener("click", reveal);
$("btn-check").addEventListener("click", checkPlacements);
$("btn-repeat").addEventListener("click", () => speak(state.caption));
$("btn-test-voice").addEventListener("click", () => {
  state.voiceOn = true;
  renderBoardScreen();
  const v = pickVoice();
  setVoiceNote(macVoice ? "Using the Mac's own voice (most reliable)."
    : v ? "Using the browser voice: " + v.name + ". For the most reliable sound, open the app with start.command."
    : "No English voice found; using the browser's default voice.");
  speak("Hello. I am your tutor. If you can hear me, the voice is working.");
});
$("btn-voice").addEventListener("click", () => {
  state.voiceOn = !state.voiceOn;
  if (!state.voiceOn) stopVoice();
  renderBoardScreen();
});
$("btn-ask").addEventListener("click", () => {
  state.askOpen = !state.askOpen;
  if (state.askOpen) { state.mode = "listen"; renderBoardScreen(); $("ask-input").focus(); }
  else renderBoardScreen();
});
$("ask-form").addEventListener("submit", e => {
  e.preventDefault();
  const q = $("ask-input").value.trim();
  if (q) askTutor(q);
});
$("btn-back").addEventListener("click", () => {
  state.askOpen = false; state.askReply = ""; $("ask-input").value = "";
  state.mode = state.waitingFor ? "quiz" : "idle";
  const step = currentStep();
  say(step ? (state.waitingFor ? step.ask.prompt : step.say) : "Let us start the lesson.");
});
$("answer-form").addEventListener("submit", e => { e.preventDefault(); submitTyped($("answer-input").value); });
$("btn-clear").addEventListener("click", () => { state.progress = {}; saveProgress(); render(); });

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
  canvas.style.cursor = hitTest(p.x, p.y) ? "pointer" : "default";
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
  ghost.textContent = (currentLesson().tray.find(c => c.id === drag.id) || {}).label;
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
  setVoiceNote("This browser has no speech engine. Use Chrome or Edge.");
}

// Links like index.html#progress (from the Demo notes page) open that screen.
const startScreen = location.hash.slice(1);
if (["board", "progress"].includes(startScreen)) goTo(startScreen); else render();
requestAnimationFrame(draw);
