# Tutor Studio

A stick-figure tutor teaches on a chalkboard: it speaks, points at what it is
talking about, asks the learner to tap, type, say or drag answers, and records
mastery by what the learner did *without help*.

Underneath, the app is **two layers that do not know about each other**.

```
  GENERATION                                   EXECUTION
  what to teach                                how it is taught
  ────────────────                             ─────────────────
  src/generate/numbers.js    authored     ┐
  src/generate/answers.js    on demand    │    src/engine/script.js   the format
  src/data/lessons.js        the library  ├──▶ src/engine/runner.js   plays it
  a file, a URL, another     outside      │    src/engine/intake.js   lets it in
  window, a model                         ┘
```

The runner takes a script and renders it. It has no idea what a curriculum is,
who wrote the script, or why. Hand it a script and it will play it — that is the
entire contract. `src/engine/` importing anything from `src/generate/` is a test
failure, not a style opinion.

## Run it

```bash
npm install     # first time only
npm run dev     # open http://localhost:5173
npm test        # plays every script end to end, headless, in ~60ms
```

Or double-click `start.command` (macOS). Use Chrome or Edge in a normal tab (not
an embedded preview) so the tutor's voice and "Answer out loud" work. Click once
anywhere on the page to let the browser start speaking.

**For the good voice**, also start the renderer in the sibling folder — double-click
`../tutor-simple/start.command`, and run its `prepare-voice.command` once before a
demo. `npm run dev` proxies `/voices`, `/prepare` and `/audio` to it, so this app
gets the same Nigerian English voice and the same instant playback. Without it,
everything still works using the browser's own speech engine.

## The script format

A script is JSON. Every step is one thing the tutor does.

```json
{
  "title": "Reading a big number out loud",
  "objective": "…",
  "level": 2,
  "board": { "kind": "circles", "heading": "", "sub": "" },
  "steps": [
    { "do": "say",   "text": "Watch my hand, because I will point at everything I talk about." },
    { "do": "show",  "objects": [{ "id": "d1", "label": "4", "x": 12, "y": 28, "shape": "circle" }],
                     "at": ["d1"], "text": "Here is the first digit. This is a four." },
    { "do": "point", "at": ["d1"], "text": "It is in the ten thousands, so it is worth forty thousand." },
    { "do": "trace", "at": ["d5", "d4", "d3"], "text": "Count three digits from the right." },
    { "do": "ask",   "text": "Your turn.",
                     "ask": { "type": "select", "prompt": "Tap the comma.", "expect": "comma", "hint": "…" } },
    { "do": "praise","text": "That is it." }
  ]
}
```

| Directive | What it does |
| --- | --- |
| `say` | Speaks. Nothing on the board changes. |
| `board` | Sets the heading, subheading or representation. |
| `show` | Puts objects on the board (or updates ones already there). |
| `hide` / `clear` | Takes objects off. `clear` keeps anything listed in `keep`. |
| `point` | Raises the tutor's arm at `at` and speaks. |
| `trace` | Sweeps across `at` in turn while speaking. |
| `compare` | Alternates between two targets. |
| `highlight` | Marks objects without pointing. |
| `tray` | Sets the cards and slots for a drag-and-drop task. |
| `ask` | Stops and waits: `select`, `type` or `place`. |
| `listen` | Waits for the learner to ask something. |
| `praise` | Celebrates. |
| `wait` | Holds still for `ms`. |

Any step that names `at` makes the tutor point at it, whatever the directive —
drawing something and not indicating it would be the tutor talking about one
thing while looking at another.

A step with several targets — `trace`, `compare` — moves **in time with the
words**, using the timings the renderer saves beside each line's audio. Each
target is matched to the words that name it (its place, or its label, reading
figures as words so `"4"` matches "Four"), or to an explicit `cues` list on the
step. Without a renderer the moves are spread evenly across the sentence
instead.

`x` and `y` are percentages of the board, which is how the tutor knows where to
aim. `level` is the depth of explanation: 1 concrete, 2 the taught lesson,
3 the general form. Old-style steps (`verb` / `say` / `target`) are still
accepted, so the original eight lessons play unchanged.

## Getting a script into the engine

Every route funnels through `src/engine/intake.js`, is validated, and is handed
to the runner. Nothing else in the app changes when a new source appears.

| Route | How |
| --- | --- |
| Paste | Board → **Script intake** → paste JSON → *Run it* (or *Run over this lesson*) |
| File | *Upload .json*, or drop a `.json` file anywhere on the page |
| Another window | `win.postMessage({ type: "tutor:script", script }, "*")` |
| Console or host page | `TutorEngine.run(script)` |
| A service | open the app with `?script=https://…/lesson.json` |

`examples/sent-from-outside.json` is a script to drop in and prove it.

## Answering a question mid-lesson

A question does not get a paragraph back. It gets a **script**, and the same
engine plays it on the same board with the same tutor — then puts the lesson
back on the exact step it was interrupted on.

- **Ask the tutor** → `generateAnswerScript()` writes a script, the runner
  interjects it, and *Back to step N* restores the lesson.
- **Explain it simpler** → drops to the level-1 script for the same concept
  (apples), or breaks the current step into smaller ones if there is no
  lower-level script.
- **Go deeper** → climbs to the level-3 script (powers of ten).

The generator in `src/generate/answers.js` is deterministic and runs offline, so
a demo never waits on a network. To hand generation to a model or a curriculum
service instead:

```js
import { setProvider, remoteProvider } from "./generate/answers.js";
setProvider(remoteProvider("https://…/generate"));
```

A provider returns a script, or `null` to fall through to the local generator.
The engine is not told, and does not change.

## Structure

- `src/engine/script.js` — the format: directives, validation, board state
- `src/engine/runner.js` — the executor: transport, pointing, asking, interjection
- `src/engine/intake.js` — every way a script can arrive
- `src/generate/numbers.js` — the numbers lesson, at three levels
- `src/generate/answers.js` — scripts written to answer a question
- `src/generate/library.js` — what this build ships with
- `src/data/lessons.js` — the original eight lessons (old format, still played)
- `src/voice.js` — how a line is spoken: a rendered file, else the browser's engine
- `src/App.jsx` — the board, the tutor's body, the controls, the progress report
- `src/styles/organic.css` — the Organic design system from Claude Design
- `test/engine.test.mjs` — plays every script headless; asserts the layer split

Progress and received scripts are saved in the browser's localStorage. Use
*Clear this learner's record* to reset.
