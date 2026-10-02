// ─────────────────────────────────────────────────────────────────────────────
// GENERATION LAYER — an authored script.
//
// "Do a simple script for a lesson on numbers. Make it very elaborate and very
//  simple, that even the dumbest student would get it. And let every action
//  point — point to a number on the board, point to the first three numbers for
//  the comma, then explain the comma. Step by step, till the end of the lesson."
//
// Nothing in this file is imported by the engine. It is data. The same lesson
// exists at three levels of explanation, so the tutor can drop down to apples or
// climb up to powers of ten without leaving the objective.
// ─────────────────────────────────────────────────────────────────────────────

const CONCEPT = "reading-numbers";

// Geometry for the five digits of 40,632. Positions are percentages of the
// board, which is how the tutor knows where to aim its arm.
const DX = { d1: 12, d2: 30, d3: 52, d4: 70, d5: 88 };
const DY = 28;
const VY = 56; // the row of values written under each digit

const digit = (id, label) => ({ id, label, x: DX[id], y: DY, shape: "circle" });
const value = (id, label, under) => ({ id, label, x: DX[under], y: VY, shape: "label" });

// ─── Level 2 · the main lesson ───────────────────────────────────────────────
export const READ_NUMBERS = {
  id: "numbers-read-l2",
  title: "Reading a big number out loud",
  subject: "Mathematics",
  objective: "Read a five-digit number correctly by naming the place of each digit and using the comma.",
  level: 2,
  concept: CONCEPT,
  curricula: ["NERDC", "KS3", "CCSS"],
  board: { kind: "circles", heading: "", sub: "" },
  objects: [],
  meta: { source: "library" },
  faq: [
    { k: ["zero", "0", "nothing"], a: "The zero is holding a seat. Take it away and the four slides one place to the right, and forty thousand becomes four thousand." },
    { k: ["comma", ","], a: "The comma is a rest for your eyes. It goes after every three digits counting from the right, and it means everything to its left is thousands." },
    { k: ["why right", "from the right", "start"], a: "We count places from the right because the right-hand end is where the units live, and every step left is worth ten times more." },
    { k: ["ten times", "times ten"], a: "Each place is ten of the place on its right: ten units make a ten, ten tens make a hundred, ten hundreds make a thousand." }
  ],

  steps: [
    // ── Opening ────────────────────────────────────────────────────────────
    { do: "board", heading: "", sub: "", text: "Hello. My name is Tutor, and today you are going to read a big number out loud — and get it right every single time." },
    { do: "say", text: "Not by guessing. By a method. If you can count to ten, you can do this. Watch my hand, because I will point at everything I talk about." },

    // ── Write the number, one digit at a time ──────────────────────────────
    { do: "show", objects: [digit("d1", "4")], at: ["d1"], text: "I am going to write one number on this board. Here is the first digit. This is a four." },
    { do: "show", objects: [digit("d2", "0")], at: ["d2"], text: "Next to it, a zero." },
    { do: "show", objects: [digit("d3", "6")], at: ["d3"], text: "Then a six." },
    { do: "show", objects: [digit("d4", "3")], at: ["d4"], text: "Then a three." },
    { do: "show", objects: [digit("d5", "2")], at: ["d5"], text: "And last of all, a two." },
    { do: "trace", at: ["d1", "d2", "d3", "d4", "d5"], text: "Four. Zero. Six. Three. Two. Five digits, sitting in a row." },
    { do: "say", text: "Now here is the important part. Those are not five little numbers. Together they are one big number. And there is a right way to say it." },

    // ── Rule one: start from the right ─────────────────────────────────────
    { do: "board", sub: "Rule one: always start from the right", text: "Rule one, and it is the only rule you must never forget. We always start from the right-hand end." },
    { do: "point", at: ["d5"], text: "This is the right-hand end. This two. It is worth exactly what it looks like — two. Two single things. Two stones, two pencils, two naira." },
    { do: "show", objects: [{ id: "d5", sub: "Units" }, value("v5", "2", "d5")], at: ["d5"], text: "We call this place the units. So I will write its worth underneath. Two." },

    { do: "point", at: ["d4"], text: "Now take one step to the left. This three. Careful — it is not three." },
    { do: "show", objects: [{ id: "d4", sub: "Tens" }, value("v4", "30", "d4")], at: ["d4"], text: "It sits in the tens place, so it means three tens. Three tens is thirty. Not three. Thirty." },
    { do: "compare", at: ["d5", "d4"], text: "Look carefully. Same kind of digit, different seat. A three sitting here is thirty. A three sitting over there would be three. The seat decides the size." },
    { do: "say", text: "That is the whole secret of our number system. Every single step to the left makes a digit ten times bigger." },

    { do: "point", at: ["d3"], text: "One more step to the left. This six." },
    { do: "show", objects: [{ id: "d3", sub: "Hundreds" }, value("v3", "600", "d3")], at: ["d3"], text: "Ten times bigger than tens is hundreds. So this six means six hundred." },

    { do: "point", at: ["d2"], text: "Next step left, and we meet the zero." },
    { do: "show", objects: [{ id: "d2", sub: "Thousands" }, value("v2", "0", "d2")], at: ["d2"], text: "It is sitting in the thousands place. Zero thousands. Keep an eye on it — I will come back to this zero, because it is cleverer than it looks." },

    { do: "point", at: ["d1"], text: "And the four, right at the far left." },
    { do: "show", objects: [{ id: "d1", sub: "Ten thousands" }, value("v1", "40000", "d1")], at: ["d1"], text: "Ten times bigger than thousands is ten thousands. Four ten-thousands is forty thousand." },

    { do: "trace", at: ["d5", "d4", "d3", "d2", "d1"], gap: 950, text: "Say the places with me, from the right. Units. Tens. Hundreds. Thousands. Ten thousands." },

    // ── First check ────────────────────────────────────────────────────────
    {
      do: "ask", text: "Your turn. Do not rush — count from the right.",
      ask: { type: "select", prompt: "Tap the digit that is sitting in the tens place.", expect: "d4", hint: "Start at the right-hand end and count: units, then tens. That is only two steps." }
    },
    {
      do: "ask", text: "Good. Now one in words.",
      ask: { type: "type", prompt: "The 6 is in the hundreds place. What is it worth?", expect: ["600", "six hundred", "sixhundred"], hint: "Six of something. And the something is hundreds." }
    },

    // ── The zero earns its place ───────────────────────────────────────────
    { do: "point", at: ["d2"], text: "Now, the zero. A student once asked me: if zero is worth nothing, why bother writing it?" },
    { do: "say", text: "Because it is not there to be worth something. It is there to hold a seat." },
    { do: "show", objects: [{ id: "w1", label: "4", x: 22, y: 82, shape: "tile" }, { id: "w2", label: "6", x: 40, y: 82, shape: "tile" }, { id: "w3", label: "3", x: 58, y: 82, shape: "tile" }, { id: "w4", label: "2", x: 76, y: 82, shape: "tile" }], at: ["w1"], text: "Watch what happens if I rub the zero out. Everything slides one seat to the right." },
    { do: "trace", at: ["w1", "w2", "w3", "w4"], text: "Four, six, three, two. Four thousand, six hundred and thirty-two." },
    { do: "compare", at: ["d1", "w1"], text: "That four used to be forty thousand. Now it is only four thousand. Ten times smaller — because it lost its seat." },
    { do: "say", text: "So the zero was doing real work all along. It was standing in the thousands seat so nothing could slide into it." },
    { do: "hide", ids: ["w1", "w2", "w3", "w4"], text: "Let me put our number back the way it was." },
    {
      do: "ask", text: "Tell me you have got that.",
      ask: { type: "type", prompt: "Without the zero, what does the 4 become?", expect: ["4000", "4,000", "four thousand", "fourthousand"], hint: "It slides one place to the right, so it is ten times smaller than forty thousand." }
    },

    // ── The comma ──────────────────────────────────────────────────────────
    { do: "say", text: "Now. Five digits in a row is a lot for the eye to take in at once. So we give the eye a rest. This is where the comma comes in." },
    { do: "trace", at: ["d5", "d4", "d3"], gap: 800, text: "Start at the right-hand end again, and count three digits. One — two — three." },
    { do: "say", text: "Three digits counted. That is where the comma goes: just to the left of the three I have counted." },
    { do: "show", objects: [{ id: "comma", label: ",", x: 41, y: 31, shape: "label", size: 8 }], at: ["comma"], text: "There. A comma, sitting between the zero and the six." },
    { do: "board", heading: "40,632", text: "And now the number looks like this. Forty thousand, six hundred and thirty-two." },
    { do: "point", at: ["comma"], text: "The comma is not decoration, and it is not a full stop. It is a signpost. It says: everything on my left is thousands." },
    { do: "compare", at: ["d1", "d2"], text: "So these two, on the left of the comma, are the thousands part. Four and zero. Forty." },
    { do: "trace", at: ["d3", "d4", "d5"], text: "And these three, on the right of the comma, are what is left over. Six hundred and thirty-two." },
    { do: "say", text: "So here is how you read any number with a comma. Read the left part. Say the word thousand. Then read the right part." },
    { do: "trace", at: ["d1", "d2", "comma", "d3", "d4", "d5"], gap: 700, text: "Forty… thousand… six hundred and thirty-two." },
    {
      do: "ask", text: "Find it for me.",
      ask: { type: "select", prompt: "Tap the comma.", expect: "comma", hint: "It is the small mark sitting between the zero and the six." }
    },
    {
      do: "ask", text: "And now read the whole thing.",
      ask: {
        type: "type", prompt: "Write 40,632 in words.",
        expect: ["forty thousand six hundred and thirty two", "forty thousand, six hundred and thirty-two", "fortythousandsixhundredandthirtytwo", "forty thousand six hundred thirty two", "forty thousand six hundred and thirtytwo"],
        hint: "Left of the comma, then the word thousand, then right of the comma."
      }
    },
    { do: "praise", text: "That is it. You did not guess it — you read it, using the places and the comma." },

    // ── Do one alone ───────────────────────────────────────────────────────
    { do: "clear", heading: "", sub: "Your turn", text: "Let me clear the board. One more number, and this time you lead." },
    { do: "show", objects: [{ id: "e1", label: "8", x: 18, y: 28, shape: "circle" }, { id: "e2", label: "5", x: 40, y: 28, shape: "circle" }, { id: "e3", label: "0", x: 62, y: 28, shape: "circle" }, { id: "e4", label: "7", x: 84, y: 28, shape: "circle" }], at: ["e1", "e2", "e3", "e4"], text: "Eight, five, zero, seven. Four digits this time." },
    { do: "say", text: "Remember rule one. Start from the right-hand end and name the places as you walk left." },
    {
      do: "ask", text: "Off you go.",
      ask: { type: "select", prompt: "Tap the digit in the hundreds place.", expect: "e2", hint: "From the right: the 7 is units, the 0 is tens, so the next one along is hundreds." }
    },
    { do: "trace", at: ["e4", "e3", "e2"], text: "Units, tens, hundreds. Three digits counted from the right — so the comma goes to the left of those three." },
    { do: "show", objects: [{ id: "comma2", label: ",", x: 29, y: 31, shape: "label", size: 8 }], at: ["comma2"], text: "Right here, after the eight." },
    { do: "board", heading: "8,507", text: "Eight thousand, five hundred and seven." },
    {
      do: "ask", text: "Last one. Say it the way we practised.",
      ask: {
        type: "type", prompt: "Write 8,507 in words.",
        expect: ["eight thousand five hundred and seven", "eight thousand, five hundred and seven", "eightthousandfivehundredandseven", "eight thousand five hundred seven"],
        hint: "Left of the comma, then the word thousand, then the three digits on the right."
      }
    },
    { do: "praise", text: "Excellent. You can now read any number of this size." },
    { do: "say", text: "Three things to keep. Always start from the right. Every step to the left is ten times bigger. And the comma tells you where the thousands end. That is the whole lesson." }
  ]
};

