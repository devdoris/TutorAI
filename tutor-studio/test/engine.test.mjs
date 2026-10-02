// Runs the execution layer over every script in the library, with a stub for
// the things a browser provides. No DOM, no speech, no waiting — so the whole
// library is proved to play end to end in milliseconds.
//
//   node --test test/
//
// The engine is importable on its own precisely because it is separate from the
// view; if this file ever needs a DOM, the layers have leaked into each other.

import { test } from "node:test";
import assert from "node:assert/strict";

import { ScriptRunner } from "../src/engine/runner.js";
import { validateScript, normalizeScript, applyToBoard, boardFromScript } from "../src/engine/script.js";
import { LIBRARY, catalogue } from "../src/generate/library.js";
import { generateAnswerScript, breakDownStep, explainAtLevel, isConfusion } from "../src/generate/answers.js";

// A runner wired to nothing: every asynchronous thing resolves at once, and any
// question is answered correctly so the script runs to the end.
function harness(opts = {}) {
  const spoken = [];
  const emits = [];
  let finished = null;
  // With `gate`, the tutor's voice never finishes on its own: the test releases
  // it. That is the only way to be sure a pause lands mid-step rather than
  // after the loop has already raced to the end.
  let release = null;
  const runner = new ScriptRunner({
    onState: s => emits.push(s),
    speak: text => {
      spoken.push(text);
      if (!opts.gate) return Promise.resolve();
      return new Promise(res => { release = res; });
    },
    silence: () => { const r = release; release = null; if (r) r(); },
    wait: () => Promise.resolve(),
    onAsk: () => { if (!opts.manualAnswers) setImmediate(() => runner.answered(true)); },
    onFinish: s => { finished = s; }
  });
  return { runner, spoken, emits, done: () => finished, speaking: () => !!release };
}

const settle = () => new Promise(r => setImmediate(() => setImmediate(r)));
async function playToEnd(runner, limitMs = 4000) {
  const started = Date.now();
  runner.play();
  while (runner.status !== "done" && Date.now() - started < limitMs) await settle();
  return runner.status;
}

test("every library script passes validation", () => {
  for (const script of LIBRARY) {
    const res = validateScript(script);
    assert.ok(res.ok, script.id + " failed validation: " + res.errors.join("; "));
    assert.deepEqual(res.warnings, [], script.id + " has warnings: " + res.warnings.join("; "));
  }
});

test("every library script plays from first step to last", async () => {
  for (const script of LIBRARY) {
    const h = harness();
    h.runner.load(script);
    const status = await playToEnd(h.runner);
    assert.equal(status, "done", script.id + " did not finish (stopped at step " + (h.runner.cursor + 1) + ")");
    assert.equal(h.runner.cursor, script.steps.length - 1, script.id + " ended on the wrong step");
    assert.ok(h.done(), script.id + " never reported finishing");
    assert.ok(h.spoken.length > 0, script.id + " said nothing");
  }
});

test("the numbers lesson builds the number, then the comma", async () => {
  const script = LIBRARY.find(s => s.id === "numbers-read-l2");
  const h = harness();
  h.runner.load(script);
  await playToEnd(h.runner);

  const said = h.spoken.join(" ");
  assert.match(said, /point at everything I talk about/);
  assert.match(said, /always start from the right/i);
  assert.match(said, /comma/i);
  assert.match(said, /forty thousand, six hundred and thirty-two|Forty… thousand… six hundred and thirty-two/i);

  // Every digit is pointed at by name at some stage.
  const pointed = new Set();
  script.steps.forEach(s => (s.at || []).forEach(id => pointed.add(id)));
  ["d1", "d2", "d3", "d4", "d5", "comma"].forEach(id =>
    assert.ok(pointed.has(id), "nothing ever points at " + id));
});

