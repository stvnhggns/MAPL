// United States games: states, postal codes, borders, high points, capitals & cities, waterways,
// national parks and state flags. Same round contract as games.js.
import * as D from "./data.js";
import { theName } from "./games.js";

let US = null;
let loaded = null;
async function usInit(view) {
  if (!loaded) loaded = (async () => {
    const [us, world] = await Promise.all([D.us(), D.world()]);
    US = us;
    view.usmap.load({ topo: us.topo, meta: us.meta, world });
  })();
  return loaded;
}

const FAR = 1300; // km between state centres for "far apart"
const dist = (a, b) => D.distKm(a.ctr, b.ctr);
const statePool = (opts) => US.meta.states.filter((s) => opts.terr || !s.terr);
const stateName = (id) => (US.states.get(id) || { n: "Washington, D.C." }).n;
const stateWiki = (s) => (s.wd ? D.wikiFromWikidata(s.wd) : D.wikiSearch(s.n));
const stateEntities = (pool) => pool.map((s) => ({ key: s.id, names: [s.n, ...(s.alt || [])] }));
const corners = (b) => [b[0], b[1], [b[0][0], b[1][1]], [b[1][0], b[0][1]]];
const kindWord = (opts) => (opts.terr ? "state or territory" : "state");

function farStates(t, pool, n, exclude = new Set()) {
  const ok = pool.filter((s) => s !== t && !exclude.has(s.id));
  const far = ok.filter((s) => dist(s, t) > FAR);
  return D.sample(far.length >= n ? far : ok, n);
}
function nearStates(t, pool, n, exclude = new Set()) {
  const near = pool.filter((s) => s !== t && !exclude.has(s.id)).sort((a, b) => dist(a, t) - dist(b, t));
  return D.sample(near.slice(0, n + 2), n);
}
const stateCands = (t, pool, mode, exclude) => (mode === "easy" ? farStates(t, pool, 2, exclude) : mode === "medium" ? nearStates(t, pool, 4, exclude) : []);
const stateChoices = (mode, list) => (mode === "hard" ? null : D.shuffle(list).map((s) => ({ key: s.id, label: s.n })));

// A "click the state" round body. `ok` = set of state ids that count as right.
function stateFind({ ok, among, showTerr = true, fills = {}, points = [], hintAll = "Click the state on the map.", reveal }) {
  return {
    find: true,
    hint: among ? "Click one of the shaded states." : hintAll,
    show: (v) => {
      v.useUS();
      const f = { ...fills };
      if (among) for (const id of among) if (!f[id]) f[id] = "cand";
      v.usmap.render({ showTerr, fills: f, points, pick: { states: among || true } });
      v.recenter = () => v.usmap.reset();
    },
    pick: (hit, v) => {
      if (hit.kind !== "state") return { valid: false };
      if (fills[hit.id] === "given") return { valid: false, msg: `That's ${stateName(hit.id)} itself.` };
      if (among && !among.has(hit.id)) return { valid: false, msg: "Click one of the shaded states." };
      if (ok.has(hit.id)) return { valid: true, ok: true };
      return { valid: true, ok: false, label: `That's ${stateName(hit.id)}.`, mark: () => v.usmap.setFill(hit.id, "wrong") };
    },
    reveal: (v) => { for (const id of ok) v.usmap.setFill(id, "right"); if (reveal) reveal(v); },
  };
}
const labelAt = (s, cls = "target") => ({ lon: s.ctr[0], lat: s.ctr[1], text: s.n, cls });

function usGame(def) {
  return Object.assign({ region: "us", decks: {}, async init(view) { await usInit(view); } }, def, {
    deck(key, items) { return (this.decks[key] ||= D.deck(items)); },
  });
}

