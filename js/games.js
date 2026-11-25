// World games. Each round object has:
//  prompt, sub, flag?, find (bool), choices [{key,label}] (easy/medium "name it"), entities [{key,names}] (hard),
//  correct Set, answer, learn {label,url}, note, ready?, show(view), reveal(view),
//  pick(hit, view) -> { valid, ok, label, msg, mark() } for "find it" rounds.
import * as D from "./data.js";
import { COLORS } from "./globe.js";

const FAR_KM = 3000;
const halfDiagDeg = (b) => (d3.geoDistance(b[0], b[1]) * 180) / Math.PI / 2;
const sizeGap = (a, b) => Math.abs(Math.log(Math.max(a, 1) / Math.max(b, 1)));
const rand = (a, b) => a + Math.random() * (b - a);

// Pick n distractors: sample from the `poolSize` best by score, then fill from fallback.
export function pickSimilar(cands, score, n, poolSize, fallback = []) {
  const sorted = cands.slice().sort((a, b) => score(a) - score(b));
  const out = D.sample(sorted.slice(0, Math.max(poolSize, n)), n);
  for (const f of fallback) { if (out.length >= n) break; if (!out.includes(f)) out.push(f); }
  return out.slice(0, n);
}

// ------------------------------------------------------------------ Countries (and world flags)
function countryCands(game, t, mode) {
  const others = game.c.list.filter((c) => c !== t);
  if (mode === "easy") return D.sample(others.filter((c) => c.cont !== t.cont && D.distKm(c.ctr, t.ctr) > FAR_KM), 2);
  if (mode === "medium") {
    const near = others.slice().sort((a, b) => D.distKm(a.ctr, t.ctr) - D.distKm(b.ctr, t.ctr));
    return pickSimilar(others.filter((c) => c.cont === t.cont), (c) => sizeGap(c.area, t.area), 4, 6, near);
  }
  return [];
}
async function countryInit(game, view) {
  const [world, countries] = await Promise.all([D.world(), D.countries()]);
  game.world = world; game.c = countries;
  game.deal = D.deck(countries.list);
  game.entities = countries.list.map((c) => ({ key: c.iso, names: [c.n, ...(c.alt || [])] }));
  view.globe.setSmall(countries.list.filter((c) => c.area < 30000).map((c) => ({ id: c.iso, ctr: c.ctr })));
}
// Shared "find the country" round body.
function countryFind(game, t, mode, cands) {
  const r = Math.min(70, Math.max(7, halfDiagDeg(t.fb) * 1.7));
  const among = mode === "hard" ? null : new Set([t, ...cands].map((c) => c.iso));
  return {
    find: true,
    hint: mode === "hard" ? "Spin and zoom the globe, then click the country." : "Click one of the shaded countries.",
    show: (v) => {
      v.useGlobe();
      if (among) {
        v.globe.highlight({ fills: Object.fromEntries([...among].map((id) => [id, COLORS.cand])) });
        v.globe.fit([t, ...cands].map((c) => c.ctr));
        v.recenter = () => v.globe.fit([t, ...cands].map((c) => c.ctr));
      } else {
        v.globe.highlight({});
        const start = [t.ctr[0] + rand(-70, 70), rand(-10, 35)];
        v.globe.flyTo(start, 80);
        v.recenter = () => v.globe.flyTo(start, 80);
      }
    },
    pick: (hit, v) => {
      if (hit.kind !== "globe") return { valid: false };
      const id = v.globe.pickCountry(hit.px, { among });
      if (!id) return { valid: false, msg: among ? "Click one of the shaded countries." : "Click on a country." };
      if (id === t.iso) return { valid: true, ok: true };
      const o = game.c.byIso.get(id);
      return { valid: true, ok: false, label: o ? `That's ${o.n}.` : "That's not one of the 197 countries.", mark: () => v.globe.setFill(id, COLORS.wrong) };
    },
    reveal: (v) => { v.globe.setFill(t.iso, COLORS.right); v.globe.flyTo(t.ctr, r); },
  };
}

export const countriesGame = {
  id: "countries", title: "Countries", region: "world",
  blurb: "Name the shaded country on the globe, or find it.",
  async init(view) { await countryInit(this, view); },
  next(mode, variant, dir) {
    const t = this.deal();
    const cands = countryCands(this, t, mode);
    const r = Math.min(70, Math.max(7, halfDiagDeg(t.fb) * 1.7));
    const base = { entities: this.entities, correct: new Set([t.iso]), answer: t.n, learn: { label: `Learn about ${t.n}`, url: D.countryWiki(t) } };
    if (dir === "find") return { ...base, prompt: `Where is ${t.n}?`, ...countryFind(this, t, mode, cands) };
    return {
      ...base,
      prompt: "Which country is shaded?",
      choices: mode === "hard" ? null : D.shuffle([t, ...cands]).map((c) => ({ key: c.iso, label: c.n })),
      show: (v) => { v.useGlobe(); v.globe.highlight({ countries: [t.iso], ringCenter: t.ctr }); v.globe.flyTo(t.ctr, r); v.recenter = () => v.globe.flyTo(t.ctr, r); },
      reveal: (v) => v.globe.setFill(t.iso, COLORS.right),
    };
  },
};

