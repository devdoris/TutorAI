// ============================================================
//  THE EXECUTION LAYER.
//
//  This file takes a script and renders it: it moves the tutor, changes the
//  board, speaks, and stops to wait for the learner. It has no idea what a
//  curriculum is, where a script came from, or whether a person or a model
//  wrote it. Hand it a script and it will play it. That is the only contract.
//
//  It must not read LESSONS, or anything else from generate.js. The two layers
//  are kept apart on purpose, so that whatever writes a script — a teacher, a
//  file, another window, a model — this side never changes.
//
//  Plain script, no build. This is the no-install port of
//  tutor-studio/src/engine/ ; keep the two in step.
//
//    1. The script format    what a script is allowed to say
//    2. The board            the picture a script builds up
//    3. ScriptRunner         playing it: transport, pointing, asking
//    4. Intake               every way a script can arrive
// ============================================================

(function (root) {
  "use strict";

  // ---------- 1. THE SCRIPT FORMAT ----------

  const SCRIPT_VERSION = "tutor-script/1";

  // Every directive the engine understands. Anything else is skipped with a
  // warning rather than stopping the lesson: a script from a generator we have
  // not met yet should still play as far as it can.
  const DIRECTIVES = [
    { do: "say", note: "Tutor speaks. Nothing on the board changes." },
    { do: "board", note: "Sets the heading, subheading or kind of board." },
    { do: "layout", note: "Divides the board into panels (a 2x2 grid, up to six parts), each with its own title." },
    { do: "show", note: "Puts objects on the board, or updates ones already there." },
    { do: "focus", note: "Brings one thing to centre stage, larger, and fades the rest until unfocus." },
    { do: "unfocus", note: "Puts a focused thing back and brings the rest back." },
    { do: "transition", note: "A visible change of scene (wipe, fade, sweep) in place of a bare pause." },
    { do: "hide", note: "Takes objects off the board." },
    { do: "clear", note: "Removes everything except the ids listed in keep." },
    { do: "point", note: "Tutor raises an arm at a target and speaks." },
    { do: "trace", note: "Tutor sweeps across several targets in turn." },
    { do: "compare", note: "Tutor alternates between two targets." },
    { do: "highlight", note: "Marks objects without pointing." },
    { do: "mark", note: "Tutor draws on the board: a ring, a cross, an underline or an arrow." },
    { do: "rough", note: "Opens a rough-work pad over the board and writes the arithmetic on it." },
    { do: "unmark", note: "Rubs a drawn mark off the board." },
    { do: "tray", note: "Sets the cards and slots for a drag-and-drop task." },
    { do: "ask", note: "Stops and waits for an answer." },
    { do: "listen", note: "Waits for the learner to ask something." },
    { do: "praise", note: "Celebrates." },
    { do: "wait", note: "Holds still for a moment." }
  ];
  const KNOWN = DIRECTIVES.map(d => d.do);

  // Older lesson files used verb / say / target. Accepting them here means the
  // original lessons in lessons.js keep working untouched.
  const LEGACY_VERB = {
    explain: "say", point: "point", trace: "trace", compare: "compare",
    reveal: "highlight", ask: "ask", listen: "listen", praise: "praise"
  };

  const clone = o => (o === undefined ? o : JSON.parse(JSON.stringify(o)));
  const arr = v => (v === null || v === undefined ? [] : [].concat(v));
  const round1 = n => Math.round(n * 10) / 10;

  // An object with no x across is one the board places itself. An object in a
  // panel measures its x / y inside that panel rather than across the whole
  // board, so a script can lay a section out without knowing where the
  // section is; those are kept as lx / ly and resolved every time the board
  // is arranged.
  function normaliseObject(o) {
    if (!o || typeof o !== "object") return o;
    const out = Object.assign({}, o);
    if (out.panel !== undefined && out.panel !== null && out.panel !== "") {
      out.panel = String(out.panel);
      if (out.x !== undefined) { out.lx = out.x; out.ly = out.y; delete out.x; delete out.y; }
    } else {
      delete out.panel;
    }
    if (out.x === undefined && out.lx === undefined) out.auto = true;
    return out;
  }

  // ---------- panels ----------
  // A board can be divided into sections: two side by side, a 2x2 grid, or up
  // to six parts. "3x2" is three columns by two rows. A bare number of parts
  // is accepted too, and "none" takes the division away.
  function parseGrid(g) {
    if (g === undefined || g === null || g === "" || g === "none" || g === false) return null;
    if (typeof g === "object") {
      const cols = Math.max(1, Math.min(3, Number(g.cols) || 1));
      const rows = Math.max(1, Math.min(3, Number(g.rows) || 1));
      return cols * rows > 1 ? { cols: cols, rows: rows } : null;
    }
    const m = String(g).trim().match(/^(\d)\s*[x×by]+\s*(\d)$/i);
    if (m) return parseGrid({ cols: m[1], rows: m[2] });
    const n = Number(g);
    if (n >= 2 && n <= 3) return { cols: n, rows: 1 };
    if (n === 4) return { cols: 2, rows: 2 };
    if (n === 5 || n === 6) return { cols: 3, rows: 2 };
    return null;
  }

  // The name of each part, in reading order: "tl", "tr", "bl", "br" for a
  // 2x2 grid, "l", "m", "r" for three across, "t", "b" for two down.
  function panelNames(cols, rows) {
    const rn = rows === 1 ? [""] : rows === 2 ? ["t", "b"] : ["t", "m", "b"];
    const cn = cols === 1 ? [""] : cols === 2 ? ["l", "r"] : ["l", "m", "r"];
    const out = [];
    rn.forEach(r => cn.forEach(c => out.push(r + c || "1")));
    return out;
  }

  // `grid` says how the board is divided; `spec` names the panels, either as
  // a list in reading order ("Linear", { id: "quad", title: "Quadratic" })
  // or as a map from a panel's positional name to its title ({ tl: "…" }).
  function normaliseLayout(grid, spec) {
    let g = parseGrid(grid);
    if (!g && Array.isArray(spec) && spec.length >= 2) g = parseGrid(spec.length);
    if (!g) return null;
    const names = panelNames(g.cols, g.rows);
    const list = Array.isArray(spec) ? spec : [];
    const map = spec && !Array.isArray(spec) && typeof spec === "object" ? spec : {};
    const panels = names.map(function (name, i) {
      const given = list[i];
      const p = typeof given === "string" ? { title: given } : (given && typeof given === "object" ? given : {});
      const byName = map[name] !== undefined ? map[name] : map[String(i + 1)];
      const q = typeof byName === "string" ? { title: byName } : (byName && typeof byName === "object" ? byName : {});
      return {
        id: String(q.id || p.id || name),
        name: name,
        title: q.title !== undefined ? q.title : (p.title || ""),
        explain: q.explain !== undefined ? q.explain : p.explain
      };
    });
    return { cols: g.cols, rows: g.rows, panels: panels };
  }

  // Retitle the panels of a layout that is already there.
  function retitleLayout(layout, spec) {
    if (!layout || !spec) return layout;
    const next = normaliseLayout({ cols: layout.cols, rows: layout.rows }, spec);
    return Object.assign({}, layout, {
      panels: layout.panels.map(function (p, i) {
        const n = next.panels[i];
        const touched = Array.isArray(spec) ? spec[i] !== undefined : (spec[p.name] !== undefined || spec[String(i + 1)] !== undefined || spec[p.id] !== undefined);
        if (!touched) return p;
        const q = !Array.isArray(spec) && spec[p.id] !== undefined ? spec[p.id] : null;
        const title = typeof q === "string" ? q : q && q.title !== undefined ? q.title : n.title;
        return Object.assign({}, p, { title: title });
      })
    });
  }

  // Where each panel sits, as percentages of the board. The heading takes the
  // top when there is one, and the bottom is left for the question line.
  function panelGeometry(layout, board) {
    const top = (board.heading || board.sub) ? 19 : 6, bottom = 90, left = 2.5, right = 97.5, gap = 2.5;
    const cols = layout.cols, rows = layout.rows;
    const w = (right - left - gap * (cols - 1)) / cols;
    const h = (bottom - top - gap * (rows - 1)) / rows;
    return layout.panels.map(function (p, i) {
      const c = i % cols, r = Math.floor(i / cols);
      const x = left + c * (w + gap), y = top + r * (h + gap);
      const titleH = p.title ? Math.min(9, h * 0.22) : 0;
      return Object.assign({}, p, {
        x: round1(x), y: round1(y), w: round1(w), h: round1(h),
        // The content box, under the title.
        cx0: round1(x), cy0: round1(y + titleH), cw: round1(w), ch: round1(h - titleH),
        cx: round1(x + w / 2), cy: round1(y + titleH + (h - titleH) / 2)
      });
    });
  }

  function panelIds(layout) {
    const out = [];
    (layout ? layout.panels : []).forEach(function (p, i) { out.push(p.id, p.name, String(i + 1)); });
    return out;
  }

  function normaliseStep(raw) {
    if (!raw || typeof raw !== "object") return null;
    const step = Object.assign({}, raw);

    if (!step.do && step.verb) step.do = LEGACY_VERB[step.verb] || step.verb;
    if (step.text === undefined && step.say !== undefined) step.text = step.say;
    if (step.at === undefined && step.target !== undefined) step.at = step.target;
    delete step.verb; delete step.say; delete step.target;

    if (!step.do) step.do = step.ask ? "ask" : "say";
    if (step.do === "ask" && !step.ask) step.do = "say";
    // "write" is shorthand for showing a single object.
    if (step.do === "write") {
      step.do = "show";
      step.objects = [{ id: step.id, label: step.label, sub: step.sub, x: step.x, y: step.y, shape: step.shape || "label" }];
    }
    if (step.at !== undefined) step.at = arr(step.at).filter(Boolean);
    // Writing a script should not mean working out percentages. An object
    // with no x across is one the board will place itself, spread evenly
    // along its row with anything else in that row.
    if (step.objects) step.objects = arr(step.objects).map(normaliseObject);
    // "unfocus" is "focus" on nothing.
    if (step.do === "unfocus") { step.do = "focus"; step.at = []; }
    if (step.ids) step.ids = arr(step.ids);
    // Any step may rub chalk off as it happens, so the tutor can cross a number
    // out and write its replacement in one movement rather than two.
    if (step.unmark) step.unmark = arr(step.unmark);
    return step;
  }

  function normaliseScript(raw) {
    if (!raw || typeof raw !== "object") throw new Error("A script must be an object.");
    const steps = arr(raw.steps).map(normaliseStep).filter(Boolean);
    if (!steps.length) throw new Error("A script needs at least one step.");
    return {
      script: SCRIPT_VERSION,
      id: raw.id || "script-" + Date.now(),
      title: raw.title || "Untitled script",
      subject: raw.subject || "",
      objective: raw.objective || "",
      // How deep the explanation goes: 1 concrete (apples), 2 the taught
      // lesson, 3 the general form (powers of ten).
      level: Number(raw.level) || 2,
      concept: raw.concept || raw.id || "",
      curricula: arr(raw.curricula).length ? arr(raw.curricula) : ["NERDC", "KS3", "CCSS"],
      board: Object.assign({ kind: "blank", heading: "", sub: "" }, raw.board),
      objects: arr(raw.objects).map(normaliseObject),
      slots: arr(raw.slots),
      tray: arr(raw.tray),
      faq: arr(raw.faq),
      steps: steps,
      meta: Object.assign({ source: "unknown", generatedAt: null }, raw.meta)
    };
  }

  // Used by the intake: never throws at the caller, reports instead.
  function validateScript(raw) {
    const errors = [];
    const warnings = [];
    let script;
    try {
      script = normaliseScript(raw);
    } catch (e) {
      return { ok: false, errors: [e.message], warnings: warnings, script: null };
    }
    const ids = {};
    script.objects.concat(script.slots).forEach(o => { if (o && o.id) ids[o.id] = true; });
    // A panel of a divided board is a target too: the tutor can point at a
    // whole section.
    panelIds(normaliseLayout(script.board.layout, script.board.panels)).forEach(id => { ids[id] = true; });
    script.steps.forEach((s, i) => {
      const where = "step " + (i + 1) + " (" + s.do + ")";
      if (KNOWN.indexOf(s.do) < 0) warnings.push(where + ": unknown directive, it will be skipped.");
      if (s.do === "show") arr(s.objects).forEach(o => { if (o && o.id) ids[o.id] = true; });
      if (s.do === "layout" || s.do === "board" || s.do === "clear") {
        panelIds(normaliseLayout(s.grid !== undefined ? s.grid : s.layout, s.panels)).forEach(id => { ids[id] = true; });
      }
      if (s.do === "transition" && s.kind !== undefined && TRANSITIONS.indexOf(s.kind) < 0) {
        warnings.push(where + ': unknown transition "' + s.kind + '", a wipe will be used.');
      }
      if (s.do === "tray") arr(s.slots).forEach(o => { if (o && o.id) ids[o.id] = true; });
      // The rough-work pad is not an object on the board, but the tutor can
      // point at it, so opening one makes "rough" a target like any other.
      if (s.do === "rough" && !s.close) ids.rough = true;
      // Targets are resolved as the script runs, so an unknown id is only a
      // warning: a later "show" may well create it.
      arr(s.at).forEach(t => { if (!ids[t]) warnings.push(where + ': points at "' + t + '", which nothing creates.'); });
      if (s.do === "ask") {
        const a = s.ask || {};
        if (!a.prompt) errors.push(where + ": an ask needs a prompt.");
        if (a.expect === undefined) errors.push(where + ": an ask needs an expected answer.");
        if (["select", "type", "place"].indexOf(a.type) < 0) errors.push(where + ': ask type must be "select", "type" or "place".');
      }
    });
    return { ok: !errors.length, errors: errors, warnings: warnings, script: errors.length ? null : script };
  }

  // ---------- 2. THE BOARD ----------
  // The board is data the script owns. The runner hands a new board to the
  // drawing code on every change; the drawing code never reaches back.

  function boardFromScript(script) {
    return arrange({
      kind: script.board.kind || "blank",
      heading: script.board.heading || "",
      sub: script.board.sub || "",
      // So a script can ask for a drawn illustration (the plant cell).
      picture: script.board.picture || script.board.photo || "",
      objects: clone(script.objects) || [],
      slots: clone(script.slots) || [],
      tray: clone(script.tray) || [],
      // Chalk the tutor has drawn: rings, crosses, underlines, arrows. They
      // hang off object ids rather than coordinates, so a mark stays on the
      // thing it was drawn around.
      marks: clone(script.marks) || [],
      // How the board is divided, if it is: the grid and each panel's title.
      layout: normaliseLayout(script.board.layout || script.board.grid, script.board.panels),
      // What is on centre stage, and what was faded to make room for it.
      stage: null,
      // A pad the tutor pulls over the board to do the arithmetic on, the way
      // a teacher works in the corner. It floats above everything, so working
      // can never collide with the thing being worked on.
      rough: { open: false, title: "", lines: [] }
    });
  }

  // The lasting effect of a step on the picture. What is being pointed at, and
  // what the tutor is saying, belong to the runner instead: they are not part
  // of the board.
  function applyToBoard(board, step) {
    const b = {
      kind: board.kind, heading: board.heading, sub: board.sub, picture: board.picture,
      objects: board.objects.slice(), slots: board.slots.slice(), tray: board.tray.slice(),
      marks: (board.marks || []).slice(),
      rough: board.rough || { open: false, title: "", lines: [] },
      layout: board.layout || null,
      stage: board.stage || null
    };
    const upsert = (list, item) => {
      let found = -1;
      for (let i = 0; i < list.length; i++) if (list[i].id === item.id) { found = i; break; }
      if (found >= 0) {
        // An update that gives no position ("d5 is the units") keeps the one
        // the object already has; it must not turn into a request to move it.
        const merged = Object.assign({}, list[found], item);
        merged.auto = item.x !== undefined || item.lx !== undefined ? false : !!list[found].auto;
        if (item.x !== undefined) { delete merged.autoY; }
        list[found] = merged;
      } else list.push(Object.assign({}, item));
    };
    const setLayout = (grid, panels) => {
      if (grid !== undefined) b.layout = normaliseLayout(grid, panels);
      else if (panels !== undefined) b.layout = b.layout ? retitleLayout(b.layout, panels) : normaliseLayout(undefined, panels);
    };
    // Things that leave the board leave the stage with them.
    const dropFromStage = gone => {
      if (!b.stage) return;
      const ids = b.stage.ids.filter(id => gone.indexOf(id) < 0);
      b.stage = ids.length ? Object.assign({}, b.stage, { ids: ids, hidden: b.stage.hidden.filter(id => gone.indexOf(id) < 0) }) : null;
    };
    switch (step.do) {
      case "board":
        if (step.kind !== undefined) b.kind = step.kind;
        if (step.heading !== undefined) b.heading = step.heading;
        if (step.sub !== undefined) b.sub = step.sub;
        setLayout(step.layout !== undefined ? step.layout : step.grid, step.panels);
        break;
      case "layout":
        setLayout(step.grid !== undefined ? step.grid : step.layout, step.panels);
        if (step.heading !== undefined) b.heading = step.heading;
        if (step.sub !== undefined) b.sub = step.sub;
        break;
      case "show":
        arr(step.objects).forEach(o => { if (o && o.id) upsert(b.objects, o); });
        break;
      case "hide": {
        const gone = arr(step.ids).concat(arr(step.at));
        b.objects = b.objects.filter(o => gone.indexOf(o.id) < 0);
        b.slots = b.slots.filter(o => gone.indexOf(o.id) < 0);
        dropFromStage(gone);
        break;
      }
      case "focus": {
        // The chosen things come forward; everything else on the board at
        // this moment fades until unfocus. Anything shown later, while the
        // stage is set, is the explanation and stays visible.
        const ids = arr(step.at).filter(id => b.objects.some(o => o.id === id));
        b.stage = ids.length
          ? { ids: ids, hidden: b.objects.filter(o => ids.indexOf(o.id) < 0).map(o => o.id), scale: Number(step.scale) || 1.5 }
          : null;
        break;
      }
      case "clear": {
        const keep = arr(step.keep);
        b.objects = b.objects.filter(o => keep.indexOf(o.id) >= 0);
        b.slots = b.slots.filter(o => keep.indexOf(o.id) >= 0);
        b.tray = b.tray.filter(o => keep.indexOf(o.id) >= 0);
        b.marks = [];
        b.rough = { open: false, title: "", lines: [] };
        b.stage = null;
        if (!step.keepHeading) { b.heading = step.heading || ""; b.sub = step.sub || ""; }
        // The division of the board survives a clear unless the step says
        // otherwise: a wiped 2x2 board is still a 2x2 board.
        setLayout(step.layout !== undefined ? step.layout : step.grid, step.panels);
        break;
      }
      case "rough":
        b.rough = step.close
          ? { open: false, title: "", lines: [] }
          : {
              open: true,
              title: step.title === undefined ? b.rough.title : step.title,
              // Passing no lines keeps what is already written, so a step can
              // change the heading without wiping the working underneath it.
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
  const ROW_Y = [30, 56, 74, 90];
  // Rows inside a panel, as a fraction of the panel's height, by how many rows
  // the panel holds.
  const PANEL_ROWS = [[0.5], [0.34, 0.74], [0.24, 0.55, 0.86]];
  const TRANSITIONS = ["wipe", "fade", "sweep"];

  // Where things end up. Spreads every object that did not say where it goes
  // evenly along its row, resolves panel-local positions into board positions,
  // and puts whatever is focused on centre stage. Called after each change,
  // so an object added later pushes its neighbours apart rather than landing
  // on top of one.
  function arrange(board) {
    const stage = board.stage || null;
    const panels = board.layout ? panelGeometry(board.layout, board) : [];
    board.panels = panels;
    const byPanel = {};
    panels.forEach(function (p, i) { byPanel[p.id] = p; byPanel[p.name] = p; byPanel[String(i + 1)] = p; });

    let touched = !!stage;
    const rows = {};            // whole-board rows of auto-placed objects
    const inPanel = {};         // panel id -> row name -> ids
    board.objects.forEach(function (o) {
      if (o.staged || o.hidden) touched = true;      // flags to refresh
      const p = o.panel !== undefined ? byPanel[o.panel] : null;
      if (p) {
        touched = true;
        if (!o.auto) return;
        const r = (inPanel[p.id] = inPanel[p.id] || {});
        const name = o.row || "main";
        (r[name] = r[name] || []).push(o.id);
        return;
      }
      if (!o.auto) return;
      const name = o.row || "main";
      (rows[name] = rows[name] || []).push(o.id);
      touched = true;
    });
    if (!touched) return board;

    // Copy the objects being moved: earlier boards (a paused step, a saved
    // lesson behind an answer) still hold the originals and must not shift.
    const moving = {};
    // While something is on stage, the top row is the stage, so auto rows
    // (the explanation shown under it) start one lower.
    const offset = stage ? 1 : 0;
    Object.keys(rows).forEach((name, r) => {
      const ids = rows[name];
      const k = Math.min(ROW_Y.length - 1, r + offset);
      ids.forEach(function (id, i) {
        moving[id] = { x: round1(((i + 1) / (ids.length + 1)) * 100), y: ROW_Y[k] };
      });
    });
    Object.keys(inPanel).forEach(function (pid) {
      const p = byPanel[pid];
      const names = Object.keys(inPanel[pid]);
      const fr = PANEL_ROWS[Math.min(PANEL_ROWS.length - 1, names.length - 1)];
      names.forEach(function (name, r) {
        const ids = inPanel[pid][name];
        ids.forEach(function (id, i) {
          moving[id] = {
            x: round1(p.cx0 + ((i + 1) / (ids.length + 1)) * p.cw),
            y: round1(p.cy0 + fr[Math.min(r, fr.length - 1)] * p.ch)
          };
        });
      });
    });

    const staged = stage ? stage.ids : [];
    const stageY = (board.heading || board.sub) ? 34 : 28;
    board.objects = board.objects.map(function (o) {
      let out = o;
      const at = moving[o.id];
      const p = o.panel !== undefined ? byPanel[o.panel] : null;
      if (at) {
        // A y the script gave is kept; one the board chose is chosen again,
        // so a row can move down when the stage is set above it.
        const ownY = o.y !== undefined && !o.autoY;
        out = Object.assign({}, out, { x: at.x, y: ownY ? o.y : at.y, autoY: !ownY });
      } else if (p && o.lx !== undefined) {
        out = Object.assign({}, out, {
          x: round1(p.cx0 + (Number(o.lx) || 0) / 100 * p.cw),
          y: round1(p.cy0 + (o.ly === undefined ? 50 : Number(o.ly) || 0) / 100 * p.ch)
        });
      }
      if (stage) {
        const si = staged.indexOf(o.id);
        if (si >= 0) {
          out = Object.assign({}, out, {
            staged: true, hidden: false, scale: stage.scale || 1.5,
            sx: round1(((si + 1) / (staged.length + 1)) * 100), sy: stageY
          });
        } else if (stage.hidden.indexOf(o.id) >= 0) {
          out = Object.assign({}, out, { hidden: true, staged: false });
        } else if (out.staged || out.hidden) {
          out = Object.assign({}, out, { staged: false, hidden: false });
        }
      } else if (out.staged || out.hidden || out.sx !== undefined) {
        out = Object.assign({}, out);
        delete out.staged; delete out.hidden; delete out.sx; delete out.sy; delete out.scale;
      }
      return out;
    });
    return board;
  }

  // What the tutor's body should do while a step runs.
  function moodFor(step) {
    switch (step.do) {
      case "point": case "highlight": case "mark": case "unmark": case "rough": return "point";
      case "focus": return arr(step.at).length ? "point" : "idle";
      case "trace": return "trace";
      case "compare": return "compare";
      case "ask": return "quiz";
      case "listen": return "listen";
      case "praise": return "celebrate";
      // Any other directive that names a target still points at it. Drawing
      // something and not indicating it would be the tutor talking about one
      // thing while looking at another.
      default: return arr(step.at).length ? "point" : "idle";
    }
  }

  // Turns one of the original lesson objects into a script, so the whole
  // library runs through this engine unchanged.
  function scriptFromLesson(lesson) {
    return normaliseScript({
      id: lesson.id,
      title: lesson.title,
      subject: lesson.subject,
      objective: lesson.objective,
      level: 2,
      concept: lesson.id,
      curricula: lesson.curricula,
      board: Object.assign({}, lesson.board, { picture: lesson.id === "cell" ? "plant-cell" : "" }),
      objects: lesson.objects,
      slots: lesson.slots,
      tray: lesson.tray,
      faq: lesson.faq,
      steps: lesson.steps,
      meta: { source: "library" }
    });
  }

  // ---------- 3. THE RUNNER ----------

  // Digits are written as figures on the board but spoken as words, so "4" has
  // to be recognised in "Four." when lining the pointing up with the voice.
  const SPOKEN = {
    "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five",
    "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten"
  };
  const tokens = phrase => String(phrase || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  // Board labels are often a name and then its working ("Ada:  2 oranges  =  1300").
  // The name is what gets said out loud, so it is worth trying on its own.
  const firstWord = label => tokens(label)[0] || "";

  // The ways a phrase might have been said: as written, and with figures read
  // out as words.
  function phrasings(phrase) {
    const plain = tokens(phrase);
    if (!plain.length) return [];
    const spoken = plain.map(t => SPOKEN[t] || t);
    return spoken.join(" ") === plain.join(" ") ? [plain] : [plain, spoken];
  }

  // The spoken line as a flat run of words, so that a phrase can be matched
  // however it was chopped up: "Ten thousands" arrives as two words, and
  // "thirty-two" as one word holding two.
  function stream(words) {
    const out = [];
    words.forEach(function (w) {
      tokens(w.word).forEach(function (tok) { out.push({ tok: tok, at: w.at }); });
    });
    return out;
  }

  // Where in the spoken line a phrase begins, searching from token `from`.
  // Returns { at, next } — when it is said, and where to search from next — or
  // null if it is not said at all.
  function findPhrase(toks, phrase, from) {
    const wants = phrasings(phrase);
    if (!wants.length) return null;
    for (let i = from; i < toks.length; i++) {
      for (const want of wants) {
        let ok = true;
        for (let k = 0; k < want.length; k++) {
          if (!toks[i + k] || toks[i + k].tok !== want[k]) { ok = false; break; }
        }
        if (ok) return { at: toks[i].at, next: i + want.length };
      }
    }
    return null;
  }

  // A cooperative stop signal. Every wait inside the loop is followed by a
  // check, so pausing stops the tutor mid-sentence instead of at the end of
  // the step.
  function Halt() { this.stopped = false; }
  Halt.prototype.stop = function () { this.stopped = true; };

  /**
   * io.onState  (snapshot) -> void   the engine pushes, the app draws
   * io.speak    (text) -> Promise    resolves when spoken, or when cancelled
   * io.silence  () -> void           stop whatever is being said
   * io.wait     (ms) -> Promise
   * io.onAsk    (ask) -> void        the app puts the question up
   * io.onFinish (script) -> void
   */
  function ScriptRunner(io) {
    this.io = io;
    this.script = null;
    this.steps = [];
    this.board = { kind: "blank", heading: "", sub: "", picture: "", objects: [], slots: [], tray: [] };
    this.cursor = -1;
    // Whether the step under the cursor has actually been performed. Seeking
    // or pausing leaves it false, so Play and Next step agree on what comes
    // next instead of one of them silently skipping a step.
    this.executed = false;
    this.status = "idle";        // idle | playing | paused | asking | done
    this.caption = "";
    this.focus = [];
    this.pending = [];   // on the board, but not written up yet
    this.mood = "idle";
    this.question = "";
    this.ask = null;
    this.stack = [];             // one saved frame per interjection
    this.halt = new Halt();
    this.pendingAnswer = null;
    this.readHalt = null;        // set while the tutor is reading a question out
    // A change of scene in progress: { kind, ms, seq }. The view animates it;
    // seq goes up each time so the view knows a new one has begun.
    this.transition = null;
    this.transitions = 0;
  }

  ScriptRunner.prototype.snapshot = function () {
    const s = this.script;
    return {
      scriptId: s ? s.id : "",
      title: s ? s.title : "",
      subject: s ? s.subject : "",
      objective: s ? s.objective : "",
      level: s ? s.level : 2,
      concept: s ? s.concept : "",
      source: s ? s.meta.source : "",
      faq: s ? s.faq : [],
      board: this.board,
      caption: this.caption,
      focus: this.focus,
      pending: this.pending,
      mood: this.mood,
      question: this.question,
      ask: this.ask,
      transition: this.transition,
      status: this.status,
      cursor: this.cursor,
      total: this.steps.length,
      // Set while an answer script is playing over the top of a lesson.
      interjecting: this.stack.length > 0,
      returnTo: this.stack.length ? this.stack[this.stack.length - 1].label : ""
    };
  };

  ScriptRunner.prototype.emit = function () {
    if (this.io.onState) this.io.onState(this.snapshot());
  };

  ScriptRunner.prototype.load = function (raw, opts) {
    const o = opts || {};
    this.stopAll();
    this.script = normaliseScript(raw);
    this.steps = this.script.steps;
    this.board = boardFromScript(this.script);
    this.cursor = -1;
    this.executed = false;
    this.status = "idle";
    this.caption = o.caption || "";
    this.focus = []; this.mood = "idle"; this.question = ""; this.ask = null; this.pending = [];
    this.stack = [];
    this.emit();
    if (o.autoplay) this.play();
    return this.script;
  };

  ScriptRunner.prototype.stopAll = function () {
    this.halt.stop();
    this.halt = new Halt();
    if (this.io.silence) this.io.silence();
    this.resolveAsk({ aborted: true });
  };

  // The step that should run next: the one under the cursor if it was cut
  // short, otherwise the one after it.
  ScriptRunner.prototype.nextIndex = function () {
    if (this.cursor < 0) return 0;
    return this.executed ? Math.min(this.cursor + 1, this.steps.length) : this.cursor;
  };

  ScriptRunner.prototype.play = function () {
    if (!this.script) return;
    if (this.status === "playing" || this.status === "asking") return;
    const from = this.status === "done" ? 0 : this.nextIndex();
    this.runFrom(from);
  };

  ScriptRunner.prototype.pause = function () {
    if (this.status !== "playing" && this.status !== "asking") return;
    this.stopAll();
    this.executed = false;
    this.status = "paused";
    this.mood = "idle";
    this.emit();
  };

  ScriptRunner.prototype.toggle = function () {
    if (this.status === "playing" || this.status === "asking") this.pause();
    else this.play();
  };

  // "Next step". Pressed mid-step it means skip ahead; pressed while stopped
  // on a step it means do this one.
  ScriptRunner.prototype.step = function () {
    if (!this.script) return Promise.resolve();
    const skipping = this.status === "playing" || this.status === "asking";
    this.stopAll();
    const i = Math.min(this.steps.length - 1, skipping ? this.cursor + 1 : this.nextIndex());
    const halt = this.halt;
    const self = this;
    this.status = "playing";
    this.emit();
    return this.exec(i, halt).then(function () {
      if (halt.stopped) return;
      self.executed = true;
      self.status = "paused";
      self.emit();
    });
  };

  ScriptRunner.prototype.seek = function (i) {
    if (!this.script) return;
    this.stopAll();
    // Rebuild the board from the start, so jumping about is truthful: the
    // board shows what it would have shown had the script played to here.
    this.board = boardFromScript(this.script);
    for (let k = 0; k < i && k < this.steps.length; k++) this.board = applyToBoard(this.board, this.steps[k]);
    this.cursor = i;
    this.executed = false;
    this.status = "paused";
    this.focus = []; this.question = ""; this.ask = null; this.pending = []; this.mood = "idle"; this.pending = [];
    this.emit();
  };

  ScriptRunner.prototype.runFrom = async function (from) {
    const halt = this.halt;
    this.status = "playing";
    this.emit();
    for (let i = from; i < this.steps.length; i++) {
      await this.exec(i, halt);
      if (halt.stopped) return;
      this.executed = true;
      await this.io.wait(320);
      if (halt.stopped) return;
    }
    this.status = "done";
    this.mood = "idle";
    this.focus = [];
    this.emit();
    if (this.io.onFinish) this.io.onFinish(this.script);
  };

  ScriptRunner.prototype.exec = async function (i, halt) {
    const step = this.steps[i];
    if (!step) return;
    this.cursor = i;
    this.executed = false;

    // The board changes first, so the tutor points at something already there.
    this.board = applyToBoard(this.board, step);

    this.mood = moodFor(step);
    this.focus = arr(step.at);
    this.pending = [];
    this.question = step.do === "ask" ? (step.ask.prompt || "") : "";
    this.ask = null;
    this.transition = null;
    this.caption = step.text || (step.do === "ask" ? step.ask.prompt : this.caption);
    this.emit();

    if (step.do === "wait") {
      await this.io.wait(step.ms || 700);
      return;
    }

    if (step.do === "transition") {
      // Something to watch instead of a bare pause: the board wipes, fades or
      // sweeps while the tutor says the line, and the step lasts as long as
      // the longer of the two.
      const ms = Number(step.ms) || 650;
      this.transition = { kind: TRANSITIONS.indexOf(step.kind) >= 0 ? step.kind : "wipe", ms: ms, seq: ++this.transitions };
      this.emit();
      await Promise.all([this.say(step.text), this.io.wait(ms)]);
      return;
    }

    if (step.do === "focus" && !step.text) {
      // Give the thing time to come forward before the next step talks about it.
      await this.io.wait(Number(step.ms) || 600);
      return;
    }

    if (step.do === "show") {
      // Everything is on the board already, because where an object lands can
      // depend on how many there are. What is held back is the writing of it:
      // each one appears as the tutor says its name, so the learner's eye is on
      // the thing being talked about instead of reading ahead.
      const objs = arr(step.objects).filter(function (o) { return o && o.id; });
      const plan = objs.length >= 2 ? await this.writePlan(step, objs) : null;
      if (!plan) { await this.say(step.text); return; }
      const self = this;
      this.pending = objs.map(function (o) { return o.id; });
      this.emit();
      const writing = (async function () {
        let elapsed = 0;
        for (let k = 0; k < objs.length; k++) {
          const due = Math.max(0, plan[k] - elapsed);
          if (due) await self.io.wait(due);
          if (halt.stopped) return;
          elapsed += due;
          self.pending = self.pending.filter(function (id) { return id !== objs[k].id; });
          self.emit();
        }
      })();
      await Promise.all([this.say(step.text), writing]);
      // Paused, seeked or finished, the board must read the same either way.
      this.pending = [];
      this.emit();
      return;
    }

    if (step.do === "trace") {
      // Sweep across the targets while the sentence is being spoken, paced so
      // the arm lands on the last one just as the words run out. On a fixed
      // timer the pointer races ahead of the voice, which is what made the
      // tutor look like it was talking about one thing and pointing at another.
      const ids = arr(step.at);
      const self = this;
      const plan = await this.cuePlan(step);
      if (plan) {
        // Rest the arm until the first thing is named, rather than pointing at
        // something the tutor has not mentioned yet.
        this.focus = [];
        this.emit();
      }
      const gap = plan ? 0 : await this.pace(step.text, ids.length, step.gap || 850);
      const sweep = (async function () {
        let elapsed = 0;
        for (let k = 0; k < ids.length; k++) {
          const due = plan ? Math.max(0, plan[k] - elapsed) : (k ? gap : 0);
          if (due) await self.io.wait(due);
          if (halt.stopped) return;
          elapsed += due;
          self.focus = [ids[k]];
          self.emit();
        }
      })();
      await Promise.all([this.say(step.text), sweep]);
      return;
    }

    if (step.do === "compare") {
      const ids = arr(step.at);
      const self = this;
      const plan = await this.cuePlan(step);
      const moves = plan ? plan.length : (step.times || 4);
      if (plan) { this.focus = []; this.emit(); }
      const gap = plan ? 0 : await this.pace(step.text, moves, step.gap || 700);
      const flip = (async function () {
        let elapsed = 0;
        for (let k = 0; k < moves; k++) {
          const due = plan ? Math.max(0, plan[k] - elapsed) : (k ? gap : 0);
          if (due) await self.io.wait(due);
          if (halt.stopped) return;
          elapsed += due;
          self.focus = [ids[k % ids.length]];
          self.emit();
        }
        if (!halt.stopped) { self.focus = ids; self.emit(); }
      })();
      await Promise.all([this.say(step.text), flip]);
      return;
    }

    if (step.do === "ask") {
      // The question goes live before the tutor has finished reading it out.
      // The prompt is already on the board, so a learner who knows the answer
      // and taps straight away must be credited, not ignored.
      this.status = "asking";
      this.ask = step.ask;
      this.emit();
      if (this.io.onAsk) this.io.onAsk(step.ask, { cursor: i });

      const self = this;
      const answered = new Promise(res => { self.pendingAnswer = res; });
      const readHalt = new Halt();
      this.readHalt = readHalt;
      // The tutor says its line, then reads the question itself, so a learner
      // who is not reading still hears what is being asked.
      const reading = (async function () {
        await self.say(step.text);
        if (halt.stopped || readHalt.stopped) return;
        if (step.text && step.ask.prompt && step.text !== step.ask.prompt) {
          await self.io.wait(220);
          if (halt.stopped || readHalt.stopped) return;
          await self.say(step.ask.prompt);
        }
      })();

      const result = await answered;
      this.stopReading();            // answered early: stop reading the question out
      await reading;
      this.readHalt = null;
      this.pendingAnswer = null;
      if (result && result.aborted) return;
      this.ask = null;
      this.question = "";
      this.status = "playing";
      this.emit();
      await this.io.wait(result && result.ok ? 700 : 500);
      return;
    }

    if (step.do === "praise") {
      await this.say(step.text);
      if (!halt.stopped) await this.io.wait(700);
      return;
    }

    await this.say(step.text);
  };

  // Stop reading the question aloud. The view calls this the moment a learner
  // submits an answer, so that the tutor does not carry on asking over the top
  // of its own reply. Doing nothing when the reading has already stopped is
  // what keeps it from cutting off the reply itself.
  ScriptRunner.prototype.stopReading = function () {
    if (!this.readHalt || this.readHalt.stopped) return;
    this.readHalt.stop();
    if (this.io.silence) this.io.silence();
  };

  // When to make each move of a step that has several, so the tutor points at
  // a thing exactly as it says its name. Reads the word timings the renderer
  // captured, and matches each target to the words that name it — the object's
  // place ("Tens"), its label ("4" heard as "four"), or a `cues` list the
  // script gives outright. Returns times in milliseconds from the start of the
  // line, or null when it cannot line every target up, because a plan that is
  // right about some of them and guessing about the rest looks worse than an
  // honest even sweep.
  ScriptRunner.prototype.cuePlan = async function (step) {
    const ids = arr(step.at);
    if (ids.length < 2) return null;
    // A panel is named by its title ("Look at Linear, then Quadratic").
    const panels = (this.board.panels || []).map(p => ({ id: p.id, label: p.title }));
    const things = this.board.objects.concat(this.board.slots, panels);
    const cues = arr(step.cues);
    return this.cueTimes(step.text, ids.map(function (id, i) {
      const thing = things.filter(function (o) { return o.id === id; })[0] || {};
      return cues[i] ? [cues[i]] : [thing.sub, thing.label, firstWord(thing.label)];
    }));
  };

  // The same question for a `show`: when is each of these objects named? The
  // script can say outright with `cues`, or an object can carry its own `cue`.
  ScriptRunner.prototype.writePlan = async function (step, objs) {
    const cues = arr(step.cues);
    return this.cueTimes(step.text, objs.map(function (o, i) {
      return cues[i] ? [cues[i]] : [o.cue, o.sub, o.label, firstWord(o.label)];
    }));
  };

  // When each of a line's targets is spoken. `wants[i]` holds the phrasings to
  // try for target i, best first. Null when any one of them cannot be found: a
  // plan right about some and guessing about the rest looks worse than an even
  // sweep, and worse than not trying at all.
  ScriptRunner.prototype.cueTimes = async function (text, wants) {
    if (!text || !wants.length || !this.io.marks) return null;
    let words = [];
    try { words = (await this.io.marks(text)) || []; } catch { return null; }
    if (!words.length) return null;

    const toks = stream(words);
    const times = [];
    let from = 0;
    for (let i = 0; i < wants.length; i++) {
      let hit = null;
      for (let j = 0; j < wants[i].length; j++) {
        if (!wants[i][j]) continue;
        hit = findPhrase(toks, wants[i][j], from);
        if (hit) break;
      }
      if (!hit) return null;
      times.push(hit.at);
      from = hit.next;
    }
    return times;
  };

  // How long to leave between moves when there is nothing to line them up
  // with: spread them over the sentence so the last one lands near its end.
  ScriptRunner.prototype.pace = async function (text, moves, fallback) {
    if (moves < 2) return fallback;
    let total = 0;
    if (text && this.io.duration) {
      try { total = Number(await this.io.duration(text)) || 0; } catch { total = 0; }
    }
    if (!total) return fallback;
    // The last move happens after moves-1 gaps, not moves of them.
    return Math.max(260, (total * 0.88) / (moves - 1));
  };

  ScriptRunner.prototype.say = async function (text) {
    if (!text) return;
    this.caption = text;
    this.emit();
    await this.io.speak(text);
  };

  // The app calls this when the learner has answered, or the answer was shown.
  ScriptRunner.prototype.resolveAsk = function (result) {
    const r = this.pendingAnswer;
    this.pendingAnswer = null;
    if (r) r(result || { ok: false });
  };
  ScriptRunner.prototype.answered = function (ok) { this.resolveAsk({ ok: !!ok }); };

  // ---------- Interjection ----------
  // When the learner stops the lesson and asks something, the answer is a
  // script like any other, so this same engine plays it — over the top of the
  // lesson — and then puts the lesson back exactly as it was.
  ScriptRunner.prototype.interject = async function (raw, opts) {
    if (!this.script) return;
    const o = opts || {};
    this.stopAll();

    const frame = {
      script: this.script,
      steps: this.steps,
      board: clone(this.board),
      cursor: this.cursor,
      executed: this.executed,
      caption: this.caption,
      status: this.status === "done" ? "done" : "paused",
      label: o.label || (this.cursor >= 0 ? "step " + (this.cursor + 1) : "the start")
    };
    this.stack.push(frame);

    let sub;
    try {
      sub = normaliseScript(raw);
    } catch (e) {
      this.stack.pop();
      this.caption = "I could not put that answer together: " + e.message;
      this.emit();
      return;
    }

    this.script = sub;
    this.steps = sub.steps;
    // An answer script either starts from a blank board, or carries the
    // lesson's board forward so the tutor can point at what the learner was
    // just looking at.
    this.board = sub.board.inherit ? clone(frame.board) : boardFromScript(sub);
    if (sub.board.inherit) {
      if (sub.board.heading) this.board.heading = sub.board.heading;
      if (sub.board.sub) this.board.sub = sub.board.sub;
      this.board.objects = this.board.objects.concat(clone(sub.objects || []));
    }
    this.cursor = -1;
    this.executed = false;
    this.focus = []; this.question = ""; this.ask = null; this.pending = [];
    this.emit();
    await this.runFrom(0);
  };

  // Put the lesson back exactly where it was interrupted.
  ScriptRunner.prototype.resume = function () {
    if (!this.stack.length) { this.play(); return; }
    this.stopAll();
    const frame = this.stack.pop();
    this.script = frame.script;
    this.steps = frame.steps;
    this.board = frame.board;
    this.cursor = frame.cursor;
    this.executed = frame.executed;
    this.caption = frame.caption;
    this.status = frame.status;
    this.focus = []; this.question = ""; this.ask = null; this.pending = []; this.mood = "idle"; this.pending = [];
    this.emit();
  };

  ScriptRunner.prototype.resumeAndPlay = function () {
    this.resume();
    if (this.status !== "done") this.play();
  };

  ScriptRunner.prototype.currentStep = function () { return this.steps[this.cursor] || null; };

  // ---------- 4. INTAKE ----------
  // Every way a script can arrive from outside funnels through here, is
  // checked against the format, and is handed to the runner. Nothing else in
  // the app changes when a new source appears — only this part does.

  function Intake(opts) {
    this.onScript = opts.onScript;
    this.onReject = opts.onReject || function () {};
    this.onNote = opts.onNote || function () {};
    this.log = [];
    this.bound = false;
  }

  // The single door. Everything below calls this.
  Intake.prototype.accept = function (raw, source) {
    const res = validateScript(raw);
    const at = new Date().toLocaleTimeString();
    if (!res.ok) {
      this.record({ at: at, source: source, ok: false, title: (raw && raw.title) || "—", detail: res.errors.join(" ") });
      this.onReject(res.errors, source);
      return null;
    }
    res.script.meta = Object.assign({}, res.script.meta, { source: source, generatedAt: new Date().toISOString() });
    this.record({
      at: at, source: source, ok: true, title: res.script.title,
      detail: res.script.steps.length + " steps" + (res.warnings.length ? " · " + res.warnings.length + " warning(s)" : "")
    });
    this.onScript(res.script, source);
    return res.script;
  };

  Intake.prototype.acceptText = function (text, source) {
    try {
      return this.accept(JSON.parse(text), source);
    } catch (e) {
      this.record({ at: new Date().toLocaleTimeString(), source: source, ok: false, title: "—", detail: "Not valid JSON: " + e.message });
      this.onReject(["Not valid JSON: " + e.message], source);
      return null;
    }
  };

  Intake.prototype.record = function (entry) {
    this.log = [entry].concat(this.log).slice(0, 25);
    this.onNote(entry);
  };

  Intake.prototype.open = function () {
    if (this.bound || typeof window === "undefined") return;
    const self = this;
    this.bound = true;

    // 1. Another window, or a page this one is embedded in.
    this.onMessage = function (e) {
      const d = e && e.data;
      if (!d || d.type !== "tutor:script" || !d.script) return;
      self.accept(d.script, "postMessage");
    };
    window.addEventListener("message", this.onMessage);

    // 2. The console, or any other script on the page.
    window.TutorEngine = {
      run: script => self.accept(script, "api"),
      runJSON: text => self.acceptText(text, "api"),
      fromUrl: url => self.fromUrl(url),
      version: SCRIPT_VERSION
    };

    // 3. Drop a .json file anywhere on the page.
    this.onDragOver = e => { e.preventDefault(); };
    this.onDrop = function (e) {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      e.preventDefault();
      const r = new FileReader();
      r.onload = () => self.acceptText(String(r.result), "drop");
      r.readAsText(file);
    };
    window.addEventListener("dragover", this.onDragOver);
    window.addEventListener("drop", this.onDrop);

    // 4. ?script=<url> — how a service would hand a generated lesson to a tab.
    const q = new URLSearchParams(window.location.search).get("script");
    if (q) this.fromUrl(q);
  };

  Intake.prototype.fromUrl = function (url) {
    const self = this;
    return fetch(url, { headers: { Accept: "application/json" } })
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(json => self.accept(json, "url"))
      .catch(function (e) {
        self.record({ at: new Date().toLocaleTimeString(), source: "url", ok: false, title: url, detail: e.message });
        self.onReject([String(e.message)], "url");
        return null;
      });
  };

  // ---------- exports ----------

  const api = {
    SCRIPT_VERSION: SCRIPT_VERSION,
    DIRECTIVES: DIRECTIVES,
    normaliseStep: normaliseStep,
    normaliseScript: normaliseScript,
    validateScript: validateScript,
    boardFromScript: boardFromScript,
    applyToBoard: applyToBoard,
    normaliseLayout: normaliseLayout,
    panelGeometry: panelGeometry,
    TRANSITIONS: TRANSITIONS,
    moodFor: moodFor,
    scriptFromLesson: scriptFromLesson,
    ScriptRunner: ScriptRunner,
    Intake: Intake
  };

  root.TutorEngineLib = api;
  // So the tests can run this file under node without a browser.
  if (typeof module !== "undefined" && module.exports) module.exports = api;

})(typeof globalThis !== "undefined" ? globalThis : this);