// ─── Level 1 · the concrete version ──────────────────────────────────────────
// "You have one apple, you have another apple." For a learner who did not follow
// the main lesson, this is what the tutor drops down to.
export const READ_NUMBERS_L1 = {
  id: "numbers-read-l1",
  title: "What a digit's place means — with apples",
  subject: "Mathematics",
  objective: "Understand that the same digit is worth more when it sits further to the left.",
  level: 1,
  concept: CONCEPT,
  curricula: ["NERDC", "KS3", "CCSS"],
  board: { kind: "blank", heading: "", sub: "Let us go all the way back" },
  meta: { source: "library" },
  steps: [
    { do: "say", text: "Let us forget big numbers for a moment. Let us count apples." },
    { do: "show", objects: [{ id: "a1", label: "🍎", x: 20, y: 34, shape: "tile" }], at: ["a1"], text: "You have one apple." },
    { do: "show", objects: [{ id: "a2", label: "🍎", x: 34, y: 34, shape: "tile" }], at: ["a2"], text: "Someone gives you another apple. Now you have two." },
    { do: "show", objects: [{ id: "a3", label: "🍎", x: 48, y: 34, shape: "tile" }, { id: "a4", label: "🍎", x: 62, y: 34, shape: "tile" }, { id: "a5", label: "🍎", x: 76, y: 34, shape: "tile" }], at: ["a3", "a4", "a5"], text: "Three more. Now five. You can still see all of them at once, so counting is easy." },
    { do: "say", text: "But now imagine your mother sends you to buy apples for the whole street. Hundreds of apples. Would you count them one by one?" },
    { do: "clear", sub: "So we put them in bags", text: "No. You would put them in bags. Ten apples in every bag." },
    { do: "show", objects: [{ id: "b1", label: "🧺 10", x: 24, y: 40, shape: "tile" }, { id: "b2", label: "🧺 10", x: 42, y: 40, shape: "tile" }, { id: "b3", label: "🧺 10", x: 60, y: 40, shape: "tile" }], at: ["b1", "b2", "b3"], text: "Three bags. Each bag holds ten apples." },
    { do: "show", objects: [{ id: "l1", label: "4", x: 78, y: 40, shape: "circle", sub: "loose apples" }], at: ["l1"], text: "And four loose apples that did not fill a bag." },
    { do: "trace", at: ["b1", "b2", "b3", "l1"], text: "Three bags and four loose. Thirty apples, and four more. Thirty-four." },
    { do: "show", objects: [{ id: "n3", label: "3", x: 40, y: 74, shape: "circle", sub: "bags of ten" }, { id: "n4", label: "4", x: 58, y: 74, shape: "circle", sub: "loose ones" }], at: ["n3", "n4"], text: "And that is exactly how we write it. Three, then four. Thirty-four." },
    { do: "compare", at: ["n3", "n4"], text: "Both are just marks on a board. But the one on the left means bags, and the one on the right means loose apples. Same mark, different job — because of where it sits." },
    {
      do: "ask", text: "So tell me.",
      ask: { type: "type", prompt: "In the number 34, how many apples does the 3 stand for?", expect: ["30", "thirty", "3 bags", "three bags"], hint: "Three bags, and every bag holds ten." }
    },
    { do: "praise", text: "That is place value. Everything else is just bigger bags — bags of bags, and bags of those." }
  ]
};