// ------------------------------------------------------------------ States
export const usStatesGame = usGame({
  id: "usStates", title: "States", terr: true,
  blurb: "Name the shaded state, or find it on the map.",
  next(mode, variant, dir, opts) {
    const pool = statePool(opts);
    const t = this.deck("s" + opts.terr, pool)();
    const cands = stateCands(t, pool, mode);
    const base = { entities: stateEntities(pool), correct: new Set([t.id]), answer: t.n, learn: { label: `Learn about ${t.n}`, url: stateWiki(t) } };
    const reveal = (v) => v.usmap.update({ labels: [labelAt(t)] });
    if (dir === "find") return { ...base, prompt: `Where is ${t.n}?`, ...stateFind({ ok: new Set([t.id]), among: mode === "hard" ? null : new Set([t, ...cands].map((s) => s.id)), showTerr: opts.terr, reveal }) };
    return {
      ...base, prompt: `Which ${kindWord(opts)} is shaded?`, choices: stateChoices(mode, [t, ...cands]),
      show: (v) => { v.useUS(); v.usmap.render({ showTerr: opts.terr, fills: { [t.id]: "target" } }); v.recenter = () => v.usmap.reset(); },
      reveal: (v) => { v.usmap.setFill(t.id, "right"); reveal(v); },
    };
  },
});

// ------------------------------------------------------------------ Postal codes
export const usPostalGame = usGame({
  id: "usPostal", title: "Postal codes", terr: true,
  blurb: "Two-letter abbreviations: name the shaded state's code, or find the state for a code.",
  next(mode, variant, dir, opts) {
    const pool = statePool(opts);
    const t = this.deck("p" + opts.terr, pool)();
    const cands = stateCands(t, pool, mode);
    const base = { entities: pool.map((s) => ({ key: s.id, names: [s.id] })), correct: new Set([t.id]), answer: `${t.id} — ${t.n}`, learn: { label: `Learn about ${t.n}`, url: stateWiki(t) } };
    const reveal = (v) => v.usmap.update({ labels: [{ ...labelAt(t), text: `${t.id} — ${t.n}` }] });
    if (dir === "find") return { ...base, prompt: `Which ${kindWord(opts)} is ${t.id}?`, ...stateFind({ ok: new Set([t.id]), among: mode === "hard" ? null : new Set([t, ...cands].map((s) => s.id)), showTerr: opts.terr, reveal }) };
    return {
      ...base, prompt: `What is this ${kindWord(opts)}'s postal code?`,
      choices: mode === "hard" ? null : D.shuffle([t, ...cands]).map((s) => ({ key: s.id, label: s.id })),
      show: (v) => { v.useUS(); v.usmap.render({ showTerr: opts.terr, fills: { [t.id]: "target" } }); v.recenter = () => v.usmap.reset(); },
      reveal: (v) => { v.usmap.setFill(t.id, "right"); reveal(v); },
    };
  },
});

