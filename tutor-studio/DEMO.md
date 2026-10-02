# Sunday demo — running order

Chrome or Edge, normal tab. Click once on the page so the browser lets the tutor
speak. Teaching pace and voice speed are in **Script → Board options**.

**Set the voice up first, the night before.** In `../tutor-simple`: double-click
`prepare-voice.command` (about a minute — it renders every line of every lesson
to an audio file with a Nigerian English voice), then `start.command` to leave
the renderer running. `npm run dev` here proxies to it. Without the renderer the
app still works, but on the browser's own voice, which pauses between lines.

## What was asked for, and where it is

| From the call | Where to see it |
| --- | --- |
| "Write a script, execute everything on that script, make it as extensive as you can" | *Reading a big number out loud* — 56 steps, played end to end |
| "A simple lesson on numbers… so even the dumbest student would get it" | The same lesson: one digit at a time, one idea per step |
| "Let every action point — point to a number, point to the first three numbers for the comma, then explain the comma" | Steps 3–8 draw the digits one by one; steps 35–43 count three from the right, draw the comma, and explain it |
| "Pause the lesson in between, and resume from exactly where it started" | **Pause** → the button reads *Resume from step N*, and it repeats that step rather than losing it |
| "Separate the layer that generates the scripts from the layer that executes it" | `src/engine/` and `src/generate/`. A test fails if the engine imports the generator |
| "The execution engine is able to receive any script at any time and render it" | **Script intake** — paste, file, drag-drop, `postMessage`, `TutorEngine.run()`, `?script=` |
| "When the student pauses and asks a question, we generate the script to answer that question" | **Ask the tutor** — the answer is a script the same engine plays, then *Back to step N* |
| "Scripts that are more broken down… different levels, from one apple to exponential" | **Explain it simpler** (apples) and **Go deeper** (powers of ten) |

## Running order — about twelve minutes

**1. The lesson (4 min).**
Lessons → *Reading a big number out loud* → it starts itself. Let it run through
the opening and the digits going up one at a time. Point out that the tutor's arm
moves to whatever it is naming — nothing is drawn without being indicated.

**2. Pause and resume (30 sec).**
Hit **Pause** mid-sentence. The button now says *Resume from step N*. Press it:
the tutor repeats that step from the beginning rather than dropping it.

**3. The comma (2 min).**
Open **Script** on the right and click the step *"Start at the right-hand end
again, and count three digits."* Then **Next step** through to the comma being
drawn and explained. This is the sequence asked for on the call, step by step.

**4. A question mid-lesson (2 min).**
**Ask the tutor** → type *"why is there a zero?"* → Ask.

Say out loud what is happening: the question was turned into a script, the same
engine is rendering it on the same board, and the lesson is holding its place.
The bar at the top says so. Press **Back to step N** and the lesson resumes
exactly where it was.

**5. Levels (1 min).**
**Explain it simpler** → the apples script. **Back to step N**.
**Go deeper** → powers of ten. **Back to step N**.
Same concept, three depths, one engine.

**6. Any script, any time (2 min).** *This is the architectural point.*

Open **Script intake**. Then, in the browser console:

```js
TutorEngine.run({
  title: "Written five seconds ago",
  board: { heading: "9" },
  steps: [
    { do: "say", text: "Nobody wrote me into this app." },
    { do: "show", objects: [{ id: "n", label: "9", x: 50, y: 40, shape: "circle", sub: "Units" }],
      at: ["n"], text: "And yet here I am, on the board." },
    { do: "ask", text: "It can ask, too.",
      ask: { type: "type", prompt: "What is on the board?", expect: ["9"], hint: "A single digit." } },
    { do: "praise", text: "Same engine. No code change." }
  ]
})
```

Or drag `examples/sent-from-outside.json` onto the window. The intake panel logs
where every script came from, and the tag by the lesson title reads
`source: api` / `file` / `generator` / `library`.

Close with: *whatever writes the script — a teacher, a service, a model — this
side does not change. That is the separation you asked for.*

## If something goes wrong

- **No voice.** Click once on the page. Check the tab is not muted. **Script →
  Board options → Test voice** says what is wrong.
- **Wrong voice, or pauses between lines.** The renderer is not running: start
  `../tutor-simple/start.command`, then reload. The picker is **Script → Board
  options → Tutor voice**.
- **Voice too fast or slow.** Script → Board options → *Voice speed*.
- **Lesson running long.** *Teaching pace* → brisk, or jump steps from the Script
  panel.
- **Odd state after experimenting.** Progress → *Clear this learner's record*,
  then reload.

## What is not built yet

Worth saying plainly rather than being asked:

- The answer generator is deterministic and rule-based — it answers the
  questions this lesson provokes and refuses the rest rather than inventing.
  `setProvider()` swaps in a model or a service without the engine changing.
- One authored lesson at three levels. Other subjects still use the original
  six-step lessons.
- Progress is per-browser (localStorage). No accounts, no teacher dashboard, no
  back end — the "flesh of the application" conversation.
- The Nigerian voice is Microsoft's neural `en-NG-AbeoNeural`, rendered ahead of
  time by the local renderer. Without that renderer the app falls back to
  whatever voice the browser has.