export const flagsGame = {
  id: "flags", title: "Flags", region: "world",
  blurb: "Name the country from its flag, or find it on the globe.",
  async init(view) { await countryInit(this, view); },
  next(mode, variant, dir) {
    const t = this.deal();
    const cands = countryCands(this, t, mode);
    const r = Math.min(70, Math.max(7, halfDiagDeg(t.fb) * 1.7));
    const base = { flag: D.flagUrl("world", t.iso), entities: this.entities, correct: new Set([t.iso]), answer: t.n, learn: { label: `Learn about ${t.n}`, url: D.countryWiki(t) } };
    if (dir === "find") return { ...base, prompt: "Click this flag's country.", ...countryFind(this, t, mode, cands) };
    return {
      ...base,
      prompt: "Which country's flag is this?",
      choices: mode === "hard" ? null : D.shuffle([t, ...cands]).map((c) => ({ key: c.iso, label: c.n })),
      show: (v) => { v.useGlobe(); v.globe.highlight({}); v.recenter = () => {}; },
      reveal: (v) => { v.globe.highlight({ countries: [t.iso], ringCenter: t.ctr }); v.globe.flyTo(t.ctr, r); },
    };
  },
};

// ------------------------------------------------------------------ Cities
export const citiesGame = {
  id: "cities", title: "Cities", region: "world",
  blurb: "Capitals, largest cities and \"what city is this?\" on each country's map.",
  variants: [
    { id: "capital", label: "Capital of…" },
    { id: "largest", label: "Largest city in…" },
    { id: "whatcity", label: "What city is this?" },
    { id: "mixed", label: "Mixed" },
  ],
  async init() {
    const [world, countries, cities] = await Promise.all([D.world(), D.countries(), D.cities()]);
    Object.assign(this, { world, c: countries, ci: cities });
    const capOf = (iso) => (cities.byIso.get(iso) || []).find((x) => x.cap === 1);
    this.capOf = capOf;
    this.decks = {
      capital: D.deck(countries.list.filter((c) => capOf(c.iso))),
      largest: D.deck(countries.list.filter((c) => (cities.byIso.get(c.iso) || []).some((x) => x.lg))),
      whatcity: D.deck(cities.list.filter((x) => x.pool)),
    };
    this.entities = cities.list.map((x) => ({ key: x.id, names: [x.n, ...(x.alt || [])] }));
    this.pool = cities.list.filter((x) => x.pool);
  },
  next(mode, variant, dir) {
    const v = variant === "mixed" ? D.pick(["capital", "capital", "largest", "whatcity", "whatcity"]) : variant;
    const { ci, c } = this;
    let target, country, correct, prompt, sub = "";
    if (v === "capital") {
      country = this.decks.capital();
      target = this.capOf(country.iso);
      correct = new Set(ci.byIso.get(country.iso).filter((x) => x.cap > 0).map((x) => x.id));
      prompt = dir === "find" ? `Click the capital of ${country.n}.` : `What is the capital of ${country.n}?`;
    } else if (v === "largest") {
      country = this.decks.largest();
      target = ci.byIso.get(country.iso).find((x) => x.lg);
      correct = new Set([target.id]);
      prompt = dir === "find" ? `Click the largest city in ${country.n}.` : `What is the largest city in ${country.n}?`;
    } else {
      target = this.decks.whatcity();
      country = c.byIso.get(target.iso);
      correct = new Set([target.id]);
      prompt = dir === "find" ? `Where is ${target.n}?` : "What city is this?";
      sub = `In ${country.n}`;
    }
    const cityList = ci.byIso.get(country.iso);
    const notCorrect = (x) => !correct.has(x.id) && x.n !== target.n;
    const here = [target.lon, target.lat];
    let distractors = [];
    if (dir === "find") {
      // candidates must be on this country's map: same-country cities, spread out on easy
      const mine = cityList.filter(notCorrect);
      if (mode === "easy") {
        const far = mine.slice().sort((a, b) => D.distKm([b.lon, b.lat], here) - D.distKm([a.lon, a.lat], here));
        distractors = D.sample(far.slice(0, Math.max(2, Math.ceil(far.length / 2))), 2);
      } else if (mode === "medium") {
        distractors = D.sample([...mine.filter((x) => x.pool), ...mine.filter((x) => !x.pool)].slice(0, 7), 4);
      }
    } else if (mode === "easy") {
      const farCountry = (iso) => { const o = c.byIso.get(iso); return o && o.cont !== country.cont && D.distKm(o.ctr, country.ctr) > FAR_KM; };
      let cands;
      if (v === "capital") cands = c.list.filter((o) => farCountry(o.iso)).map((o) => this.capOf(o.iso)).filter(Boolean);
      else if (v === "largest") cands = ci.list.filter((x) => (x.lg || (x.pool && !x.cap)) && farCountry(x.iso));
      else cands = this.pool.filter((x) => farCountry(x.iso));
      distractors = D.sample(cands, 2);
    } else if (mode === "medium") {
      const mine = cityList.filter(notCorrect);
      distractors = D.sample([...mine.filter((x) => x.pool), ...mine.filter((x) => !x.pool)].slice(0, 7), Math.min(4, mine.length));
      if (distractors.length < 4) {
        // small countries: fill with the closest cities across the border
        const nearby = ci.list.filter((x) => x.iso !== country.iso && (x.pool || x.cap) && x.n !== target.n)
          .sort((a, b) => D.distKm([a.lon, a.lat], here) - D.distKm([b.lon, b.lat], here));
        for (const x of nearby) { if (distractors.length >= 4) break; if (!distractors.some((d) => d.n === x.n)) distractors.push(x); }
      }
    }
    let mapData = null;
    const mapP = D.countryMap(country.iso).then((m) => (mapData = m));
    const acceptedNames = [...correct].map((id) => ci.list[id].n);
    const base = {
      prompt, sub, entities: this.entities, correct,
      answer: correct.size > 1 ? acceptedNames.join(" / ") : target.n,
      learn: { label: `Learn about ${target.n}`, url: D.cityWiki(target, country.n) },
      note: v === "capital" ? country.note : null,
      ready: mapP,
    };
    const render = (view, extra) => view.cmap.render({ meta: country, map: mapData, world: this.world, cities: cityList, extraPoints: [[target.lon, target.lat]], ...extra });
    if (dir === "find") {
      const cands = mode === "hard" ? null : new Set([target, ...distractors].map((x) => x.id));
      return {
        ...base, find: true,
        hint: mode === "hard" ? "Click the right city dot." : "Click one of the highlighted cities.",
        show: (view) => {
          view.useMap();
          render(view, { targetId: null, labels: "none", show: cands, styles: cands ? Object.fromEntries([...cands].map((id) => [id, "cand"])) : null, pickable: true });
          view.recenter = () => view.cmap.reset();
        },
        pick: (hit, view) => {
          if (hit.kind !== "city") return { valid: false };
          if (correct.has(hit.id)) return { valid: true, ok: true };
          return { valid: true, ok: false, label: `That's ${ci.list[hit.id].n}.`, mark: () => view.cmap.setStyle(hit.id, "wrong") };
        },
        reveal: (view) => { view.cmap.setStyle(target.id, "right"); view.cmap.reveal({ targetId: target.id, labels: "all", showAll: true }); },
      };
    }
    return {
      ...base,
      choices: mode === "hard" ? null : D.shuffle([target, ...distractors]).map((x) => ({ key: x.id, label: x.n })),
      show: (view) => { view.useMap(); render(view, { targetId: target.id, labels: "none" }); view.recenter = () => view.cmap.reset(); },
      reveal: (view) => view.cmap.setLabels("all"),
    };
  },
};

