import * as D from "./data.js";
import { judge } from "./match.js";
import { createGlobe } from "./globe.js";
import { createCountryMap } from "./cmap.js";
import { countriesGame, citiesGame, waterGame } from "./games.js";

const $ = (id) => document.getElementById(id);
// SVG elements have no .hidden property, so toggle the attribute directly
const setShown = (id, shown) => $(id).toggleAttribute("hidden", !shown);
const isShown = (id) => !$(id).hasAttribute("hidden");
const GAMES = { countries: countriesGame, cities: citiesGame, water: waterGame };
// points for a correct answer after n wrong guesses: MAX - n; the round ends after MAX wrong guesses
const MAX = { easy: 2, medium: 4, hard: 5 };
const MODE_NAME = { easy: "Easy", medium: "Medium", hard: "Hard" };

const store = {
  get(k, d) { try { const v = localStorage.getItem("mapl." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("mapl." + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// ---------------- views ----------------
const view = {
  globe: createGlobe($("globe")),
  cmap: createCountryMap($("cmap")),
  recenter: () => {},
  useGlobe() { setShown("globe", true); setShown("cmap", false); this.globe.resize(); },
  useMap() { setShown("globe", false); setShown("cmap", true); },
};
$("zoomIn").onclick = () => (!isShown("cmap") ? view.globe.zoomBy(1.5) : view.cmap.zoomBy(1.5));
$("zoomOut").onclick = () => (!isShown("cmap") ? view.globe.zoomBy(1 / 1.5) : view.cmap.zoomBy(1 / 1.5));
$("recenter").onclick = () => view.recenter();

// ---------------- screens ----------------
function showScreen(id) {
  for (const s of ["menu", "game", "atlas"]) $(s).hidden = s !== id;
  $("status").hidden = id !== "game";
  if (id === "game") view.globe.resize();
  if (id === "atlas") atlas.globe.resize();
}
$("homeBtn").onclick = () => { showScreen("menu"); };

// ---------------- setup ----------------
let chosen = { game: null, mode: store.get("mode", "easy"), variant: {} };
document.querySelectorAll("#gameCards .card").forEach((card) => {
  card.onclick = () => {
    const g = card.dataset.game;
    if (g === "atlas") { openAtlas(); return; }
    chosen.game = g;
    document.querySelectorAll("#gameCards .card").forEach((c) => c.classList.toggle("on", c === card));
    renderSetup();
  };
});
function renderSetup() {
  const game = GAMES[chosen.game];
  $("setup").hidden = false;
  $("setupTitle").textContent = game.title;
  const vg = $("variantGroup"), vs = $("variantSeg");
  vs.innerHTML = "";
  if (game.variants) {
    vg.hidden = false;
    const cur = chosen.variant[game.id] || store.get("variant." + game.id, game.variants[0].id);
    chosen.variant[game.id] = cur;
    for (const v of game.variants) {
      const b = document.createElement("button");
      b.textContent = v.label; b.className = v.id === cur ? "on" : "";
      b.onclick = () => { chosen.variant[game.id] = v.id; store.set("variant." + game.id, v.id); renderSetup(); };
      vs.appendChild(b);
    }
  } else vg.hidden = true;
  document.querySelectorAll("#modeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === chosen.mode));
  $("modeHelp").textContent = game.help[chosen.mode];
  $("setup").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
document.querySelectorAll("#modeSeg button").forEach((b) => {
  b.onclick = () => { chosen.mode = b.dataset.mode; store.set("mode", chosen.mode); renderSetup(); };
});
$("startBtn").onclick = () => startGame();

// ---------------- game loop ----------------
let session = null;
async function startGame() {
  const game = GAMES[chosen.game];
  const variant = game.variants ? chosen.variant[game.id] : null;
  $("startBtn").disabled = true; $("startBtn").textContent = "Loading…";
  try {
    if (!game.ready) game.ready = game.init();
    await game.ready;
    view.globe.setWorld(await D.world());
  } catch (err) {
    alert("Could not load the map data. If you opened index.html straight from disk, serve the folder over http (for example GitHub Pages) instead.\n\n" + err.message);
    return;
  } finally {
    $("startBtn").disabled = false; $("startBtn").textContent = "Start";
  }
  const bestKey = `best.${game.id}.${chosen.mode}${variant ? "." + variant : ""}`;
  session = { game, mode: chosen.mode, variant, score: 0, rounds: 0, bestKey, best: store.get(bestKey, 0) };
  $("statusTitle").textContent = game.title + (variant ? " · " + game.variants.find((v) => v.id === variant).label : "");
  $("statusMode").textContent = MODE_NAME[session.mode];
  showScreen("game");
  nextRound();
}

async function nextRound() {
  const s = session;
  const round = s.game.next(s.mode, s.variant);
  s.round = round; s.wrong = 0; s.done = false;
  s.rounds++;
  updateStatus();
  $("prompt").innerHTML = "";
  $("prompt").append(round.prompt);
  if (round.sub) { const sub = document.createElement("div"); sub.className = "worth"; sub.textContent = round.sub; $("prompt").append(sub); }
  $("feedback").innerHTML = ""; $("learn").innerHTML = ""; $("guesses").innerHTML = "";
  $("nextBtn").hidden = true;
  updateWorth();
  // choices / type-in
  const box = $("choices"); box.innerHTML = "";
  if (round.choices) {
    $("typein").hidden = true;
    const seen = new Set();
    for (const ch of round.choices) {
      if (seen.has(ch.label)) continue; seen.add(ch.label);
      const b = document.createElement("button");
      b.className = "choice"; b.textContent = ch.label; b.dataset.key = ch.key;
      b.onclick = () => guessChoice(b, ch.key);
      box.appendChild(b);
    }
  } else {
    $("typein").hidden = false;
    $("answer").value = "";
    setTimeout(() => $("answer").focus(), 50);
  }
  if (round.ready) await round.ready;
  round.show(view);
}

function updateWorth() {
  const s = session;
  if (s.done) { $("worth").textContent = ""; return; }
  const left = MAX[s.mode] - s.wrong;
  $("worth").textContent = `Worth ${left} point${left === 1 ? "" : "s"} · ${left} ${left === 1 ? "try" : "tries"} left`;
}
function updateStatus() {
  $("score").textContent = session.score;
  $("round").textContent = session.rounds;
  $("best").textContent = Math.max(session.best, session.score);
}

function guessChoice(btn, key) {
  const s = session;
  if (s.done) return;
  const k = typeof s.round.correct.values().next().value === "number" ? Number(key) : key;
  if (s.round.correct.has(k)) { btn.classList.add("right"); finish(true); }
  else {
    btn.classList.add("wrong"); btn.disabled = true; s.wrong++;
    if (s.wrong >= MAX[s.mode]) finish(false); else updateWorth();
  }
}

$("typein").addEventListener("submit", (e) => {
  e.preventDefault();
  const s = session;
  if (!s || s.done) return;
  const text = $("answer").value;
  const res = judge(text, s.round.entities, s.round.correct);
  if (res.result === "empty") return;
  if (res.result === "correct") { finish(true, res.typo ? text.trim() : null); return; }
  const li = document.createElement("li"); li.textContent = text.trim(); $("guesses").appendChild(li);
  $("answer").value = "";
  s.wrong++;
  if (s.wrong >= MAX[s.mode]) finish(false); else updateWorth();
});

function finish(correct, typo) {
  const s = session;
  s.done = true;
  const pts = correct ? MAX[s.mode] - s.wrong : 0;
  s.score += pts;
  if (s.score > s.best) { s.best = s.score; store.set(s.bestKey, s.best); }
  updateStatus(); updateWorth();
  document.querySelectorAll("#choices .choice").forEach((b) => {
    b.disabled = true;
    const key = typeof s.round.correct.values().next().value === "number" ? Number(b.dataset.key) : b.dataset.key;
    if (s.round.correct.has(key)) b.classList.add("right");
  });
  $("typein").hidden = true;
  const fb = $("feedback");
  fb.innerHTML = "";
  const head = document.createElement("span");
  head.className = correct ? "ok" : "no";
  head.textContent = correct ? `Correct! +${pts} point${pts === 1 ? "" : "s"}` : "Out of tries — 0 points";
  fb.append(head, document.createElement("br"));
  fb.append((correct ? "It's " : "The answer was ") );
  const b = document.createElement("b"); b.textContent = s.round.answer; fb.append(b, ".");
  if (typo) { const n = document.createElement("span"); n.className = "note"; n.textContent = `Accepted "${typo}" as a small typo.`; fb.append(n); }
  if (s.round.note) { const n = document.createElement("span"); n.className = "note"; n.textContent = s.round.note; fb.append(n); }
  const a = document.createElement("a");
  a.href = s.round.learn.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = s.round.learn.label;
  $("learn").innerHTML = ""; $("learn").appendChild(a);
  s.round.reveal(view);
  $("nextBtn").hidden = false;
  $("nextBtn").focus();
}
$("nextBtn").onclick = () => nextRound();
document.addEventListener("keydown", (e) => {
  if (!session || $("game").hidden) return;
  if (session.done && (e.key === "Enter" || e.key === " ") && document.activeElement !== $("answer")) { e.preventDefault(); nextRound(); return; }
  if (!session.done && session.round.choices && /^[1-5]$/.test(e.key)) {
    const btn = document.querySelectorAll("#choices .choice")[Number(e.key) - 1];
    if (btn && !btn.disabled) btn.click();
  }
});

// ---------------- atlas ----------------
const atlas = {
  globe: createGlobe($("atlasGlobe"), { onClick: (id) => id && openCountry(id) }),
  cmap: createCountryMap($("atlasMap")),
  loaded: null,
};
async function openAtlas() {
  showScreen("atlas");
  if (!atlas.loaded) {
    atlas.loaded = Promise.all([D.world(), D.countries(), D.cities()]).then(([w, c, ci]) => {
      atlas.world = w; atlas.c = c; atlas.ci = ci;
      atlas.globe.setWorld(w);
      const dl = $("atlasList");
      for (const x of c.list.slice().sort((a, b) => a.n.localeCompare(b.n))) { const o = document.createElement("option"); o.value = x.n; dl.appendChild(o); }
    });
  }
  try { await atlas.loaded; } catch (err) { alert("Could not load the map data: " + err.message); return; }
  backToGlobe();
}
function backToGlobe() {
  setShown("atlasGlobe", true); setShown("atlasMap", false); $("atlasBack").hidden = true;
  atlas.globe.resize();
  $("atlasTitle").textContent = "Click any country";
  $("atlasInfo").textContent = "Drag to spin the globe, scroll or pinch to zoom, then click a country to open its map with major cities, rivers and lakes.";
}
async function openCountry(id) {
  const c = atlas.c.byIso.get(id);
  if (!c) { $("atlasTitle").textContent = "Not one of the 197 countries in the game"; return; }
  atlas.globe.highlight({ countries: [id], ringCenter: c.ctr });
  const map = await D.countryMap(id);
  setShown("atlasGlobe", false); setShown("atlasMap", true); $("atlasBack").hidden = false;
  const list = atlas.ci.byIso.get(id) || [];
  atlas.cmap.render({ meta: c, map, world: atlas.world, cities: list, labels: "all" });
  $("atlasTitle").textContent = c.n;
  const caps = list.filter((x) => x.cap).map((x) => x.n).join(", ");
  const lg = list.find((x) => x.lg);
  const info = $("atlasInfo");
  info.innerHTML = "";
  const dl = document.createElement("dl");
  const row = (k, v) => { const dt = document.createElement("dt"); dt.textContent = k; const dd = document.createElement("dd"); dd.textContent = v; dl.append(dt, dd); };
  row("Continent", c.cont);
  row(caps.includes(",") ? "Capitals" : "Capital", caps || "—");
  if (lg) row("Largest city", lg.n);
  row("Area", c.area >= 10 ? `${c.area.toLocaleString()} km²` : "under 10 km²");
  info.appendChild(dl);
  if (c.note) { const p = document.createElement("p"); p.textContent = c.note; info.appendChild(p); }
  const a = document.createElement("a"); a.href = D.countryWiki(c); a.target = "_blank"; a.rel = "noopener"; a.textContent = `Learn about ${c.n}`;
  const p = document.createElement("p"); p.appendChild(a); info.appendChild(p);
}
$("atlasBack").onclick = backToGlobe;
$("atlasSearch").addEventListener("change", (e) => {
  const q = e.target.value.trim().toLowerCase();
  const c = atlas.c && atlas.c.list.find((x) => x.n.toLowerCase() === q || (x.alt || []).some((a) => a.toLowerCase() === q));
  if (c) { openCountry(c.iso); atlas.globe.flyTo(c.ctr, 20); e.target.value = ""; }
});

// warm the shared data in the background
D.world().catch(() => {});

// handle for automated tests / debugging in the console
window.MAPL = { view, GAMES, D, startGame, nextRound, chosen };
