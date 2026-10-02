// ============================================================
//  THE QUESTION PIPELINE — a learner stops the lesson and asks.
//
//    1. Intent         is the question about this lesson?
//    2. Response       a model works out the explanation, pitched at the learner
//    3. Script Manager turns that explanation into a script, using the
//                      dictionary, and checks it against the engine
//    4. (the app)      plays it on the board, then asks "does that make sense?"
//
//  Generation side: it produces a script and hands it over. It never draws,
//  never speaks, and engine.js never reads it. The model is reached through a
//  function it is given (llm), and the engine's validator is handed in the same
//  way, so the whole flow runs in a test with a fake model.
//
//  With no model — offline, or no key — every stage still answers: intent by
//  matching words, the response and the script by the local generator. A
//  lesson never waits on a network it does not have.
// ============================================================

(function (root) {
  "use strict";

  const D = () => root.TutorDictionary;
  const CHECK_IN = "Does that make sense now? Tell me, or ask me another question.";

  const STAGES = {
    intent: "Checking your question is about this lesson…",
    respond: "Working out how to explain it…",
    script: "Writing it up for the board…",
    repair: "Tidying the board plan…",
    ready: "Here it comes."
  };

  // ---------- helpers ----------

  const norm = s => String(s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const STOP = ("a an the is are was were be to of in on at for and or but if then so it this that these those what why how when where who which " +
    "do does did can could would should i me my you your we us our they them he she his her its with by from as about into than just not no yes " +
    "please tell explain mean means meaning get got make made like some any there here have has had will").split(" ");
  const words = s => norm(s).split(" ").filter(w => w.length > 2 && STOP.indexOf(w) < 0);

  // Models wrap JSON in prose or fences now and then. Take the outermost object.
  function parseJSON(text) {
    if (text && typeof text === "object") return text;
    const s = String(text || "");
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a < 0 || b <= a) throw new Error("no JSON object in the reply");
    return JSON.parse(s.slice(a, b + 1));
  }

  const lessonOf = ctx => ({
    title: ctx.title || "", objective: ctx.objective || "", concept: ctx.concept || "",
    subject: ctx.subject || "", level: ctx.level || 2,
    step: ctx.step && ctx.step.text ? ctx.step.text : ""
  });

  // Everything the lesson is about, as words: what "in scope" is measured against.
  function lessonWords(ctx) {
    const b = ctx.board || {};
    const bits = [ctx.title, ctx.objective, ctx.concept, ctx.subject, b.heading, b.sub, ctx.step && ctx.step.text];
    (b.objects || []).forEach(o => bits.push(o.label, o.sub, o.name));
    (ctx.faq || []).forEach(f => bits.push((f.k || []).join(" ")));
    (ctx.lessonText || []).forEach(t => bits.push(t));
    return words(bits.join(" "));
  }

  // ---------- 1. intent ----------

  const CHAT = ["hello", "hi", "thanks", "thank you", "ok", "okay", "cool", "nice", "good morning", "good afternoon"];

  function localIntent(question, ctx) {
    const q = norm(question);
    if (!q) return { kind: "chat", reason: "nothing was asked", source: "local" };
    if (CHAT.indexOf(q) >= 0) return { kind: "chat", reason: "a greeting, not a question", source: "local" };
    if (/(dont|do not|didnt|did not) (understand|get it)|confus|lost me|im lost|simpler|explain again|slower|what do you mean/.test(q)) {
      return { kind: "confused", reason: "asks for the last step again, more simply", source: "local" };
    }
    const mine = lessonWords(ctx);
    const hits = words(question).filter(w => mine.some(m => m === w || (w.length > 4 && (m.indexOf(w) === 0 || w.indexOf(m) === 0))));
    // Pointing words ("this one", "that number") are about the board by definition.
    if (hits.length || /\b(this|that|these|those)\b/.test(q)) return { kind: "in_scope", reason: hits.length ? "shares words with the lesson: " + hits.join(", ") : "points at the board", source: "local" };
    return { kind: "unsure", reason: "no words in common with the lesson", source: "local" };
  }

  const INTENT_SYSTEM = [
    "You are the intent layer of a classroom tutor. A learner has paused a lesson to ask something.",
    "Decide whether the tutor should answer it now. Reply with ONE JSON object and nothing else:",
    '{"kind": "in_scope" | "related" | "confused" | "chat" | "out_of_scope" | "unsafe", "restated": "the question in clear, complete words", "reason": "one short sentence"}',
    "- in_scope: about what this lesson teaches, or about something on the board.",
    "- related: a nearby idea the learner needs to follow this lesson (a prerequisite, or the next step). A good teacher would answer it briefly.",
    "- confused: they did not follow the last step and want it again, more simply.",
    "- chat: a greeting or remark, not a question.",
    "- out_of_scope: a different subject or topic. A teacher would say \"not now\".",
    "- unsafe: harmful, or not for a child.",
    "Be generous with in_scope and related: a learner rarely phrases things the way the lesson does."
  ].join("\n");

  function intentPrompt(question, ctx) {
    return "LESSON\n" + JSON.stringify(lessonOf(ctx)) +
      "\n\nBOARD\n" + D().describeBoard(ctx.board) +
      (ctx.history && ctx.history.length ? "\n\nEARLIER QUESTIONS\n" + ctx.history.map(h => "- " + h.question).join("\n") : "") +
      "\n\nQUESTION\n" + question;
  }

  const KINDS = ["in_scope", "related", "confused", "chat", "out_of_scope", "unsafe"];

  // ---------- 2. response ----------

  const RESPOND_SYSTEM = [
    "You are a patient Nigerian teacher explaining one thing to one child who stopped the lesson to ask.",
    "Write the explanation itself — what you would say — not the board plan. Another step lays it out on the board.",
    "Reply with ONE JSON object and nothing else:",
    "{",
    '  "direct_answer": "one or two short sentences that answer the question",',
    '  "explanation": ["one small idea per sentence", "..."],',
    '  "example": {"intro": "a sentence introducing it", "lines": ["one line of working", "..."]} or null,',
    '  "refers_to": ["ids of things already on the board you talk about"],',
    '  "check": {"prompt": "a short question to check they got it", "expect": "the answer as plain text", "hint": "a nudge"} or null',
    "}",
    "Rules: 3 to 8 explanation sentences. Short sentences, plain words. Start from something a child can count or picture before the formal word.",
    "Pitch it at the level given: 1 means concrete (apples, sweets), 2 the normal lesson, 3 the general form.",
    "Say maths in words in the sentences (\"x squared\"); symbols only in example lines.",
    "Never guess. If the honest answer is beyond the lesson, say so in direct_answer and keep it short."
  ].join("\n");

  function respondPrompt(question, intent, ctx, opts) {
    const level = Math.max(1, (ctx.level || 2) - (opts && opts.simpler ? 1 : 0));
    return "LESSON\n" + JSON.stringify(lessonOf(ctx)) +
      "\n\nLEVEL\n" + level + (opts && opts.simpler ? " (they asked for it simpler than last time)" : "") +
      "\n\nBOARD\n" + D().describeBoard(ctx.board) +
      (ctx.history && ctx.history.length ? "\n\nEARLIER IN THIS CONVERSATION\n" + ctx.history.map(h => "Q: " + h.question + "\nA: " + (h.answer || "")).join("\n") : "") +
      "\n\nQUESTION\n" + (intent.restated || question);
  }

  function cleanResponse(r) {
    const out = {
      direct_answer: String(r.direct_answer || "").trim(),
      explanation: [].concat(r.explanation || []).map(s => String(s).trim()).filter(Boolean).slice(0, 10),
      example: null, refers_to: [].concat(r.refers_to || []).map(String), check: null
    };
    if (r.example && [].concat(r.example.lines || []).length) {
      out.example = { intro: String(r.example.intro || ""), lines: [].concat(r.example.lines).map(String).slice(0, 6) };
    }
    if (r.check && r.check.prompt && r.check.expect !== undefined && r.check.expect !== null && String(r.check.expect) !== "") {
      out.check = { prompt: String(r.check.prompt), expect: String(r.check.expect), hint: r.check.hint ? String(r.check.hint) : "" };
    }
    if (!out.direct_answer && !out.explanation.length) throw new Error("the response had nothing in it");
    return out;
  }

  // ---------- 3. script manager ----------

  function scriptPrompt(question, response, ctx) {
    return "QUESTION\n" + question +
      "\n\nLESSON\n" + JSON.stringify(lessonOf(ctx)) +
      "\n\nBOARD (already there — point at these ids)\n" + D().describeBoard(ctx.board) +
      "\n\nTHE EXPLANATION TO PUT ON THE BOARD\n" + JSON.stringify(response, null, 1) +
      "\n\nTurn this explanation into one script. Keep its words; split them so each step does one thing. Point at board ids when a sentence is about them. " +
      "Put example lines on the rough pad or as new ans- objects in row \"answer\". Use the check as the one ask. End with a listen step.";
  }

  const ids = list => [].concat(list || []).filter(Boolean);

  // What a model sends back is checked, not trusted. Unknown directives go,
  // pointing at things that do not exist goes, and an ask that would be
  // rejected becomes a line the tutor says. Then the engine's own validator
  // has the last word.
  function sanitise(raw, ctx) {
    const known = D().directiveNames();
    const there = {};
    ((ctx.board && ctx.board.objects) || []).forEach(o => { if (o && o.id) there[o.id] = true; });
    ((ctx.board && ctx.board.layout && ctx.board.layout.panels) || []).forEach(p => { there[p.id] = true; there[p.name] = true; });
    const s = Object.assign({}, raw);
    s.board = s.board && s.board.inherit === false ? s.board : Object.assign({}, s.board, { inherit: true });
    s.steps = [].concat(s.steps || []).filter(st => st && typeof st === "object" && known.indexOf(st.do || "say") >= 0).map(function (st) {
      const step = Object.assign({}, st);
      if (step.do === "show") ids(step.objects).forEach(o => { if (o.id) there[o.id] = true; });
      if (step.do === "rough" && !step.close) there.rough = true;
      if (step.do === "ask") {
        const a = step.ask || {};
        if (!a.prompt || a.expect === undefined || ["select", "type", "place"].indexOf(a.type) < 0) {
          return { do: "say", text: [step.text, a.prompt].filter(Boolean).join(" ") };
        }
      }
      if (step.at) {
        step.at = ids(step.at).filter(id => there[id]);
        if (!step.at.length) {
          delete step.at;
          if (["point", "trace", "compare", "highlight", "focus", "mark"].indexOf(step.do) >= 0) step.do = "say";
        }
      }
      return step;
    }).filter(st => st.do !== "say" || st.text);
    return s;
  }

  // The last word is always the same question, so the app knows where the
  // learner gets to say whether it landed.
  function finish(script, question, source, intent) {
    const steps = ids(script.steps).filter((st, i, all) => !(st.do === "listen" && i === all.length - 1));
    steps.push({ do: "listen", text: CHECK_IN });
    return Object.assign({}, script, {
      id: script.id && String(script.id).indexOf("ans-") === 0 ? script.id + "-" + Date.now() : "ans-" + Date.now(),
      title: script.title || "Your question",
      board: script.board || { inherit: true },
      steps: steps,
      meta: Object.assign({}, script.meta, { source: source, kind: "answer", question: question, intent: intent && intent.kind })
    });
  }

  // The explanation, laid out without a model: still on the board, still
  // pointing where it can. Used when the model is unreachable or what it
  // wrote will not pass the engine's checks.
  function scriptFromResponse(response, ctx) {
    const board = (ctx.board && ctx.board.objects) || [];
    const onBoard = id => board.some(o => o.id === id);
    const target = response.refers_to.filter(onBoard)[0];
    const steps = [];
    steps.push(target ? { do: "point", at: [target], text: response.direct_answer } : { do: "say", text: response.direct_answer || "Good question." });
    response.explanation.forEach(s => steps.push({ do: "say", text: s }));
    if (response.example) {
      steps.push({ do: "rough", title: "working", lines: response.example.lines, text: response.example.intro || "Watch the working." });
      steps.push({ do: "rough", close: true, text: "That is the working." });
    }
    if (response.check) {
      steps.push({ do: "ask", text: "Your turn.", ask: { type: "type", prompt: response.check.prompt, expect: response.check.expect, hint: response.check.hint || "Go back over what I just said." } });
      steps.push({ do: "praise", text: "That is it." });
    }
    return { title: "Your question", level: ctx.level || 2, concept: ctx.concept || "", board: { inherit: true }, steps: steps.filter(s => s.text || s.do === "rough") };
  }

  function declineScript(intent, ctx) {
    const topic = ctx.title ? "about " + ctx.title.toLowerCase() : "about this lesson";
    const steps = intent.kind === "unsafe"
      ? [{ do: "say", face: "plain", text: "That is not something I can help with here." }, { do: "say", text: "Let us keep going with the lesson." }]
      : intent.kind === "chat"
        ? [{ do: "say", face: "happy", text: "I am here. Ask me anything about what is on the board." }]
        : [{ do: "say", face: "thinking", text: "That is a good question, but it is not " + topic + "." },
           { do: "say", text: "I would rather not guess at it. I will note it for your teacher." },
           { do: "say", text: "Ask me again at the end, or ask me something about this lesson." }];
    return { title: intent.kind === "chat" ? "Hello" : "Not this lesson", board: { inherit: true }, steps: steps };
  }

  // ---------- the pipeline ----------

  /**
   * opts.llm({ system, prompt, effort, maxTokens }) -> Promise<string>   the model; omit for offline
   * opts.available() -> boolean                                         is the model there right now (default: yes if llm given)
   * opts.validate(script) -> { ok, errors, warnings, script }             the engine's validator
   * opts.localAnswer(question, ctx) -> Promise<script>                    the offline generator
   * opts.onStage(stage, label)                                            progress, for the screen
   */
  function create(opts) {
    const o = opts || {};
    const stage = (name, extra) => { if (o.onStage) o.onStage(name, STAGES[name] || name, extra); };
    const history = [];
    const hasModel = () => !!o.llm && (typeof o.available !== "function" || !!o.available());

    async function ask(name, system, prompt, effort, maxTokens) {
      const text = await o.llm({ system: system, prompt: prompt, effort: effort, maxTokens: maxTokens, stage: name });
      return parseJSON(text);
    }

    async function intent(question, ctx) {
      const quick = localIntent(question, ctx);
      // Greetings and "I'm lost" need no model to recognise.
      if (quick.kind === "chat" || quick.kind === "confused" || !hasModel()) return quick;
      try {
        const r = await ask("intent", INTENT_SYSTEM, intentPrompt(question, ctx), "low", 400);
        if (KINDS.indexOf(r.kind) < 0) throw new Error("unknown intent " + r.kind);
        return { kind: r.kind, restated: r.restated || question, reason: r.reason || "", source: "llm" };
      } catch (e) {
        return Object.assign(quick, { error: e.message });
      }
    }

    async function respond(question, it, ctx, extra) {
      return cleanResponse(await ask("respond", RESPOND_SYSTEM, respondPrompt(question, it, ctx, extra), "medium", 2000));
    }

    async function toScript(question, response, ctx) {
      const system = D().toPrompt({ mode: "answer" });
      let prompt = scriptPrompt(question, response, ctx);
      for (let attempt = 0; attempt < 2; attempt++) {
        let raw;
        try {
          raw = await ask("script", system, prompt, "medium", 6000);
        } catch (e) {
          if (attempt) break;
          stage("repair");
          prompt = scriptPrompt(question, response, ctx) + "\n\nYour last reply could not be read (" + e.message + "). Reply with the JSON object only.";
          continue;
        }
        const clean = sanitise(raw, ctx);
        const check = o.validate ? o.validate(Object.assign({}, clean, { steps: clean.steps.concat([{ do: "listen", text: CHECK_IN }]) })) : { ok: true, errors: [], warnings: [] };
        if (check.ok && clean.steps.length) return { script: clean, warnings: check.warnings || [], repaired: attempt > 0 };
        if (attempt) break;
        stage("repair");
        prompt = scriptPrompt(question, response, ctx) +
          "\n\nYour last script was rejected:\n" + (check.errors.length ? check.errors : ["it had no usable steps"]).map(x => "- " + x).join("\n") +
          "\nFix those and send the whole script again.";
      }
      return null;
    }

    /**
     * The whole flow. Always resolves to a script — never to nothing — so the
     * board always has something to play.
     * extra.simpler: the learner said the last answer did not land.
     */
    async function answer(question, context, extra) {
      const ctx = Object.assign({ board: { objects: [] }, faq: [], level: 2 }, context || {}, { history: history.slice(-3) });
      const trace = { question: question, intent: null, response: null, route: "" };

      stage("intent");
      const it = extra && extra.simpler ? { kind: "confused", reason: "asked for it simpler", source: "learner" } : await intent(question, ctx);
      trace.intent = it;

      const done = function (script, source, route) {
        trace.route = route;
        stage("ready");
        const out = finish(script, question, source, it);
        history.push({ question: question, answer: trace.response ? [trace.response.direct_answer].concat(trace.response.explanation).join(" ") : "" });
        return { script: out, trace: trace };
      };

      if (["chat", "out_of_scope", "unsafe"].indexOf(it.kind) >= 0) return done(declineScript(it, ctx), "pipeline", "declined: " + it.kind);

      // No model: the local generator answers what it recognises and says
      // honestly when it does not.
      if (!hasModel()) {
        stage("respond");
        const local = await o.localAnswer(question, ctx);
        return done(local, "generator", "offline");
      }

      try {
        stage("respond");
        trace.response = await respond(question, it, ctx, { simpler: it.kind === "confused" });
      } catch (e) {
        trace.error = "response: " + e.message;
        const local = await o.localAnswer(question, ctx);
        return done(local, "generator", "model failed, offline answer");
      }

      stage("script");
      const made = await toScript(question, trace.response, ctx);
      if (made) {
        trace.warnings = made.warnings;
        return done(Object.assign({ title: "Your question" }, made.script), "llm", made.repaired ? "model, repaired once" : "model");
      }
      return done(scriptFromResponse(trace.response, ctx), "pipeline", "model explanation, laid out locally");
    }

    return { answer: answer, intent: intent, history: history };
  }

  // The model, reached through the local server so the key never reaches the
  // browser. Resolves to the reply's text; rejects if there is no model.
  function serverLLM(base) {
    const url = (base || "") + "/llm";
    return function (req) {
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: req.system, prompt: req.prompt, effort: req.effort, max_tokens: req.maxTokens })
      }).then(r => r.json().then(body => {
        if (!r.ok || body.error) throw new Error(body.error || "the model is unavailable");
        return body.text;
      }));
    };
  }

  root.TutorPipeline = {
    create: create,
    serverLLM: serverLLM,
    CHECK_IN: CHECK_IN,
    STAGES: STAGES,
    // exposed for tests
    localIntent: localIntent,
    sanitise: sanitise,
    scriptFromResponse: scriptFromResponse,
    parseJSON: parseJSON
  };

})(typeof globalThis !== "undefined" ? globalThis : this);
