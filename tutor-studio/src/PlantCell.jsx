// Drawn plant cell for the "Parts of a plant cell" lesson. The diagram box sits at
// left 3% / top 18% / 50% x 66% of the board surface, so a local point (lx, ly) in
// this 0–100 viewBox maps to board coordinates (3 + lx * 0.5, 18 + ly * 0.66).
const toBoard = (lx, ly) => ({ x: +(3 + lx * 0.5).toFixed(1), y: +(18 + ly * 0.66).toFixed(1) });

// Where each leader line leaves the drawing, keyed by the board slot it runs to.
export const CELL_LEADERS = [
  { pin: "pin_wall", ...toBoard(97, 12) },
  { pin: "pin_nuc", ...toBoard(70, 32) },
  { pin: "pin_chl", ...toBoard(80, 72) },
  { pin: "pin_vac", ...toBoard(43, 70) }
];

export default function PlantCell() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }} role="img" aria-label="Diagram of a plant cell">
      <rect x="0" y="0" width="100" height="100" fill="#f4efe2" />
      <rect x="3" y="5" width="94" height="90" rx="12" fill="#b9d58f" stroke="#55702f" strokeWidth="2.6" />
      <rect x="7.5" y="9.5" width="85" height="81" rx="9" fill="#e3efc9" stroke="#86a55a" strokeWidth="1" strokeDasharray="2 1.5" />
      <rect x="17" y="50" width="52" height="38" rx="15" fill="#bcdde8" stroke="#5f98ab" strokeWidth="1.6" />
      <path d="M24 62 q8 -5 16 0 t16 0" fill="none" stroke="#8fc0d0" strokeWidth="1" />
      <circle cx="70" cy="32" r="11" fill="#dcb48a" stroke="#8c5a2b" strokeWidth="1.6" />
      <circle cx="72.5" cy="30" r="3.6" fill="#a8703d" />
      {[[80, 72, -20], [84, 52, 30], [26, 26, 15], [44, 21, -10], [24, 40, 40], [50, 36, 0]].map(([cx, cy, r], i) => (
        <g key={i} transform={`rotate(${r} ${cx} ${cy})`}>
          <ellipse cx={cx} cy={cy} rx="6" ry="3.4" fill="#4f8a37" stroke="#2f5a1e" strokeWidth="0.9" />
          <line x1={cx - 3.6} y1={cy} x2={cx + 3.6} y2={cy} stroke="#9ccc75" strokeWidth="0.7" />
        </g>
      ))}
    </svg>
  );
}