// ------------------------------------------------------------------ Borders
export const usBordersGame = usGame({
  id: "usBorders", title: "Borders",
  blurb: "Which states border which? Name one, or click one.",
  variants: [
    { id: "one", label: "Borders X" },
    { id: "both", label: "Borders X and Y" },
    { id: "mixed", label: "Mixed" },
  ],
  next(mode, variant, dir) {
    const pool = US.meta.states.filter((s) => !s.terr && s.nb.length);
    const v = variant === "mixed" ? D.pick(["one", "both"]) : variant;
    let given, correct, prompt;
    if (v === "one") {
      const A = this.deck("one", pool)();
      given = [A]; correct = new Set(A.nb);
      prompt = dir === "find" ? `Click a state that borders ${A.n}.` : `Name a state that borders ${A.n}.`;
    } else {
      // two states that share at least one neighbour
      let A, B, C;
      do { C = D.pick(pool.filter((s) => s.nb.length >= 2)); [A, B] = D.sample(C.nb, 2).map((id) => US.states.get(id)); } while (!A || !B);
      given = [A, B];
      correct = new Set(A.nb.filter((id) => B.nb.includes(id)));
      prompt = dir === "find" ? `Click a state that borders both ${A.n} and ${B.n}.` : `Which state borders both ${A.n} and ${B.n}?`;
    }
    const givenIds = new Set(given.map((s) => s.id));
    const right = US.states.get(D.pick([...correct]));
    const exclude = new Set([...correct, ...givenIds]);
    const anchor = given[0];
    let distractors = [];
    if (mode === "easy") distractors = farStates(anchor, pool, 2, exclude);
    else if (mode === "medium") {
      // states next door to the given state(s) that still don't qualify
      const ring = new Set(given.flatMap((g) => g.nb.flatMap((id) => [id, ...(US.states.get(id)?.nb || [])])));
      const near = pool.filter((s) => ring.has(s.id) && !exclude.has(s.id));
      distractors = D.sample(near, 4);
      if (distractors.length < 4) distractors.push(...nearStates(anchor, pool, 4 - distractors.length, new Set([...exclude, ...distractors.map((s) => s.id)])));
    }
    const names = [...correct].map(stateName);
    const fills = Object.fromEntries(given.map((g) => [g.id, "given"]));
    const base = {
      prompt, entities: stateEntities(US.meta.states.filter((s) => !s.terr)), correct,
      answer: names.join(", "), answerPrefix: correct.size > 1 ? "Every state that counts: " : null,
      learn: { label: `Learn about ${right.n}`, url: stateWiki(right) },
    };
    const reveal = (v) => v.usmap.update({ labels: [...given.map((g) => labelAt(g, "")), ...[...correct].map((id) => labelAt(US.states.get(id)))] });
    if (dir === "find") {
      return { ...base, ...stateFind({ ok: correct, among: mode === "hard" ? null : new Set([right, ...distractors].map((s) => s.id)), showTerr: false, fills, reveal }) };
    }
    return {
      ...base, choices: stateChoices(mode, [right, ...distractors]),
      show: (v) => { v.useUS(); v.usmap.render({ showTerr: false, fills }); v.recenter = () => v.usmap.reset(); },
      reveal: (v) => { for (const id of correct) v.usmap.setFill(id, "right"); reveal(v); },
    };
  },
});

// ------------------------------------------------------------------ High points
const hpName = (s) => (s.id === "AK" ? "Denali (Mount McKinley)" : s.hp.n);
export const usHighGame = usGame({
  id: "usHigh", title: "State high points", terr: true,
  blurb: "Each state's highest point: name it, or find its state.",
  next(mode, variant, dir, opts) {
    const pool = statePool(opts);
    const t = this.deck("h" + opts.terr, pool)();
    const cands = stateCands(t, pool, mode);
    const peak = (cls) => ({ key: "hp", kind: "peak", lon: t.hp.lon, lat: t.hp.lat, cls });
    const label = { lon: t.hp.lon, lat: t.hp.lat, text: `${hpName(t)} · ${t.hp.ft.toLocaleString()} ft`, cls: "target" };
    const base = {
      entities: pool.map((s) => ({ key: s.id, names: [s.hp.n, ...(s.hp.alt || []), ...(s.id === "AK" ? ["Denali"] : [])] })),
      correct: new Set([t.id]), answer: `${hpName(t)} (${t.hp.ft.toLocaleString()} ft)`,
      learn: { label: `Learn about ${hpName(t)}`, url: D.wikiSearch(t.id === "AK" ? "Denali" : `${t.hp.n} ${t.n}`) },
    };
    if (dir === "find") {
      return { ...base, prompt: `Where is ${hpName(t)}?`, sub: `${t.hp.ft.toLocaleString()} ft — click its ${kindWord(opts)}.`,
        ...stateFind({ ok: new Set([t.id]), among: mode === "hard" ? null : new Set([t, ...cands].map((s) => s.id)), showTerr: opts.terr,
          reveal: (v) => v.usmap.update({ points: [peak("right")], labels: [label] }) }) };
    }
    return {
      ...base, prompt: `What is the highest point in ${t.n}?`,
      choices: mode === "hard" ? null : D.shuffle([t, ...cands]).map((s) => ({ key: s.id, label: hpName(s) })),
      show: (v) => { v.useUS(); v.usmap.render({ showTerr: opts.terr, fills: { [t.id]: "target" }, points: [peak("target")] }); v.recenter = () => v.usmap.reset(); },
      reveal: (v) => { v.usmap.setFill(t.id, "right"); v.usmap.update({ points: [peak("right")], labels: [label] }); },
    };
  },
});

