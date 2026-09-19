// ============================================================
//  LESSON CONTENT — edit this file to change what the tutor teaches.
//
//  Each lesson has:
//    board    what is written on the chalkboard (kind decides the drawing)
//    objects  things drawn on the board. x / y are percentages across / down.
//    slots    drop targets for drag-and-drop answers
//    tray     the cards the learner drags into slots
//    steps    what the tutor does, in order:
//               explain / point / trace / compare / ask / praise
//             an "ask" step has a question: select (tap it), type, or place (drag)
//    faq      answers to questions the learner may ask mid-lesson
// ============================================================

const CURRICULA = [
  { id: "NERDC", label: "Nigeria · NERDC · JSS1", stage: "JSS1" },
  { id: "KS3", label: "England · National Curriculum · Year 7", stage: "Year 7" },
  { id: "CCSS", label: "United States · Common Core · Grade 7", stage: "Grade 7" }
];
const KINDS = [
  { value: "circles", label: "Number circles / place value" },
  { value: "numberline", label: "Number line" },
  { value: "bars", label: "Fraction & part-whole bars" },
  { value: "tiles", label: "Word / sentence tiles" },
  { value: "diagram", label: "Labelled diagram" },
  { value: "axes", label: "Graph with axes" },
  { value: "timeline", label: "Timeline or sequence" },
  { value: "stave", label: "Notes on a stave" }
];
const VERBS = [
  { value: "explain", label: "Explain" },
  { value: "point", label: "Point at" },
  { value: "trace", label: "Trace across" },
  { value: "compare", label: "Compare" },
  { value: "reveal", label: "Reveal" },
  { value: "ask", label: "Ask the learner" },
  { value: "listen", label: "Wait for a question" },
  { value: "praise", label: "Praise" }
];

function L(id, subject, title, objective, curricula, board, objects, slots, tray, steps, faq) {
  return { id, subject, title, objective, curricula, board, objects, slots, tray, steps, faq };
}

