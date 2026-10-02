// ─────────────────────────────────────────────────────────────────────────────
// THE SCRIPT FORMAT — the contract between the two layers.
//
// Layer 1 (generation) produces a script. It may be a teacher authoring by hand,
// a file upload, a curriculum service, or a model answering a learner's question.
// Layer 2 (execution — ./runner.js) renders any script that satisfies this file.
//
// The runner imports nothing from ../generate. That is the whole point: the
// execution side must not know who wrote the script or why.
// ─────────────────────────────────────────────────────────────────────────────

export const SCRIPT_VERSION = "tutor-script/1";

// Every directive the execution layer understands. Anything else is ignored with
// a warning rather than crashing the lesson — a script from a generator we have
// not met yet should still play as far as it can.
export const DIRECTIVES = [
  { do: "say", label: "Say", note: "Tutor speaks. Nothing on the board changes." },
  { do: "board", label: "Set the board", note: "Heading, subheading, representation." },
  { do: "show", label: "Show objects", note: "Put one or more objects on the board." },
  { do: "hide", label: "Hide objects", note: "Take objects off the board." },
  { do: "clear", label: "Clear the board", note: "Remove everything except `keep`." },
  { do: "point", label: "Point at", note: "Tutor raises an arm at a target and speaks." },
  { do: "trace", label: "Trace across", note: "Tutor sweeps across several targets in turn." },
  { do: "compare", label: "Compare", note: "Tutor alternates between two targets." },
  { do: "highlight", label: "Highlight", note: "Mark objects without pointing." },
  { do: "mark", label: "Draw on the board", note: "A ring, a cross, an underline or an arrow." },
  { do: "rough", label: "Rough work pad", note: "Opens a pad over the board and writes the arithmetic on it." },
  { do: "unmark", label: "Rub out a mark", note: "Takes a drawn mark off the board." },
  { do: "tray", label: "Set the card tray", note: "Cards and slots for a drag-and-drop task." },
  { do: "ask", label: "Ask the learner", note: "Stop and wait for an answer." },
  { do: "listen", label: "Invite a question", note: "Tutor waits for the learner to speak." },
  { do: "praise", label: "Praise", note: "Tutor celebrates." },
  { do: "wait", label: "Pause", note: "Hold still for a moment." }
];
const KNOWN = new Set(DIRECTIVES.map(d => d.do));

// Older lesson files (and the teacher panel's first version) used `verb`/`say`/
// `target`. Accepting them here means eight existing lessons keep working and no
// saved localStorage record is lost.
const LEGACY_VERB = {
  explain: "say", point: "point", trace: "trace", compare: "compare",
  reveal: "highlight", ask: "ask", listen: "listen", praise: "praise"
};

const clone = o => (o === undefined ? o : JSON.parse(JSON.stringify(o)));
const arr = v => (v === null || v === undefined ? [] : [].concat(v));

export function normalizeStep(raw) {
  if (!raw || typeof raw !== "object") return null;
  const step = Object.assign({}, raw);

  if (!step.do && step.verb) step.do = LEGACY_VERB[step.verb] || step.verb;
  if (step.text === undefined && step.say !== undefined) step.text = step.say;
  if (step.at === undefined && step.target !== undefined) step.at = step.target;
  delete step.verb; delete step.say; delete step.target;

  if (!step.do) step.do = step.ask ? "ask" : "say";
  if (step.do === "ask" && !step.ask) step.do = "say";
  // `write` is sugar for showing a single object.
  if (step.do === "write") {
    step.do = "show";
    step.objects = [{ id: step.id, label: step.label, sub: step.sub, x: step.x, y: step.y, shape: step.shape || "label" }];
  }
  if (step.at !== undefined) step.at = arr(step.at).filter(Boolean);
  if (step.objects) {
    // Writing a script should not mean working out percentages. An object with
    // no x across is one the board will place itself, spread evenly along its
    // row with anything else in that row.
    step.objects = arr(step.objects).map(o =>
      (o && typeof o === "object" && o.x === undefined) ? Object.assign({ auto: true }, o) : o);
  }
  if (step.ids) step.ids = arr(step.ids);
  // Any step may rub chalk off as it happens, so the tutor can cross a number
  // out and write its replacement in one movement rather than two.
  if (step.unmark) step.unmark = arr(step.unmark);
  return step;
}

