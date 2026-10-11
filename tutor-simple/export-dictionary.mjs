// Writes the dictionary out for anyone who is not this app: a curriculum
// service, another model, a person reading it.
//
//   node export-dictionary.mjs            -> dictionary.json
//   node export-dictionary.mjs --prompt   -> prints the instructions a model is given for an answer
//
// dictionary.js is the source; never edit dictionary.json by hand.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = name => fileURLToPath(new URL(name, import.meta.url));
["icons.js", "dictionary.js"].forEach(f => vm.runInThisContext(readFileSync(here(f), "utf8"), { filename: f }));
const D = globalThis.TutorDictionary;

if (process.argv.includes("--prompt")) {
  process.stdout.write(D.toPrompt({ mode: "answer" }) + "\n");
} else {
  writeFileSync(here("dictionary.json"), JSON.stringify(D.DICTIONARY, null, 2) + "\n");
  console.log("wrote dictionary.json (" + D.DICTIONARY.directives.length + " directives)");
}