// ------------------------------------------------------------------ Capitals & cities
const shortMetro = (m) => m.n.replace(/ \(.*\)$/, "");
export const usCitiesGame = usGame({
  id: "usCities", title: "Capitals & cities", terr: true,
  blurb: "State capitals, largest cities, largest metro areas and \"what city is this?\"",
  variants: [
    { id: "capital", label: "Capital of…" },
    { id: "largest", label: "Largest city" },
    { id: "metro", label: "Largest metro" },
    { id: "whatcity", label: "What city is this?" },
    { id: "mixed", label: "Mixed" },
  ],
  next(mode, variant, dir, opts) {
    let v = variant === "mixed" ? D.pick(["capital", "capital", "largest", "metro", "whatcity", "whatcity"]) : variant;
    if (v === "metro" && dir === "find") v = D.pick(["capital", "largest", "whatcity"]); // metros are name-only
    const pool = statePool(opts);
    const C = US.meta.cities;
    let s, target, correct, prompt, sub = "", answer, learn, note = null, entities, choices = null;
    if (v === "whatcity") {
      const cityPool = C.filter((c) => c.pool && c.st !== "DC" && (opts.terr || !US.states.get(c.st)?.terr));
      target = this.deck("w" + opts.terr, cityPool)();
      s = US.states.get(target.st);
      prompt = dir === "find" ? `Where is ${target.n}?` : "What city is this?";
      sub = `In ${s.n}`;
    } else {
      s = this.deck(v + opts.terr, pool)();
      if (v === "capital") { target = C[s.cap]; prompt = dir === "find" ? `Click the capital of ${s.n}.` : `What is the capital of ${s.n}?`; }
      else if (v === "largest") { target = C[s.lg]; prompt = dir === "find" ? `Click the largest city in ${s.n}.` : `What is the largest city in ${s.n}?`; sub = "By population within city limits"; }
      else { target = C[s.metro.city]; prompt = `Which metro area is home to the most people in ${s.n}?`; note = s.metroNote; }
    }
    const stCities = (US.citiesBySt.get(s.id) || []).filter((c) => !c.dc);
    const here = [target.lon, target.lat];
    const byDist = (list) => list.slice().sort((a, b) => D.distKm([a.lon, a.lat], here) - D.distKm([b.lon, b.lat], here));
    const cityName = (c) => c.n;
    if (v === "metro") {
      const label = shortMetro(s.metro);
      correct = new Set(pool.filter((o) => o.metro.n === s.metro.n).map((o) => o.id));
      answer = s.metro.n;
      entities = pool.map((o) => ({ key: o.id, names: o.metro.ans }));
      learn = { label: `Learn about the ${label} area`, url: D.wikiSearch(`${label.replace(/ metro$/, "")} metropolitan area`) };
      if (mode !== "hard") {
        const others = (mode === "easy" ? farStates(s, pool, 6) : nearStates(s, pool, 8)).filter((o) => shortMetro(o.metro) !== label);
        const seen = new Set([label]);
        const picks = [];
        for (const o of others) { const l = shortMetro(o.metro); if (!seen.has(l)) { seen.add(l); picks.push({ key: o.id, label: l }); } if (picks.length >= (mode === "easy" ? 2 : 4)) break; }
        choices = D.shuffle([{ key: s.id, label }, ...picks]);
      }
    } else {
      correct = new Set([target.id]);
      answer = target.n;
      entities = C.filter((c) => !c.dc).map((c) => ({ key: c.id, names: [c.n, ...(c.alt || [])] }));
      learn = { label: `Learn about ${target.n}`, url: target.wd ? D.wikiFromWikidata(target.wd) : target.wt ? D.wikiFromTitle(target.wt) : D.wikiSearch(`${target.n}, ${s.n}`) };
    }
    // distractor cities
    const notT = (c) => c.id !== target.id && c.n !== target.n;
    let distractors = [];
    if (v !== "metro" && mode !== "hard") {
      const n = mode === "easy" ? 2 : 4;
      if (dir === "find" || mode === "medium") {
        // same state: spread out on easy, any on medium; fall back to the nearest cities next door
        const mine = stCities.filter(notT);
        distractors = mode === "easy" ? D.sample(byDist(mine).reverse().slice(0, Math.max(2, Math.ceil(mine.length / 2))), 2) : D.sample(mine.slice(0, 7), Math.min(4, mine.length));
        if (distractors.length < n) for (const c of byDist(C.filter((c) => c.st !== s.id && !c.dc && notT(c)))) { if (distractors.length >= n) break; if (!distractors.some((d) => d.n === c.n)) distractors.push(c); }
      } else {
        const farSt = farStates(s, pool, 6).map((o) => o.id);
        let cands;
        if (v === "capital") cands = farSt.map((id) => C[US.states.get(id).cap]);
        else if (v === "largest") cands = farSt.map((id) => C[US.states.get(id).lg]);
        else cands = C.filter((c) => c.pool && farSt.includes(c.st));
        distractors = D.sample(cands.filter((c) => c && notT(c)), 2);
      }
    }
    if (v !== "metro" && mode !== "hard" && dir !== "find") choices = D.shuffle([target, ...distractors]).map((c) => ({ key: c.id, label: cityName(c) }));
    const focus = [...corners(s.b), here];
    const context = stCities.map((c) => ({ key: c.id, kind: "city", lon: c.lon, lat: c.lat, cls: "" }));
    const allLabels = (cls) => [{ lon: target.lon, lat: target.lat, text: v === "metro" ? shortMetro(s.metro) : target.n, cls }, ...stCities.filter((c) => c.id !== target.id).slice(0, 8).map((c) => ({ lon: c.lon, lat: c.lat, text: c.n, cls: c.cap ? "cap" : "" }))];
    const base = { prompt, sub, correct, answer, learn, note, entities };
    if (dir === "find") {
      const cands = mode === "hard" ? null : [target, ...distractors];
      const pts = (cands || stCities).map((c) => ({ key: c.id, kind: "city", lon: c.lon, lat: c.lat, cls: cands ? "cand" : "" }));
      const fpts = [...focus, ...(cands || []).map((c) => [c.lon, c.lat])];
      return {
        ...base, find: true, hint: cands ? "Click one of the highlighted cities." : "Click the right city dot.",
        show: (view) => { view.useUS(); view.usmap.render({ showTerr: true, fills: { [s.id]: "focus" }, points: pts, focus: fpts, pick: { points: true } }); view.recenter = () => view.usmap.reset(); },
        pick: (hit, view) => {
          if (hit.kind !== "point") return { valid: false };
          if (correct.has(hit.id)) return { valid: true, ok: true };
          return { valid: true, ok: false, label: `That's ${C[hit.id].n}.`, mark: () => view.usmap.setPoint(hit.id, "wrong") };
        },
        reveal: (view) => { view.usmap.setPoint(target.id, "right"); view.usmap.update({ labels: allLabels("target") }); },
      };
    }
    return {
      ...base, choices,
      show: (view) => {
        view.useUS();
        view.usmap.render({ showTerr: true, fills: { [s.id]: "focus" }, points: [...context.filter((p) => p.key !== target.id), { key: target.id, kind: "city", lon: target.lon, lat: target.lat, cls: "target" }], focus });
        view.recenter = () => view.usmap.reset();
      },
      reveal: (view) => view.usmap.update({ labels: allLabels("target") }),
    };
  },
});

