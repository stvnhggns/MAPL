import * as D from "./data.js";
import { judge } from "./match.js";
import { createGlobe } from "./globe.js";
import { createCountryMap } from "./cmap.js";
import { createUSMap } from "./usmap.js";
import { countriesGame, flagsGame, citiesGame, waterGame } from "./games.js";
import { usStatesGame, usCitiesGame, usWaterGame, usParksGame, usBordersGame, usPostalGame, usHighGame, usFlagsGame } from "./usgames.js";

const $ = (id) => document.getElementById(id);
// SVG elements have no .hidden property, so toggle the attribute directly
const setShown = (id, shown) => $(id).toggleAttribute("hidden", !shown);
const isShown = (id) => !$(id).hasAttribute("hidden");

const WORLD = [countriesGame, citiesGame, waterGame, flagsGame];
const USA = [usStatesGame, usCitiesGame, usWaterGame, usParksGame, usBordersGame, usHighGame, usPostalGame, usFlagsGame];
const GAMES = Object.fromEntries([...WORLD, ...USA].map((g) => [g.id, g]));
const ICONS = { countries: "🌍", cities: "🏙️", water: "🌊", flags: "🏳️", usStates: "🗺️", usCities: "🏛️", usWater: "🛶", usParks: "🏞️", usBorders: "🧩", usHigh: "⛰️", usPostal: "✉️", usFlags: "🚩" };

// points for a correct answer after n wrong guesses: MAX - n; the round ends after MAX wrong guesses
const MAX = { easy: 2, medium: 4, hard: 5 };
const MODE_NAME = { easy: "Easy", medium: "Medium", hard: "Hard" };
const MODE_HELP = {
  easy: "3 options: pick one, or click one of 3 highlighted places. 2 points first try, 1 point second try.",
  medium: "5 options that are close or similar. 4 → 3 → 2 → 1 points.",
  hard: "No options: type the answer (small typos are fine) or find it on the map yourself. 5 → 4 → 3 → 2 → 1 points.",
};
const DIR_HELP = {
  name: "Something is highlighted on the map: say what it is.",
  find: "You're given a name: click it on the map.",
  mixed: "A mix of both, chosen at random each round.",
};

