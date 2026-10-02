// Plays every script in the no-build Tutor end to end, with a stub for the
// things a browser provides. No DOM, no canvas, no speech, no waiting.
//
//   node --test test/engine.test.mjs
//
// The engine is testable on its own precisely because it is separate from the
// view. If this file ever needs a canvas, the layers have leaked together.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// The app's files are plain browser scripts, so load them the way a page does:
// in order, sharing one global scope.
const read = name => readFileSync(fileURLToPath(new URL("../" + name, import.meta.url)), "utf8");
["icons.js", "engine.js", "lessons.js", "generate.js", "voice-lines.js"].forEach(f => vm.runInThisContext(read(f), { filename: f }));

const E = globalThis.TutorEngineLib;
const G = globalThis.TutorGenerate;
const V = globalThis.TutorVoiceLines;
const I = globalThis.TutorIconSource;

// A runner wired to nothing: every wait resolves at once, and any question is
// answered correctly so a script runs to the end. With `gate`, the tutor's
// voice never finishes on its own and the test releases it — the only way to
// be sure a pause lands mid-step rather than after the loop has raced ahead.
function harness(opts = {}) {
  const spoken = [];
  let finished = null;
  let release = null;
  const runner = new E.ScriptRunner({
    onState: () => {},
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
  return { runner, spoken, done: () => finished, speaking: () => !!release };
}

const settle = () => new Promise(r => setImmediate(() => setImmediate(r)));
async function playToEnd(runner, limitMs = 4000) {
  const started = Date.now();
  runner.play();
  while (runner.status !== "done" && Date.now() - started < limitMs) await settle();
  return runner.status;
}

test("the library loaded, and the original lessons came with it", () => {
  assert.ok(G.LIBRARY.length >= 10, "only " + G.LIBRARY.length + " scripts loaded");
  assert.ok(G.byId("numbers-read-l2"), "the numbers lesson is missing");
  assert.ok(G.byId("cell"), "the original lessons were not converted");
});

test("every script passes validation", () => {
  for (const script of G.LIBRARY) {
    const res = E.validateScript(script);
    assert.ok(res.ok, script.id + " failed validation: " + res.errors.join("; "));
    assert.deepEqual(res.warnings, [], script.id + " has warnings: " + res.warnings.join("; "));
  }
});

test("every script plays from first step to last", async () => {
  for (const script of G.LIBRARY) {
    const h = harness();
    h.runner.load(script);
    const status = await playToEnd(h.runner);
    assert.equal(status, "done", script.id + " stopped at step " + (h.runner.cursor + 1));
    assert.equal(h.runner.cursor, script.steps.length - 1, script.id + " ended on the wrong step");
    assert.ok(h.done(), script.id + " never reported finishing");
    assert.ok(h.spoken.length > 0, script.id + " said nothing");
  }
});

test("the numbers lesson builds the number, then the comma", async () => {
  const script = G.byId("numbers-read-l2");
  const h = harness();
  h.runner.load(script);
  await playToEnd(h.runner);

  const said = h.spoken.join(" ");
  assert.match(said, /point at everything I talk about/);
  assert.match(said, /always start from the right/i);
  assert.match(said, /comma/i);
  assert.match(said, /six hundred and thirty-two/i);

  // Every digit, and the comma, is pointed at by name at some stage.
  const pointed = new Set();
  script.steps.forEach(s => (s.at || []).forEach(id => pointed.add(id)));
  ["d1", "d2", "d3", "d4", "d5", "comma"].forEach(id =>
    assert.ok(pointed.has(id), "nothing ever points at " + id));
});

test("every step that names a target makes the tutor point", () => {
  const script = E.normaliseScript(G.byId("numbers-read-l2"));
  script.steps.forEach((s, i) => {
    if (!(s.at || []).length) return;
    const mood = E.moodFor(s);
    assert.notEqual(mood, "idle", "step " + (i + 1) + " (" + s.do + ") names a target but the tutor stands still");
  });
});

test("pausing holds the step, and resuming repeats it rather than skipping it", async () => {
  const script = G.byId("numbers-read-l2");
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

  h.runner.play();
  await settle();
  assert.equal(h.runner.cursor, 20, "resume skipped the interrupted step");
  h.runner.pause();
});

test("seeking rebuilds the board as if the script had played to there", () => {
  const script = E.normaliseScript(G.byId("numbers-read-l2"));
  const h = harness();
  h.runner.load(script);

  const commaStep = script.steps.findIndex(s => (s.objects || []).some(o => o.id === "comma"));
  assert.ok(commaStep > 0);

  h.runner.seek(commaStep);
  assert.equal(h.runner.board.objects.some(o => o.id === "comma"), false, "the comma appeared before its step ran");

  h.runner.seek(commaStep + 1);
  assert.equal(h.runner.board.objects.some(o => o.id === "comma"), true, "the comma is missing after its step ran");

  // The row used to show what happens without the zero is cleaned up again.
  h.runner.seek(h.runner.steps.length);
  assert.equal(h.runner.board.objects.some(o => o.id === "w1"), false, "the discarded row was left on the board");
});

test("a question is answered by a script, and the lesson comes back to the same step", async () => {
  const script = G.byId("numbers-read-l2");
  const h = harness();
  h.runner.load(script);
  h.runner.seek(40);
  const was = h.runner.cursor;

  const answer = await G.generateAnswerScript("why is there a comma?", {
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
  const script = G.byId("numbers-read-l2");
  const h = harness();
  h.runner.load(script);
  const commaStep = h.runner.steps.findIndex(s => (s.objects || []).some(o => o.id === "comma"));
  h.runner.seek(commaStep + 1);

  const answer = await G.generateAnswerScript("what is the comma for", {
    faq: script.faq, board: h.runner.board, concept: script.concept, level: 2
  });
  const targets = answer.steps.reduce((all, s) => all.concat(s.at || []), []);
  assert.ok(targets.includes("comma"), "the answer never points at the comma");
});

test("saying you are lost drops to a lower level of explanation", () => {
  assert.equal(G.isConfusion("I don't understand"), true);
  assert.equal(G.isConfusion("what is a comma"), false);

  const script = G.byId("numbers-read-l2");
  const lower = G.explainAtLevel(1, { concept: script.concept, level: 2, scriptId: script.id }, G.LIBRARY);
  assert.ok(lower, "no level-1 script for this concept");
  assert.equal(lower.level, 1);
  assert.match(lower.steps.map(s => s.text).join(" "), /apple/i);

  const higher = G.explainAtLevel(3, { concept: script.concept, level: 2, scriptId: script.id }, G.LIBRARY);
  assert.equal(higher.level, 3);
  assert.match(higher.steps.map(s => s.text).join(" "), /power/i);
});

test("breaking a step down produces more, smaller steps", () => {
  const script = E.normaliseScript(G.byId("numbers-read-l2"));
  const step = script.steps.find(s => s.do === "point" && (s.text || "").length > 120);
  const built = script.steps.slice(0, 20).reduce(E.applyToBoard, E.boardFromScript(script));
  const broken = G.breakDownStep(step, { board: built, concept: script.concept, level: 2 });
  assert.ok(broken.steps.length > 3, "breaking down produced no extra steps");
  assert.ok(broken.level < 2, "the broken-down script is not at a lower level");
});

test("an unanswerable question is refused rather than invented", async () => {
  const out = await G.generateAnswerScript("who won the 1994 world cup", { faq: [], board: { objects: [] }, concept: "x" });
  const said = out.steps.map(s => s.text).join(" ");
  assert.match(said, /outside what this lesson covers/i);
  assert.doesNotMatch(said, /Brazil/i);
});

test("the engine renders a script it has never seen", async () => {
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
  assert.equal(await playToEnd(h.runner), "done");
  assert.equal(h.runner.board.objects.length, 1);
  assert.equal(h.runner.board.heading, "New");
});

test("legacy lesson files still play", async () => {
  // lessons.js uses verb / say / target rather than do / text / at.
  const legacy = {
    id: "old", title: "Old shape",
    objects: [{ id: "a", label: "A", x: 50, y: 50 }],
    steps: [
      { verb: "explain", say: "One." },
      { verb: "point", target: "a", say: "Two." },
      { verb: "praise", say: "Three." }
    ]
  };
  const res = E.validateScript(legacy);
  assert.ok(res.ok, res.errors.join("; "));
  assert.deepEqual(res.script.steps.map(s => s.do), ["say", "point", "praise"]);

  const h = harness();
  h.runner.load(legacy);
  assert.equal(await playToEnd(h.runner), "done");
});

test("a malformed script is rejected with a reason, not a crash", () => {
  assert.equal(E.validateScript(null).ok, false);
  assert.equal(E.validateScript({ steps: [] }).ok, false);
  const bad = E.validateScript({ steps: [{ do: "ask", ask: { type: "nonsense", prompt: "?" } }] });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(e => /ask type/.test(e)));
  assert.ok(bad.errors.some(e => /expected answer/.test(e)));
});

test("the intake logs what it accepted and what it refused", () => {
  const seen = [];
  const intake = new E.Intake({ onScript: (s, src) => seen.push(src), onReject: () => {} });
  intake.accept({ title: "ok", steps: [{ do: "say", text: "hi" }] }, "api");
  intake.acceptText("not json", "paste");
  assert.deepEqual(seen, ["api"]);
  assert.equal(intake.log.length, 2);
  assert.equal(intake.log[0].ok, false);
  assert.equal(intake.log[1].ok, true);
  assert.equal(intake.log[1].source, "api");
});

test("the execution layer does not reach into the generation layer", () => {
  // Comments are allowed to mention the other side; code is not.
  const src = read("engine.js").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  ["LESSONS", "TutorGenerate", "generateAnswerScript", "READ_NUMBERS"].forEach(name =>
    assert.ok(src.indexOf(name) < 0,
      "engine.js mentions " + name + " — the engine must not know where scripts come from"));
});

test("the picker only offers the taught level", () => {
  assert.ok(G.catalogue().every(s => s.level === 2));
  assert.ok(G.LIBRARY.some(s => s.level === 1) && G.LIBRARY.some(s => s.level === 3));
});

// ── Writing that keeps time with the voice ───────────────────────────────────
// A `show` of several things holds each one back until the tutor says its name.
// The board itself always holds them all, because where an object lands can
// depend on how many are up; what is held back is the writing.

function timedHarness(marks, opts = {}) {
  const emits = [];
  const waits = [];
  const runner = new E.ScriptRunner({
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

  const afterLoad = h.emits.filter(e => e.objects.length);
  assert.ok(afterLoad.length, "the step never put anything on the board");
  assert.ok(afterLoad.every(e => e.objects.indexOf("obi") >= 0 && e.objects.indexOf("ada") >= 0),
    "the board should hold every object throughout, not gain them one at a time");
  assert.ok(h.emits.some(e => e.pending.length === 2), "nothing should be written before it is said");
  assert.ok(h.emits.some(e => e.pending.length === 1 && e.pending[0] === "ada"),
    "Obi should be written while Ada is still waiting");
  assert.deepEqual(h.emits[h.emits.length - 1].pending, [], "everything is written by the end");
  assert.ok(h.waits.indexOf(1500) >= 0, "should wait for the word, waited: " + h.waits.join(", "));
});

test("without word timings a show still puts everything up at once", async () => {
  const h = timedHarness(WORDS, { noMarks: true });
  h.runner.load(TWO_ROWS);
  await playToEnd(h.runner);
  assert.ok(h.emits.every(e => e.pending.length === 0),
    "with nothing to line up against, nothing should be held back");
});

// ── A divided board, centre stage, and changes of scene ─────────────────────

const build = (script, upTo) => E.normaliseScript(script).steps.slice(0, upTo).reduce(E.applyToBoard, E.boardFromScript(E.normaliseScript(script)));

test("a divided board places each thing inside its own panel", () => {
  const script = {
    steps: [
      { do: "layout", grid: "2x2", panels: ["Price", "Ten percent", "Twenty percent", "You pay"] },
      { do: "show", objects: [
        { id: "a", label: "A", panel: "tl" }, { id: "b", label: "B", panel: "tr" },
        { id: "c", label: "C", panel: "3" }, { id: "d", label: "D", panel: "br", x: 100, y: 100 }
      ] }
    ]
  };
  const board = build(script, 2);
  assert.equal(board.panels.length, 4);
  assert.deepEqual(board.panels.map(p => p.name), ["tl", "tr", "bl", "br"]);
  assert.equal(board.panels[1].title, "Ten percent");
  const at = id => board.objects.find(o => o.id === id);
  const inside = (o, p) => o.x >= p.x && o.x <= p.x + p.w && o.y >= p.y && o.y <= p.y + p.h;
  assert.ok(inside(at("a"), board.panels[0]), "a is not in the top-left panel");
  assert.ok(inside(at("b"), board.panels[1]), "b is not in the top-right panel");
  assert.ok(inside(at("c"), board.panels[2]), "c (panel 3) is not in the bottom-left panel");
  // Panel-local x / y: 100,100 is the panel's bottom-right corner, not the board's.
  assert.ok(inside(at("d"), board.panels[3]), "d's panel-local position was read as a board position");
  assert.ok(at("d").x < 100 && at("d").y < 100);
  // Six parts, and a panel the tutor can point at without a warning.
  const six = E.validateScript({ steps: [{ do: "layout", grid: "3x2" }, { do: "point", at: ["bm"], text: "This part." }] });
  assert.ok(six.ok);
  assert.deepEqual(six.warnings, []);
  assert.equal(E.normaliseLayout(6).panels.length, 6);
});

test("focus brings a thing to centre stage and unfocus puts everything back", () => {
  const script = {
    steps: [
      { do: "layout", grid: "3x1" },
      { do: "show", objects: [{ id: "lin", label: "2x+3=11", panel: "l" }, { id: "quad", label: "x²=9", panel: "m" }, { id: "sim", label: "x+y=5", panel: "r" }] },
      { do: "focus", at: ["quad"] },
      { do: "show", objects: [{ id: "w1", label: "x = 3" }] },
      { do: "hide", ids: ["w1"] },
      { do: "unfocus" }
    ]
  };
  const before = build(script, 2);
  const staged = build(script, 3);
  const q = staged.objects.find(o => o.id === "quad");
  assert.ok(q.staged && q.sx === 50, "the focused thing is not on centre stage");
  assert.ok(q.scale > 1, "the focused thing is not enlarged");
  assert.ok(staged.objects.filter(o => o.id !== "quad").every(o => o.hidden), "the other things did not step back");
  // Something shown while the stage is set is the explanation, and is visible under it.
  const during = build(script, 4);
  const w1 = during.objects.find(o => o.id === "w1");
  assert.ok(!w1.hidden && !w1.staged, "the explanation should be visible, not staged or hidden");
  assert.ok(w1.y > q.sy, "the explanation should sit below the thing on stage");
  // And afterwards everything is exactly where it was.
  const after = build(script, 6);
  assert.equal(after.stage, null);
  assert.deepEqual(after.objects.map(o => [o.id, o.x, o.y, !!o.hidden, !!o.staged]),
    before.objects.map(o => [o.id, o.x, o.y, false, false]));
});

test("an update that gives no position does not move the thing it updates", () => {
  const script = G.byId("numbers-read-l2");
  const s = E.normaliseScript(script);
  const unitsStep = s.steps.findIndex(st => (st.objects || []).some(o => o.id === "d5" && o.sub === "Units"));
  assert.ok(unitsStep > 0);
  const board = build(script, unitsStep + 1);
  assert.equal(board.objects.find(o => o.id === "d5").x, 88, "writing 'Units' under the 2 moved it");
});

test("a transition is something to watch, not a bare pause", async () => {
  const seen = [];
  const waits = [];
  const runner = new E.ScriptRunner({
    onState: s => { if (s.transition) seen.push(s.transition); },
    speak: () => Promise.resolve(), silence: () => {},
    wait: ms => { waits.push(ms); return Promise.resolve(); },
    onAsk: () => {}, onFinish: () => {}
  });
  runner.load({ steps: [{ do: "transition", kind: "sweep", ms: 500, text: "Now the next part." }, { do: "say", text: "Here." }] });
  await playToEnd(runner);
  assert.ok(seen.length, "the view was never told about the transition");
  assert.equal(seen[0].kind, "sweep");
  assert.ok(waits.includes(500), "the step did not last as long as the transition");
  assert.equal(runner.snapshot().transition, null, "the transition outlived its step");
  // An unknown kind is a warning, and plays as a wipe.
  const res = E.validateScript({ steps: [{ do: "transition", kind: "explode" }] });
  assert.ok(res.ok && res.warnings.length === 1);
});

test("tapping a thing that can be looked at closer produces a focus script", () => {
  const thing = { id: "quad", label: "x² − 5x + 6 = 0", name: "the quadratic",
    explain: [{ say: "Split it into brackets.", write: "(x − 2)(x − 3) = 0" }, "Two answers."] };
  const script = G.focusScript(thing, { concept: "equation-kinds", level: 2 });
  const res = E.validateScript(script);
  assert.ok(res.ok, res.errors.join("; "));
  assert.equal(script.meta.kind, "focus");
  assert.equal(script.steps[0].do, "focus");
  assert.deepEqual(script.steps[0].at, ["quad"]);
  assert.ok(script.steps.some(s => s.do === "show" && s.objects[0].label === "(x − 2)(x − 3) = 0"), "the working was not written up");
  assert.ok(script.steps.some(s => s.text === "Two answers."));
  // Its lines are known ahead of time, so the voice can be rendered before a demo.
  const lesson = { steps: [{ do: "show", objects: [thing] }] };
  const lines = V.linesFor(lesson);
  script.steps.forEach(s => { if (s.text) assert.ok(lines.includes(s.text), "not prepared: " + s.text); });
});

test("icons can come from a collection on the internet", () => {
  assert.equal(I.isRemote("orange"), false, "a drawn icon is local");
  assert.equal(I.isRemote("simple-icons:whatsapp"), true);
  assert.equal(I.urlFor("simple-icons:whatsapp"), "https://api.iconify.design/simple-icons/whatsapp.svg");
  assert.equal(I.urlFor("mdi:school", true), "/icon?ref=mdi%3Aschool");
  assert.equal(I.urlFor("https://example.org/pic.svg"), "https://example.org/pic.svg");
  assert.match(I.tint('<svg width="1em" height="1em"><path fill="currentColor"/></svg>', "#fff"), /width="256" height="256".*fill="#fff"/);
});

test("the samples use numbers, equations, a divided board and centre stage", () => {
  for (const id of ["equations-three-kinds", "social-media-numbers", "market-discount"]) {
    const s = E.normaliseScript(G.byId(id));
    assert.equal(s.level, 2, id + " should be in the picker");
    assert.ok(s.steps.some(st => st.do === "layout"), id + " never divides the board");
    assert.ok(s.steps.some(st => st.do === "ask" && st.ask.type === "type"), id + " never asks for a number");
    const objects = s.steps.reduce((all, st) => all.concat(st.objects || []), []);
    assert.ok(objects.some(o => /\d/.test(o.label)), id + " writes no numbers on the board");
    assert.ok(objects.some(o => o.explain), id + " has nothing that can be tapped for a closer look");
  }
  const eq = E.normaliseScript(G.byId("equations-three-kinds"));
  assert.ok(eq.steps.some(st => st.do === "focus" && st.at.length), "the equations lesson never focuses");
  assert.ok(eq.steps.some(st => st.do === "transition"), "the equations lesson has no transition");
  const social = E.normaliseScript(G.byId("social-media-numbers"));
  const icons = social.steps.reduce((all, st) => all.concat(st.objects || []), []).filter(o => I.isRemote(o.icon));
  assert.equal(icons.length, 6, "six icons from a collection");
});