test("pausing holds the step, and resuming repeats it rather than skipping it", async () => {
  const script = LIBRARY.find(s => s.id === "numbers-read-l2");
  const h = harness({ gate: true });
  h.runner.load(script);
  h.runner.seek(10);
  assert.equal(h.runner.cursor, 10);

  // Next step, stopped on a step, performs the step it is showing.
  h.runner.step();
  await settle();
  assert.equal(h.runner.cursor, 10, "Next step skipped the step it was showing");

  // Next step again, mid-step, skips ahead.
  h.runner.step();
  await settle();
  assert.equal(h.runner.cursor, 11, "Next step did not advance");

  // Play, then pause while the tutor is still speaking.
  h.runner.seek(20);
  h.runner.play();
  await settle();
  assert.equal(h.runner.cursor, 20, "play did not start on the step it was showing");
  assert.ok(h.speaking(), "the tutor should still be mid-sentence");

  h.runner.pause();
  await settle();
  assert.equal(h.runner.status, "paused");
  assert.equal(h.runner.cursor, 20, "pause moved the cursor");

  // Resuming repeats the interrupted step rather than losing it.
  h.runner.play();
  await settle();
  assert.equal(h.runner.cursor, 20, "resume skipped the interrupted step");
  h.runner.pause();
});

test("seeking rebuilds the board as if the script had played to there", () => {
  const script = normalizeScript(LIBRARY.find(s => s.id === "numbers-read-l2"));
  const h = harness();
  h.runner.load(script);

  // The comma is on the board only once the step that draws it has run.
  const commaStep = script.steps.findIndex(s => (s.objects || []).some(o => o.id === "comma"));
  assert.ok(commaStep > 0);

  h.runner.seek(commaStep);
  assert.equal(h.runner.board.objects.some(o => o.id === "comma"), false, "the comma appeared before its step ran");

  h.runner.seek(commaStep + 1);
  assert.equal(h.runner.board.objects.some(o => o.id === "comma"), true, "the comma is missing after its step ran");

  // And the zero demonstration is cleaned up again.
  const end = h.runner.steps.length;
  h.runner.seek(end);
  assert.equal(h.runner.board.objects.some(o => o.id === "w1"), false, "the discarded row was left on the board");
});

test("a question is answered by a script, and the lesson comes back to the same step", async () => {
  const script = LIBRARY.find(s => s.id === "numbers-read-l2");
  const h = harness();
  h.runner.load(script);
  h.runner.seek(40);
  const was = h.runner.cursor;

  const answer = await generateAnswerScript("why is there a comma?", {
    faq: script.faq, board: h.runner.board, focus: h.runner.focus,
    concept: script.concept, level: script.level, objective: script.objective
  });
  assert.ok(answer.steps.length >= 2, "the answer was not a script");

  await h.runner.interject(answer, { label: "step " + (was + 1) });
  assert.equal(h.runner.stack.length, 1, "the lesson was not saved");
  assert.equal(h.runner.snapshot().returnTo, "step " + (was + 1));

  h.runner.resume();
  assert.equal(h.runner.stack.length, 0);
  assert.equal(h.runner.script.id, script.id, "did not come back to the lesson");
  assert.equal(h.runner.cursor, was, "came back to the wrong step");
});

test("an answer script points at the board the learner was looking at", async () => {
  const script = LIBRARY.find(s => s.id === "numbers-read-l2");
  const h = harness();
  h.runner.load(script);
  // Play far enough that the comma is drawn.
  const commaStep = h.runner.steps.findIndex(s => (s.objects || []).some(o => o.id === "comma"));
  h.runner.seek(commaStep + 1);

  const answer = await generateAnswerScript("what is the comma for", {
    faq: script.faq, board: h.runner.board, concept: script.concept, level: 2
  });
  const targets = answer.steps.flatMap(s => s.at || []);
  assert.ok(targets.includes("comma"), "the answer never points at the comma");
});