// ------------------------------------------------------------------ Waterways
const W_PROMPT = { sea: "Name this body of water.", lake: "Name this lake.", river: "Name this river." };
export const usWaterGame = usGame({
  id: "usWater", title: "U.S. waterways",
  blurb: "Bays, sounds, the Great Lakes and other lakes, and major rivers.",
  variants: [
    { id: "all", label: "Everything" },
    { id: "sea", label: "Oceans, gulfs & bays" },
    { id: "lake", label: "Lakes" },
    { id: "river", label: "Rivers" },
  ],
  next(mode, variant, dir) {
    const list = US.meta.water;
    const t = this.deck(variant, variant === "all" ? list : list.filter((w) => w.t === variant))();
    const same = list.filter((w) => w !== t && w.t === t.t);
    let distractors = [];
    if (mode === "easy") { const far = same.filter((w) => D.distKm(w.ctr, t.ctr) > 1500); distractors = D.sample(far.length >= 2 ? far : same, 2); }
    else if (mode === "medium") distractors = D.sample(same.slice().sort((a, b) => D.distKm(a.ctr, t.ctr) - D.distKm(b.ctr, t.ctr)).slice(0, 6), 4);
    const diag = D.distKm(t.b[0], t.b[1]);
    const focus = diag < 700 ? corners(t.b) : null;
    const label = { lon: t.ctr[0], lat: t.ctr[1], text: t.n, cls: "target" };
    const base = {
      entities: list.map((w) => ({ key: w.id, names: [w.n, ...(w.alt || [])] })), correct: new Set([t.id]), answer: t.n,
      learn: { label: `Learn about ${t.n.replace(/ \(formerly.*\)$/, "")}`, url: D.wikiFromTitle(t.wt) },
    };
    if (dir === "find") {
      const cands = mode === "hard" ? null : [t, ...distractors];
      const pickable = new Set((cands || [t, ...same]).map((w) => w.id));
      return {
        ...base, find: true, prompt: `Where is ${theName(t.n, t.t)}?`,
        hint: cands ? "Click one of the highlighted waters." : "Zoom in if you need to, then click it.",
        show: (v) => {
          v.useUS();
          v.usmap.render({ showTerr: false, water: cands ? Object.fromEntries(cands.map((w) => [w.id, "cand"])) : {}, pick: { water: pickable } });
          v.recenter = () => v.usmap.reset();
        },
        pick: (hit, v) => {
          if (hit.kind !== "water") return { valid: false };
          if (hit.id === t.id) return { valid: true, ok: true };
          const o = list.find((w) => w.id === hit.id);
          return { valid: true, ok: false, label: `That's ${theName(o.n, o.t)}.`, mark: () => v.usmap.setWater(hit.id, "wrong") };
        },
        reveal: (v) => { v.usmap.setWater(t.id, "right"); v.usmap.update({ labels: [label] }); },
      };
    }
    return {
      ...base, prompt: W_PROMPT[t.t],
      choices: mode === "hard" ? null : D.shuffle([t, ...distractors]).map((w) => ({ key: w.id, label: w.n })),
      show: (v) => { v.useUS(); v.usmap.render({ showTerr: false, water: { [t.id]: "target" }, focus, maxZoom: 6 }); v.recenter = () => v.usmap.reset(); },
      reveal: (v) => { v.usmap.setWater(t.id, "right"); v.usmap.update({ labels: [label] }); },
    };
  },
});

