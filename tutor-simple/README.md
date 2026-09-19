# Tutor (simple version)

Plain HTML + JavaScript. No install, no build.

**To open:** double-click `start.command`. It opens the app in your browser at a local address,
and the tutor speaks with the Mac's own voice (Daniel). Use Chrome or Edge.
(Double-clicking `index.html` also opens it, but Chrome may block the voice there.)

**No voice?** On the Board, press **Test voice**. The line under the caption says what is wrong.
Also check the Mac volume and that the browser tab is not muted.

| File | What it is |
| --- | --- |
| `index.html` | The page: top bar and three screens (Lessons, Board, Progress) |
| `app.js` | All the logic, in 7 labelled sections: state, voice, teaching loop, answers, canvas drawing, screens, events |
| `lessons.js` | The lesson content. Edit this to change what is taught |
| `style.css` | Page layout |
| `server.py` | Tiny local server started by `start.command`. It lets the tutor speak with the Mac's own voice, which is more reliable than browser speech |
| `organic.css` | The design system from Claude Design (colours, fonts, buttons) |

**How it works:** the chalkboard and the stick-figure tutor are drawn on a `<canvas>`, redrawn
60 times a second. Each lesson step sets what the tutor is doing (explain, point, ask, praise);
the drawing code reads that and moves the arm, head and pointer. The browser's built-in speech
engine does the voice. Progress is saved in the browser (localStorage).

**Presenting?** See `DEMO-NOTES.md` for the demo script, how this fits the PRD, the gaps, and where AI comes in.
