// The dictionary and the question pipeline, with a fake model.
//
//   node --test test/pipeline.test.mjs
//
// No network and no key: the model is a function that returns what a model
// might, including the things a model gets wrong.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const read = name => readFileSync(fileURLToPath(new URL("../" + name, import.meta.url)), "utf8");
["icons.js", "engine.js", "lessons.js", "generate.js", "dictionary.js", "pipeline.js"].forEach(f => vm.runInThisContext(read(f), { filename: f }));

const E = globalThis.TutorEngineLib;
const G = globalThis.TutorGenerate;
const D = globalThis.TutorDictionary;
const P = globalThis.TutorPipeline;

function harness() {
  const spoken = [];
  const runner = new E.ScriptRunner({
    onState: () => {}, speak: t => { spoken.push(t); return Promise.resolve(); },
    silence: () => {}, wait: () => Promise.resolve(),
    onAsk: () => setImmediate(() => runner.answered(true)), onFinish: () => {}
  });
  return { runner, spoken };
}

// The numbers lesson, stopped part-way, as the app would hand it over.
function midLesson(at = 40) {
  const script = G.byId("numbers-read-l2");
  const h = harness();
  h.runner.load(script);
  h.runner.seek(at);
  const ctx = {
    title: script.title, subject: script.subject, objective: script.objective, concept: script.concept,
    level: script.level, faq: script.faq, board: h.runner.board, focus: h.runner.focus,
    step: h.runner.currentStep(), lessonText: script.steps.map(s => s.text || "")
  };
  return { script, h, ctx };
}

// A model that answers each stage from a table, and remembers what it was asked.
function fakeModel(byStage) {
  const calls = [];
  const llm = req => {
    calls.push(req);
    const queue = byStage[req.stage];
    const next = Array.isArray(queue) ? queue.shift() : queue;
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(typeof next === "string" ? next : JSON.stringify(next));
  };
  return { llm, calls };
}

const make = llm => P.create({ llm, validate: E.validateScript, localAnswer: G.generateAnswerScript });
const last = s => s.steps[s.steps.length - 1];

// ---------- the dictionary ----------

test("the dictionary names exactly the directives the engine plays", () => {
  const engine = E.DIRECTIVES.map(d => d.do).sort();
  const dict = D.directiveNames().slice().sort();
  assert.deepEqual(dict, engine, "dictionary.js and engine.js disagree on the directives");
});

test("every example in the dictionary is a script the engine accepts", () => {
  D.DICTIONARY.directives.forEach(d => {
    const res = E.validateScript({ steps: [d.example] });
    assert.ok(res.ok, d.do + ": " + res.errors.join("; "));
  });
  const whole = E.validateScript(D.DICTIONARY.example.script);
  assert.ok(whole.ok, whole.errors.join("; "));
});

test("the dictionary's marks are the ones the board actually draws", () => {
  // app.js draws a ring by default and names the others; LESSON-PROMPT once
  // promised "strike" and "box", which silently came out as rings.
  const drawn = ["ring"].concat((read("app.js").match(/m\.kind === "([a-z]+)"/g) || []).map(s => s.split('"')[1]));
  assert.deepEqual(Object.keys(D.DICTIONARY.marks).sort(), drawn.sort());
});

test("the prompt carries every directive, the answer rules and the board", () => {
  const prompt = D.toPrompt({ mode: "answer" });
  D.directiveNames().forEach(n => assert.ok(prompt.includes("- " + n + " — "), n + " missing from the prompt"));
  assert.ok(prompt.includes("inherit"), "answer rules missing");
  const { ctx } = midLesson();
  const board = D.describeBoard(ctx.board);
  assert.ok(board.includes("comma:"), "the board snapshot does not list the comma by id");
});

test("the dictionary's worked answer plays over the numbers lesson and returns to the step", async () => {
  const { script, h } = midLesson();
  const was = h.runner.cursor;
  await h.runner.interject(D.DICTIONARY.example.script, { label: "step " + (was + 1) });
  assert.equal(h.runner.status, "done");
  h.runner.resume();
  assert.equal(h.runner.script.id, script.id);
  assert.equal(h.runner.cursor, was);
});

// ---------- intent ----------

test("the intent layer tells a lesson question from the rest without a model", () => {
  const { ctx } = midLesson();
  assert.equal(P.localIntent("why is there a comma?", ctx).kind, "in_scope");
  assert.equal(P.localIntent("I don't understand", ctx).kind, "confused");
  assert.equal(P.localIntent("thanks", ctx).kind, "chat");
  assert.equal(P.localIntent("who won the champions league", ctx).kind, "unsure");
});

// ---------- the whole flow ----------

test("offline, a question still becomes a script that ends by checking in", async () => {
  const { ctx } = midLesson();
  const res = await make(null).answer("why is there a comma?", ctx);
  assert.equal(res.trace.route, "offline");
  assert.equal(last(res.script).do, "listen");
  assert.equal(last(res.script).text, P.CHECK_IN);
  assert.equal(res.script.meta.kind, "answer");
  assert.ok(E.validateScript(res.script).ok);
});

