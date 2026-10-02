// ─────────────────────────────────────────────────────────────────────────────
// GENERATION LAYER — scripts made on demand.
//
// "When the student pauses and asks the question, we generate the script to
//  answer that question… so we can generate scripts that are more broken down."
//
// A question does not get a paragraph of text back. It gets a *script*, which
// the same execution engine renders on the same board with the same tutor. That
// is what keeps the experience one thing instead of two.
//
// The generator below is deterministic and runs offline, so the demo never waits
// on a network. `setProvider` swaps in a real one — a model, or the curriculum
// service — without the engine knowing anything changed.
// ─────────────────────────────────────────────────────────────────────────────

// Apostrophes are dropped rather than turned into spaces, so that "don't"
// becomes "dont" and matches the phrase list instead of "don t".
const norm = s => String(s || "").toLowerCase().replace(/['\u2019]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const has = (q, ...words) => words.some(w => q.indexOf(w) >= 0);

// ── The provider seam ────────────────────────────────────────────────────────
// A provider is: (question, context) => Promise<script|null>. Returning null
// means "I have nothing", and the local generator answers instead.
let provider = null;
export function setProvider(fn) { provider = fn; }
export function getProvider() { return provider; }

/**
 * An example remote provider. Point it at whatever generates scripts — the
 * contract is only that it returns something the engine can validate.
 *
 *   setProvider(remoteProvider("https://…/generate"));
 */
export function remoteProvider(endpoint, init) {
  return async (question, context) => {
    const r = await fetch(endpoint, Object.assign({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        concept: context.concept,
        level: context.level,
        objective: context.objective,
        step: context.step,
        board: context.board
      })
    }, init || {}));
    if (!r.ok) return null;
    return await r.json();
  };
}

// ─────────────────────────────────────────────────────────────────────────────

const script = (id, title, steps, extra) => Object.assign({
  id, title, level: 2, concept: "", curricula: ["NERDC", "KS3", "CCSS"],
  // `inherit` keeps the lesson's board underneath, so the tutor answers by
  // pointing at the very thing the learner was looking at.
  board: { inherit: true },
  steps,
  meta: { source: "generator" }
}, extra || {});

// ── The local generator ──────────────────────────────────────────────────────

function fromFaq(q, context) {
  const hit = (context.faq || []).find(f => (f.k || []).some(k => norm(q).indexOf(norm(k)) >= 0));
  if (!hit) return null;
  // If the FAQ entry names something on the board, point at it while answering.
  const target = findOnBoard(hit.k, context.board);
  const steps = [{ do: "say", text: "Good question. Let me show you." }];
  steps.push(target
    ? { do: "point", at: [target], text: hit.a }
    : { do: "say", text: hit.a });
  steps.push({ do: "say", text: "Does that settle it? We can carry on." });
  return script("ans-faq-" + Date.now(), "Answer: " + q, steps, { concept: context.concept });
}

function findOnBoard(words, board) {
  const objs = (board && board.objects) || [];
  for (const w of [].concat(words)) {
    const n = norm(w);
    if (!n) continue;
    const hit = objs.find(o => norm(o.label) === n || norm(o.sub) === n || norm(o.sub).indexOf(n) >= 0);
    if (hit) return hit.id;
  }
  return null;
}

// Questions that come up in every numbers lesson, answered by pointing.
function fromPattern(q, context) {
  const board = context.board || { objects: [] };
  const objs = board.objects || [];
  const byLabel = lbl => (objs.find(o => norm(o.label) === norm(lbl)) || {}).id;
  const bySub = sub => (objs.find(o => norm(o.sub).indexOf(norm(sub)) >= 0) || {}).id;

  if (has(q, "comma")) {
    const comma = byLabel(",");
    const steps = [{ do: "say", text: "The comma. Let me take it slowly, because almost everyone asks about this one." }];
    if (comma) steps.push({ do: "point", at: [comma], text: "This mark here is the comma." });
    steps.push({ do: "say", text: "It does not change the number at all. You could rub it out and the number would be worth exactly the same." });
    steps.push({ do: "say", text: "It is there for your eyes. Counting three digits from the right and putting a comma means you never have to count five digits at once." });
    steps.push({ do: "say", text: "And it carries one piece of information: everything to the left of the comma is thousands. That is the part you read first, before you say the word thousand." });
    return script("ans-comma-" + Date.now(), "Why is there a comma?", steps, { concept: context.concept });
  }

  if (has(q, "zero", " 0 ") || q === "0") {
    const zero = byLabel("0");
    const steps = [{ do: "say", text: "Why write a zero if it is worth nothing. That is a sharp question." }];
    if (zero) steps.push({ do: "point", at: [zero], text: "This zero is not there to be worth something. It is there to hold a seat." });
    steps.push({ do: "say", text: "A digit's worth comes from where it sits. If the zero left, every digit to its left would slide one seat to the right, and become ten times smaller." });
    steps.push({ do: "say", text: "So the zero is a guard. It keeps the seat occupied so nothing moves." });
    return script("ans-zero-" + Date.now(), "Why is there a zero?", steps, { concept: context.concept });
  }

  if (has(q, "why right", "from the right", "start from", "why do we start")) {
    const units = bySub("units");
    const steps = [{ do: "say", text: "Why from the right — because that is where the smallest place lives, and it is the only place that never moves." }];
    if (units) steps.push({ do: "point", at: [units], text: "The units are always at the right-hand end, whether the number has two digits or twenty." });
    steps.push({ do: "say", text: "If you counted from the left instead, the names would change every time the number got longer. From the right, they never change." });
    return script("ans-right-" + Date.now(), "Why count from the right?", steps, { concept: context.concept });
  }

  if (has(q, "ten times", "times ten", "why ten", "why 10")) {
    const steps = [
      { do: "say", text: "Because we have ten fingers, and we built our whole counting system around that." },
      { do: "say", text: "Once you have used all ten digits — zero up to nine — you have run out of marks. So you start a new column to the left and keep going." },
      { do: "say", text: "That is all a place is: a record of how many times you ran out of digits." }
    ];
    return script("ans-ten-" + Date.now(), "Why ten times?", steps, { concept: context.concept });
  }

  if (has(q, "tens", "hundreds", "thousands", "units", "place")) {
    const which = ["units", "tens", "hundreds", "thousands", "ten thousands"].find(p => q.indexOf(p) >= 0) || "place";
    const id = bySub(which);
    const steps = [{ do: "say", text: "Let me point at it rather than describe it." }];
    if (id) {
      const o = objs.find(x => x.id === id) || {};
      steps.push({ do: "point", at: [id], text: "This digit, the " + o.label + ", is the one in the " + which + " place." });
      steps.push({ do: "say", text: "Which means it is worth " + o.label + " lots of " + which + ", not just " + o.label + " on its own." });
    } else {
      steps.push({ do: "say", text: "The places run from the right: units, tens, hundreds, thousands, then ten thousands. Each one is ten of the one before." });
    }
    return script("ans-place-" + Date.now(), "About the " + which, steps, { concept: context.concept });
  }

  // "What is this?" pointed at whatever is currently in focus.
  if (has(q, "what is this", "what is that", "this one", "that one") && (context.focus || []).length) {
    const id = context.focus[0];
    const o = objs.find(x => x.id === id);
    if (o) {
      return script("ans-this-" + Date.now(), "What is this?", [
        { do: "point", at: [id], text: "This one is " + (o.label || "here") + (o.sub ? ", and it sits in the " + o.sub.toLowerCase() + "." : ".") }
      ], { concept: context.concept });
    }
  }

  return null;
}