test("saying you are lost drops to a lower level of explanation", async () => {
  assert.equal(isConfusion("I don't understand"), true);      // curly and straight
  assert.equal(isConfusion("I don\u2019t understand"), true);
  assert.equal(isConfusion("do not understand"), true);
  assert.equal(isConfusion("what is a comma"), false);

  const script = LIBRARY.find(s => s.id === "numbers-read-l2");
  const lower = explainAtLevel(1, { concept: script.concept, level: 2, scriptId: script.id }, LIBRARY);
  assert.ok(lower, "no level-1 script for this concept");
  assert.equal(lower.level, 1);
  assert.match(lower.steps.map(s => s.text).join(" "), /apple/i);

  const higher = explainAtLevel(3, { concept: script.concept, level: 2, scriptId: script.id }, LIBRARY);
  assert.equal(higher.level, 3);
  assert.match(higher.steps.map(s => s.text).join(" "), /power/i);
});

test("breaking a step down produces more, smaller steps", () => {
  const script = normalizeScript(LIBRARY.find(s => s.id === "numbers-read-l2"));
  const step = script.steps.find(s => s.do === "point" && (s.text || "").length > 120);
  const board = boardFromScript(script);
  const built = script.steps.slice(0, 20).reduce(applyToBoard, board);
  const broken = breakDownStep(step, { board: built, concept: script.concept, level: 2 });
  assert.ok(broken.steps.length > 3, "breaking down produced no extra steps");
  assert.ok(broken.level < 2, "the broken-down script is not at a lower level");
});

test("an unanswerable question is refused rather than invented", async () => {
  const out = await generateAnswerScript("who won the 1994 world cup", { faq: [], board: { objects: [] }, concept: "x" });
  const said = out.steps.map(s => s.text).join(" ");
  assert.match(said, /outside what this lesson covers/i);
  assert.doesNotMatch(said, /Brazil/i);
});

test("the engine renders a script it has never seen, from any shape of source", async () => {
  const stranger = {
    title: "Written by something else",
    steps: [
      { do: "board", heading: "New", text: "Hello." },
      { do: "show", objects: [{ id: "n1", label: "9", x: 50, y: 40, shape: "circle" }], at: ["n1"], text: "A nine." },
      { do: "ask", text: "Go on.", ask: { type: "type", prompt: "What is on the board?", expect: ["9"], hint: "A digit." } },
      { do: "praise", text: "Good." }
    ]
  };
  const h = harness();
  h.runner.load(stranger);
  const status = await playToEnd(h.runner);
  assert.equal(status, "done");
  assert.equal(h.runner.board.objects.length, 1);
  assert.equal(h.runner.board.heading, "New");
});

test("legacy lesson files still play", async () => {
  // The original eight lessons use verb/say/target rather than do/text/at.
  const legacy = { id: "old", title: "Old shape", steps: [
    { verb: "explain", say: "One." },
    { verb: "point", target: "a", say: "Two." },
    { verb: "praise", say: "Three." }
  ], objects: [{ id: "a", label: "A", x: 50, y: 50 }] };
  const res = validateScript(legacy);
  assert.ok(res.ok, res.errors.join("; "));
  assert.deepEqual(res.script.steps.map(s => s.do), ["say", "point", "praise"]);

  const h = harness();
  h.runner.load(legacy);
  assert.equal(await playToEnd(h.runner), "done");
});

test("a malformed script is rejected with a reason, not a crash", () => {
  assert.equal(validateScript(null).ok, false);
  assert.equal(validateScript({ steps: [] }).ok, false);
  const bad = validateScript({ steps: [{ do: "ask", ask: { type: "nonsense", prompt: "?" } }] });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(e => /ask type/.test(e)));
  assert.ok(bad.errors.some(e => /expected answer/.test(e)));
});

test("the picker only offers the taught level", () => {
  assert.ok(catalogue().every(s => s.level === 2));
  assert.ok(LIBRARY.some(s => s.level === 1) && LIBRARY.some(s => s.level === 3));
});

