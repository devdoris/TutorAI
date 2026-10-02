// ============================================================
//  RECORD THE TUTOR'S LINES IN YOUR OWN VOICE.
//
//  The app already plays a file for every line it says, named after a hash of
//  the words. So "use my own voice" needs no model and no training: record the
//  same lines, save them under the same names, and the tutor plays them without
//  knowing the difference. Nothing leaves this machine.
//
//  Lines you have not recorded yet fall back to the rendered Nigerian voice, so
//  a half-finished recording still teaches a whole lesson.
// ============================================================

const G = TutorGenerate;
const V = TutorVoiceLines;
const $ = id => document.getElementById(id);
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const rec = {
  lines: [],
  done: Object.create(null),   // line -> url of the recording
  voice: "my-voice",
  stream: null,
  recorder: null,
  running: false,              // "record the lot" is working through the list
  active: -1
};

// ---------- which lines ----------

$("which").innerHTML =
  `<option value="__all">Everything (all lessons)</option>` +
  G.catalogue().map(s => `<option value="${s.id}">${escapeHtml(s.title)} (${V.linesFor(s).length} lines)</option>`).join("");
$("which").value = "numbers-read-l2";

function chosenLines() {
  const which = $("which").value;
  return which === "__all" ? V.allLines(G.LIBRARY) : V.linesFor(G.byId(which));
}

$("btn-load").addEventListener("click", load);

async function load() {
  const name = $("voice-name").value.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    $("setup-note").textContent = "Use letters, numbers, - and _ for the voice name.";
    return;
  }
  rec.voice = name;
  rec.lines = chosenLines();
  rec.done = Object.create(null);
  $("setup-note").textContent = "";

  // Which of these are already recorded? The server knows, because a recorded
  // line is just a file sitting where the tutor expects one.
  try {
    const r = await fetch("/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: rec.voice, rate: "", lines: rec.lines })
    });
    const res = await r.json();
    // Only count urls that live in this voice's own folder: the others are the
    // rendered fallback, not something you have said.
    Object.keys(res.urls || {}).forEach(text => {
      if (res.urls[text].indexOf("/audio/" + rec.voice + "/") === 0) rec.done[text] = res.urls[text];
    });
  } catch {
    $("setup-note").textContent = "Could not reach the server. Open this page through start.command.";
  }
  draw();
}

function draw() {
  const total = rec.lines.length;
  const done = Object.keys(rec.done).length;
  $("count").textContent = done + " of " + total + " recorded";
  $("meter-fill").style.width = total ? Math.round(done / total * 100) + "%" : "0%";
  $("lines").innerHTML = rec.lines.map(function (text, i) {
    const has = !!rec.done[text];
    return `
      <div class="line ${has ? "done" : ""} ${i === rec.active ? "active" : ""}" data-i="${i}">
        <span class="n">${i + 1}</span>
        <span class="words">${escapeHtml(text)}</span>
        <span class="acts">
          <button class="btn btn-secondary" data-rec="${i}">${has ? "Record again" : "Record"}</button>
          ${has ? `<button class="btn btn-ghost" data-play="${i}">Play</button>` : ""}
        </span>
      </div>`;
  }).join("");
}

$("lines").addEventListener("click", function (e) {
  const r = e.target.closest("[data-rec]");
  if (r) { recordOne(Number(r.dataset.rec)); return; }
  const p = e.target.closest("[data-play]");
  if (p) {
    const url = rec.done[rec.lines[Number(p.dataset.play)]];
    if (url) new Audio(url + "?t=" + Date.now()).play();
  }
});

// ---------- the microphone ----------

async function microphone() {
  if (rec.stream) return rec.stream;
  rec.stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  return rec.stream;
}

// Record until `stop()` is called, then hand back the clip.
function clip(stream) {
  const chunks = [];
  const recorder = new MediaRecorder(stream);
  rec.recorder = recorder;
  const finished = new Promise(resolve => {
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
  });
  recorder.start();
  return { finished, stop: () => { if (recorder.state !== "inactive") recorder.stop(); } };
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const blobToBase64 = blob => new Promise(resolve => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(String(reader.result));
  reader.readAsDataURL(blob);
});

async function save(text, blob) {
  const audio = await blobToBase64(blob);
  const r = await fetch("/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voice: rec.voice, label: rec.voice, text: text, audio: audio })
  });
  const res = await r.json();
  if (res.error) throw new Error(res.error);
  rec.done[text] = res.url;
  return res.url;
}

// How long to leave the microphone open for a line: roughly how long it takes
// to read, with room to breathe. "Record the lot" uses this; recording one line
// by hand waits for you to press Stop.
function readingTime(text) {
  return 1400 + String(text).trim().split(/\s+/).length * 420;
}

async function recordOne(i) {
  if (rec.running) return;
  const text = rec.lines[i];
  rec.active = i;
  draw();
  try {
    const stream = await microphone();
    $("status").textContent = "Recording — press Stop when you have finished the line.";
    $("btn-stop").classList.remove("hidden");
    $("btn-stop").classList.add("recording");
    const take = clip(stream);
    await new Promise(resolve => { $("btn-stop").onclick = () => { take.stop(); resolve(); }; });
    const blob = await take.finished;
    $("btn-stop").classList.add("hidden");
    $("btn-stop").classList.remove("recording");
    $("status").textContent = "Saving…";
    await save(text, blob);
    $("status").textContent = "Saved.";
  } catch (err) {
    $("status").textContent = "Could not record: " + err.message;
  }
  rec.active = -1;
  draw();
}

// Work through every line that is not recorded yet, without touching the mouse.
$("btn-all").addEventListener("click", recordAll);

async function recordAll() {
  if (rec.running) { rec.running = false; return; }
  const todo = rec.lines.map((t, i) => i).filter(i => !rec.done[rec.lines[i]]);
  if (!todo.length) { $("status").textContent = "Every line is already recorded."; return; }

  let stream;
  try {
    stream = await microphone();
  } catch (err) {
    $("status").textContent = "No microphone: " + err.message;
    return;
  }

  rec.running = true;
  $("btn-all").textContent = "Stop after this line";
  $("btn-stop").classList.remove("hidden");
  let stopNow = false;
  $("btn-stop").onclick = () => { stopNow = true; rec.running = false; };

  for (const i of todo) {
    if (!rec.running) break;
    const text = rec.lines[i];
    rec.active = i;
    draw();
    document.querySelector('[data-i="' + i + '"]').scrollIntoView({ block: "center", behavior: "smooth" });

    $("status").textContent = "Ready…";
    await wait(600);
    if (!rec.running) break;

    $("status").textContent = "Recording — read the highlighted line.";
    const take = clip(stream);
    const until = readingTime(text);
    const started = Date.now();
    while (Date.now() - started < until && rec.running && !stopNow) await wait(100);
    take.stop();
    const blob = await take.finished;

    $("status").textContent = "Saving…";
    try {
      await save(text, blob);
    } catch (err) {
      $("status").textContent = "Could not save that one: " + err.message;
      rec.running = false;
      break;
    }
    draw();
    await wait(250);
  }

  rec.running = false;
  rec.active = -1;
  $("btn-all").textContent = "Record the lot";
  $("btn-stop").classList.add("hidden");
  const left = rec.lines.filter(t => !rec.done[t]).length;
  $("status").textContent = left ? left + " still to record." : "All done. Pick your voice on the Board.";
  draw();
}

load();