// ------------------------------------------------------------------ National parks
const parkName = (p) => (p.n === "American Samoa" ? "National Park of American Samoa" : `${p.n} National Park`);
export const usParksGame = usGame({
  id: "usParks", title: "National parks",
  blurb: "All 64 national parks: which state each is in, and where it is.",
  variants: [
    { id: "state", label: "Which state?" },
    { id: "name", label: "Name the park" },
    { id: "mixed", label: "Mixed" },
  ],
  next(mode, variant, dir) {
    const parks = US.meta.parks;
    const v = variant === "mixed" ? D.pick(["state", "name"]) : variant;
    const p = this.deck(v, parks)();
    const pd = (a, b) => D.distKm([a.lon, a.lat], [b.lon, b.lat]);
    const marker = (cls) => ({ key: p.id, kind: "park", lon: p.lon, lat: p.lat, cls });
    const label = { lon: p.lon, lat: p.lat, text: parkName(p), cls: "target" };
    const learn = { label: `Learn about ${parkName(p)}`, url: D.wikiFromTitle(p.wt) };
    if (v === "state") {
      const pool = US.meta.states;
      const s0 = US.states.get(p.st[0]);
      const ok = new Set(p.st);
      const cands = stateCands(s0, pool, mode, ok);
      const where = p.st.some((id) => US.states.get(id)?.terr) ? "territory" : "state";
      const base = { entities: stateEntities(pool), correct: ok, answer: p.st.map(stateName).join(", "), learn };
      const reveal = (vw) => vw.usmap.update({ points: [marker("right")], labels: [label] });
      if (dir === "find") return { ...base, prompt: `Click the ${where} where ${parkName(p)} is.`, ...stateFind({ ok, among: mode === "hard" ? null : new Set([s0, ...cands].map((s) => s.id)), reveal }) };
      return {
        ...base, prompt: `Which ${where} is ${parkName(p)} in?`, sub: p.st.length > 1 ? "It spans more than one state — any of them counts." : "",
        choices: stateChoices(mode, [s0, ...cands]),
        show: (vw) => { vw.useUS(); vw.usmap.render({ showTerr: true }); vw.recenter = () => vw.usmap.reset(); },
        reveal: (vw) => { for (const id of ok) vw.usmap.setFill(id, "right"); reveal(vw); },
      };
    }
    // name the park / find the park
    const others = parks.filter((x) => x !== p);
    let distractors = [];
    if (mode === "easy") distractors = D.sample(others.filter((x) => pd(x, p) > 1500), 2);
    else if (mode === "medium") distractors = D.sample(others.slice().sort((a, b) => pd(a, p) - pd(b, p)).slice(0, 6), 4);
    const base = { entities: parks.map((x) => ({ key: x.id, names: [x.n, parkName(x), ...(x.alt || [])] })), correct: new Set([p.id]), answer: parkName(p), learn };
    if (dir === "find") {
      const cands = mode === "hard" ? null : [p, ...distractors];
      const pts = (cands || parks).map((x) => ({ key: x.id, kind: "park", lon: x.lon, lat: x.lat, cls: cands ? "cand" : "" }));
      return {
        ...base, find: true, prompt: `Where is ${parkName(p)}?`, hint: cands ? "Click one of the highlighted parks." : "Click the right park.",
        show: (vw) => { vw.useUS(); vw.usmap.render({ showTerr: true, points: pts, pick: { points: true } }); vw.recenter = () => vw.usmap.reset(); },
        pick: (hit, vw) => {
          if (hit.kind !== "point") return { valid: false };
          if (hit.id === p.id) return { valid: true, ok: true };
          return { valid: true, ok: false, label: `That's ${parkName(parks[hit.id])}.`, mark: () => vw.usmap.setPoint(hit.id, "wrong") };
        },
        reveal: (vw) => { vw.usmap.setPoint(p.id, "right"); vw.usmap.update({ labels: [label] }); },
      };
    }
    return {
      ...base, prompt: "Name this national park.",
      choices: mode === "hard" ? null : D.shuffle([p, ...distractors]).map((x) => ({ key: x.id, label: parkName(x) })),
      show: (vw) => { vw.useUS(); vw.usmap.render({ showTerr: true, points: [marker("target")] }); vw.recenter = () => vw.usmap.reset(); },
      reveal: (vw) => vw.usmap.update({ points: [marker("right")], labels: [label] }),
    };
  },
});

