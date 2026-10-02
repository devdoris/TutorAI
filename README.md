# Tutor (no-build version)

Plain HTML and JavaScript. No install, no bundler, no dependencies.

**To open:** double-click `start.command`. It opens the app in your browser at a
local address, and the tutor teaches with a Nigerian English voice. Use Chrome or
Edge. (Double-clicking `index.html` also works, but then there is no renderer, so
the browser's own voice is used and Chrome may block it.)

**Before a demo, run `prepare-voice.command` once.** It renders every line of
every lesson to an audio file, which takes about a minute. After that the tutor
starts speaking within milliseconds of each step and never touches the network.

**No voice?** On the Board, press **Test voice**. The line under the caption says
which of the three routes is in use and what is wrong. Also check the Mac volume
and that the browser tab is not muted.

**Presenting?** The running order, how this fits the PRD, the gaps and where AI
comes in are in the app itself: the **Demo notes** tab, or open `notes.html`.

## Two layers

The app is split in two, and the halves do not know about each other.

```
  GENERATION                              EXECUTION
  what to teach                           how it is taught
  ──────────────                          ─────────────────
  generate.js   the numbers lesson,   ┐
                answers written       │   engine.js   the script format,
                on demand             ├──▶            the runner, the intake
  lessons.js    the original lessons  ┘
```

`engine.js` takes a script and renders it: it moves the tutor, changes the board,
speaks, and stops to wait for the learner. It has no idea what a curriculum is,
where a script came from, or whether a person or a model wrote it. Hand it a
script and it will play it — that is the whole contract, and `npm`-free tests
assert it.

| File | What it is |
| --- | --- |
| `index.html` | The page: top bar and three screens (Lessons, Board, Progress) |
| `engine.js` | **Execution.** The script format, the runner, and every way a script can arrive. Reads nothing from the other two |
| `dictionary.js` | **Generation.** The dictionary: every directive, field and shape a script may use, and the prompt built from it. `dictionary.json` is its export |
| `pipeline.js` | **Generation.** A question mid-lesson: intent → explanation → Script Manager → a checked script |
| `llm.py` | Asks Claude one thing for the pipeline; run by `server.py` |
| `generate.js` | **Generation.** The numbers lesson at three levels, and the scripts written to answer a learner's question |
| `lessons.js` | The original lessons, in the old `verb` / `say` / `target` shape. The engine accepts them unchanged |
| `app.js` | The view: draws the board on a `<canvas>`, works the buttons, speaks |
| `icons.js` | The chalk icons drawn by hand, and where to fetch any other from (Iconify's collections) |
| `icons/` | Icons fetched from the internet, kept so they load without it. Safe to delete |
| `style.css` | Page layout |
| `organic.css` | The design system from Claude Design (colours, fonts, buttons) |
| `server.py` | Tiny local server started by `start.command`. Renders the tutor's lines to audio, serves them, and keeps the Mac voice as a fallback |
| `tts.py` | Renders one batch of lines to `audio/`, named after a hash of the words |
| `prepare-voice.mjs` | Works out every line every lesson could say, and renders them all. Run it before a demo |
| `audio/` | The rendered files. Safe to delete; they are rebuilt on demand |
| `record.html`, `record.js` | Record the tutor's lines in your own voice |
| `voice-lines.js` | Works out every line the tutor could say, so it can be rendered or recorded in advance. Shared by the app and `prepare-voice.mjs` |
| `notes.html` | The demo notes, linked from the top bar |
| `test/engine.test.mjs` | Plays every script end to end with no browser, and asserts the layer split |

**How it works:** the chalkboard and the stick-figure tutor are drawn on a
`<canvas>`, redrawn 60 times a second from the board the engine last handed over.
Each script step says what the tutor is doing — explain, show, point, ask, praise
— and the drawing code reads that and moves the arm, head and pointer. Progress
is saved in the browser (localStorage).

## The script format

A script is JSON. Every step is one thing the tutor does.

```json
{
  "title": "Reading a big number out loud",
  "level": 2,
  "board": { "kind": "circles", "heading": "", "sub": "" },
  "steps": [
    { "do": "show",  "objects": [{ "id": "d1", "label": "4", "x": 12, "y": 26, "shape": "circle" }],
                     "at": ["d1"], "text": "Here is the first digit. This is a four." },
    { "do": "point", "at": ["d1"], "text": "It is in the ten thousands, so it is worth forty thousand." },
    { "do": "trace", "at": ["d5", "d4", "d3"], "text": "Count three digits from the right." },
    { "do": "ask",   "text": "Your turn.",
                     "ask": { "type": "select", "prompt": "Tap the comma.", "expect": "comma", "hint": "…" } },
    { "do": "praise","text": "That is it." }
  ]
}
```

Directives: `say`, `board`, `layout`, `show`, `hide`, `clear`, `focus`,
`unfocus`, `transition`, `point`, `trace`, `compare`, `highlight`, `mark`,
`unmark`, `rough`, `tray`, `ask`, `listen`, `praise`, `wait`. Any step that
names `at` makes the tutor point at it, whatever the directive.

**The board can be divided.** A `layout` step splits it into parts — two side
by side, a 2x2 grid, up to six — each with its own title, and an object then
says which part it lives in. Its `x` / `y`, if it gives any, are measured
inside that part; leave them out and the part places it:

```json
{ "do": "layout", "grid": "2x2", "panels": ["The price", "Ten percent", "Twenty percent", "You pay"] },
{ "do": "show", "objects": [{ "id": "price", "label": "₦4,500", "panel": "tl" }], "at": ["price"], "text": "…" }
```

Parts are named by position: `tl`, `tr`, `bl`, `br` for a 2x2 grid; `l`, `m`,
`r` for three across; `tl`, `tm`, `tr`, `bl`, `bm`, `br` for six. Numbers work
too (`"panel": 3`). A part is a target like anything else, so `{ "do": "point",
"at": ["tr"] }` points at the whole section and a `mark` can ring it. `grid:
"3x2"` is three columns by two rows; `grid: 6` means the same.

**One thing can come to centre stage.** `focus` brings it forward, larger,
while everything else on the board fades back; anything shown while the stage
is set is the explanation, and is written up under it; `unfocus` puts it all
back exactly as it was. The learner can do this too: tap any object that
carries `explain`, and the tutor writes a script on the spot that focuses it
and goes through those lines, then *Back to step N* returns to the lesson.

```json
{ "id": "quad", "label": "x² − 5x + 6 = 0", "panel": "m", "name": "the quadratic",
  "explain": [
    { "say": "Find two numbers that multiply to six and add to five.", "write": "(x − 2)(x − 3) = 0" },
    "Two answers, because it is a quadratic."
  ] }
```

**A change of scene instead of a pause.** `{ "do": "transition", "kind":
"sweep", "text": "Now the next one." }` wipes, fades or sweeps the board while
the tutor says the line, where a `wait` would have left it standing still.
Things also move rather than jump: a row re-spacing itself, a part filling up,
something coming forward, all glide, and a thing taken off the board fades
from where it was.

**Icons can come from the internet.** The eighteen chalk drawings in
`icons.js` are still there, and beyond them any icon in Iconify's collections
by `collection:name` — `"icon": "simple-icons:whatsapp"`, `"mdi:school"`,
`"tabler:calculator"` (browse at icon-sets.iconify.design). It is fetched once,
tinted to chalk, and kept: the local server stores it under `icons/`, and the
browser keeps it too, so a lesson opened once never needs the network for its
pictures. `"image": "https://…/photo.jpg"` draws a photo as a card. An icon
that cannot be fetched falls back to writing its label.

**The tutor can draw, not only point.** A `mark` step puts chalk on the board,
drawn on over half a second as a hand would, and fastened to an object rather
than to a spot so it follows what it marks:

```json
{ "do": "mark", "id": "xo", "kind": "cross", "at": ["a21"],
  "text": "Two take away two is none at all. Watch me cross them out." },
{ "do": "show", "objects": [{ "id": "a21", "label": "0", "x": 33, "y": 54 }],
  "unmark": ["xo"], "at": ["a21"], "text": "Gone. Zero oranges." }
```

Kinds: `ring` (circle it), `cross` (strike it out), `underline`, and `arrow`
(from `at` to `to`). Any step may carry `unmark` to rub marks off as it acts, so
the tutor can cross a number out and write its replacement in one movement.
`clear` wipes the chalk with everything else.

A step with several targets — `trace`, `compare` — moves **in time with the
words**. The renderer saves, beside each line's audio, when every word in it is
spoken; the engine matches each target to the words that name it and moves the
arm on the word. It matches an object's place ("Tens"), or its label, reading
figures as words so `"4"` is found in "Four." Where the wording does not name
the targets, give the step a `cues` list:

```json
{ "do": "trace", "at": ["d5", "d4", "d3"],
  "cues": ["One", "Two", "Three"],
  "text": "Start at the right-hand end again, and count three digits. One. Two. Three." }
```

With no timings and no cues it falls back to spreading the moves evenly across
the sentence. Measured drift on a cued step is under 30 ms. `x` and `y` are percentages
of the board, which is how the tutor knows where to aim. `level` is the depth of
explanation: 1 concrete (apples), 2 the taught lesson, 3 the general form
(powers of ten).

**Two looks.** The board is a dark chalkboard unless a script says `"board":
{ "theme": "paper" }`, which turns it into a white panel with clean type and
coloured pictures, the look of an explainer video, with the caption as a black
pill underneath. Coloured icons come from collections that carry their own
colours, such as `vscode-icons:file-type-json`; single-colour icons are inked
to match. The **Look** picker on the Board overrides what the script asked for.

**The tutor can pull a face.** Any step may carry `"face"`: `happy`,
`surprised`, `thinking`, `plain` or `sad`. Her mouth still moves while she
speaks; the face is what is left when she stops.

**Two more shapes.** `"shape": "bubble"` is a speech bubble, with `sub` as who
is speaking (`"sub": "JSON says:"`) and `w` its width; `"tail": "br"` moves
the tail to the bottom right. `"shape": "window"` is a code window: a title
bar with three dots, `sub` as the file name, and one line of fixed-width text
per `\n` in the label. *JSON and XML* in the Lessons list uses all of this.

## Writing your own lesson

Copy `examples/starter-lesson.json`, change the words, load it. There is nothing
to build and nothing to register — the app has no list of lessons it will accept.

Three things happen on their own when a script arrives:

1. **It is checked** against the format, and anything wrong is named — which
   step, and what is missing — rather than failing silently.
2. **Its voice is rendered**, in the Nigerian voice, in a few seconds. A
   fourteen-line lesson took five seconds from cold; after that it is instant
   and needs no network.
3. **Its pointing is timed to the words**, because the renderer captures when
   every word is spoken. You do not time anything yourself.

**You do not need coordinates.** An object with no `x` is placed by the board,
spread evenly along its row, and re-spaced when another joins it:

```json
{ "do": "show", "objects": [{ "id": "six", "label": "6", "shape": "circle", "sub": "Even" }],
  "at": ["six"], "text": "Six sweets. Three each. Nobody is left out." }
```

One object centres; two sit at a third and two thirds; five spread across the
board. Add `"row": "answers"` to start a second row lower down. Give `x` and `y`
yourself when you want something in a particular place — the plant cell diagram
does.

The pointing matches each target to the words that name it, using the object's
`sub` or `label` (figures are read as words, so `"6"` is found in "Six"). When
the sentence does not name them, add `cues`:

```json
{ "do": "compare", "at": ["six", "seven"], "cues": ["Six", "Seven"],
  "text": "Six shares out fairly. Seven always leaves one behind." }
```

Fields worth setting: `level` (2 is the taught lesson — only level 2 appears in
the picker), `concept` (scripts sharing a concept become each other's *Explain
it simpler* and *Go deeper*), and `faq` (answers the tutor may give when asked).

Shapes: `circle`, `tile`, `bar`, `note`, `point`, `node`, `pin`, or a plain
label. Board kinds: `circles`, `numberline`, `bars`, `tiles`, `diagram`, `axes`,
`timeline`, `stave`, `blank`.

## Getting a script in

Every route is checked against the format first, and logged in the **Script
intake** panel on the Board.

| Route | How |
| --- | --- |
| Paste | Board → **Script intake** → paste JSON → *Run it* (or *Run over this lesson*) |
| File | *Upload .json*, or drop a `.json` file anywhere on the page |
| Another window | `win.postMessage({ type: "tutor:script", script }, "*")` |
| Console | `TutorEngine.run(script)` |
| A service | open the app with `?script=https://…/lesson.json` |

## Asking the tutor

```
  lecture ─▶ learner presses "Ask the tutor" (the lesson pauses on its step)
          ─▶ 1. intent        is it about this lesson?          pipeline.js
          ─▶ 2. response      the explanation, at their level   pipeline.js → model
          ─▶ 3. Script Manager the explanation as a script,     pipeline.js → model + dictionary.js
                               checked by the engine
          ─▶ the board plays it                                 engine.js
          ─▶ "Did that make sense?"  Yes · Ask another · Not yet, simpler
```

**The dictionary** (`dictionary.js`) is every word a script may use, as data:
each directive with its fields and an example, what an object can be, the
marks, asks, faces, icons, the teaching rules, and the usual shapes of a good
answer. `toPrompt()` turns it into the instructions the model writes against;
`node export-dictionary.mjs` writes it out as `dictionary.json` for anyone
else, and `--prompt` prints the instructions. A test fails if it and the
engine ever disagree.

**What a model sends back is checked, not trusted.** Unknown directives are
dropped, pointing at things that are not on the board is dropped, a broken
`ask` becomes a line she says, and then the engine's own validator has the last
word. A reply that cannot be read is asked for once more with the reason; if
it still fails, the explanation is laid out on the board without the model.
Out-of-scope questions are declined politely and the lesson waits.

**The model can be any provider.** Board → *Ask the tutor* → *Connect the
model*: pick Anthropic (Claude), OpenAI, OpenRouter, Google Gemini, Groq,
DeepSeek, Ollama on this computer (no key), or any other OpenAI-compatible
address; the model name is filled in and can be changed; paste the key;
*Connect*. The server tries it with one small call and only keeps it if it
works, in `model.local` beside `server.py` (git ignores it, only your user can
read it). *Change key* with the key left empty switches model and keeps the
key; *Disconnect* deletes it. The key never reaches the browser, and only pages
served from this machine may use the model routes, so another website open in
the same browser cannot spend the credit.

Claude goes through the Anthropic SDK (`llm.py`, run with `uv run --with
anthropic`, so nothing is installed); every other provider is the OpenAI
chat format over plain HTTP, with JSON mode where the provider has it.
`ANTHROPIC_API_KEY` still works when nothing is connected in the app. A small
model may fail the Script Manager's checks more often; the answer then falls
back to a plain layout of the model's explanation.

**With no model it all still works offline**: intent by matching words,
answers by the built-in generator below. The line under the question box says
which one is answering.

The rest of this section is the offline generator.

A question does not get a paragraph back. It gets a **script**, which the same
engine plays on the same board — then the lesson resumes on the exact step it
was interrupted on. **Explain it simpler** drops to the level-1 script for the
same concept; **Go deeper** climbs to level 3.

The generator in `generate.js` is deterministic and runs offline, so a demo never
waits on a network. To hand generation to a model or a service instead:

```js
TutorGenerate.setProvider(TutorGenerate.remoteProvider("https://…/generate"));
```

A provider returns a script, or nothing, in which case the built-in generator
answers. The engine is not told, and does not change.

## Tests

```bash
node --test test/engine.test.mjs test/pipeline.test.mjs
```

Loads `engine.js`, `lessons.js` and `generate.js` the way the page does, plays
every script end to end with no browser, and fails if the engine ever reaches
into the generation layer.

## The voice

macOS ships no Nigerian voice — the nearest is Tessa, who is South African. So
the tutor's lines are rendered instead, using Microsoft's neural voices, which
include Nigerian English and need no account or API key:

| Voice | |
| --- | --- |
| `en-NG-EzinneNeural` | Nigerian English, female — the default |
| `en-NG-AbeoNeural` | Nigerian English, male |
| your own | whatever you record on the **Record** page |
| `en-KE-*`, `en-ZA-*`, `en-GB-RyanNeural` | the other choices in the picker |

Switch voices with the **Voice** picker on the Board. Each voice has its own
rendered files, so swapping mid-demo re-renders the current lesson (about
fifteen seconds) unless it was prepared beforehand.

To hear a voice before choosing:

```bash
afplay voice-samples/en-NG-AbeoNeural.mp3
afplay voice-samples/en-NG-EzinneNeural.mp3
```

### Teaching in your own voice

Open **Record** in the top bar. It lists every line the tutor could say, records
them one at a time with your microphone, and saves each one under the exact name
the renderer would have used — so the app plays your recording without knowing
the difference. **Record the lot** works through the list hands-free.

Nothing leaves the machine, and nothing is trained: it is your recording played
back. Lines you have not recorded yet fall back to the Nigerian voice, so a
half-finished recording still teaches a whole lesson, and the caption line says
how much of it is actually you.

A *cloned* voice — one that could read a line you never recorded — is a
different job that needs a speech model. These recordings are exactly the
reference audio such a model would learn from, so recording thirty lines is a
useful first step either way.

**Why rendered rather than spoken live.** The Mac's `say` command costs about a
second of silence before each line. Over a fifty-step lesson that is a minute of
dead air, and it sounds like the tutor is stuttering. A rendered file starts in
about fifteen milliseconds, so the only pause between lines is the deliberate
one the engine leaves for breath.

Files are content-addressed — the name is a hash of voice, rate and words — so
re-running `prepare-voice.command` after editing a lesson only pays for the
lines that changed.

## Relationship to tutor-studio

`../tutor-studio` is the React build of the same idea, and its
`src/engine/` is the reference implementation of the script format. `engine.js`
here is the no-build port of it. Change one, change the other — both have tests
that will notice if the behaviour drifts.