export function normalizeScript(raw) {
  if (!raw || typeof raw !== "object") throw new Error("A script must be an object.");
  const steps = arr(raw.steps).map(normalizeStep).filter(Boolean);
  if (!steps.length) throw new Error("A script needs at least one step.");
  return {
    script: SCRIPT_VERSION,
    id: raw.id || "script-" + Date.now(),
    title: raw.title || "Untitled script",
    subject: raw.subject || "",
    objective: raw.objective || "",
    // `level` is what the client called "different levels of explanation":
    // 1 = concrete (one apple, another apple), 2 = the standard lesson,
    // 3 = the abstract/general form (powers of ten, exponents).
    level: Number(raw.level) || 2,
    concept: raw.concept || raw.id || "",
    curricula: arr(raw.curricula).length ? arr(raw.curricula) : ["NERDC", "KS3", "CCSS"],
    // `kind` picks the board decoration: a number line, axes, a stave, and so on.
    board: Object.assign({ kind: "blank", heading: "", sub: "" }, raw.board),
    // Content the script starts with. Most scripts start empty and build the
    // board up step by step, which is what makes the pointing legible.
    objects: arr(raw.objects),
    slots: arr(raw.slots),
    tray: arr(raw.tray),
    faq: arr(raw.faq),
    steps,
    meta: Object.assign({ source: "unknown", generatedAt: null }, raw.meta)
  };
}

// Used by the intake channel: never throw at the caller, report instead.
export function validateScript(raw) {
  const errors = [];
  const warnings = [];
  let script = null;
  try {
    script = normalizeScript(raw);
  } catch (e) {
    return { ok: false, errors: [e.message], warnings, script: null };
  }
  const ids = new Set(script.objects.concat(script.slots).map(o => o.id));
  script.steps.forEach((s, i) => {
    const where = "step " + (i + 1) + " (" + s.do + ")";
    if (!KNOWN.has(s.do)) warnings.push(where + ": unknown directive, it will be skipped.");
    if (s.do === "show") arr(s.objects).forEach(o => { if (o && o.id) ids.add(o.id); });
    if (s.do === "tray") arr(s.slots).forEach(o => { if (o && o.id) ids.add(o.id); });
    // The rough-work pad is not an object on the board, but the tutor can
    // point at it, so opening one makes "rough" a target like any other.
    if (s.do === "rough" && !s.close) ids.add("rough");
    // Targets are resolved at run time, so an unknown id is a warning, not a
    // failure: a later `show` may well create it.
    arr(s.at).forEach(t => { if (!ids.has(t)) warnings.push(where + ': points at "' + t + '", which nothing creates.'); });
    if (s.do === "ask") {
      const a = s.ask || {};
      if (!a.prompt) errors.push(where + ": an ask needs a prompt.");
      if (a.expect === undefined) errors.push(where + ": an ask needs an expected answer.");
      if (["select", "type", "place"].indexOf(a.type) < 0) errors.push(where + ': ask type must be "select", "type" or "place".');
    }
  });
  return { ok: !errors.length, errors, warnings, script: errors.length ? null : script };
}

// ── Board state ──────────────────────────────────────────────────────────────
// The board is data the script owns. The runner hands a new board to the view on
// every change; the view never reaches back into the script.

export function boardFromScript(script) {
  return arrange({
    kind: script.board.kind || "blank",
    heading: script.board.heading || "",
    sub: script.board.sub || "",
    // Carried through so a script can name a drawn illustration (the plant cell).
    photo: script.board.photo || false,
    objects: clone(script.objects) || [],
    slots: clone(script.slots) || [],
    tray: clone(script.tray) || [],
    // Chalk the tutor has drawn. The canvas build draws these; this one keeps
    // them in the board so a script written for either app still plays here.
    marks: clone(script.marks) || [],
    // A pad the tutor pulls over the board to do arithmetic on. The canvas
    // build draws it; this one keeps it in the board so a script written for
    // either app still plays here.
    rough: { open: false, title: "", lines: [] }
  });
}