// ─── Level 3 · the general form ──────────────────────────────────────────────
// "…all the way to exponential."
export const READ_NUMBERS_L3 = {
  id: "numbers-read-l3",
  title: "Place value as powers of ten",
  subject: "Mathematics",
  objective: "Write a whole number in expanded form using powers of ten.",
  level: 3,
  concept: CONCEPT,
  curricula: ["KS3", "CCSS"],
  board: { kind: "blank", heading: "40,632", sub: "The same number, written honestly" },
  meta: { source: "library" },
  steps: [
    { do: "say", text: "You already know that each place is ten times the one on its right. Mathematicians got tired of saying that, so they wrote it down shorter." },
    { do: "show", objects: [{ id: "p0", label: "10⁰", x: 86, y: 30, shape: "circle", sub: "= 1" }], at: ["p0"], text: "The units place is ten to the power zero, which is one." },
    { do: "show", objects: [{ id: "p1", label: "10¹", x: 68, y: 30, shape: "circle", sub: "= 10" }], at: ["p1"], text: "The tens place is ten to the power one. Ten." },
    { do: "show", objects: [{ id: "p2", label: "10²", x: 50, y: 30, shape: "circle", sub: "= 100" }], at: ["p2"], text: "Hundreds: ten to the power two. Two tens multiplied together." },
    { do: "show", objects: [{ id: "p3", label: "10³", x: 32, y: 30, shape: "circle", sub: "= 1 000" }], at: ["p3"], text: "Thousands: ten to the power three." },
    { do: "show", objects: [{ id: "p4", label: "10⁴", x: 14, y: 30, shape: "circle", sub: "= 10 000" }], at: ["p4"], text: "And ten thousands: ten to the power four." },
    { do: "trace", at: ["p0", "p1", "p2", "p3", "p4"], text: "The exponent is simply how many steps you have walked to the left. Nothing more mysterious than that." },
    { do: "show", objects: [{ id: "ex", label: "(4×10⁴) + (0×10³) + (6×10²) + (3×10¹) + (2×10⁰)", x: 50, y: 72, shape: "label" }], at: ["ex"], text: "So our number, written out in full, is four times ten to the fourth, plus zero times ten cubed, plus six times ten squared, plus three times ten, plus two." },
    {
      do: "ask", text: "One for you.",
      ask: { type: "type", prompt: "In expanded form, what does the 6 in 40,632 contribute?", expect: ["6x10^2", "6×10²", "600", "6 x 100", "six hundred"], hint: "It is two steps from the right, so the power is two." }
    },
    { do: "praise", text: "Now you can read the number, and you can also write down why it means what it means." }
  ]
};

export const NUMBER_SCRIPTS = [READ_NUMBERS, READ_NUMBERS_L1, READ_NUMBERS_L3];