const LESSONS = [
  L("place-value", "Mathematics", "Reading large whole numbers", "Read and write whole numbers to 100,000 and state the value of each digit.", ["NERDC", "KS3", "CCSS"],
    { kind: "circles", heading: "40,632", sub: "Each place is ten times the one on its right" },
    [
      { id: "d1", label: "4", sub: "Ten thousands", x: 10, y: 34, shape: "circle" },
      { id: "d2", label: "0", sub: "Thousands", x: 30, y: 34, shape: "circle" },
      { id: "d3", label: "6", sub: "Hundreds", x: 50, y: 34, shape: "circle" },
      { id: "d4", label: "3", sub: "Tens", x: 70, y: 34, shape: "circle" },
      { id: "d5", label: "2", sub: "Units", x: 90, y: 34, shape: "circle" }
    ], [], [],
    [
      { verb: "explain", say: "Before any rule: a number is a row of places, and each place is worth ten of the place on its right." },
      { verb: "point", target: "d3", say: "This 6 is not just six. It sits in the hundreds place, so it is worth six hundred." },
      { verb: "compare", target: ["d3", "d4"], say: "Same shape of digit, different place. One step to the left is worth ten times more." },
      { verb: "ask", say: "Your turn to find one.", ask: { type: "select", prompt: "Tap the digit in the tens place.", expect: "d4", hint: "Count from the right: units, then tens." } },
      { verb: "ask", say: "Now say what it is worth.", ask: { type: "type", prompt: "What is the 4 worth?", expect: ["40000", "40,000", "forty thousand"], hint: "It is four ten-thousands." } },
      { verb: "praise", say: "That is place value. You can now read any number in this range." }
    ],
    [{ k: ["zero", "0"], a: "The zero is doing real work: it holds the thousands place open so the 4 stays in ten-thousands." },
     { k: ["why", "place"], a: "Place exists so we can write any size of number with only ten digits — the position carries the size." }]),

  L("rounding", "Mathematics", "Rounding on a number line", "Round three-digit numbers to the nearest ten using a number line.", ["NERDC", "KS3", "CCSS"],
    { kind: "numberline", heading: "347", sub: "Which ten is it nearer to?" },
    [
      { id: "t340", label: "340", x: 4, y: 62, shape: "label" },
      { id: "t345", label: "345", x: 50, y: 62, shape: "label" },
      { id: "t350", label: "350", x: 96, y: 62, shape: "label" },
      { id: "mark", label: "347", x: 68.4, y: 36, shape: "pin" }
    ], [], [],
    [
      { verb: "explain", say: "Rounding is not a rule to memorise. It is a question: which ten is this number closer to?" },
      { verb: "point", target: "mark", say: "Here is 347, sitting between 340 and 350." },
      { verb: "trace", target: "t345", say: "Halfway is 345. Anything past halfway is nearer the ten above." },
      { verb: "ask", say: "So which ten wins?", ask: { type: "select", prompt: "Tap the ten that 347 is closer to.", expect: "t350", hint: "347 is past the halfway mark of 345." } },
      { verb: "ask", say: "Write it down.", ask: { type: "type", prompt: "347 rounded to the nearest ten is…", expect: ["350"], hint: "Past halfway, so round up." } },
      { verb: "praise", say: "You rounded by reasoning about distance, not by a rule." }
    ],
    [{ k: ["halfway", "5", "345"], a: "At exactly halfway we agree to round up, so 345 becomes 350 — a convention, not a fact about distance." }]),

  L("fractions", "Mathematics", "Fractions as parts of a whole", "Name a fraction from a part-whole model and identify equivalent shading.", ["NERDC", "KS3", "CCSS"],
    { kind: "bars", heading: "One bar, eight equal parts", sub: "The bottom number names the parts; the top counts them" },
    [
      { id: "p1", label: "", x: 8, y: 40, w: 11, shape: "bar", on: true },
      { id: "p2", label: "", x: 20, y: 40, w: 11, shape: "bar", on: true },
      { id: "p3", label: "", x: 32, y: 40, w: 11, shape: "bar", on: true },
      { id: "p4", label: "", x: 44, y: 40, w: 11, shape: "bar" },
      { id: "p5", label: "", x: 56, y: 40, w: 11, shape: "bar" },
      { id: "p6", label: "", x: 68, y: 40, w: 11, shape: "bar" },
      { id: "p7", label: "", x: 80, y: 40, w: 11, shape: "bar" },
      { id: "p8", label: "", x: 92, y: 40, w: 11, shape: "bar" }
    ], [], [],
    [
      { verb: "explain", say: "A fraction only means something once we know the whole. Here the whole is this bar, cut into eight equal parts." },
      { verb: "point", target: "p1", say: "This is one of eight equal parts — one eighth." },
      { verb: "trace", target: "p3", say: "Three of them are shaded, so three eighths of the bar is covered." },
      { verb: "ask", say: "Name it for me.", ask: { type: "type", prompt: "What fraction of the bar is shaded?", expect: ["3/8", "three eighths"], hint: "Count the shaded parts over the total parts." } },
      { verb: "ask", say: "And the rest?", ask: { type: "select", prompt: "Tap any part that is not shaded.", expect: ["p4", "p5", "p6", "p7", "p8"], hint: "Any of the five pale parts." } },
      { verb: "praise", say: "Good — the bottom number names the parts, the top number counts them." }
    ],
    [{ k: ["equal", "same"], a: "The parts must be equal, otherwise the bottom number no longer describes the size of one part." }]),

  L("sentence", "English", "Parts of a sentence", "Identify the subject, verb and object in a simple sentence.", ["NERDC", "KS3", "CCSS"],
    { kind: "tiles", heading: "The farmer planted two hundred seeds", sub: "Every sentence has a doer, an action and a thing acted on" },
    [
      { id: "w1", label: "The", x: 8, y: 30, shape: "tile" },
      { id: "w2", label: "farmer", x: 24, y: 30, shape: "tile" },
      { id: "w3", label: "planted", x: 45, y: 30, shape: "tile" },
      { id: "w4", label: "two hundred", x: 70, y: 30, shape: "tile" },
      { id: "w5", label: "seeds", x: 90, y: 30, shape: "tile" }
    ],
    [
      { id: "s_subj", label: "Subject", place: "row" },
      { id: "s_verb", label: "Verb", place: "row" },
      { id: "s_obj", label: "Object", place: "row" }
    ],
    [{ id: "c_farmer", label: "farmer" }, { id: "c_planted", label: "planted" }, { id: "c_seeds", label: "seeds" }],
    [
      { verb: "explain", say: "A sentence is not a list of words. It tells us who did something, what they did, and what it was done to." },
      { verb: "point", target: "w2", say: "The farmer is the doer — the subject." },
      { verb: "point", target: "w3", say: "Planted is the action — the verb." },
      { verb: "ask", say: "Sort the three words for me.", ask: { type: "place", mode: "group", prompt: "Drag each word into its part of the sentence.", expect: { c_farmer: "s_subj", c_planted: "s_verb", c_seeds: "s_obj" }, hint: "Ask: who did it, what did they do, what was it done to?" } },
      { verb: "ask", say: "Say it back to me.", ask: { type: "type", prompt: "Which word is the verb?", expect: ["planted"], hint: "The action word." } },
      { verb: "praise", say: "That structure holds for almost every sentence you will meet." }
    ],
    [{ k: ["two hundred", "adjective", "number"], a: "Two hundred describes how many seeds, so it belongs with the object rather than being the object itself." }]),

  L("cell", "Science", "Parts of a plant cell", "Locate and name the main structures of a plant cell.", ["NERDC", "KS3", "CCSS"],
    { kind: "diagram", heading: "Inside a plant cell", sub: "Name each part by what it does", photo: true },
    [],
    [
      { id: "pin_wall", label: "?", x: 74, y: 22, place: "board" },
      { id: "pin_nuc", label: "?", x: 74, y: 44, place: "board" },
      { id: "pin_chl", label: "?", x: 74, y: 66, place: "board" },
      { id: "pin_vac", label: "?", x: 74, y: 88, place: "board" }
    ],
    [{ id: "c_wall", label: "Cell wall" }, { id: "c_nuc", label: "Nucleus" }, { id: "c_chl", label: "Chloroplast" }, { id: "c_vac", label: "Vacuole" }],
    [
      { verb: "explain", say: "Each part of a cell exists because the cell has a job to do: hold its shape, store water, capture light, keep instructions." },
      { verb: "point", target: "pin_chl", say: "This one captures light and makes food. Animal cells do not have it." },
      { verb: "ask", say: "Label the diagram with me.", ask: { type: "place", mode: "match", prompt: "Drag each name onto the part it belongs to.", expect: { c_wall: "pin_wall", c_nuc: "pin_nuc", c_chl: "pin_chl", c_vac: "pin_vac" }, hint: "Start with the outer boundary, then the large store of water." } },
      { verb: "ask", say: "One in words.", ask: { type: "type", prompt: "Which part holds the cell's instructions?", expect: ["nucleus"], hint: "It is the control centre." } },
      { verb: "praise", say: "You named the parts by their function, not by memory alone." }
    ],
    [{ k: ["animal", "difference"], a: "An animal cell has no cell wall and no chloroplasts, and only a small vacuole — that difference is the point of comparing them." }]),

  L("trade", "Geography", "Ordering events on a timeline", "Place events in chronological order and read a timeline.", ["NERDC", "KS3", "CCSS"],
    { kind: "timeline", heading: "Four moments in West African trade", sub: "Earliest on the left, latest on the right" },
    [
      { id: "e1", label: "1050", sub: "Salt caravans cross the Sahara", x: 12, y: 44, shape: "node" },
      { id: "e2", label: "1324", sub: "Mansa Musa's pilgrimage", x: 38, y: 44, shape: "node" },
      { id: "e3", label: "1590", sub: "Songhai trade routes shift", x: 64, y: 44, shape: "node" },
      { id: "e4", label: "1890", sub: "Rail replaces caravan routes", x: 90, y: 44, shape: "node" }
    ],
    [
      { id: "o1", label: "First", place: "row" }, { id: "o2", label: "Second", place: "row" },
      { id: "o3", label: "Third", place: "row" }, { id: "o4", label: "Fourth", place: "row" }
    ],
    [{ id: "c_rail", label: "Rail replaces caravans" }, { id: "c_salt", label: "Salt caravans" }, { id: "c_songhai", label: "Songhai shift" }, { id: "c_musa", label: "Mansa Musa" }],
    [
      { verb: "explain", say: "A timeline turns time into distance, so you can see which events sat close together." },
      { verb: "trace", target: "e4", say: "Left is earliest, right is latest. The gaps matter as much as the order." },
      { verb: "ask", say: "Put them in order for me.", ask: { type: "place", mode: "order", prompt: "Drag each event into its position in time.", expect: { c_salt: "o1", c_musa: "o2", c_songhai: "o3", c_rail: "o4" }, hint: "Read the years on the board from left to right." } },
      { verb: "ask", say: "Read one off the board.", ask: { type: "type", prompt: "In which year did Mansa Musa's pilgrimage take place?", expect: ["1324"], hint: "It is the second node." } },
      { verb: "praise", say: "You read sequence and interval — both of what a timeline is for." }
    ],
    [{ k: ["gap", "interval", "scale"], a: "Equal spacing here is a simplification; a true scale would show the 1050 to 1324 gap as much wider." }]),

  L("coordinates", "Mathematics", "Reading coordinates", "Plot and read points in the first quadrant as ordered pairs.", ["KS3", "CCSS"],
    { kind: "axes", heading: "Points on a grid", sub: "Across first, then up" },
    [
      { id: "pA", label: "A", x: 42, y: 62, shape: "point" },
      { id: "pB", label: "B", x: 22, y: 42, shape: "point" },
      { id: "pC", label: "C", x: 62, y: 32, shape: "point" }
    ], [], [],
    [
      { verb: "explain", say: "A point needs two numbers because a flat surface has two directions. We agree to say across first, then up." },
      { verb: "point", target: "pA", say: "A is three across and two up, so we write it as (3, 2)." },
      { verb: "ask", say: "Find one for me.", ask: { type: "select", prompt: "Tap the point at (3, 2).", expect: "pA", hint: "Three steps across the bottom, then two steps up." } },
      { verb: "ask", say: "Now read one off.", ask: { type: "type", prompt: "What are the coordinates of B?", expect: ["(1,4)", "1,4", "(1, 4)"], hint: "Across first, then up." } },
      { verb: "praise", say: "Across then up — that order is the whole convention." }
    ],
    [{ k: ["order", "why across"], a: "The order is a shared agreement; without it (3, 2) and (2, 3) would name the same place and nobody could follow directions." }]),

  L("stave", "Music", "Notes on the stave", "Name notes on the treble stave by their line or space.", ["KS3"],
    { kind: "stave", heading: "Five lines, four spaces", sub: "A note's name comes from where it sits" },
    [
      { id: "n1", label: "", sub: "E", x: 24, y: 64, shape: "note" },
      { id: "n2", label: "", sub: "B", x: 50, y: 46, shape: "note" },
      { id: "n3", label: "", sub: "F", x: 76, y: 28, shape: "note" }
    ], [], [],
    [
      { verb: "explain", say: "The stave is a map of pitch. Higher on the page means higher in sound — the names are just labels for positions." },
      { verb: "point", target: "n1", say: "This note sits on the bottom line. On the treble stave that line is E." },
      { verb: "ask", say: "Find the middle one.", ask: { type: "select", prompt: "Tap the note sitting on the middle line.", expect: "n2", hint: "Count lines from the bottom: E, G, B." } },
      { verb: "ask", say: "Name the top one.", ask: { type: "type", prompt: "Which note sits on the top line?", expect: ["f", "F"], hint: "Lines from the bottom: E, G, B, D, F." } },
      { verb: "praise", say: "You read pitch from position — that is sight reading beginning." }
    ],
    [{ k: ["treble", "clef"], a: "The clef at the start tells you which pitches the lines stand for; change the clef and the same line means a different note." }])
];
