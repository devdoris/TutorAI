// ============================================================
//  THE GENERATION LAYER — what to teach.
//
//  Everything here produces scripts. Nothing here is imported by engine.js,
//  and nothing here knows how a script is drawn or spoken. Swap this file for
//  a curriculum service or a model and the engine does not change.
//
//    1. The numbers lesson, at three levels of explanation
//    2. The library (this lesson plus the ones in lessons.js)
//    3. Scripts written on demand, to answer a question
// ============================================================

(function (root) {
  "use strict";

  const CONCEPT = "reading-numbers";

  // ---------- 1. THE NUMBERS LESSON ----------
  // Very elaborate and very simple: one digit at a time, one idea per step,
  // and the tutor points at everything it names.

  // Where the five digits of 40,632 sit. x and y are percentages of the board,
  // which is how the tutor knows where to aim its arm.
  const DX = { d1: 12, d2: 30, d3: 52, d4: 70, d5: 88 };
  const DY = 26;
  const VY = 58;   // the row of values written under the digits

  const digit = (id, label) => ({ id: id, label: label, x: DX[id], y: DY, shape: "circle" });
  const value = (id, label, under) => ({ id: id, label: label, x: DX[under], y: VY, shape: "label" });

  const READ_NUMBERS = {
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
      // Opening
      { do: "board", heading: "", sub: "", text: "Hello. My name is Tutor, and today you are going to read a big number out loud, and get it right every single time." },
      { do: "say", text: "Not by guessing. By a method. If you can count to ten, you can do this. Watch my hand, because I will point at everything I talk about." },

      // Write the number, one digit at a time
      { do: "show", objects: [digit("d1", "4")], at: ["d1"], text: "I am going to write one number on this board. Here is the first digit. This is a four." },
      { do: "show", objects: [digit("d2", "0")], at: ["d2"], text: "Next to it, a zero." },
      { do: "show", objects: [digit("d3", "6")], at: ["d3"], text: "Then a six." },
      { do: "show", objects: [digit("d4", "3")], at: ["d4"], text: "Then a three." },
      { do: "show", objects: [digit("d5", "2")], at: ["d5"], text: "And last of all, a two." },
      { do: "trace", at: ["d1", "d2", "d3", "d4", "d5"], text: "Four. Zero. Six. Three. Two. Five digits, sitting in a row." },
      { do: "say", text: "Now here is the important part. Those are not five little numbers. Together they are one big number, and there is a right way to say it." },

      // Rule one: start from the right
      { do: "board", sub: "Rule one: always start from the right", text: "Rule one, and it is the only rule you must never forget. We always start from the right-hand end." },
      { do: "point", at: ["d5"], text: "This is the right-hand end. This two. It is worth exactly what it looks like. Two. Two single things. Two stones, two pencils, two naira." },
      { do: "show", objects: [{ id: "d5", sub: "Units" }, value("v5", "2", "d5")], at: ["d5"], text: "We call this place the units. So I will write its worth underneath. Two." },

      { do: "point", at: ["d4"], text: "Now take one step to the left. This three. Careful. It is not three." },
      { do: "show", objects: [{ id: "d4", sub: "Tens" }, value("v4", "30", "d4")], at: ["d4"], text: "It sits in the tens place, so it means three tens. Three tens is thirty. Not three. Thirty." },
      { do: "compare", at: ["d4", "d5"], cues: ["here", "there"], text: "Look carefully. Same kind of digit, different seat. A three sitting here is thirty. A three sitting over there would be three. The seat decides the size." },
      { do: "say", text: "That is the whole secret of our number system. Every single step to the left makes a digit ten times bigger." },

      { do: "point", at: ["d3"], text: "One more step to the left. This six." },
      { do: "show", objects: [{ id: "d3", sub: "Hundreds" }, value("v3", "600", "d3")], at: ["d3"], text: "Ten times bigger than tens is hundreds. So this six means six hundred." },

      { do: "point", at: ["d2"], text: "Next step left, and we meet the zero." },
      { do: "show", objects: [{ id: "d2", sub: "Thousands" }, value("v2", "0", "d2")], at: ["d2"], text: "It is sitting in the thousands place. Zero thousands. Keep an eye on it, because it is cleverer than it looks." },

      { do: "point", at: ["d1"], text: "And the four, right at the far left." },
      { do: "show", objects: [{ id: "d1", sub: "Ten thousands" }, value("v1", "40000", "d1")], at: ["d1"], text: "Ten times bigger than thousands is ten thousands. Four ten-thousands is forty thousand." },

      { do: "trace", at: ["d5", "d4", "d3", "d2", "d1"], gap: 950, text: "Say the places with me, from the right. Units. Tens. Hundreds. Thousands. Ten thousands." },

      // First check
      {
        do: "ask", text: "Your turn. Do not rush. Count from the right.",
        ask: { type: "select", prompt: "Tap the digit that is sitting in the tens place.", expect: "d4", hint: "Start at the right-hand end and count: units, then tens. That is only two steps." }
      },
      {
        do: "ask", text: "Good. Now one in words.",
        ask: { type: "type", prompt: "The 6 is in the hundreds place. What is it worth?", expect: ["600", "six hundred", "sixhundred"], hint: "Six of something. And the something is hundreds." }
      },

      // The zero earns its place
      { do: "point", at: ["d2"], text: "Now, the zero. A student once asked me: if zero is worth nothing, why bother writing it?" },
      { do: "say", text: "Because it is not there to be worth something. It is there to hold a seat." },
      {
        do: "show", at: ["w1"],
        objects: [
          { id: "w1", label: "4", x: 22, y: 84, shape: "tile" }, { id: "w2", label: "6", x: 40, y: 84, shape: "tile" },
          { id: "w3", label: "3", x: 58, y: 84, shape: "tile" }, { id: "w4", label: "2", x: 76, y: 84, shape: "tile" }
        ],
        text: "Watch what happens if I rub the zero out. Everything slides one seat to the right."
      },
      { do: "trace", at: ["w1", "w2", "w3", "w4"], text: "Four, six, three, two. Four thousand, six hundred and thirty-two." },
      { do: "compare", at: ["d1", "w1"], cues: ["forty", "only"], text: "That four used to be forty thousand. Now it is only four thousand. Ten times smaller, because it lost its seat." },
      { do: "say", text: "So the zero was doing real work all along. It was standing in the thousands seat so that nothing could slide into it." },
      { do: "hide", ids: ["w1", "w2", "w3", "w4"], text: "Let me put our number back the way it was." },
      {
        do: "ask", text: "Tell me you have got that.",
        ask: { type: "type", prompt: "Without the zero, what does the 4 become?", expect: ["4000", "4,000", "four thousand", "fourthousand"], hint: "It slides one place to the right, so it is ten times smaller than forty thousand." }
      },

      // The comma
      { do: "say", text: "Now. Five digits in a row is a lot for the eye to take in at once. So we give the eye a rest. This is where the comma comes in." },
      { do: "trace", at: ["d5", "d4", "d3"], cues: ["One", "Two", "Three"], text: "Start at the right-hand end again, and count three digits. One. Two. Three." },
      { do: "say", text: "Three digits counted. That is where the comma goes: just to the left of the three I have counted." },
      { do: "show", objects: [{ id: "comma", label: ",", x: 41, y: 28, shape: "label", size: 7 }], at: ["comma"], text: "There. A comma, sitting between the zero and the six." },
      { do: "board", heading: "40,632", text: "And now the number looks like this. Forty thousand, six hundred and thirty-two." },
      { do: "point", at: ["comma"], text: "The comma is not decoration, and it is not a full stop. It is a signpost. It says: everything on my left is thousands." },
      { do: "compare", at: ["d1", "d2"], cues: ["Four", "zero"], text: "So these two, on the left of the comma, are the thousands part. Four and zero. Forty." },
      { do: "trace", at: ["d3", "d4", "d5"], cues: ["Six", "and", "thirty-two"], text: "And these three, on the right of the comma, are what is left over. Six hundred and thirty-two." },
      { do: "say", text: "So here is how you read any number with a comma. Read the left part. Say the word thousand. Then read the right part." },
      { do: "trace", at: ["d1", "comma", "d3"], cues: ["Forty", "Thousand", "Six"], text: "Forty. Thousand. Six hundred and thirty-two." },
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
      { do: "praise", text: "That is it. You did not guess it. You read it, using the places and the comma." },

      // Do one alone
      { do: "clear", heading: "", sub: "Your turn", text: "Let me clear the board. One more number, and this time you lead." },
      {
        do: "show", at: ["e1", "e2", "e3", "e4"],
        objects: [
          { id: "e1", label: "8", x: 18, y: 26, shape: "circle" }, { id: "e2", label: "5", x: 40, y: 26, shape: "circle" },
          { id: "e3", label: "0", x: 62, y: 26, shape: "circle" }, { id: "e4", label: "7", x: 84, y: 26, shape: "circle" }
        ],
        text: "Eight, five, zero, seven. Four digits this time."
      },
      { do: "say", text: "Remember rule one. Start from the right-hand end and name the places as you walk left." },
      {
        do: "ask", text: "Off you go.",
        ask: { type: "select", prompt: "Tap the digit in the hundreds place.", expect: "e2", hint: "From the right: the 7 is units, the 0 is tens, so the next one along is hundreds." }
      },
      { do: "trace", at: ["e4", "e3", "e2"], cues: ["Units", "tens", "hundreds"], text: "Units, tens, hundreds. Three digits counted from the right, so the comma goes to the left of those three." },
      { do: "show", objects: [{ id: "comma2", label: ",", x: 29, y: 28, shape: "label", size: 7 }], at: ["comma2"], text: "Right here, after the eight." },
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

  // Level 1: the concrete version, for a learner who did not follow the lesson.
  const READ_NUMBERS_L1 = {
    id: "numbers-read-l1",
    title: "What a digit's place means, with apples",
    subject: "Mathematics",
    objective: "Understand that the same digit is worth more when it sits further to the left.",
    level: 1,
    concept: CONCEPT,
    curricula: ["NERDC", "KS3", "CCSS"],
    board: { kind: "blank", heading: "", sub: "Let us go all the way back" },
    meta: { source: "library" },
    steps: [
      { do: "say", text: "Let us forget big numbers for a moment. Let us count apples." },
      { do: "show", objects: [{ id: "a1", label: "1 apple", x: 22, y: 34, shape: "tile" }], at: ["a1"], text: "You have one apple." },
      { do: "show", objects: [{ id: "a2", label: "1 apple", x: 48, y: 34, shape: "tile" }], at: ["a2"], text: "Someone gives you another apple. Now you have two." },
      { do: "show", objects: [{ id: "a3", label: "3 more", x: 74, y: 34, shape: "tile" }], at: ["a3"], text: "Three more. Now five. You can still see all of them at once, so counting is easy." },
      { do: "say", text: "But now imagine your mother sends you to buy apples for the whole street. Hundreds of apples. Would you count them one by one?" },
      { do: "clear", sub: "So we put them in bags", text: "No. You would put them in bags. Ten apples in every bag." },
      {
        do: "show", at: ["b1", "b2", "b3"],
        objects: [
          { id: "b1", label: "bag of 10", x: 22, y: 38, shape: "tile" },
          { id: "b2", label: "bag of 10", x: 46, y: 38, shape: "tile" },
          { id: "b3", label: "bag of 10", x: 70, y: 38, shape: "tile" }
        ],
        text: "Three bags. Each bag holds ten apples."
      },
      { do: "show", objects: [{ id: "l1", label: "4", x: 90, y: 38, shape: "circle", sub: "loose apples" }], at: ["l1"], text: "And four loose apples that did not fill a bag." },
      { do: "trace", at: ["b1", "b2", "b3", "l1"], cues: ["Three", "bags", "Thirty", "four more"], text: "Three bags and four loose. Thirty apples, and four more. Thirty-four." },
      {
        do: "show", at: ["n3", "n4"],
        objects: [
          { id: "n3", label: "3", x: 40, y: 76, shape: "circle", sub: "bags of ten" },
          { id: "n4", label: "4", x: 62, y: 76, shape: "circle", sub: "loose ones" }
        ],
        text: "And that is exactly how we write it. Three, then four. Thirty-four."
      },
      { do: "compare", at: ["n3", "n4"], cues: ["left", "right"], text: "Both are just marks on a board. But the one on the left means bags, and the one on the right means loose apples. Same mark, different job, because of where it sits." },
      {
        do: "ask", text: "So tell me.",
        ask: { type: "type", prompt: "In the number 34, how many apples does the 3 stand for?", expect: ["30", "thirty", "3 bags", "three bags"], hint: "Three bags, and every bag holds ten." }
      },
      { do: "praise", text: "That is place value. Everything else is just bigger bags. Bags of bags, and bags of those." }
    ]
  };

  // Level 3: the general form. All the way to exponents.
  const READ_NUMBERS_L3 = {
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
      { do: "show", objects: [{ id: "p0", label: "10⁰", x: 88, y: 30, shape: "circle", sub: "= 1" }], at: ["p0"], text: "The units place is ten to the power zero, which is one." },
      { do: "show", objects: [{ id: "p1", label: "10¹", x: 69, y: 30, shape: "circle", sub: "= 10" }], at: ["p1"], text: "The tens place is ten to the power one. Ten." },
      { do: "show", objects: [{ id: "p2", label: "10²", x: 50, y: 30, shape: "circle", sub: "= 100" }], at: ["p2"], text: "Hundreds: ten to the power two. Two tens multiplied together." },
      { do: "show", objects: [{ id: "p3", label: "10³", x: 31, y: 30, shape: "circle", sub: "= 1000" }], at: ["p3"], text: "Thousands: ten to the power three." },
      { do: "show", objects: [{ id: "p4", label: "10⁴", x: 12, y: 30, shape: "circle", sub: "= 10000" }], at: ["p4"], text: "And ten thousands: ten to the power four." },
      { do: "trace", at: ["p0", "p1", "p2", "p3", "p4"], text: "The exponent is simply how many steps you have walked to the left. Nothing more mysterious than that." },
      { do: "show", objects: [{ id: "ex", label: "(4×10⁴) + (0×10³) + (6×10²) + (3×10¹) + (2×10⁰)", x: 50, y: 74, shape: "label", size: 3 }], at: ["ex"], text: "So our number, written out in full, is four times ten to the fourth, plus zero times ten cubed, plus six times ten squared, plus three times ten, plus two." },
      {
        do: "ask", text: "One for you.",
        ask: { type: "type", prompt: "In expanded form, what does the 6 in 40,632 contribute?", expect: ["6x10^2", "6×10²", "600", "6 x 100", "six hundred"], hint: "It is two steps from the right, so the power is two." }
      },
      { do: "praise", text: "Now you can read the number, and you can also write down why it means what it means." }
    ]
  };

  // ---------- 1b. SAMPLES WITH NUMBERS AND EQUATIONS ----------
  // Three lessons written to show the divided board, things coming to centre
  // stage, transitions in place of pauses, and icons from a collection on the
  // internet. Each object that a learner may tap carries `explain`: the lines
  // the tutor says, and the working it writes, when that thing comes forward.

  // Three kinds of equation, one in each of three panels. Tap one and it comes
  // forward while the other two step back.
  const EQUATIONS = {
    id: "equations-three-kinds",
    title: "Three kinds of equation",
    subject: "Mathematics",
    objective: "Tell a linear, a quadratic and a pair of simultaneous equations apart, and solve the linear one.",
    level: 2,
    concept: "equation-kinds",
    curricula: ["NERDC", "KS3", "CCSS"],
    board: { kind: "blank", heading: "", sub: "" },
    meta: { source: "library" },
    faq: [
      { k: ["linear"], a: "Linear means the x is on its own: no x squared, no x times y. Its graph is a straight line, which is where the name comes from." },
      { k: ["quadratic", "squared"], a: "Quadratic means there is an x squared in it. Quad is the Latin for square. It can have two answers, because two different numbers can square to the same thing." },
      { k: ["simultaneous"], a: "Simultaneous means at the same time: two equations that must both be true at once, so you solve them together." }
    ],
    steps: [
      { do: "board", heading: "Three kinds of equation", text: "An equation is a sentence with an equals sign in it. Today you meet three kinds, and by the end you will tell them apart at a glance." },
      { do: "layout", grid: "3x1", panels: ["Linear", "Quadratic", "Simultaneous"], text: "I will divide the board into three parts. One kind of equation in each." },
      {
        do: "show", at: ["lin"],
        objects: [{
          id: "lin", label: "2x + 3 = 11", panel: "l", size: 4.2, sub: "one x, nothing squared", name: "the linear equation",
          explain: [
            { say: "Take the three away from both sides. Eleven take away three is eight, so two x equals eight.", write: "2x = 8" },
            { say: "Two x is eight, so one x is four.", write: "x = 4" },
            "Check it. Two times four is eight, and eight plus three is eleven. It works."
          ]
        }],
        text: "On the left, a linear equation. Two x plus three equals eleven. One x, nothing squared."
      },
      {
        do: "show", at: ["quad"],
        objects: [{
          id: "quad", label: "x² − 5x + 6 = 0", panel: "m", size: 4.2, sub: "an x squared", name: "the quadratic",
          explain: [
            { say: "Find two numbers that multiply to give six and add to give five. Two and three. So it splits into two brackets.", write: "(x − 2)(x − 3) = 0" },
            { say: "If two things multiply to give zero, one of them must be zero. So x is two, or x is three.", write: "x = 2   or   x = 3" },
            "Two answers, because it is a quadratic. Both of them work."
          ]
        }],
        text: "In the middle, a quadratic. It has an x squared in it. x squared, minus five x, plus six, equals zero."
      },
      {
        do: "show", at: ["sim"],
        objects: [{
          id: "sim", label: "x + y = 5,   x − y = 1", panel: "r", size: 3.6, sub: "two unknowns, two lines", name: "the simultaneous equations",
          explain: [
            { say: "Add the two lines together. Plus y and minus y cancel, so two x equals six.", write: "2x = 6" },
            { say: "So x is three. Put it back in the first line: three plus y is five, so y is two.", write: "x = 3,   y = 2" },
            "Two unknowns need two equations. That is why they come as a pair."
          ]
        }],
        text: "On the right, simultaneous equations. Two lines, two unknowns. x plus y is five, and x minus y is one."
      },
      { do: "trace", at: ["l", "m", "r"], cues: ["Linear", "Quadratic", "Simultaneous"], text: "Linear. Quadratic. Simultaneous. Three names, three shapes." },
      { do: "say", text: "Tap any of them at any time and it will come forward on its own so we can look closer. For now, let me pick." },

      // The linear one, on centre stage.
      { do: "focus", at: ["lin"], text: "Let us start with the linear one. The other two step back." },
      { do: "show", objects: [{ id: "w1", label: "2x = 8", size: 4 }], at: ["w1"], text: "Take three away from both sides. Eleven take away three is eight. Two x equals eight." },
      { do: "show", objects: [{ id: "w2", label: "x = 4", size: 4, row: "answer" }], at: ["w2"], text: "Two x is eight, so one x is four." },
      { do: "mark", id: "r1", kind: "ring", at: ["w2"], text: "x equals four. Ring it. That is the answer." },
      { do: "hide", ids: ["w1", "w2"], unmark: ["r1"] },
      { do: "transition", kind: "sweep", text: "Now the quadratic." },

      // The quadratic.
      { do: "focus", at: ["quad"], text: "An x squared means it can have two answers, not one." },
      { do: "show", objects: [{ id: "q1", label: "(x − 2)(x − 3) = 0", size: 4 }], at: ["q1"], text: "Find two numbers that multiply to give six and add to give five. Two and three. So it splits into two brackets." },
      { do: "show", objects: [{ id: "q2", label: "x = 2   or   x = 3", size: 4, row: "answer" }], at: ["q2"], text: "If two things multiply to give zero, one of them must be zero. So x is two, or x is three." },
      { do: "mark", id: "r2", kind: "ring", at: ["q2"], text: "Two answers. Ring them both." },
      { do: "hide", ids: ["q1", "q2"], unmark: ["r2"] },
      { do: "transition", kind: "sweep", text: "And the third one." },

      // The pair.
      { do: "focus", at: ["sim"], text: "Two equations, two unknowns. You solve them together." },
      { do: "show", objects: [{ id: "s1", label: "2x = 6", size: 4 }], at: ["s1"], text: "Add the two lines together. Plus y and minus y cancel. Two x equals six." },
      { do: "show", objects: [{ id: "s2", label: "x = 3,   y = 2", size: 4, row: "answer" }], at: ["s2"], text: "So x is three. Put it back in the first line: three plus y is five, so y is two." },
      { do: "mark", id: "r3", kind: "ring", at: ["s2"], text: "x is three and y is two. Ring the pair." },
      { do: "hide", ids: ["s1", "s2"], unmark: ["r3"] },
      { do: "unfocus", text: "Back to all three, side by side." },

      {
        do: "ask", text: "Now you.",
        ask: { type: "select", prompt: "Tap the equation that has an x squared in it.", expect: "quad", hint: "Look for the small two written high up, after the x." }
      },
      {
        do: "ask", text: "And solve one.",
        ask: { type: "type", prompt: "Solve 2x + 3 = 11. What is x?", expect: ["4", "x=4", "x = 4", "four"], hint: "Take three away from eleven, then halve what is left." }
      },
      { do: "praise", text: "You can tell them apart, and you solved one on your own." },
      { do: "say", text: "Tap any equation whenever you like. It comes forward, and I go through it again." }
    ]
  };

  // Six apps, six panels, six big numbers. The icons come from a collection on
  // the internet, not from this folder.
  const app = (id, icon, users, panel, name, explain) => ({
    id: id, icon: icon, label: users, panel: panel, size: 8, labelSize: 3.2, name: name, cue: name, explain: explain
  });
  const SOCIAL = {
    id: "social-media-numbers",
    title: "Who has the most users?",
    subject: "Mathematics",
    objective: "Read numbers in the millions and billions by counting commas, and compare them.",
    level: 2,
    concept: "billions",
    curricula: ["NERDC", "KS3", "CCSS"],
    board: { kind: "blank", heading: "", sub: "" },
    meta: { source: "library" },
    faq: [
      { k: ["billion"], a: "A billion is a thousand million. Written out it is a one and nine zeros: three commas, with three zeros after each." },
      { k: ["million"], a: "A million is a thousand thousand. A one and six zeros, two commas." },
      { k: ["comma"], a: "Every comma marks three more zeros. Count the commas and you know the size of the number before you read a single digit." }
    ],
    steps: [
      { do: "board", heading: "Who has the most users?", text: "Every one of these apps counts its users, and the numbers are enormous. Let us read them properly, not just say a lot." },
      { do: "layout", grid: "3x2", panels: ["Facebook", "YouTube", "WhatsApp", "Instagram", "TikTok", "X"], text: "Six apps, so six parts of the board. One app in each." },
      { do: "show", at: ["fb"], objects: [app("fb", "simple-icons:facebook", "3,000,000,000", "tl", "Facebook", [
        "Three billion. A three, then nine zeros.",
        "That is three thousand million people. Nigeria has about two hundred and twenty million, so that is more than thirteen Nigerias."
      ])], text: "Facebook. About three billion people use it every month. A three, and then nine zeros." },
      { do: "show", at: ["yt"], objects: [app("yt", "simple-icons:youtube", "2,500,000,000", "tm", "YouTube", [
        "Two billion, five hundred million. Two, comma, five hundred, then two more commas of zeros.",
        "Ten digits. Read the first group, say billion, then read the rest."
      ])], text: "YouTube. Two and a half billion. Two billion, five hundred million." },
      { do: "show", at: ["wa"], objects: [app("wa", "simple-icons:whatsapp", "2,000,000,000", "tr", "WhatsApp", [
        "Two billion. A two and nine zeros.",
        "That is the one most of your family is on. Two thousand million people."
      ])], text: "WhatsApp. Two billion." },
      { do: "show", at: ["ig"], objects: [app("ig", "simple-icons:instagram", "2,000,000,000", "bl", "Instagram", [
        "Also two billion. Same number as WhatsApp, same nine zeros.",
        "Same size, so neither is bigger. Ten digits each."
      ])], text: "Instagram. Also two billion." },
      { do: "show", at: ["tt"], objects: [app("tt", "simple-icons:tiktok", "1,600,000,000", "bm", "TikTok", [
        "One billion, six hundred million. One, comma, six hundred, and two commas of zeros.",
        "Still ten digits, so still in the billions. But one is less than two, so it is behind WhatsApp."
      ])], text: "TikTok. One billion, six hundred million." },
      { do: "show", at: ["x"], objects: [app("x", "simple-icons:x", "600,000,000", "br", "X", [
        "Six hundred million. Only nine digits: six hundred, then two commas of zeros.",
        "No billion group at all. That is why it is the smallest here."
      ])], text: "And X. Six hundred million. Nine digits, not ten." },
      { do: "say", text: "Nine zeros makes a billion. Let me show you why, on the pad." },
      { do: "rough", title: "counting zeros", lines: ["1,000  =  a thousand   (3 zeros)", "1,000,000  =  a million   (6 zeros)", "1,000,000,000  =  a billion   (9 zeros)"], text: "A thousand has three zeros. A million has six. A billion has nine. Every comma is three more zeros." },
      { do: "rough", close: true, text: "So count the commas first. Three commas means billions." },
      { do: "compare", at: ["fb", "x"], cues: ["Facebook", "X"], text: "Facebook has three billion. X has six hundred million. Count the digits: ten against nine. The longer number wins." },

      { do: "focus", at: ["fb"], text: "Facebook comes forward. Let us read its number the way we read any number: group by group." },
      { do: "show", objects: [{ id: "g1", label: "3  |  000  |  000  |  000", size: 4.2 }], at: ["g1"], text: "Split it at the commas. Three. Then three groups of zeros." },
      { do: "show", objects: [{ id: "g2", label: "three billion", size: 3.6, row: "answer" }], at: ["g2"], text: "The first group is three, and three commas means billion. Three billion. Nothing else to say." },
      { do: "hide", ids: ["g1", "g2"] },
      { do: "unfocus", text: "Back to all six." },

      {
        do: "ask", text: "Now you.",
        ask: { type: "select", prompt: "Tap the app with the fewest users.", expect: "x", hint: "The only number with nine digits instead of ten." }
      },
      {
        do: "ask", text: "And a number question.",
        ask: { type: "type", prompt: "How many zeros are in one billion?", expect: ["9", "nine"], hint: "Three commas, and three zeros after each one." }
      },
      { do: "praise", text: "That is reading big numbers. Same rule as small ones, just more commas." },
      { do: "say", text: "Tap any of the icons and I will read its number with you." }
    ]
  };

  // A discount at the market, worked out in four panels, with a change of
  // scene between each part instead of a pause.
  const DISCOUNT = {
    id: "market-discount",
    title: "Twenty percent off at the market",
    subject: "Mathematics",
    objective: "Find a percentage discount by taking ten percent first and building it up.",
    level: 2,
    concept: "percent-discount",
    curricula: ["NERDC", "KS3", "CCSS"],
    board: { kind: "blank", heading: "", sub: "" },
    meta: { source: "library" },
    faq: [
      { k: ["percent", "%"], a: "Percent means out of every hundred. Ten percent is ten out of every hundred, which is one tenth." },
      { k: ["ten percent", "divide by ten"], a: "Ten percent is one tenth, so you divide by ten. Dividing by ten just takes one zero off, or moves the last digit down." }
    ],
    steps: [
      { do: "board", heading: "20% off", text: "A dress costs four thousand five hundred naira, and the seller says twenty percent off. How much do you pay? We will work it out, not guess it." },
      { do: "layout", grid: "2x2", panels: ["The price", "Ten percent", "Twenty percent", "You pay"], text: "Four parts. The price. Ten percent. Twenty percent. And what you pay." },
      { do: "show", at: ["price"], objects: [{ id: "price", label: "₦4,500", panel: "tl", size: 5.6, name: "the price", explain: ["Four thousand five hundred naira. That is the full price, before anything comes off."] }], text: "The price. Four thousand five hundred naira." },
      { do: "transition", kind: "fade", text: "Percent means out of every hundred. Ten percent is ten out of every hundred, which is one tenth." },
      { do: "show", at: ["ten"], objects: [{ id: "ten", label: "₦450", panel: "tr", size: 5.6, name: "ten percent", explain: ["One tenth of four thousand five hundred. Divide by ten: take one zero off. Four hundred and fifty."] }], text: "One tenth of four thousand five hundred. Take one zero off. Four hundred and fifty naira." },
      { do: "rough", title: "ten percent", lines: ["4,500 ÷ 10  =  450"], text: "On the pad. Four thousand five hundred divided by ten is four hundred and fifty." },
      { do: "rough", close: true },
      { do: "transition", kind: "sweep", text: "Twenty percent is two lots of ten percent." },
      { do: "show", at: ["twenty"], objects: [{ id: "twenty", label: "₦900", panel: "bl", size: 5.6, name: "twenty percent", explain: ["Twenty percent is ten percent twice. Four hundred and fifty, times two. Nine hundred."] }], text: "Four hundred and fifty, twice. Nine hundred naira comes off." },
      { do: "rough", title: "twenty percent", lines: ["450 × 2  =  900"], text: "Four fifty times two is nine hundred." },
      { do: "rough", close: true },
      { do: "transition", kind: "sweep", text: "Now take it off the price." },
      { do: "show", at: ["pay"], objects: [{ id: "pay", label: "₦3,600", panel: "br", size: 5.6, name: "what you pay", explain: ["The price, take away the discount. Four thousand five hundred, take away nine hundred. Three thousand six hundred naira."] }], text: "Four thousand five hundred, take away nine hundred. Three thousand six hundred naira. That is what you pay." },
      { do: "rough", title: "you pay", lines: ["4,500 − 900  =  3,600"], text: "Four thousand five hundred take away nine hundred is three thousand six hundred." },
      { do: "rough", close: true },
      { do: "mark", id: "x1", kind: "cross", at: ["price"], text: "Cross the old price out. Nobody pays that today." },
      { do: "mark", id: "ring1", kind: "ring", at: ["pay"], text: "And ring what you pay. Three thousand six hundred." },
      { do: "trace", at: ["price", "ten", "twenty", "pay"], cues: ["price", "Ten", "Twenty", "pay"], text: "The price. Ten percent. Twenty percent. What you pay. Four steps, every single time." },
      {
        do: "ask", text: "Your turn, with a new price.",
        ask: { type: "type", prompt: "What is 10% of ₦8,000?", expect: ["800", "₦800", "eight hundred"], hint: "Divide by ten: take one zero off." }
      },
      {
        do: "ask", text: "Build it up.",
        ask: { type: "type", prompt: "So what is 20% of ₦8,000?", expect: ["1600", "1,600", "₦1,600", "₦1600", "one thousand six hundred"], hint: "Two lots of ten percent. Eight hundred, twice." }
      },
      { do: "praise", text: "You can do any discount now. Ten percent first, then build it up." }
    ]
  };

  // Factors, equations and formulas. Very slow and very simple: oranges shared
  // between friends, a bag with a number hidden in it, the tiles on a floor.
  // One idea per step, a question early and often, and the three words side
  // by side at the end, where each can be tapped for a closer look.
  const oranges = (id, count, label, x, y) => ({ id: id, icon: "orange", count: count, label: label, x: x, y: y, size: 5 });
  const factor = (id, label, x) => ({ id: id, label: label, x: x, y: 86, shape: "circle" });
  const FEF = {
    id: "factors-equations-formulas",
    title: "Factors, equations and formulas",
    subject: "Mathematics",
    objective: "Find the factors of a number by sharing, solve a simple equation by undoing, and use a formula by putting numbers in.",
    level: 2,
    concept: "factors-equations-formulas",
    curricula: ["NERDC", "KS3", "CCSS"],
    board: { kind: "blank", heading: "", sub: "" },
    meta: { source: "library" },
    faq: [
      { k: ["factor"], a: "A factor of a number shares it out with nothing left over. Two is a factor of twelve, because twelve oranges between two people is six each and none left. Five is not." },
      { k: ["prime"], a: "A prime number has only two factors, one and itself. Seven is prime: only one person or seven people can share seven with nothing left over." },
      { k: ["equation"], a: "An equation is a sentence with an equals sign. The equals sign says the two sides are the same size, like a balance." },
      { k: ["x", "letter", "box", "bag"], a: "x is not a letter from the alphabet. It is a closed bag with a number hidden inside. Solving the equation means opening the bag." },
      { k: ["formula", "formulas", "formulae"], a: "A formula is a rule written with letters, so that it works every time, not just once. Area equals length times width works for every room in the world." },
      { k: ["area"], a: "Area is how many tiles it takes to cover a floor. Length times width." },
      { k: ["perimeter"], a: "Perimeter is the distance all the way round the edge. Walk round the room and add up every side." }
    ],
    steps: [
      { do: "board", heading: "Three words", text: "Hello. Today you learn three words that you will hear in every mathematics class for the rest of your life. Factors. Equations. Formulas." },
      { do: "say", text: "Do not worry about the words yet. We take them one at a time, slowly, and by the end you will use them the way you use the word football." },

      // ── Part one: factors, with oranges ──
      { do: "board", heading: "Factors", sub: "Word one", text: "Word one. Factors. Forget the word for a moment. Let us share some oranges." },
      { do: "show", objects: [oranges("all", 12, "12 oranges", 50, 30)], at: ["all"], text: "Here are twelve oranges. Count them with me. One, two, three, four, five, six, seven, eight, nine, ten, eleven, twelve." },
      { do: "say", text: "You and one friend. Two people. Can you share twelve oranges so that both of you get exactly the same, and no orange is left over?" },
      { do: "show", objects: [oranges("p1", 6, "you: 6", 30, 60), oranges("p2", 6, "your friend: 6", 70, 60)], at: ["p1", "p2"], cues: ["you", "friend"], text: "Yes. Six for you, and six for your friend." },
      { do: "compare", at: ["p1", "p2"], cues: ["Six", "six"], text: "Six on this side. Six on that side. Nothing left over. Nobody is cheated." },
      { do: "show", objects: [factor("f2", "2", 26)], at: ["f2"], text: "So we say: two is a factor of twelve. A factor shares the number out with nothing left over. I will write the two down here." },
      { do: "say", text: "Now three people. You and two friends." },
      { do: "hide", ids: ["p1", "p2"] },
      { do: "show", objects: [oranges("q1", 4, "4", 22, 60), oranges("q2", 4, "4", 50, 60), oranges("q3", 4, "4", 78, 60)], at: ["q1", "q2", "q3"], cues: ["Four", "four", "four"], text: "Four each. Four, four, four. Twelve altogether, and nothing left over." },
      { do: "show", objects: [factor("f3", "3", 42)], at: ["f3"], text: "So three is a factor of twelve too. I write it next to the two." },
      { do: "say", text: "Now five people. Careful. Watch what happens." },
      { do: "hide", ids: ["q1", "q2", "q3"] },
      {
        do: "show", at: ["r1", "r2", "r3", "r4", "r5"], cues: ["Two", "two", "two", "two", "two"],
        objects: [oranges("r1", 2, "2", 14, 50), oranges("r2", 2, "2", 32, 50), oranges("r3", 2, "2", 50, 50), oranges("r4", 2, "2", 68, 50), oranges("r5", 2, "2", 86, 50)],
        text: "Two each. Two, two, two, two, two. That is ten oranges given out."
      },
      { do: "show", objects: [oranges("left", 2, "left over", 50, 66)], at: ["left"], text: "But we had twelve. Two oranges are left over, and nobody can have them without somebody getting more than the others." },
      { do: "mark", id: "xleft", kind: "cross", at: ["left"], text: "Left over. So five is not a factor of twelve. Five does not go in. I do not write it down." },
      { do: "say", text: "That is the whole test. Share the number out. Nothing left over: it is a factor. Something left over: it is not." },
      {
        do: "ask", text: "Your turn.",
        ask: { type: "type", prompt: "Share 12 oranges between 4 friends. How many does each friend get?", expect: ["3", "three"], hint: "Give them out one at a time, round and round, until the oranges finish." }
      },
      { do: "hide", ids: ["r1", "r2", "r3", "r4", "r5", "left"], unmark: ["xleft"] },
      { do: "show", objects: [factor("f4", "4", 58)], at: ["f4"], text: "Three each, nothing left over. So four is a factor of twelve. Down it goes." },
      { do: "say", text: "Six people? Twelve shared by six is two each. Nothing left over." },
      { do: "show", objects: [factor("f6", "6", 74)], at: ["f6"], text: "Six is a factor." },
      { do: "say", text: "Twelve people? One orange each. Nothing left over." },
      { do: "show", objects: [factor("f12", "12", 90)], at: ["f12"], text: "Twelve is a factor of itself. Every number is." },
      { do: "say", text: "And one person? That person takes all twelve oranges. Nothing left over." },
      { do: "show", objects: [factor("f1", "1", 10)], at: ["f1"], text: "One is a factor of twelve. One is a factor of every number there is." },
      { do: "hide", ids: ["all"] },
      { do: "trace", at: ["f1", "f2", "f3", "f4", "f6", "f12"], cues: ["One", "Two", "Three", "Four", "Six", "Twelve"], text: "One. Two. Three. Four. Six. Twelve. These six numbers are the factors of twelve." },
      { do: "board", sub: "A factor shares the number out with nothing left over", text: "Say it with me. A factor shares the number out with nothing left over." },
      {
        do: "ask", text: "Find one for me.",
        ask: { type: "select", prompt: "Tap the biggest factor of 12.", expect: "f12", hint: "A number is always its own biggest factor." }
      },
      {
        do: "ask", text: "Now think.",
        ask: { type: "type", prompt: "Is 7 a factor of 12? Answer yes or no.", expect: ["no", "no.", "not"], hint: "Share twelve oranges among seven people. One each is seven. Are any left over?" }
      },
      {
        do: "ask", text: "A new number, on your own.",
        ask: { type: "type", prompt: "What are the factors of 10? Type them with commas.", expect: ["1,2,5,10", "10,5,2,1", "1 2 5 10"], hint: "Try sharing ten between 1, 2, 3, 4, 5 people and so on. Keep the ones with nothing left over." }
      },
      { do: "praise", text: "Factors. You can find them for any number now. Share it out and watch for leftovers." },
      { do: "clear", heading: "Equations", sub: "Word two", text: "Let me clean the board. Word two." },

      // ── Part two: equations, with a bag ──
      { do: "say", text: "Equation. An equation is a sentence with an equals sign in it." },
      { do: "say", text: "The equals sign is the important part. It says: this side and that side are the same size. Like a balance at the market. Same weight on both pans." },
      { do: "show", objects: [{ id: "e0", label: "x + 3 = 7", x: 50, y: 30, size: 6 }], at: ["e0"], text: "Here is one. x plus three equals seven." },
      { do: "say", text: "What is that x? It is not a letter from the alphabet. It is a bag. Somebody put some oranges in the bag and closed it. Our job is to find out how many." },
      {
        do: "show", at: ["bag", "plus", "three", "eq", "seven"], cues: ["bag", "plus", "three", "makes", "seven"],
        objects: [
          { id: "bag", icon: "tabler:shopping-bag", label: "x", x: 13, y: 60, size: 9, labelSize: 3.4 },
          { id: "plus", label: "+", x: 26, y: 58, size: 5 },
          Object.assign(oranges("three", 3, "3", 39, 60), { size: 4 }),
          { id: "eq", label: "=", x: 53, y: 58, size: 5 },
          Object.assign(oranges("seven", 7, "7", 76, 60), { size: 4 })
        ],
        text: "A closed bag, plus three oranges, makes seven oranges."
      },
      { do: "point", at: ["bag"], text: "How many oranges are inside the bag? Do not guess. Think." },
      { do: "point", at: ["seven"], text: "Seven altogether on this side." },
      { do: "point", at: ["three"], text: "Three of them are outside the bag, where we can see them." },
      { do: "say", text: "So the rest must be inside the bag. Seven take away three." },
      { do: "rough", title: "open the bag", lines: ["7 − 3 = 4"], text: "On the pad. Seven take away three is four." },
      { do: "show", objects: [{ id: "bag", label: "x = 4" }], at: ["bag"], text: "Four oranges in the bag. x is four." },
      { do: "say", text: "Check it. Four in the bag, plus three outside, is seven. Yes. The equation is happy. Both sides the same." },
      { do: "rough", close: true },
      { do: "hide", ids: ["bag", "plus", "three", "eq", "seven"] },
      { do: "say", text: "Now the rule you just used, so you can use it every time. Whatever you do to one side of the equals sign, you must do to the other side too. Or the balance tips." },
      { do: "show", objects: [{ id: "e1", label: "x + 3 − 3 = 7 − 3", x: 50, y: 54, size: 4.4 }], at: ["e1"], text: "We took three away from the left side. So we take three away from the right side as well." },
      { do: "point", at: ["e1"], text: "On the left, plus three and take away three cancel each other. They are gone. Only x is left." },
      { do: "show", objects: [{ id: "e2", label: "x = 4", x: 50, y: 78, size: 5 }], at: ["e2"], text: "On the right, seven take away three is four. x equals four. Same answer as the bag." },
      { do: "mark", id: "ring-e2", kind: "ring", at: ["e2"], text: "Ring the answer. Always." },
      {
        do: "ask", text: "You try one.",
        ask: { type: "type", prompt: "Solve x + 5 = 9. What is x?", expect: ["4", "x=4", "x = 4", "four"], hint: "Nine oranges, five outside the bag. How many inside?" }
      },
      { do: "clear", heading: "Equations", sub: "Word two", keepHeading: true },
      { do: "say", text: "One more kind. Sometimes the x is multiplied. Two x means two times x. Two bags, with the same number in each." },
      { do: "show", objects: [{ id: "m0", label: "2x = 10", x: 50, y: 30, size: 6 }], at: ["m0"], text: "Two x equals ten. Two bags, and ten oranges altogether." },
      {
        do: "show", at: ["b1", "b2"], cues: ["one", "two"],
        objects: [
          { id: "b1", icon: "tabler:shopping-bag", label: "x", x: 36, y: 60, size: 9, labelSize: 3.4 },
          { id: "b2", icon: "tabler:shopping-bag", label: "x", x: 64, y: 60, size: 9, labelSize: 3.4 }
        ],
        text: "Bag one, bag two. Ten oranges shared between the two bags."
      },
      { do: "say", text: "Ten shared by two. That is sharing again, like the oranges. Five each." },
      { do: "rough", title: "share the ten", lines: ["10 ÷ 2 = 5"], text: "On the pad. Ten shared by two is five." },
      { do: "show", objects: [{ id: "b1", label: "5" }, { id: "b2", label: "5" }], at: ["b1", "b2"], cues: ["Five", "five"], text: "Five in this bag, five in that bag." },
      { do: "show", objects: [{ id: "m1", label: "x = 5", x: 50, y: 84, size: 5 }], at: ["m1"], text: "So x is five." },
      { do: "say", text: "Check it. Two times five is ten. Happy." },
      { do: "rough", close: true },
      {
        do: "ask", text: "Your turn.",
        ask: { type: "type", prompt: "Solve 3x = 12. What is x?", expect: ["4", "x=4", "x = 4", "four"], hint: "Three bags share twelve oranges. How many in each bag?" }
      },
      { do: "say", text: "Did you notice? Three bags sharing twelve. That is factors. Three is a factor of twelve, so it shares out with nothing left over. Factors and equations are cousins." },
      { do: "praise", text: "Equations. Open the bag. Do the same to both sides. Check the answer." },
      { do: "clear", heading: "Formulas", sub: "Word three", text: "Clean board. Word three." },

      // ── Part three: formulas, with a floor ──
      { do: "say", text: "Formula. A formula is a rule written with letters, and it works every time. Not for one room. For every room in the world." },
      { do: "say", text: "Think of the floor of your room. Your mother wants to put tiles on it. How many tiles? To know that, you need the area." },
      { do: "show", objects: [{ id: "floor", icon: "tabler:rectangle", x: 40, y: 52, size: 30 }], at: ["floor"], text: "Here is the floor of the room, looking down from above." },
      { do: "show", objects: [{ id: "len", label: "8 tiles", x: 40, y: 27, size: 3.2, sub: "long" }], at: ["len"], text: "It is eight tiles long. Along the top." },
      { do: "show", objects: [{ id: "wid", label: "5 tiles", x: 66, y: 52, size: 3.2, sub: "wide" }], at: ["wid"], text: "And five tiles wide. Down the side." },
      { do: "say", text: "Area means how many tiles cover the whole floor. Eight tiles in a row, and five rows of them." },
      { do: "rough", title: "count the tiles", lines: ["8 + 8 + 8 + 8 + 8 = 40", "8 × 5 = 40"], text: "Five rows of eight. Eight, plus eight, plus eight, plus eight, plus eight. Forty. Or the short way: eight times five. Forty." },
      { do: "show", objects: [{ id: "area", label: "40 tiles", x: 40, y: 52, size: 5, sub: "area" }], at: ["area"], text: "Forty tiles. That is the area of the floor." },
      { do: "rough", close: true },
      { do: "say", text: "Now, the next room will not be eight by five. So instead of eight and five, we write letters. That is all a formula is." },
      { do: "show", objects: [{ id: "fw", label: "Area = length × width", x: 50, y: 82, size: 3.6 }], at: ["fw"], text: "Area equals length times width. That is the formula. It works for every room." },
      { do: "show", objects: [{ id: "fw", label: "A = l × w" }], at: ["fw"], text: "In short: A for area, l for length, w for width. A equals l times w." },
      { do: "say", text: "Using a formula is three moves. Write it down. Put your numbers in. Work it out." },
      { do: "rough", title: "three moves", lines: ["A = l × w", "A = 8 × 5", "A = 40"], text: "Write it. A equals l times w. Put the numbers in. A equals eight times five. Work it out. Forty." },
      { do: "rough", close: true },
      {
        do: "ask", text: "A new room.",
        ask: { type: "type", prompt: "A room is 6 tiles long and 4 tiles wide. What is its area?", expect: ["24", "twenty four", "twenty-four", "24 tiles"], hint: "Write the formula, put in six and four, then multiply." }
      },
      { do: "say", text: "One more formula. Perimeter. That is the distance all the way round the edge. Imagine walking round the room, touching the wall." },
      { do: "trace", at: ["len", "wid", "len", "wid"], cues: ["Eight", "five", "eight", "five"], text: "Eight along the top, five down the side, eight along the bottom, five back up." },
      { do: "rough", title: "walk round", lines: ["8 + 5 + 8 + 5 = 26"], text: "Eight plus five plus eight plus five. Twenty-six." },
      { do: "show", objects: [{ id: "fp", label: "P = 2 × (l + w)", x: 50, y: 92, size: 3.2 }], at: ["fp"], text: "The formula for that: two times, length plus width. Because every side comes twice." },
      { do: "rough", title: "three moves", lines: ["P = 2 × (l + w)", "P = 2 × (8 + 5)", "P = 2 × 13 = 26"], text: "Write it. Put the numbers in: two times, eight plus five. Work it out: two times thirteen. Twenty-six. Same answer as walking." },
      { do: "rough", close: true },
      {
        do: "ask", text: "Your turn.",
        ask: { type: "type", prompt: "What is the perimeter of the 6 by 4 room?", expect: ["20", "twenty"], hint: "Two times, six plus four." }
      },
      { do: "praise", text: "Formulas. Write it, put the numbers in, work it out. Three moves, every time." },

      // ── The three words, side by side ──
      { do: "clear", heading: "Three words", sub: "", layout: "3x1", panels: ["Factors", "Equations", "Formulas"], text: "Now the three words together, side by side. Tap any of them and I will go through it again." },
      {
        do: "show", at: ["s12"],
        objects: [{
          id: "s12", label: "12", panel: "l", size: 6, sub: "1, 2, 3, 4, 6, 12", name: "the factors of twelve",
          explain: [
            "Share twelve oranges out. Two people get six each. Three people get four each. Nothing left over.",
            { say: "Five people get two each, and two oranges are left over. So five is not a factor.", write: "12 ÷ 5 = 2, and 2 left over" },
            { say: "The ones with nothing left over are the factors. One, two, three, four, six, twelve.", write: "1, 2, 3, 4, 6, 12" }
          ]
        }],
        text: "Factors. Share the number out with nothing left over. Twelve has six of them."
      },
      {
        do: "show", at: ["seq"],
        objects: [{
          id: "seq", label: "x + 3 = 7", panel: "m", size: 4.4, sub: "x = 4", name: "the equation",
          explain: [
            "x is a closed bag. Seven oranges altogether, and three of them are outside the bag.",
            { say: "Take three away from both sides. Seven take away three is four.", write: "7 − 3 = 4" },
            { say: "So there are four in the bag. x equals four. Check it: four plus three is seven.", write: "x = 4" }
          ]
        }],
        text: "Equations. Open the bag. Do the same to both sides."
      },
      {
        do: "show", at: ["sfa"],
        objects: [{
          id: "sfa", label: "A = l × w", panel: "r", size: 4.2, sub: "8 × 5 = 40", name: "the area formula",
          explain: [
            "Area is how many tiles cover the floor. Length times width.",
            { say: "Write the formula. Put the numbers in. Eight times five.", write: "A = 8 × 5" },
            { say: "Work it out. Forty tiles. And it works for every room, because the letters stand for any numbers.", write: "A = 40" }
          ]
        }],
        text: "Formulas. Write it, put the numbers in, work it out."
      },
      { do: "trace", at: ["l", "m", "r"], cues: ["Factors", "Equations", "Formulas"], text: "Factors share a number out. Equations open the bag. Formulas are rules that work every time." },
      { do: "say", text: "And they hold hands. Sharing ten between two bags is factors inside an equation. And a formula is just an equation with names in it instead of one bag." },
      {
        do: "ask", text: "Last one.",
        ask: { type: "select", prompt: "Tap the equation.", expect: "seq", hint: "The one with the bag, x, in it." }
      },
      { do: "praise", text: "Factors, equations, formulas. Three words, and you own all three now." },
      { do: "say", text: "Tap the twelve, the equation, or the formula whenever you like, and I will go through it again from the start." }
    ]
  };

  // ---------- 2. THE LIBRARY ----------
  // The numbers lesson, plus the original lessons from lessons.js turned into
  // scripts. LESSONS is read here, in the generation layer, and nowhere else.

  const E = root.TutorEngineLib;
  // lessons.js declares LESSONS with const, so it is a global *binding* rather
  // than a property of window — reach it by name, not through root.
  const legacy = typeof LESSONS !== "undefined" ? LESSONS : [];
  const LIBRARY = [READ_NUMBERS, READ_NUMBERS_L1, READ_NUMBERS_L3, FEF, EQUATIONS, SOCIAL, DISCOUNT]
    .concat(legacy.map(E.scriptFromLesson));

  // Level 2 is the taught lesson. Levels 1 and 3 are the same idea lower down
  // and further up, reached from inside a lesson rather than from the picker.
  const catalogue = () => LIBRARY.filter(s => s.level === 2);
  const byId = id => LIBRARY.filter(s => s.id === id)[0] || null;

  // ---------- 3. SCRIPTS WRITTEN ON DEMAND ----------
  // A question does not get a paragraph back. It gets a script, which the same
  // engine renders on the same board with the same tutor. That is what keeps
  // the experience one thing instead of two.

  // Apostrophes are dropped rather than turned into spaces, so that "don't"
  // becomes "dont" and matches the phrase list instead of "don t".
  const norm = s => String(s || "").toLowerCase().replace(/['\u2019]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const has = function (q) {
    const words = Array.prototype.slice.call(arguments, 1);
    return words.some(w => q.indexOf(w) >= 0);
  };

  // A provider is (question, context) -> Promise<script|null>. Returning null
  // means "I have nothing", and the local generator answers instead. This is
  // the seam where a model or a curriculum service plugs in; the engine is not
  // told, and does not change.
  let provider = null;
  const setProvider = fn => { provider = fn; };

  function remoteProvider(endpoint, init) {
    return function (question, context) {
      return fetch(endpoint, Object.assign({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question, concept: context.concept, level: context.level,
          objective: context.objective, step: context.step, board: context.board
        })
      }, init || {})).then(r => (r.ok ? r.json() : null));
    };
  }

  const mkScript = (id, title, steps, extra) => Object.assign({
    id: id, title: title, level: 2, concept: "", curricula: ["NERDC", "KS3", "CCSS"],
    // inherit keeps the lesson's board underneath, so the tutor answers by
    // pointing at the very thing the learner was looking at.
    board: { inherit: true },
    steps: steps,
    meta: { source: "generator" }
  }, extra || {});

  function findOnBoard(words, board) {
    const objs = (board && board.objects) || [];
    for (const w of [].concat(words)) {
      const n = norm(w);
      if (!n) continue;
      const hit = objs.filter(o => norm(o.label) === n || norm(o.sub).indexOf(n) >= 0)[0];
      if (hit) return hit.id;
    }
    return null;
  }

  function fromFaq(q, context) {
    const hit = (context.faq || []).filter(f => (f.k || []).some(k => q.indexOf(norm(k)) >= 0))[0];
    if (!hit) return null;
    const target = findOnBoard(hit.k, context.board);
    const steps = [{ do: "say", text: "Good question. Let me show you." }];
    steps.push(target ? { do: "point", at: [target], text: hit.a } : { do: "say", text: hit.a });
    steps.push({ do: "say", text: "Does that settle it? We can carry on." });
    return mkScript("ans-faq-" + Date.now(), "Answer: " + q, steps, { concept: context.concept });
  }

  // The questions every numbers lesson provokes, answered by pointing.
  function fromPattern(q, context) {
    const board = context.board || { objects: [] };
    const objs = board.objects || [];
    const byLabel = lbl => (objs.filter(o => norm(o.label) === norm(lbl))[0] || {}).id;
    const bySub = sub => (objs.filter(o => norm(o.sub).indexOf(norm(sub)) >= 0)[0] || {}).id;

    if (has(q, "comma")) {
      const comma = byLabel(",");
      const steps = [{ do: "say", text: "The comma. Let me take it slowly, because almost everyone asks about this one." }];
      if (comma) steps.push({ do: "point", at: [comma], text: "This mark here is the comma." });
      steps.push({ do: "say", text: "It does not change the number at all. You could rub it out and the number would be worth exactly the same." });
      steps.push({ do: "say", text: "It is there for your eyes. Counting three digits from the right and putting a comma means you never have to take in five digits at once." });
      steps.push({ do: "say", text: "And it carries one piece of information. Everything to the left of the comma is thousands. That is the part you read first, before you say the word thousand." });
      return mkScript("ans-comma-" + Date.now(), "Why is there a comma?", steps, { concept: context.concept });
    }

    if (has(q, "zero") || q === "0") {
      const zero = byLabel("0");
      const steps = [{ do: "say", text: "Why write a zero if it is worth nothing. That is a sharp question." }];
      if (zero) steps.push({ do: "point", at: [zero], text: "This zero is not there to be worth something. It is there to hold a seat." });
      steps.push({ do: "say", text: "A digit's worth comes from where it sits. If the zero left, every digit to its left would slide one seat to the right, and become ten times smaller." });
      steps.push({ do: "say", text: "So the zero is a guard. It keeps the seat occupied so that nothing moves." });
      return mkScript("ans-zero-" + Date.now(), "Why is there a zero?", steps, { concept: context.concept });
    }

    if (has(q, "why right", "from the right", "start from", "why do we start")) {
      const units = bySub("units");
      const steps = [{ do: "say", text: "Why from the right. Because that is where the smallest place lives, and it is the only place that never moves." }];
      if (units) steps.push({ do: "point", at: [units], text: "The units are always at the right-hand end, whether the number has two digits or twenty." });
      steps.push({ do: "say", text: "If you counted from the left instead, the names would change every time the number got longer. From the right, they never change." });
      return mkScript("ans-right-" + Date.now(), "Why count from the right?", steps, { concept: context.concept });
    }

    if (has(q, "ten times", "times ten", "why ten", "why 10")) {
      return mkScript("ans-ten-" + Date.now(), "Why ten times?", [
        { do: "say", text: "Because we have ten fingers, and we built our whole counting system around that." },
        { do: "say", text: "Once you have used all ten digits, zero up to nine, you have run out of marks. So you start a new column to the left and keep going." },
        { do: "say", text: "That is all a place is. A record of how many times you ran out of digits." }
      ], { concept: context.concept });
    }

    if (has(q, "tens", "hundreds", "thousands", "units", "place")) {
      const which = ["units", "tens", "hundreds", "thousands", "ten thousands"].filter(p => q.indexOf(p) >= 0)[0] || "place";
      const id = bySub(which);
      const steps = [{ do: "say", text: "Let me point at it rather than describe it." }];
      if (id) {
        const o = objs.filter(x => x.id === id)[0] || {};
        steps.push({ do: "point", at: [id], text: "This digit, the " + o.label + ", is the one in the " + which + " place." });
        steps.push({ do: "say", text: "Which means it is worth " + o.label + " lots of " + which + ", not just " + o.label + " on its own." });
      } else {
        steps.push({ do: "say", text: "The places run from the right: units, tens, hundreds, thousands, then ten thousands. Each one is ten of the one before." });
      }
      return mkScript("ans-place-" + Date.now(), "About the " + which, steps, { concept: context.concept });
    }

    // "What is this?" pointed at whatever the tutor was last indicating.
    if (has(q, "what is this", "what is that", "this one", "that one") && (context.focus || []).length) {
      const id = context.focus[0];
      const o = objs.filter(x => x.id === id)[0];
      if (o) {
        return mkScript("ans-this-" + Date.now(), "What is this?", [
          { do: "point", at: [id], text: "This one is " + (o.label || "here") + (o.sub ? ", and it sits in the " + o.sub.toLowerCase() + "." : ".") }
        ], { concept: context.concept });
      }
    }

    return null;
  }

  // "I don't understand" is not a question to answer. It is a request for a
  // lower level of explanation.
  function isConfusion(question) {
    const q = norm(question);
    return has(q, "dont understand", "do not understand", "confused", "lost", "simpler", "explain again", "slower", "what do you mean");
  }

  function fallback(q, context) {
    return mkScript("ans-none-" + Date.now(), "Outside this lesson", [
      { do: "listen", text: "Honest answer: that is outside what this lesson covers, and I would rather not guess at it. I will flag it for your teacher." },
      { do: "say", text: "Shall we finish this first? You can ask me again at the end." }
    ], { concept: context.concept });
  }

  // Always resolves to a script, never to nothing, so the engine always has
  // something to render.
  function generateAnswerScript(question, context) {
    const ctx = Object.assign({ faq: [], board: { objects: [] }, focus: [], concept: "", level: 2 }, context || {});
    const local = function () {
      const q = norm(question);
      // Patterns first: they build a several-step script that points at the
      // board, which teaches better than reading out one authored sentence.
      // The lesson's own FAQ catches whatever the patterns do not recognise.
      return fromPattern(q, ctx) || fromFaq(q, ctx) || fallback(q, ctx);
    };
    if (!provider) return Promise.resolve(local());
    return Promise.resolve()
      .then(() => provider(question, ctx))
      .then(remote => remote || local())
      .catch(local);      // a generator being down must never stop a lesson
  }

  // "Scripts that are more broken down." Takes the step the learner is stuck
  // on and expands it: name the thing, then say the sentence in pieces.
  function breakDownStep(step, context) {
    if (!step) return null;
    const board = context.board || { objects: [] };
    const objs = board.objects || [];
    const steps = [{ do: "say", text: "Let me take that one apart. Same idea, smaller pieces." }];

    [].concat(step.at || []).forEach(function (id) {
      const o = objs.filter(x => x.id === id)[0];
      if (!o) return;
      steps.push({ do: "point", at: [id], text: "First, this one. It is a " + (o.label || "mark") + "." });
      if (o.sub) steps.push({ do: "point", at: [id], text: "And it is sitting in the " + o.sub.toLowerCase() + ". That is what decides how much it is worth." });
    });

    // Slower is usually the whole fix.
    String(step.text || "").split(/([.!?])\s+/).filter(s => s.trim().length > 1).forEach(function (sentence) {
      steps.push({ do: "say", text: sentence.trim() });
      steps.push({ do: "wait", ms: 420 });
    });

    steps.push({ do: "say", text: "That is the same thing I said before, only slower. Tell me if it is still not clear and I will go further back." });
    return mkScript("ans-break-" + Date.now(), "Broken down", steps, {
      concept: context.concept, level: Math.max(1, (context.level || 2) - 1)
    });
  }

  // The learner tapped something on the board. It comes forward on its own,
  // the rest steps back, and the tutor goes through it: its `explain` lines,
  // written up under it where they come with something to write. Like every
  // answer, it is a script the engine plays over the lesson.
  const FOCUS_CLOSE = "Tap another one to look at it, or go back to the lesson.";
  const focusName = thing => thing.name || thing.title || thing.sub || thing.label || "this one";
  const focusIntro = thing => "Let us look at " + focusName(thing) + " on its own.";

  function focusScript(thing, context) {
    if (!thing || !thing.id) return null;
    const ctx = context || {};
    const lines = [].concat(thing.explain || []);
    const steps = [{ do: "focus", at: [thing.id], text: focusIntro(thing) }];
    const written = [];
    lines.forEach(function (line, i) {
      const say = typeof line === "string" ? line : (line && line.say) || "";
      const write = line && typeof line === "object" ? line.write : undefined;
      if (write) {
        const id = "look-" + i;
        // Each written line takes the next row down under the thing on stage.
        steps.push({ do: "show", objects: [{ id: id, label: String(write), size: 4, row: "look-" + written.length }], at: [id], text: say });
        written.push(id);
      } else if (say) {
        steps.push({ do: "say", text: say });
      }
    });
    if (written.length) steps.push({ do: "mark", id: "look-ring", kind: "ring", at: [written[written.length - 1]] });
    steps.push({ do: "listen", text: FOCUS_CLOSE });
    return mkScript("look-" + thing.id + "-" + Date.now(), "A closer look: " + focusName(thing), steps, {
      concept: ctx.concept, level: ctx.level || 2, meta: { source: "generator", kind: "focus" }
    });
  }

  // Drop to a lower level of explanation, or climb to a higher one.
  function explainAtLevel(level, context, library) {
    const want = Math.max(1, Math.min(3, level));
    const hit = (library || LIBRARY).filter(s => s.concept === context.concept && s.level === want && s.id !== context.scriptId)[0];
    if (hit) return hit;
    if (want < (context.level || 2)) return breakDownStep(context.step, context);
    return null;
  }

  root.TutorGenerate = {
    LIBRARY: LIBRARY,
    catalogue: catalogue,
    byId: byId,
    generateAnswerScript: generateAnswerScript,
    breakDownStep: breakDownStep,
    focusScript: focusScript,
    explainAtLevel: explainAtLevel,
    isConfusion: isConfusion,
    setProvider: setProvider,
    remoteProvider: remoteProvider
  };

})(typeof globalThis !== "undefined" ? globalThis : this);