// ------------------------------------------------------------------ Waterways
const TYPE_PROMPT = {
  ocean: "Which ocean is this?", sea: "Name this sea, gulf or bay.", lake: "Name this lake.", river: "Name this river.",
};
// "the Nile", "the Gulf of Guinea", but "Lake Baikal", "Hudson Bay", "Vänern"
export function theName(n, t) {
  if (t === "lake") return /Sea$/.test(n) ? "the " + n : n;
  if (t === "sea" && /\b(Bay|Sound|Inlet)\b/.test(n) && !/^Bay of/.test(n)) return n;
  return "the " + n;
}
export const waterGame = {
  id: "water", title: "Waterways", region: "world",
  blurb: "Oceans, seas, lakes and rivers on the globe.",
  variants: [
    { id: "all", label: "Everything" },
    { id: "seas", label: "Oceans & seas" },
    { id: "lake", label: "Lakes" },
    { id: "river", label: "Rivers" },
  ],
  async init() {
    const [world, w] = await Promise.all([D.world(), D.water()]);
    Object.assign(this, { world, w });
    const f = (fn) => D.deck(w.list.filter(fn));
    this.decks = { all: f(() => true), seas: f((x) => x.t === "ocean" || x.t === "sea"), lake: f((x) => x.t === "lake"), river: f((x) => x.t === "river") };
    this.entities = w.list.map((x) => ({ key: x.id, names: [x.n, ...(x.alt || [])] }));
  },
  feature(x) {
    const geo = this.w.geo.get(x.id);
    return { type: "Feature", geometry: geo.geometry, properties: { kind: x.t, id: x.id } };
  },
  next(mode, variant, dir) {
    const t = this.decks[variant || "all"]();
    const same = this.w.list.filter((x) => x !== t && x.t === t.t);
    const near = same.slice().sort((a, b) => D.distKm(a.ctr, t.ctr) - D.distKm(b.ctr, t.ctr));
    let distractors = [];
    if (mode === "easy") {
      const far = same.filter((x) => t.t === "ocean" || (x.reg !== t.reg && D.distKm(x.ctr, t.ctr) > FAR_KM));
      distractors = D.sample(far.length >= 2 ? far : same, 2);
    } else if (mode === "medium") {
      const reg = t.t === "ocean" ? same : same.filter((x) => x.reg === t.reg);
      distractors = pickSimilar(reg, (x) => sizeGap(x.size, t.size), 4, 6, near);
    }
    const feature = this.feature(t);
    const small = (t.t === "lake" && t.size < 4000) || (t.t === "river" && t.size < 700);
    const r = t.t === "ocean" ? 70 : Math.min(60, Math.max(t.t === "river" || t.t === "lake" ? 5 : 9, halfDiagDeg(t.b) * 1.5));
    const base = { entities: this.entities, correct: new Set([t.id]), answer: t.n, learn: { label: `Learn about ${t.n}`, url: D.wikiFromTitle(t.wt) } };
    if (dir === "find") {
      const cands = mode === "hard" ? null : [t, ...distractors];
      const pickables = cands || [t, ...same];
      const feats = new Map(pickables.map((x) => [x.id, this.feature(x)]));
      const kind = t.t === "sea" ? "sea" : t.t;
      return {
        ...base, find: true, prompt: `Where is ${theName(t.n, t.t)}?`,
        hint: mode === "hard" ? `Spin and zoom the globe, then click the ${kind}.` : "Click one of the highlighted waters.",
        show: (v) => {
          v.useGlobe();
          v.globe.highlight({ waters: cands ? cands.map((x) => ({ feature: feats.get(x.id), color: COLORS.cand })) : [], ringAuto: false });
          if (cands) { v.globe.fit(cands.map((x) => x.ctr)); v.recenter = () => v.globe.fit(cands.map((x) => x.ctr)); }
          else { const s = [t.ctr[0] + rand(-60, 60), rand(-10, 35)]; v.globe.flyTo(s, 80); v.recenter = () => v.globe.flyTo(s, 80); }
        },
        pick: (hit, v) => {
          if (hit.kind !== "globe") return { valid: false };
          let best = null, bd = Infinity;
          for (const [id, f] of feats) {
            const d = v.globe.distToFeature(f, hit.px);
            if (d < bd) { bd = d; best = id; }
          }
          if (!best || bd > 12) return { valid: false, msg: cands ? "Click one of the highlighted waters." : `No ${kind} there — try again.` };
          if (best === t.id) return { valid: true, ok: true };
          const o = this.w.list.find((x) => x.id === best);
          return { valid: true, ok: false, label: `That's ${theName(o.n, o.t)}.`, mark: () => (cands ? v.globe.setWaterColor(best, COLORS.wrong) : v.globe.addWater(feats.get(best), COLORS.wrong)) };
        },
        reveal: (v) => {
          if (cands) v.globe.setWaterColor(t.id, COLORS.right); else v.globe.addWater(feature, COLORS.right);
          v.globe.flyTo(t.ctr, r);
        },
      };
    }
    return {
      ...base,
      prompt: TYPE_PROMPT[t.t],
      choices: mode === "hard" ? null : D.shuffle([t, ...distractors]).map((x) => ({ key: x.id, label: x.n })),
      show: (v) => { v.useGlobe(); v.globe.highlight({ water: feature, ringAt: small ? t.ctr : null, ringAuto: false }); v.globe.flyTo(t.ctr, r); v.recenter = () => v.globe.flyTo(t.ctr, r); },
      reveal: (v) => v.globe.setWaterColor(t.id, COLORS.right),
    };
  },
};
