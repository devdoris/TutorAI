// Chalk icons for the board: stroke-only path data on a 100 x 100 box.
// One table, two renderers -- the studio puts these in an inline <svg>, tutor-simple
// hands the same strings to Path2D. If you change one file, change the other.

const TUTOR_ICONS = {
  apple: ["M50 34 C 40 24, 24 30, 24 48 C 24 68, 38 84, 50 78 C 62 84, 76 68, 76 48 C 76 30, 60 24, 50 34 Z", "M50 34 L 52 18", "M52 22 C 60 14, 72 16, 74 24 C 66 30, 56 30, 52 22 Z"],
  orange: ["M77 52 A 26 26 0 1 1 25 52 A 26 26 0 1 1 77 52 Z", "M51 26 L 52 16", "M53 20 C 61 12, 72 14, 75 21 C 67 27, 57 27, 53 20 Z"],
  banana: ["M22 40 C 24 66, 50 82, 74 68 C 80 64, 82 57, 77 55 C 68 68, 46 64, 34 44 C 30 37, 25 36, 22 40 Z", "M74 68 L 80 72"],
  bread: ["M22 58 C 22 40, 34 32, 50 32 C 66 32, 78 40, 78 58 L 78 66 C 78 70, 75 73, 71 73 L 29 73 C 25 73, 22 70, 22 66 Z", "M34 42 L 40 34", "M48 40 L 54 32", "M62 42 L 68 35"],
  sweet: ["M66 50 A 16 16 0 1 1 34 50 A 16 16 0 1 1 66 50 Z", "M34 50 L 16 38 L 20 50 L 16 62 Z", "M66 50 L 84 38 L 80 50 L 84 62 Z"],
  coin: ["M76 50 A 26 26 0 1 1 24 50 A 26 26 0 1 1 76 50 Z", "M66 50 A 16 16 0 1 1 34 50 A 16 16 0 1 1 66 50 Z"],
  note: ["M16 34 L 84 34 L 84 66 L 16 66 Z", "M62 50 A 12 8 0 1 1 38 50 A 12 8 0 1 1 62 50 Z", "M24 42 L 24 58", "M76 42 L 76 58"],
  bottle: ["M42 18 L 58 18 L 58 32 C 58 38, 66 43, 66 52 L 66 76 C 66 80, 63 82, 59 82 L 41 82 C 37 82, 34 80, 34 76 L 34 52 C 34 43, 42 38, 42 32 Z", "M34 56 L 66 56"],
  ball: ["M78 50 A 28 28 0 1 1 22 50 A 28 28 0 1 1 78 50 Z", "M50 34 L 64 44 L 59 60 L 41 60 L 36 44 Z", "M50 22 L 50 34", "M64 44 L 76 40", "M59 60 L 66 72", "M41 60 L 34 72", "M36 44 L 24 40"],
  book: ["M50 32 C 42 26, 28 25, 20 29 L 20 71 C 28 67, 42 68, 50 74 C 58 68, 72 67, 80 71 L 80 29 C 72 25, 58 26, 50 32 Z", "M50 32 L 50 74"],
  pencil: ["M22 78 L 28 60 L 66 22 L 78 34 L 40 72 Z", "M28 60 L 40 72", "M60 28 L 72 40"],
  cup: ["M30 32 L 70 32 L 64 76 C 64 79, 62 80, 59 80 L 41 80 C 38 80, 36 79, 36 76 Z", "M70 40 C 82 40, 84 60, 69 62", "M32 44 L 68 44"],
  egg: ["M50 18 C 34 18, 25 41, 25 56 C 25 72, 36 82, 50 82 C 64 82, 75 72, 75 56 C 75 41, 66 18, 50 18 Z"],
  fish: ["M18 50 C 31 33, 56 33, 69 50 C 56 67, 31 67, 18 50 Z", "M69 50 L 84 38 L 84 62 Z", "M34 45 L 34.5 45"],
  star: ["M50 18 L 60 41 L 84 44 L 66 60 L 71 83 L 50 71 L 29 83 L 34 60 L 16 44 L 40 41 Z"],
  leaf: ["M24 76 C 24 44, 48 22, 78 24 C 80 54, 58 78, 24 76 Z", "M24 76 C 40 60, 58 48, 72 42"],
  house: ["M20 52 L 50 26 L 80 52", "M28 48 L 28 78 L 72 78 L 72 48", "M42 78 L 42 58 L 58 58 L 58 78"],
  cube: ["M26 38 L 50 26 L 74 38 L 74 64 L 50 76 L 26 64 Z", "M26 38 L 50 50 L 74 38", "M50 50 L 50 76"]
};

// Icons from a collection on the internet, so a board is not limited to the
// eighteen drawn above. A name with a colon in it is a collection and an icon
// in it, in Iconify's naming ("simple-icons:whatsapp", "mdi:school",
// "tabler:calculator" — browse them at https://icon-sets.iconify.design).
// A full https URL to an .svg works too. Fetched once, then kept: by the local
// server on disk under icons/, and by the browser in its own storage, so a
// lesson that has been opened once never needs the network for its pictures.
const TutorIconSource = {
  API: "https://api.iconify.design",
  isRemote: function (ref) {
    const s = String(ref || "").trim();
    return /^https?:\/\/\S+$/i.test(s) || /^[a-z0-9-]+:[a-z0-9-]+$/i.test(s);
  },
  // Which URL to fetch the SVG from. With a local server, ask it, and it keeps
  // a copy on disk; otherwise go to the collection directly.
  urlFor: function (ref, viaServer) {
    const s = String(ref || "").trim();
    if (/^https?:\/\//i.test(s)) return s;
    const m = s.match(/^([a-z0-9-]+):([a-z0-9-]+)$/i);
    if (!m) return null;
    if (viaServer) return "/icon?ref=" + encodeURIComponent(m[1] + ":" + m[2]);
    return TutorIconSource.API + "/" + m[1].toLowerCase() + "/" + m[2].toLowerCase() + ".svg";
  },
  // Tint an SVG and give it a real size, so it can be drawn in chalk at any
  // scale. Collections use currentColor; anything hard-coded is left alone.
  tint: function (svg, colour) {
    return String(svg)
      .replace(/currentColor/g, colour)
      .replace(/\swidth="[^"]*"/, ' width="256"')
      .replace(/\sheight="[^"]*"/, ' height="256"');
  }
};

if (typeof globalThis !== "undefined") globalThis.TutorIconSource = TutorIconSource;
if (typeof module !== "undefined" && module.exports) module.exports = { TUTOR_ICONS: TUTOR_ICONS, TutorIconSource: TutorIconSource };
