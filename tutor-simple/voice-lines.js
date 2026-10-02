// ============================================================
//  EVERY LINE THE TUTOR COULD SAY.
//
//  The voice is rendered ahead of time, so something has to work out what the
//  tutor might say before it says it. That is this file: given a script, it
//  returns the words of every line — the teaching, the questions, the hints,
//  and the replies to right and wrong answers alike.
//
//  It lives on its own because two things need it and they must never drift:
//  app.js (warming up a lesson as it opens) and prepare-voice.mjs (rendering
//  everything before a demo). The wording here has to match the wording in
//  app.js exactly; a line that differs by one comma is a line that is not
//  rendered, and the tutor falls back to a slower voice mid-sentence.
// ============================================================

(function (root) {
  "use strict";

  const E = root.TutorEngineLib;

  function introFor(script) {
    return "Let us learn " + String(script.title || "this objective").toLowerCase() +
      ". I will teach it aloud. You can stop me at any time to ask a question.";
  }

  // Lines that belong to no particular script.
  const STOCK = [
    "That is the whole objective. Your progress is recorded by what you did without help.",
    "Hello. I am your tutor. If you can hear me, the voice is working.",
    "This is the voice I will teach with.",
    "All placed correctly.",
    "Correct. That is the one.",
    "Here is where they belong. We will come back to this so you can do it yourself.",
    "This is already as simple as I can make it. Let us try it a different way.",
    "There is nothing deeper than this for now.",
    "Press play and I will start the lesson."
  ];

  function linesFor(raw) {
    const script = E.normaliseScript(raw);
    const out = [introFor(script)];
    const add = t => { if (t) out.push(t); };

    let board = E.boardFromScript(script);
    script.steps.forEach(function (step) {
      board = E.applyToBoard(board, step);
      add(step.text);
      if (step.do !== "ask") return;

      const ask = step.ask;
      const things = board.objects.concat(board.slots);
      const expect = [].concat(ask.expect);
      const first = expect[0];
      const hint = ask.hint || "Look again at what the question is asking.";

      add(ask.prompt);
      add("A hint, not the answer: " + hint);

      if (ask.type === "type") {
        add("Yes, " + String(first).trim() + " is right.");
        add("Not yet. " + hint);
        add("The answer is " + String(first).trim() + ". We will try this again later.");
      }

      if (ask.type === "select") {
        // The reply to the right answer.
        const right = things.filter(o => o.id === first)[0];
        add(right && right.label && right.sub
          ? "Correct. " + right.label + " is in the " + right.sub.toLowerCase() + "."
          : "Correct. That is the one.");
        // And to every wrong one, because a demo taps a wrong answer on purpose.
        things.forEach(function (o) {
          if (expect.indexOf(o.id) >= 0) return;
          add((o.label && o.sub ? "That is the " + o.sub.toLowerCase() + ". " : "Not that one. ") + hint);
        });
        add("This is the one" + (right && right.sub ? ", the " + right.sub.toLowerCase() : "") + ". We will come back to it later.");
      }

      if (ask.type === "place") {
        const total = Object.keys(ask.expect || {}).length;
        add("All placed correctly.");
        for (let n = 0; n < total; n++) add(n + " of " + total + " are in the right place. " + hint);
      }
    });

    // Tapping something on the board when no question is open: a thing with
    // `explain` comes forward and is gone through (a script the generator
    // writes, so its exact wording is taken from there); anything else, the
    // tutor just names. A presenter does this to point things out.
    const G = root.TutorGenerate;
    let named = E.boardFromScript(script);
    script.steps.forEach(function (step) {
      named = E.applyToBoard(named, step);
      named.objects.concat(named.slots).forEach(function (o) {
        if (o.explain && G && G.focusScript) {
          G.focusScript(o, { concept: script.concept, level: script.level }).steps.forEach(s => add(s.text));
          return;
        }
        add(o.sub ? (o.label ? o.label + ": " : "") + o.sub : "This one is " + (o.label || "here") + ".");
      });
    });

    return out.filter((t, i) => t && out.indexOf(t) === i);
  }

  // Everything, for every script in a library, plus the stock lines and the
  // answers to the questions a demo actually asks.
  function allLines(library, answers) {
    const all = [];
    (library || []).forEach(s => linesFor(s).forEach(t => all.push(t)));
    (answers || []).forEach(s => (s.steps || []).forEach(step => { if (step.text) all.push(step.text); }));
    STOCK.forEach(t => all.push(t));
    return all.filter((t, i) => t && all.indexOf(t) === i);
  }

  root.TutorVoiceLines = { linesFor: linesFor, introFor: introFor, allLines: allLines, STOCK: STOCK };

})(typeof globalThis !== "undefined" ? globalThis : this);