const store = {
  get(k, d) { try { const v = localStorage.getItem("mapl." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("mapl." + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// ---------------- views ----------------
const VIEWS = ["globe", "cmap", "usmap"];
const view = {
  globe: createGlobe($("globe"), { onClick: (id, ll, px) => onPick({ kind: "globe", id, ll, px }) }),
  cmap: createCountryMap($("cmap"), { onPick: (id) => onPick({ kind: "city", id }) }),
  usmap: createUSMap($("usmap"), { onPick: (hit) => onPick(hit) }),
  recenter: () => {},
  use(which) { for (const v of VIEWS) setShown(v, v === which); this.current = which; if (which === "globe") this.globe.resize(); },
  useGlobe() { this.use("globe"); },
  useMap() { this.use("cmap"); },
  useUS() { this.use("usmap"); },
  current: "globe",
};
const active = () => view[view.current];
$("zoomIn").onclick = () => active().zoomBy(1.5);
$("zoomOut").onclick = () => active().zoomBy(1 / 1.5);
$("recenter").onclick = () => view.recenter();

// ---------------- screens ----------------
function showScreen(id) {
  for (const s of ["menu", "game", "atlas"]) $(s).hidden = s !== id;
  $("status").hidden = id !== "game";
  if (id === "game" && view.current === "globe") view.globe.resize();
  if (id === "atlas") atlas.globe.resize();
}
$("homeBtn").onclick = () => { showScreen("menu"); };

// ---------------- menu & setup ----------------
const chosen = { game: null, mode: store.get("mode", "easy"), dir: store.get("dir", "name"), terr: store.get("terr", false), variant: {} };
function card(id, title, blurb, onclick) {
  const b = document.createElement("button");
  b.className = "card"; b.dataset.game = id;
  b.innerHTML = `<span class="card-ico"></span><b></b><span class="blurb"></span>`;
  b.querySelector(".card-ico").textContent = ICONS[id] || "🧭";
  b.querySelector("b").textContent = title;
  b.querySelector(".blurb").textContent = blurb;
  b.onclick = onclick;
  return b;
}
function pickGame(id) {
  chosen.game = id;
  document.querySelectorAll(".cards .card").forEach((c) => c.classList.toggle("on", c.dataset.game === id));
  renderSetup();
}
for (const g of WORLD) $("worldCards").appendChild(card(g.id, g.title, g.blurb, () => pickGame(g.id)));
$("worldCards").appendChild(card("atlas", "Atlas", "Explore the globe and every country's map.", () => openAtlas()));
for (const g of USA) $("usCards").appendChild(card(g.id, g.title, g.blurb, () => pickGame(g.id)));

function seg(container, items, current, onPick) {
  container.innerHTML = "";
  for (const it of items) {
    const b = document.createElement("button");
    b.textContent = it.label; b.className = it.id === current ? "on" : "";
    b.onclick = () => onPick(it.id);
    container.appendChild(b);
  }
}
function renderSetup() {
  const game = GAMES[chosen.game];
  $("setup").hidden = false;
  $("setupTitle").textContent = game.title;
  if (game.variants) {
    $("variantGroup").hidden = false;
    const cur = chosen.variant[game.id] || store.get("variant." + game.id, game.variants[0].id);
    chosen.variant[game.id] = cur;
    seg($("variantSeg"), game.variants, cur, (id) => { chosen.variant[game.id] = id; store.set("variant." + game.id, id); renderSetup(); });
  } else $("variantGroup").hidden = true;
  document.querySelectorAll("#dirSeg button").forEach((b) => b.classList.toggle("on", b.dataset.dir === chosen.dir));
  $("dirHelp").textContent = DIR_HELP[chosen.dir];
  document.querySelectorAll("#modeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === chosen.mode));
  $("modeHelp").textContent = MODE_HELP[chosen.mode];
  $("terrGroup").hidden = !game.terr;
  $("terrBox").checked = chosen.terr;
  $("setup").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
document.querySelectorAll("#modeSeg button").forEach((b) => { b.onclick = () => { chosen.mode = b.dataset.mode; store.set("mode", chosen.mode); renderSetup(); }; });
document.querySelectorAll("#dirSeg button").forEach((b) => { b.onclick = () => { chosen.dir = b.dataset.dir; store.set("dir", chosen.dir); renderSetup(); }; });
$("terrBox").onchange = (e) => { chosen.terr = e.target.checked; store.set("terr", chosen.terr); };
$("startBtn").onclick = () => startGame();

// ---------------- game loop ----------------
let session = null;
async function startGame() {
  const game = GAMES[chosen.game];
  const variant = game.variants ? chosen.variant[game.id] : null;
  $("startBtn").disabled = true; $("startBtn").textContent = "Loading…";
  try {
    view.globe.setWorld(await D.world());
    if (!game.ready) game.ready = game.init(view);
    await game.ready;
  } catch (err) {
    game.ready = null;
    alert("Could not load the map data. If you opened index.html straight from disk, serve the folder over http (for example GitHub Pages) instead.\n\n" + err.message);
    return;
  } finally {
    $("startBtn").disabled = false; $("startBtn").textContent = "Start";
  }
  const opts = { terr: !!(game.terr && chosen.terr) };
  const bestKey = `best.${game.id}.${chosen.dir}.${chosen.mode}${variant ? "." + variant : ""}${opts.terr ? ".t" : ""}`;
  session = { game, mode: chosen.mode, dir: chosen.dir, variant, opts, score: 0, rounds: 0, bestKey, best: store.get(bestKey, 0) };
  const dirName = { name: "Name it", find: "Find it", mixed: "Mixed" }[chosen.dir];
  $("statusTitle").textContent = game.title + (variant ? " · " + game.variants.find((v) => v.id === variant).label : "") + " · " + dirName;
  $("statusMode").textContent = MODE_NAME[session.mode];
  showScreen("game");
  nextRound();
}

async function nextRound() {
  const s = session;
  const dir = s.dir === "mixed" ? (Math.random() < 0.5 ? "name" : "find") : s.dir;
  const round = s.game.next(s.mode, s.variant, dir, s.opts);
  s.round = round; s.wrong = 0; s.done = false; s.tried = new Set();
  s.rounds++;
  updateStatus();
  const img = $("flagImg");
  if (round.flag) { img.src = round.flag; img.hidden = false; } else { img.hidden = true; img.removeAttribute("src"); }
  $("prompt").innerHTML = "";
  $("prompt").append(round.prompt);
  if (round.sub) { const sub = document.createElement("div"); sub.className = "worth"; sub.textContent = round.sub; $("prompt").append(sub); }
  $("feedback").innerHTML = ""; $("learn").innerHTML = ""; $("guesses").innerHTML = "";
  $("hint").textContent = round.find ? round.hint || "Click the map." : "";
  $("nextBtn").hidden = true;
  updateWorth();
  const box = $("choices"); box.innerHTML = "";
  $("typein").hidden = true;
  if (!round.find && round.choices) {
    const seen = new Set();
    for (const ch of round.choices) {
      if (seen.has(ch.label)) continue; seen.add(ch.label);
      const b = document.createElement("button");
      b.className = "choice"; b.textContent = ch.label; b.dataset.key = ch.key;
      b.onclick = () => guessChoice(b, ch.key);
      box.appendChild(b);
    }
  } else if (!round.find) {
    $("typein").hidden = false;
    $("answer").value = "";
    setTimeout(() => $("answer").focus(), 50);
  }
  if (round.ready) await round.ready;
  if (session !== s || s.round !== round) return;
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
const keyOf = (round, key) => (typeof round.correct.values().next().value === "number" ? Number(key) : key);

function miss(label) {
  const s = session;
  if (label) { const li = document.createElement("li"); li.textContent = label; $("guesses").appendChild(li); }
  s.wrong++;
  if (s.wrong >= MAX[s.mode]) finish(false); else updateWorth();
}
function guessChoice(btn, key) {
  const s = session;
  if (s.done) return;
  if (s.round.correct.has(keyOf(s.round, key))) { btn.classList.add("right"); finish(true); }
  else { btn.classList.add("wrong"); btn.disabled = true; miss(null); }
}
$("typein").addEventListener("submit", (e) => {
  e.preventDefault();
  const s = session;
  if (!s || s.done) return;
  const text = $("answer").value;
  const res = judge(text, s.round.entities, s.round.correct);
  if (res.result === "empty") return;
  if (res.result === "correct") { finish(true, res.typo ? text.trim() : null); return; }
  $("answer").value = "";
  miss(text.trim());
});
// clicks on the map in "find it" rounds
function onPick(hit) {
  const s = session;
  if (!s || s.done || !s.round.find || $("game").hidden) return;
  const res = s.round.pick(hit, view);
  if (!res.valid) { if (res.msg) $("hint").textContent = res.msg; return; }
  if (res.ok) { finish(true); return; }
  const key = res.label || JSON.stringify(hit.id);
  if (s.tried.has(key)) { $("hint").textContent = "You already tried that one."; return; }
  s.tried.add(key);
  if (res.mark) res.mark();
  $("hint").textContent = res.label || "Not that one.";
  miss(res.label ? res.label.replace(/^That's /, "").replace(/\.$/, "") : null);
}

function finish(correct, typo) {
  const s = session;
  s.done = true;
  const pts = correct ? MAX[s.mode] - s.wrong : 0;
  s.score += pts;
  if (s.score > s.best) { s.best = s.score; store.set(s.bestKey, s.best); }
  updateStatus(); updateWorth();
  $("hint").textContent = "";
  document.querySelectorAll("#choices .choice").forEach((b) => {
    b.disabled = true;
    if (s.round.correct.has(keyOf(s.round, b.dataset.key))) b.classList.add("right");
  });
  $("typein").hidden = true;
  const fb = $("feedback");
  fb.innerHTML = "";
  const head = document.createElement("span");
  head.className = correct ? "ok" : "no";
  head.textContent = correct ? `Correct! +${pts} point${pts === 1 ? "" : "s"}` : "Out of tries — 0 points";
  fb.append(head, document.createElement("br"));
  fb.append(s.round.answerPrefix || (correct ? "It's " : "The answer was "));
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
  if (!session.done && session.round.choices && !session.round.find && /^[1-5]$/.test(e.key)) {
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
  const flag = document.createElement("img"); flag.className = "flag small"; flag.src = D.flagUrl("world", id); flag.alt = `Flag of ${c.n}`; info.appendChild(flag);
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
window.MAPL = { view, GAMES, D, startGame, nextRound, chosen, get session() { return session; }, onPick };
