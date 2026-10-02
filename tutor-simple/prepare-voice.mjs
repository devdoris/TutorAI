// Renders the audio for every lesson, ahead of a demo.
//
//   node prepare-voice.mjs [voice] [rate]
//   (or double-click prepare-voice.command)
//
// Afterwards the tutor never waits on the network: every line it can say while
// teaching is already a file on disk, named after a hash of the words. Run it
// again after editing a lesson and only the changed lines are re-rendered.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import vm from "node:vm";

const HERE = new URL("./", import.meta.url);
const read = name => readFileSync(fileURLToPath(new URL(name, HERE)), "utf8");

// Load the app's plain scripts the way the page does, sharing one global scope.
["engine.js", "lessons.js", "generate.js", "voice-lines.js"].forEach(f => vm.runInThisContext(read(f), { filename: f }));
const G = globalThis.TutorGenerate;
const V = globalThis.TutorVoiceLines;

const voice = process.argv[2] || "en-NG-EzinneNeural";
const rate = process.argv[3] || "-8%";

// The questions a demo actually asks are predictable, so render their answers
// too. They are generated against the lesson's real board: the generator points
// at what is up there, and those pointing lines differ from the ones it writes
// for an empty board.
const E = globalThis.TutorEngineLib;
const answers = [];
for (const script of G.LIBRARY) {
  const s = E.normaliseScript(script);
  // The board as it stands at the end of the lesson, when the most is on it.
  const board = s.steps.reduce(E.applyToBoard, E.boardFromScript(s));
  const ctx = { faq: s.faq, board, focus: [], concept: s.concept, level: s.level, objective: s.objective };
  for (const q of ["why is there a comma?", "why is there a zero?", "why do we start from the right?",
                   "why ten times?", "what is the tens place?", "what is the hundreds place?",
                   "what is this?", "who won the football?"]) {
    answers.push(await G.generateAnswerScript(q, ctx));
  }
}

const lines = V.allLines(G.LIBRARY, answers);
console.log(`Rendering ${lines.length} lines with ${voice} at ${rate}.`);
console.log("Lines already on disk are skipped, so running this again is cheap.\n");

const child = spawn("uv", ["run", "--quiet", "--with", "edge-tts", "python3", "tts.py"],
  { cwd: fileURLToPath(HERE), stdio: ["pipe", "pipe", "inherit"] });
child.stdin.end(JSON.stringify({ voice, rate, lines }));

let made = 0, had = 0, failed = 0, buffer = "";
child.stdout.on("data", chunk => {
  buffer += chunk;
  const rows = buffer.split("\n");
  buffer = rows.pop();
  for (const row of rows) {
    let event;
    try { event = JSON.parse(row); } catch { continue; }
    if (event.event === "made" || event.event === "have") {
      if (event.event === "made") made++; else had++;
      // Redraw one line in a terminal; stay quiet when piped to a file.
      if (process.stdout.isTTY) process.stdout.write(`\r  rendered ${made}, already had ${had}   `);
    }
    else if (event.event === "failed") { failed++; console.log(`\n  FAILED: ${event.text}… — ${event.error}`); }
    else if (event.event === "error") console.log(`\n  ${event.error}`);
  }
});

child.on("close", code => {
  console.log(`\n\nDone. ${made} newly rendered, ${had} already on disk, ${failed} failed.`);
  if (failed) console.log("Failed lines fall back to the Mac's voice, so the lesson still runs.");
  console.log("Start the app with start.command and it will not need the network for speech.");
  process.exit(code || 0);
});