// ------------------------------------------------------------------ State flags
export const usFlagsGame = usGame({
  id: "usFlags", title: "State flags", terr: true,
  blurb: "Name the state from its flag, or find it on the map.",
  next(mode, variant, dir, opts) {
    const pool = statePool(opts);
    const t = this.deck("f" + opts.terr, pool)();
    const cands = stateCands(t, pool, mode);
    const base = { flag: D.flagUrl("us", t.id), entities: stateEntities(pool), correct: new Set([t.id]), answer: t.n, learn: { label: `Learn about the flag of ${t.n}`, url: D.wikiSearch(`Flag of ${t.n}`) } };
    const reveal = (v) => v.usmap.update({ labels: [labelAt(t)] });
    if (dir === "find") return { ...base, prompt: `Click this flag's ${kindWord(opts)}.`, ...stateFind({ ok: new Set([t.id]), among: mode === "hard" ? null : new Set([t, ...cands].map((s) => s.id)), showTerr: opts.terr, reveal }) };
    return {
      ...base, prompt: `Which ${kindWord(opts)}'s flag is this?`, choices: stateChoices(mode, [t, ...cands]),
      show: (v) => { v.useUS(); v.usmap.render({ showTerr: opts.terr }); v.recenter = () => v.usmap.reset(); },
      reveal: (v) => { v.usmap.setFill(t.id, "right"); reveal(v); },
    };
  },
});
