# Tutor Studio

A curriculum-aware AI tutor prototype, built from the Claude Design "Tutor Studio" file and the
Tutor PRD. A stick-figure tutor teaches on a chalkboard: it speaks (browser speech synthesis),
points at what it is talking about, asks the learner to tap, type, say, or drag answers, and tracks
mastery by what the learner did *without help*.

## Run it

```bash
npm install     # first time only
npm run dev     # open http://localhost:5173
```

Or double-click `start.command` (macOS).

Use Chrome or Edge in a normal tab (not an embedded preview) so the tutor's voice and
"Answer out loud" work. Click once anywhere on the page to allow the browser to speak.

## Demo script

1. **Lessons**: eight objectives across Maths, English, Science, Geography, and Music. Switch the
   curriculum (Nigeria NERDC JSS1 / England Year 7 / US Grade 7). Same experience, and lesson
   availability follows the curriculum.
2. **Reading large whole numbers** → *Play lesson*. The tutor explains, points, compares, then asks.
3. Try **Hint**, a wrong answer, and **Ask the tutor** (e.g. "why is there a zero?"). The lesson
   holds its place and *Back to step N* resumes it.
4. **Parts of a plant cell**: drag labels onto the diagram (or tap a card, then tap a slot), then *Check my answer*.
5. **Progress**: independent and guided success are recorded separately (Mastered / Developing / Needs support).
6. **Teacher setup** (on the board): edit the title, objective, board objects, teaching steps,
   voice, and pace; download or load a lesson as JSON.

Progress and edits are saved in the browser's localStorage. Use *Clear this learner's record*
or *Restore demo* to reset.

## Structure

- `src/App.jsx`: the board, the tutor, the teaching loop, the progress report, and the teacher setup
- `src/data/lessons.js`: curricula and lesson content (data, not code)
- `src/PlantCell.jsx`: the drawn diagram for the Science lesson
- `src/styles/organic.css`: the Organic design system from Claude Design
