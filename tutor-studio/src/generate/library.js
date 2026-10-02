// The set of scripts this build ships with. Everything here is generation-layer
// data: the engine only ever sees whichever one is handed to it.

import { DEMO } from "../data/lessons.js";
import { scriptFromLesson } from "../engine/script.js";
import { NUMBER_SCRIPTS } from "./numbers.js";

export const LIBRARY = NUMBER_SCRIPTS.concat(DEMO.map(scriptFromLesson));

// Level 2 is the taught lesson; levels 1 and 3 are the same concept lower down
// and further up, reached from inside the lesson rather than from the picker.
export const catalogue = () => LIBRARY.filter(s => s.level === 2);

export const levelsFor = concept => LIBRARY.filter(s => s.concept === concept).map(s => s.level).sort();

export const byId = id => LIBRARY.find(s => s.id === id) || null;