// When a learner says they are lost, the honest answer is not more words at the
// same level — it is the same idea, lower down.
export function isConfusion(question) {
  const q = norm(question);
  return has(q, "dont understand", "do not understand", "confused", "lost", "simpler", "explain again", "slower", "i m lost", "im lost", "what do you mean");
}

function fallback(q, context) {
  return script("ans-none-" + Date.now(), "Outside this lesson", [
    {
      do: "listen",
      text: "Honest answer: that is outside what this lesson covers, and I would rather not guess at it. I will flag it for your teacher."
    },
    { do: "say", text: "Shall we finish " + (context.objective ? "this" : "the lesson") + " first? You can ask me again at the end." }
  ], { concept: context.concept });
}

/**
 * The entry point the app calls when a learner asks something mid-lesson.
 * Always resolves to a script — never to null — so the engine always has
 * something to render.
 */
export async function generateAnswerScript(question, context) {
  const ctx = Object.assign({ faq: [], board: { objects: [] }, focus: [], concept: "", level: 2 }, context || {});
  if (provider) {
    try {
      const remote = await provider(question, ctx);
      if (remote) return remote;
    } catch {
      // A generator being down must never stop a lesson.
    }
  }
  const q = norm(question);
  // Patterns first: they build a several-step script that points at the board,
  // which teaches better than reading out one authored sentence. The lesson's
  // own FAQ catches whatever the patterns do not recognise.
  return fromPattern(q, ctx) || fromFaq(q, ctx) || fallback(q, ctx);
}

// ── Re-explaining what is already on screen ─────────────────────────────────

/**
 * "We can generate scripts that are more broken down."
 * Takes the step the learner is stuck on and expands it into several smaller
 * steps: name the thing, say the one sentence again in pieces, then check.
 */
export function breakDownStep(step, context) {
  if (!step) return null;
  const board = context.board || { objects: [] };
  const targets = [].concat(step.at || []);
  const objs = board.objects || [];
  const steps = [{ do: "say", text: "Let me take that one apart. Same idea, smaller pieces." }];

  targets.forEach(id => {
    const o = objs.find(x => x.id === id);
    if (!o) return;
    steps.push({ do: "point", at: [id], text: "First, this one. It is a " + (o.label || "mark") + "." });
    if (o.sub) steps.push({ do: "point", at: [id], text: "And it is sitting in the " + o.sub.toLowerCase() + ". That is what decides how much it is worth." });
  });

  // Break the sentence into clauses and say them one at a time, with a beat
  // between. Slower is usually the whole fix.
  String(step.text || "").split(/(?<=[.!?])\s+/).filter(Boolean).forEach(sentence => {
    steps.push({ do: "say", text: sentence });
    steps.push({ do: "wait", ms: 420 });
  });

  steps.push({ do: "say", text: "That is the same thing I said before, only slower. Tell me if it is still not clear and I will go further back." });
  return script("ans-break-" + Date.now(), "Broken down", steps, { concept: context.concept, level: Math.max(1, (context.level || 2) - 1) });
}

/**
 * Drop to a lower level of explanation, or climb to a higher one. `library` is
 * the list of scripts the app knows about; a matching level for the same concept
 * wins, otherwise we break the current step down instead.
 */
export function explainAtLevel(level, context, library) {
  const want = Math.max(1, Math.min(3, level));
  const hit = (library || []).find(s => s.concept === context.concept && s.level === want && s.id !== context.scriptId);
  if (hit) return hit;
  if (want < (context.level || 2)) return breakDownStep(context.step, context);
  return null;
}
