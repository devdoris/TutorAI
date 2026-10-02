// ─────────────────────────────────────────────────────────────────────────────
// CHALK GEOMETRY — a view-layer helper, not part of the engine.
//
// The engine says "ring these two things" or "underline that". It does not know
// where anything sits on screen, and it must not: it only ever names ids. This
// file turns those names into the strokes a teacher's hand would leave.
//
// Every stroke wobbles a little, the same way every time, because a ring drawn
// twice in the same place with a ruler's precision reads as a computer, not a
// person. The wobble comes from the mark's id, so it never changes between
// renders and never animates on its own.
// ─────────────────────────────────────────────────────────────────────────────

// The board surface is wider than it is tall. Sizes on the board are given in
// cqw (percent of its width), so a height in those units has to be stretched by
// this much to come out square on screen.
export const AR = 708 / 534;

// Roughly how much room a thing takes, in cqw, by the shape the script gave it.
// The ring only has to look hand-drawn, so near enough is near enough.
function sizeOf(ob) {
  const chars = Array.from(String(ob.label || "")).length || 1;   // emoji count once, as a reader sees them
  if (ob.icon) {
    // A drawn thing is as wide as its row of drawings, or its caption, whichever wins.
    const icon = ob.size || 9;
    const many = Math.max(1, Math.min(12, ob.count || 1));
    const label = ob.labelSize || 2.6;
    return {
      w: Math.max(many * icon * 1.12, ob.label ? chars * label * 0.62 : 0),
      h: icon + (ob.label ? label + 1.2 : 0)
    };
  }
  const size = ob.size || (ob.shape === "circle" ? 6.4 : ob.shape === "tile" ? 3 : 3);
  const text = chars * size * 0.62;
  switch (ob.shape) {
    case "circle": return { w: 15, h: 15 };
    case "bar": return { w: ob.w || 10, h: 14 };
    case "note": return { w: 6, h: 6 };
    case "point": return { w: 4.5, h: 4.5 };
    case "node": return { w: 5, h: 5 };
    case "tile": return { w: text + 4.8, h: size + 2.8 };
    case "pin": return { w: text + 4, h: size + 2 };
    default: return { w: text + 3.2, h: size + 1.6 };
  }
}

// A small, repeatable jitter in [-1, 1] from a string.
export function wobble(seed, n) {
  let h = 2166136261;
  const s = String(seed) + ":" + n;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 2000) / 1000 - 1;
}

/**
 * The box around one or more things on the board, in percent of the surface.
 * Returns null when the engine names something the board has not got — a script
 * can mark an id before it is shown, and a mark with nowhere to go is skipped
 * rather than drawn at the origin.
 */
export function boxOf(board, ids) {
  const things = (board.objects || []).concat(board.slots || []);
  const found = ids.map(id => things.find(o => o.id === id)).filter(Boolean);
  if (!found.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const ob of found) {
    const { w, h } = sizeOf(ob);
    x1 = Math.min(x1, ob.x - w / 2);
    x2 = Math.max(x2, ob.x + w / 2);
    y1 = Math.min(y1, ob.y - (h * AR) / 2);
    y2 = Math.max(y2, ob.y + (h * AR) / 2);
  }
  // Hand the box over in the mark layer's own space: x stretched by the board's
  // aspect so that one unit across equals one unit down. Marks drawn in percent
  // would come out as flattened ovals and unevenly weighted strokes.
  x1 *= AR; x2 *= AR;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
}

// The mark layer's viewBox: as wide as the board is, relative to its height.
export const MARK_W = 100 * AR;

// A ring that starts at the left, goes round, and overshoots its own start the
// way a hand does when it does not lift the chalk cleanly.
function ring(b, seed) {
  const rx = (b.w / 2) * 1.22 + 1.5;
  const ry = (b.h / 2) * 1.3 + 1.5;
  const pts = [];
  const turns = 1.08;                       // just past a full circle
  const steps = 26;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * turns * Math.PI * 2 + 2.4;
    const jr = 1 + wobble(seed, i) * 0.045;
    pts.push([b.cx + Math.cos(t) * rx * jr, b.cy + Math.sin(t) * ry * jr]);
  }
  // Smooth the sampled points into curves; straight segments read as a polygon,
  // and nobody draws a heptagon round an answer.
  let d = "M " + pts[0][0].toFixed(2) + " " + pts[0][1].toFixed(2);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += " Q " + pts[i][0].toFixed(2) + " " + pts[i][1].toFixed(2) + " " + mx.toFixed(2) + " " + my.toFixed(2);
  }
  const end = pts[pts.length - 1];
  return d + " L " + end[0].toFixed(2) + " " + end[1].toFixed(2);
}