// The persistent visual effect of a step. Transient state — who is being pointed
// at, what the tutor is saying — belongs to the runner, not here.
export function applyToBoard(board, step) {
  const b = {
    kind: board.kind, heading: board.heading, sub: board.sub, photo: board.photo,
    objects: board.objects.slice(), slots: board.slots.slice(), tray: board.tray.slice(),
    marks: (board.marks || []).slice(),
    rough: board.rough || { open: false, title: "", lines: [] }
  };
  const upsert = (list, item) => {
    const i = list.findIndex(x => x.id === item.id);
    if (i >= 0) list[i] = Object.assign({}, list[i], item);
    else list.push(Object.assign({}, item));
  };
  switch (step.do) {
    case "board":
      if (step.kind !== undefined) b.kind = step.kind;
      if (step.heading !== undefined) b.heading = step.heading;
      if (step.sub !== undefined) b.sub = step.sub;
      break;
    case "show":
      arr(step.objects).forEach(o => { if (o && o.id) upsert(b.objects, o); });
      break;
    case "hide": {
      const gone = new Set(arr(step.ids).concat(arr(step.at)));
      b.objects = b.objects.filter(o => !gone.has(o.id));
      b.slots = b.slots.filter(o => !gone.has(o.id));
      break;
    }
    case "clear": {
      const keep = new Set(arr(step.keep));
      b.objects = b.objects.filter(o => keep.has(o.id));
      b.slots = b.slots.filter(o => keep.has(o.id));
      b.tray = b.tray.filter(o => keep.has(o.id));
      b.marks = [];
      b.rough = { open: false, title: "", lines: [] };
      if (!step.keepHeading) { b.heading = step.heading || ""; b.sub = step.sub || ""; }
      break;
    }
    case "rough":
      b.rough = step.close
        ? { open: false, title: "", lines: [] }
        : {
            open: true,
            title: step.title === undefined ? b.rough.title : step.title,
            lines: step.lines === undefined ? b.rough.lines : arr(step.lines)
          };
      break;
    case "mark":
      upsert(b.marks, {
        id: step.id || ("mark" + b.marks.length),
        kind: step.kind || "ring",
        at: arr(step.at),
        to: step.to || ""
      });
      break;
    case "unmark": {
      const rubbed = arr(step.ids).concat(arr(step.at));
      b.marks = b.marks.filter(m => rubbed.indexOf(m.id) < 0);
      break;
    }
    case "tray":
      b.tray = clone(arr(step.cards));
      if (step.slots) b.slots = clone(arr(step.slots));
      break;
    default:
      break;
  }
  if (step.unmark && step.unmark.length) {
    b.marks = b.marks.filter(m => step.unmark.indexOf(m.id) < 0);
  }
  return arrange(b);
}

// Rows stack down the board. A script can name its own rows ("row": "answers")
// and they appear in the order they are first used.
const ROW_Y = [30, 58, 80, 92];

// Spread every object that did not say where it goes evenly along its row.
// Called after each change, so an object added later pushes its neighbours
// apart rather than landing on top of one.
function arrange(board) {
  const rows = {};
  board.objects.forEach(o => {
    if (!o.auto) return;
    const name = o.row || "main";
    (rows[name] = rows[name] || []).push(o.id);
  });
  if (!Object.keys(rows).length) return board;

  // Copy the objects being moved: earlier boards (a paused step, a lesson
  // waiting behind an answer) still hold the originals and must not shift.
  const moving = {};
  Object.keys(rows).forEach((name, r) => {
    const ids = rows[name];
    ids.forEach((id, i) => {
      moving[id] = {
        x: Math.round(((i + 1) / (ids.length + 1)) * 1000) / 10,
        y: ROW_Y[r] === undefined ? ROW_Y[ROW_Y.length - 1] : ROW_Y[r]
      };
    });
  });
  board.objects = board.objects.map(o => {
    const at = moving[o.id];
    return at ? Object.assign({}, o, { x: at.x, y: o.y === undefined ? at.y : o.y }) : o;
  });
  return board;
}

// What the tutor's body should do while a step runs. Kept here so a new
// directive only has to be taught to the engine in one place.
export function moodFor(step) {
  switch (step.do) {
    case "point": case "highlight": case "mark": case "unmark": case "rough": return "point";
    case "trace": return "trace";
    case "compare": return "compare";
    case "ask": return "quiz";
    case "listen": return "listen";
    case "praise": return "celebrate";
    // Any other directive that names a target still points at it — drawing
    // something on the board and not indicating it would be the tutor talking
    // about one thing while looking at another.
    default: return arr(step.at).length ? "point" : "idle";
  }
}

// ── Legacy bridge ────────────────────────────────────────────────────────────
// Turns one of the original eight lesson objects into a script, so the whole
// library runs through the new engine unchanged.
export function scriptFromLesson(lesson) {
  return normalizeScript({
    id: lesson.id,
    title: lesson.title,
    subject: lesson.subject,
    objective: lesson.objective,
    level: 2,
    concept: lesson.id,
    curricula: lesson.curricula,
    board: lesson.board,
    objects: lesson.objects,
    slots: lesson.slots,
    tray: lesson.tray,
    faq: lesson.faq,
    steps: lesson.steps,
    meta: { source: "library", generatedAt: null }
  });
}

export { clone, arr };