test("with a model: intent, then explanation, then a script built from the dictionary", async () => {
  const { ctx, h } = midLesson();
  const m = fakeModel({
    intent: { kind: "in_scope", restated: "Why does 40,632 have a comma?", reason: "about the board" },
    respond: { direct_answer: "The comma splits off the thousands.", explanation: ["Count three digits from the right.", "Everything left of it is thousands."],
      example: null, refers_to: ["comma"], check: { prompt: "How many thousands?", expect: "40", hint: "Left of the comma." } },
    script: { title: "The comma", board: { inherit: true }, steps: [
      { do: "point", at: ["comma"], text: "This comma splits off the thousands." },
      { do: "point", at: ["ghost"], text: "This one does not exist." },
      { do: "ask", text: "Try.", ask: { prompt: "No type or expect" } },
      { do: "dance", text: "Not a directive." },
      { do: "ask", text: "Your turn.", ask: { type: "type", prompt: "How many thousands?", expect: "40" } }
    ] }
  });
  const res = await make(m.llm).answer("why the comma", ctx);

  assert.deepEqual(m.calls.map(c => c.stage), ["intent", "respond", "script"]);
  assert.ok(m.calls[2].system.includes("## Directives"), "the Script Manager was not given the dictionary");
  assert.ok(m.calls[2].prompt.includes("comma:"), "the Script Manager was not shown the board");
  assert.equal(res.trace.route, "model");
  assert.equal(res.script.meta.source, "llm");

  const s = res.script;
  assert.ok(!s.steps.some(st => st.do === "dance"), "an unknown directive got through");
  assert.ok(!s.steps.some(st => (st.at || []).includes("ghost")), "pointing at nothing got through");
  assert.equal(s.steps.filter(st => st.do === "ask").length, 1, "the broken ask was not turned into speech");
  assert.equal(last(s).text, P.CHECK_IN);
  assert.ok(E.validateScript(s).ok);

  await h.runner.interject(s, { label: "here" });
  assert.equal(h.runner.status, "done", "the answer did not play to the end");
});

test("an out-of-scope question is declined without asking the model to explain it", async () => {
  const { ctx } = midLesson();
  const m = fakeModel({ intent: { kind: "out_of_scope", reason: "football" } });
  const res = await make(m.llm).answer("who won the champions league", ctx);
  assert.deepEqual(m.calls.map(c => c.stage), ["intent"]);
  assert.match(res.trace.route, /declined/);
  assert.equal(last(res.script).text, P.CHECK_IN);
});

test("a reply that cannot be read is asked for again once", async () => {
  const { ctx } = midLesson();
  const m = fakeModel({
    intent: { kind: "in_scope" },
    respond: { direct_answer: "It holds a seat.", explanation: ["Each digit's worth comes from its seat."], refers_to: [] },
    script: ["Sure! Here is a lovely script.", { steps: [{ do: "say", text: "It holds a seat." }] }]
  });
  const res = await make(m.llm).answer("why the zero", ctx);
  assert.equal(res.trace.route, "model, repaired once");
  assert.ok(m.calls[3].prompt.includes("could not be read"), "the retry did not say what went wrong");
});

test("when the Script Manager keeps failing, the explanation is laid out locally", async () => {
  const { ctx } = midLesson();
  const m = fakeModel({
    intent: { kind: "related" },
    respond: { direct_answer: "A million has six zeros.", explanation: ["Ten hundred thousands make a million."],
      example: { intro: "Count them.", lines: ["1,000,000"] }, refers_to: ["comma"], check: null },
    script: ["nope", "still nope"]
  });
  const res = await make(m.llm).answer("what comes after thousands", ctx);
  assert.equal(res.trace.route, "model explanation, laid out locally");
  assert.equal(res.script.steps[0].do, "point", "the local layout did not point at what the explanation refers to");
  assert.ok(res.script.steps.some(s => s.do === "rough"), "the example was not worked on the pad");
  assert.ok(E.validateScript(res.script).ok);
});

test("a model that is down never stops the lesson", async () => {
  const { ctx } = midLesson();
  const m = fakeModel({ intent: new Error("offline"), respond: new Error("offline") });
  const res = await make(m.llm).answer("why is there a comma?", ctx);
  assert.equal(res.script.meta.source, "generator");
  assert.ok(res.script.steps.length >= 2);
});

test("'explain it more simply' asks for a lower level, with the earlier answer as context", async () => {
  const { ctx } = midLesson();
  const m = fakeModel({
    intent: { kind: "in_scope" },
    respond: [{ direct_answer: "First answer.", explanation: ["One."], refers_to: [] }, { direct_answer: "Simpler.", explanation: ["Apples."], refers_to: [] }],
    script: [{ steps: [{ do: "say", text: "First answer." }] }, { steps: [{ do: "say", text: "Simpler." }] }]
  });
  const p = make(m.llm);
  await p.answer("why the comma", ctx);
  await p.answer("why the comma", ctx, { simpler: true });
  const second = m.calls.filter(c => c.stage === "respond")[1];
  assert.ok(second.prompt.includes("LEVEL\n1"), "did not drop a level");
  assert.ok(second.prompt.includes("First answer."), "the earlier answer was not passed along");
  assert.equal(m.calls.filter(c => c.stage === "intent").length, 1, "re-ran intent on a follow-up");
});

test("the engine knows nothing of the dictionary or the pipeline", () => {
  const src = read("engine.js").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  ["TutorDictionary", "TutorPipeline"].forEach(name => assert.ok(src.indexOf(name) < 0, "engine.js mentions " + name));
});

test("a model that is not configured is never called, and the route says offline", async () => {
  const { ctx } = midLesson();
  const m = fakeModel({});
  const p = P.create({ llm: m.llm, available: () => false, validate: E.validateScript, localAnswer: G.generateAnswerScript });
  const res = await p.answer("why is there a comma?", ctx);
  assert.equal(m.calls.length, 0);
  assert.equal(res.trace.route, "offline");
});

test("dictionary.json is the current dictionary (run node export-dictionary.mjs)", () => {
  assert.deepEqual(JSON.parse(read("dictionary.json")), JSON.parse(JSON.stringify(D.DICTIONARY)));
});