test("the execution layer does not import the generation layer", async () => {
  // The split is the whole architecture, so it is asserted rather than trusted.
  const { readdir, readFile } = await import("node:fs/promises");
  const dir = new URL("../src/engine/", import.meta.url);
  const files = await readdir(dir);
  for (const f of files) {
    const src = await readFile(new URL(f, dir), "utf8");
    const imports = [...src.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map(m => m[1]);
    for (const spec of imports) {
      assert.ok(!/generate|data\/lessons/.test(spec),
        "src/engine/" + f + " imports " + spec + " — the engine must not know where scripts come from");
    }
  }
});

// ── Writing that keeps time with the voice ───────────────────────────────────
// A `show` of several things holds each one back until the tutor says its name.
// The board itself always holds them all, because where an object lands can
// depend on how many are up; what is held back is the writing.

function timedHarness(marks, opts = {}) {
  const emits = [];
  const waits = [];
  const runner = new ScriptRunner({
    onState: s => emits.push({ pending: (s.pending || []).slice(), objects: s.board.objects.map(o => o.id) }),
    speak: () => new Promise(res => setTimeout(res, 0)),
    silence: () => {},
    wait: ms => { waits.push(ms); return Promise.resolve(); },
    marks: () => Promise.resolve(opts.noMarks ? [] : marks),
    onAsk: () => {},
    onFinish: () => {}
  });
  return { runner, emits, waits };
}

const SAY = "Obi paid five hundred and Ada paid one thousand three hundred.";
const WORDS = [
  { word: "Obi", at: 0 }, { word: "paid", at: 300 }, { word: "five", at: 600 },
  { word: "hundred", at: 900 }, { word: "and", at: 1200 }, { word: "Ada", at: 1500 },
  { word: "paid", at: 1800 }, { word: "one", at: 2100 }
];
const TWO_ROWS = {
  id: "two-rows", title: "Two rows", steps: [{
    do: "show", text: SAY,
    objects: [{ id: "obi", label: "Obi:  500", x: 40, y: 30 }, { id: "ada", label: "Ada:  1300", x: 60, y: 30 }]
  }]
};

test("a show writes each thing up as the tutor says its name", async () => {
  const h = timedHarness(WORDS);
  h.runner.load(TWO_ROWS);
  await playToEnd(h.runner);

  // Once the step starts, the board holds both; only the writing is held back.
  const afterLoad = h.emits.filter(e => e.objects.length);
  assert.ok(afterLoad.length, "the step never put anything on the board");
  assert.ok(afterLoad.every(e => e.objects.includes("obi") && e.objects.includes("ada")),
    "the board should hold every object throughout, not gain them one at a time");
  assert.ok(h.emits.some(e => e.pending.length === 2), "nothing should be written before it is said");
  assert.ok(h.emits.some(e => e.pending.length === 1 && e.pending[0] === "ada"),
    "Obi should be written while Ada is still waiting");
  assert.deepEqual(h.emits[h.emits.length - 1].pending, [], "everything is written by the end");

  // "Ada" is said 1500ms in, so that is how long the second one waits.
  assert.ok(h.waits.includes(1500), "should wait for the word, waited: " + h.waits.join(", "));
});

test("without word timings a show still puts everything up at once", async () => {
  const h = timedHarness(WORDS, { noMarks: true });
  h.runner.load(TWO_ROWS);
  await playToEnd(h.runner);
  assert.ok(h.emits.every(e => e.pending.length === 0),
    "with nothing to line up against, nothing should be held back");
});

test("a name in a label is matched even when the working follows it", async () => {
  const h = timedHarness(WORDS);
  h.runner.load(TWO_ROWS);
  await playToEnd(h.runner);
  // "Obi:  500" and "Ada:  1300" are never said in full; the first word is.
  assert.ok(h.waits.includes(1500), "the row's name should be enough to find it");
});
