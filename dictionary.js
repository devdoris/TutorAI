// ============================================================
//  THE DICTIONARY — every word a script may use, as data.
//
//  This is the template a model writes against. It lists each directive the
//  board understands, the fields it takes, what an object on the board can be,
//  and the shapes a good answer usually has. toPrompt() turns it into the
//  instructions handed to the model; the Script Manager (pipeline.js) checks
//  what comes back against the engine before anything is drawn.
//
//  It belongs to the generation side: engine.js never reads it. A test keeps
//  the two in step, so a directive added to the engine and forgotten here (or
//  the other way round) fails loudly instead of being silently unused.
//
//    node export-dictionary.mjs   writes dictionary.json for anyone outside
// ============================================================

(function (root) {
  "use strict";

  const drawnIcons = typeof TUTOR_ICONS !== "undefined" ? Object.keys(TUTOR_ICONS) : [];

  const DIRECTIVES = [
    { do: "say", means: "Talks. The board does not change.",
      fields: {}, example: { do: "say", text: "Look at this one with me." } },
    { do: "board", means: "Sets the heading over the board, the line under it, or the kind of board.",
      fields: { heading: "text at the top", sub: "smaller line under it", kind: "one of board.kinds" },
      example: { do: "board", heading: "Sharing fairly", text: "We are sharing today." } },
    { do: "layout", means: "Divides the board into parts, each with its own title.",
      fields: { grid: '"2x2", "3x1", "2x1", "3x2"', panels: "titles in reading order" },
      example: { do: "layout", grid: "2x1", panels: ["Before", "After"], text: "Two sides. Before, and after." } },
    { do: "show", means: "Writes objects on the board, or changes ones already there (same id = update).",
      fields: { objects: "list of objects (see object.fields)" }, required: ["objects"],
      example: { do: "show", objects: [{ id: "ans-six", label: "6", shape: "circle", sub: "sweets" }], at: ["ans-six"], text: "Six sweets." } },
    { do: "focus", means: "Brings one thing to centre stage, bigger; everything else fades back.",
      fields: { at: "[id] of the one thing" }, required: ["at"],
      example: { do: "focus", at: ["d2"], text: "Let us look at the zero on its own." } },
    { do: "unfocus", means: "Puts everything back exactly as it was before focus.",
      fields: {}, example: { do: "unfocus", text: "Back to the whole number." } },
    { do: "transition", means: "A visible change of scene. Use it instead of a pause.",
      fields: { kind: "one of transitions", ms: "how long, optional" },
      example: { do: "transition", kind: "sweep", text: "Now a different example." } },
    { do: "hide", means: "Rubs particular objects off the board.",
      fields: { ids: "[ids] to rub out" }, required: ["ids"],
      example: { do: "hide", ids: ["ans-six"], text: "Rub that out." } },
    { do: "clear", means: "Rubs the whole board out, except what keep names.",
      fields: { keep: "[ids] to leave", heading: "new heading", keepHeading: "true to leave the heading" },
      example: { do: "clear", keep: [], text: "Clean board." } },
    { do: "point", means: "Raises an arm at one thing while speaking.",
      fields: { at: "[id]" }, required: ["at"],
      example: { do: "point", at: ["ans-six"], text: "This six is the whole bag." } },
    { do: "trace", means: "Sweeps the arm across several things in turn, in time with the words.",
      fields: { at: "[id, id, ...] in the order they are said", cues: "optional words to move on" }, required: ["at"],
      example: { do: "trace", at: ["a", "b", "c"], cues: ["One", "Two", "Three"], text: "One. Two. Three." } },
    { do: "compare", means: "Points back and forth between two things.",
      fields: { at: "[id, id]", cues: "optional" }, required: ["at"],
      example: { do: "compare", at: ["you", "sis"], text: "You, and your sister. The same." } },
    { do: "highlight", means: "Lights things up without pointing.",
      fields: { at: "[ids]" }, required: ["at"],
      example: { do: "highlight", at: ["ans-six"], text: "Keep your eye on the six." } },
    { do: "mark", means: "Draws on the board, fastened to an object so it moves with it.",
      fields: { id: "a name for the mark", kind: "one of marks", at: "[id] it is drawn on", to: "[id] an arrow points to" }, required: ["id", "at"],
      example: { do: "mark", id: "ans-ring", kind: "ring", at: ["ans-six"], text: "Ring it. That is the answer." } },
    { do: "unmark", means: "Rubs drawn marks off.",
      fields: { ids: "[mark ids]" }, required: ["ids"],
      example: { do: "unmark", ids: ["ans-ring"] } },
    { do: "rough", means: "Pulls out a rough-work pad and writes the arithmetic on it, so the board stays clean.",
      fields: { title: "pad title", lines: "[lines of working]", close: "true to put it away" },
      example: { do: "rough", title: "rough work", lines: ["6 ÷ 2 = 3"], text: "Six shared by two is three." } },
    { do: "tray", means: "Sets cards and slots for a drag-and-drop task. Rarely needed in an answer.",
      fields: { cards: "[{id, label}]", slots: "[{id, label, accept}]" },
      example: { do: "tray", cards: [{ id: "c1", label: "Tens" }], slots: [{ id: "s1", label: "3", accept: "c1" }] } },
    { do: "ask", means: "Stops and waits for the learner to answer.",
      fields: { ask: "{ type, prompt, expect, hint?, choices? } — see asks" }, required: ["ask"],
      example: { do: "ask", text: "Your turn.", ask: { type: "type", prompt: "What is half of eight?", expect: "4", hint: "Share eight into two equal piles." } } },
    { do: "listen", means: "Waits for the learner to ask something or say they understand.",
      fields: {}, example: { do: "listen", text: "Does that make sense now?" } },
    { do: "praise", means: "Celebrates.",
      fields: {}, example: { do: "praise", text: "That is it." } },
    { do: "wait", means: "Holds still. Prefer transition: a pause is dead air.",
      fields: { ms: "milliseconds" }, example: { do: "wait", ms: 400 } }
  ];

  const DICTIONARY = {
    name: "tutor-script dictionary",
    version: "1",
    format: "tutor-script/1",

    // Every step may carry these, whatever its directive.
    step: {
      do: "the directive (required)",
      text: "what the tutor says while doing it — nearly always wanted; a silent board is not teaching",
      at: "[ids] — the tutor points at the first one while speaking",
      face: "one of faces — what her face does when she stops talking",
      unmark: "[mark ids] to rub off as this step happens",
      cues: "[words] in text that each target in at is named by"
    },

    script: {
      id: "kebab-case name",
      title: "what the learner sees",
      level: "1 concrete (apples), 2 the taught lesson, 3 the general form",
      concept: "kebab-case topic; scripts sharing it link to each other",
      board: "{ kind, heading, sub, theme } — or { inherit: true } to answer on the lesson's own board",
      steps: "[steps] — the only required field"
    },

    board: {
      kinds: ["blank", "circles", "numberline", "bars", "tiles", "diagram", "axes", "timeline", "stave"],
      themes: { chalk: "dark chalkboard (default), for arithmetic by hand", paper: "white panel with coloured pictures, for computing and science" },
      grid: "x and y are 0–100 percent of the board: x 0 left, 100 right; y 0 top, 100 bottom. Keep y between 8 and 80.",
      panels: { "2x1": ["l", "r"], "3x1": ["l", "m", "r"], "2x2": ["tl", "tr", "bl", "br"], "3x2": ["tl", "tm", "tr", "bl", "bm", "br"] }
    },

    object: {
      fields: {
        id: "unique name; in an answer start new ones with ans-",
        label: "what is written (maths goes here, in symbols)",
        sub: "small label underneath — also the word the tutor's arm listens for",
        x: "0–100 across; leave x and y out and the board places it",
        y: "0–100 down",
        row: "name a row to start a new line lower down (\"answer\", \"ans-1\" …)",
        size: "text size, about 2 small to 6.4 big; for icons 6 small, 9 normal, 14 large",
        shape: "one of object.shapes; leave out for plain writing",
        icon: "a drawn icon name, or collection:name from Iconify",
        count: "repeat the icon (12 at most) — three oranges are three oranges, not the numeral 3",
        panel: "which part of a divided board it lives in",
        cue: "the words the tutor actually says for it, when they differ from its label",
        name: "how the tutor refers to it (\"the quadratic\")",
        explain: "[lines] it goes through if the learner taps it; each a string or { say, write }"
      },
      shapes: {
        circle: "a digit or count in a ring", tile: "a square tile", bar: "a bar of a chart",
        note: "a sticky note", point: "a dot on axes", node: "a box in a diagram", pin: "a pin on a timeline",
        bubble: "speech bubble: label is the words, sub who says them, w width, tail bl|br",
        window: "code window: sub the file name, label the code with \\n between lines (six lines at most)"
      }
    },

    marks: { ring: "circle what matters", cross: "strike out what cancelled or was wrong", underline: "underline it", arrow: "from at to to" },
    asks: {
      select: "they tap an object on the board — expect is its id",
      type: "they type the answer — expect is the answer as text",
      place: "they drag cards into slots (needs a tray step first)"
    },
    faces: ["happy", "surprised", "thinking", "plain", "sad"],
    transitions: ["wipe", "fade", "sweep"],
    icons: {
      drawn: drawnIcons,
      remote: "any Iconify icon as collection:name — simple-icons for brands, mdi or tabler for everyday things. Do not invent names; a missing one falls back to the label."
    },

    directives: DIRECTIVES,

    // How to teach, not only what is allowed. These are the rules a lesson is
    // judged by (see LESSON-PROMPT.md); the answer rules are the extra ones a
    // reply to a question must keep.
    rules: [
      "One small idea per step. If a step names two numbers, it is probably two steps.",
      "Concrete first: things a child can count (oranges, sweets, coins, floor tiles), then the formal word.",
      "Build the board up one thing at a time; never show many objects at once.",
      "Say the name of what you point at: the words in text must contain the target's label or sub.",
      "Maths goes in labels as symbols; text says it in words (\"x squared\", not \"x²\"), because text is spoken aloud.",
      "Arithmetic goes on the rough pad, not on the working.",
      "Ring what matters, cross out what cancelled.",
      "Talk like a Nigerian teacher talking to one child: short sentences, plain words, \"look\", \"you see it?\", \"now you try\"."
    ],
    answerRules: [
      "Answer on the lesson's own board: board must be { \"inherit\": true }. The ids listed under BOARD are already there — point at them rather than rewriting them.",
      "Every new object id starts with ans- so it never collides with the lesson.",
      "Leave x and y out of new objects and give them row \"answer\" (then \"ans-2\", \"ans-3\" …) so they land under what is there. If the board is too full, start with { \"do\": \"clear\" }.",
      "6 to 20 steps. First step answers the question directly in one or two sentences; then explain; then check.",
      "At most one ask, near the end, and only with type, prompt and expect.",
      "Finish with a listen step that asks whether it makes sense."
    ],

    // The usual shapes of a good answer, as step sequences with gaps. The
    // model picks the one that fits; they are what the board does well.
    patterns: [
      { name: "point-and-name", when: "the question is about something already on the board",
        steps: ["point at it and answer in one sentence", "focus it", "say why, one idea per step", "unfocus", "listen"] },
      { name: "concrete-first", when: "the learner does not see why something is true",
        steps: ["show countable icons (count ≤ 12)", "do the thing with them, step by step", "show the same thing as symbols in row answer", "compare the two", "ring the answer", "listen"] },
      { name: "worked-example", when: "the question is how to do a calculation",
        steps: ["show the problem", "rough pad with one line of working per step", "show the result", "ring it", "ask a similar one (type)", "praise", "listen"] },
      { name: "side-by-side", when: "the learner mixes up two things",
        steps: ["layout 2x1 with both names", "show one example in each panel", "compare them", "say the one difference", "listen"] }
    ],

    // A whole answer, as it should come back.
    example: {
      question: "Why do we put a zero in 40,632?",
      script: {
        id: "ans-why-zero", title: "Why is there a zero?", level: 2, concept: "reading-numbers",
        board: { inherit: true },
        steps: [
          { do: "point", at: ["d2"], text: "This zero is worth nothing. It is there to hold a seat." },
          { do: "focus", at: ["d2"], text: "Look at the zero on its own." },
          { do: "say", text: "Every digit gets its worth from where it sits." },
          { do: "show", objects: [{ id: "ans-no-zero", label: "4632", size: 4, row: "answer" }], at: ["ans-no-zero"], text: "Take the zero away and you get four six three two." },
          { do: "mark", id: "ans-x", kind: "cross", at: ["ans-no-zero"], text: "That is a much smaller number. The four slid down a seat." },
          { do: "say", text: "So the zero is a guard. It keeps the seat full, so nothing moves." },
          { do: "unfocus", unmark: ["ans-x"], text: "Back to the whole number." },
          { do: "ask", text: "Your turn.", ask: { type: "type", prompt: "How many thousands in 40,632?", expect: "40", hint: "Read everything left of the comma." } },
          { do: "praise", text: "Forty thousand. The zero kept it forty." },
          { do: "listen", text: "Does that make sense now? Tell me, or ask me another question." }
        ]
      }
    }
  };

  // ---------- turning it into instructions ----------

  const json = v => JSON.stringify(v);

  function directiveLines() {
    return DIRECTIVES.map(function (d) {
      const fields = Object.keys(d.fields).map(k => k + (d.required && d.required.indexOf(k) >= 0 ? "*" : "") + ": " + d.fields[k]).join("; ");
      return "- " + d.do + " — " + d.means + (fields ? "  Fields: " + fields + "." : "") + "\n  e.g. " + json(d.example);
    }).join("\n");
  }

  // A board snapshot the model can point at: what is there, by id.
  function describeBoard(board) {
    if (!board) return "(empty board)";
    const lines = [];
    if (board.heading) lines.push("heading: " + json(board.heading));
    if (board.layout && board.layout.panels) {
      lines.push("panels: " + board.layout.panels.map(p => p.name + (p.title ? " (" + p.title + ")" : "")).join(", "));
    }
    (board.objects || []).forEach(function (o) {
      if (!o || !o.id) return;
      const bits = [o.id + ":", json(o.label !== undefined ? o.label : o.icon || "")];
      if (o.sub) bits.push("sub " + json(o.sub));
      if (o.shape) bits.push(o.shape);
      if (o.icon) bits.push("icon " + o.icon + (o.count ? " ×" + o.count : ""));
      if (o.panel) bits.push("in " + o.panel);
      if (o.x !== undefined) bits.push("at " + Math.round(o.x) + "," + Math.round(o.y));
      lines.push("- " + bits.join(" "));
    });
    return lines.length ? lines.join("\n") : "(empty board)";
  }

  // The instructions for writing a script. mode "answer" adds the rules for a
  // reply played over a lesson; "lesson" is for writing a whole lesson.
  function toPrompt(opts) {
    const o = opts || {};
    const d = DICTIONARY;
    const parts = [
      "You write scripts for a tutor who stands at a board. You answer with ONE JSON object and nothing else — no explanation, no ``` fence.",
      "The tutor is a stick figure beside the board. She talks, writes, points at what she names, rings and crosses things out, and does arithmetic on a rough pad. Each of those is a step. She does nothing you do not write down.",
      "",
      "## Script",
      Object.keys(d.script).map(k => "- " + k + ": " + d.script[k]).join("\n"),
      "",
      "## Every step",
      Object.keys(d.step).map(k => "- " + k + ": " + d.step[k]).join("\n"),
      "",
      "## Directives (* = required)",
      directiveLines(),
      "",
      "## Objects on the board",
      Object.keys(d.object.fields).map(k => "- " + k + ": " + d.object.fields[k]).join("\n"),
      "Shapes: " + Object.keys(d.object.shapes).map(k => k + " (" + d.object.shapes[k] + ")").join("; ") + ".",
      "Board kinds: " + d.board.kinds.join(", ") + ". Themes: chalk, paper. " + d.board.grid,
      "Panels by grid: " + Object.keys(d.board.panels).map(k => k + " → " + d.board.panels[k].join(" ")).join("; ") + ".",
      "Marks: " + Object.keys(d.marks).map(k => k + " (" + d.marks[k] + ")").join(", ") + ".",
      "Ask types: " + Object.keys(d.asks).map(k => k + " — " + d.asks[k]).join("; ") + ". An ask without type, prompt and expect is rejected.",
      "Faces: " + d.faces.join(", ") + ". Transitions: " + d.transitions.join(", ") + ".",
      "Drawn icons: " + (d.icons.drawn.join(", ") || "(none)") + ". Beyond those: " + d.icons.remote,
      "",
      "## How to teach",
      d.rules.map(r => "- " + r).join("\n")
    ];
    if (o.mode === "answer") {
      parts.push("", "## This script answers a learner's question in the middle of a lesson",
        d.answerRules.map(r => "- " + r).join("\n"),
        "",
        "## Shapes a good answer takes",
        d.patterns.map(p => "- " + p.name + " (" + p.when + "): " + p.steps.join(" → ")).join("\n"),
        "",
        "## A complete answer",
        "Question: " + d.example.question,
        json(d.example.script));
    }
    return parts.join("\n");
  }

  root.TutorDictionary = {
    DICTIONARY: DICTIONARY,
    directiveNames: () => DIRECTIVES.map(d => d.do),
    toPrompt: toPrompt,
    describeBoard: describeBoard
  };

})(typeof globalThis !== "undefined" ? globalThis : this);