// One stroke under a thing, not quite level, the way a hand draws it.
function underline(b, seed) {
  const y = b.y + b.h + 1.6;
  const x1 = b.x - 1, x2 = b.x + b.w + 1;
  const mid = (x1 + x2) / 2;
  return "M " + x1.toFixed(2) + " " + (y + wobble(seed, 1) * 0.5).toFixed(2) +
         " Q " + mid.toFixed(2) + " " + (y + 0.9 + wobble(seed, 2) * 0.7).toFixed(2) +
         " " + x2.toFixed(2) + " " + (y + wobble(seed, 3) * 0.5).toFixed(2);
}

// Through the middle: this one is cancelled, gone, not needed any more.
function strike(b, seed) {
  const y = b.cy;
  return "M " + (b.x - 1.5).toFixed(2) + " " + (y + 1 + wobble(seed, 1) * 0.6).toFixed(2) +
         " L " + (b.x + b.w + 1.5).toFixed(2) + " " + (y - 1 + wobble(seed, 2) * 0.6).toFixed(2);
}

// Four sides that do not quite meet at the corners.
function box(b, seed) {
  const x1 = b.x - 2, y1 = b.y - 2.5, x2 = b.x + b.w + 2, y2 = b.y + b.h + 2.5;
  const j = n => wobble(seed, n) * 0.6;
  return "M " + (x1 + j(1)) + " " + (y1 + j(2)) +
         " L " + (x2 + j(3)) + " " + (y1 + j(4)) +
         " L " + (x2 + j(5)) + " " + (y2 + j(6)) +
         " L " + (x1 + j(7)) + " " + (y2 + j(8)) +
         " L " + (x1 + j(9)) + " " + (y1 - 0.4 + j(10));
}

// From one thing to another, with a head on the end.
function arrow(from, to, seed) {
  const sx = from.cx, sy = from.y + from.h + 1;
  const ex = to.cx, ey = to.y - 1.5;
  const mx = (sx + ex) / 2 + wobble(seed, 1) * 6;
  const my = (sy + ey) / 2 + wobble(seed, 2) * 3;
  const ang = Math.atan2(ey - my, ex - mx);
  const head = 2.6;
  const h1 = [ex - Math.cos(ang - 0.5) * head, ey - Math.sin(ang - 0.5) * head];
  const h2 = [ex - Math.cos(ang + 0.5) * head, ey - Math.sin(ang + 0.5) * head];
  return "M " + sx.toFixed(2) + " " + sy.toFixed(2) +
         " Q " + mx.toFixed(2) + " " + my.toFixed(2) + " " + ex.toFixed(2) + " " + ey.toFixed(2) +
         " M " + h1[0].toFixed(2) + " " + h1[1].toFixed(2) + " L " + ex.toFixed(2) + " " + ey.toFixed(2) +
         " L " + h2[0].toFixed(2) + " " + h2[1].toFixed(2);
}

/**
 * The path for one mark, or null when it has nothing to point at.
 * Kinds: ring (the default), underline, strike, box, arrow (needs `to`).
 */
export function markPath(board, mark) {
  const b = boxOf(board, mark.at || []);
  if (!b) return null;
  if (mark.kind === "arrow") {
    const t = boxOf(board, [mark.to]);
    return t ? arrow(b, t, mark.id) : null;
  }
  if (mark.kind === "underline") return underline(b, mark.id);
  if (mark.kind === "strike") return strike(b, mark.id);
  if (mark.kind === "box") return box(b, mark.id);
  return ring(b, mark.id);
}

// Yellow chalk for the thing that matters, white for the rest — the same two
// sticks a teacher actually has in the tray.
export function markColour(mark) {
  if (mark.colour) return mark.colour;
  return mark.kind === "strike" ? "#e8896b" : mark.kind === "ring" || !mark.kind ? "#f2d06b" : "#f3ecdc";
}
