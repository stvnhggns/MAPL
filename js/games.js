// The three games. Each round object has:
//  prompt, sub, choices [{key,label}] (easy/medium), entities [{key,names}] (hard), correct Set,
//  answer (display name), learn {label,url}, note, show(view), reveal(view)
import * as D from "./data.js";

const FAR_KM = 3000;
const halfDiagDeg = (b) => (d3.geoDistance(b[0], b[1]) * 180) / Math.PI / 2;
const sizeGap = (a, b) => Math.abs(Math.log(Math.max(a, 1) / Math.max(b, 1)));

// Pick n distractors: nearest-by-score first `pool` candidates, sampled; then fill from fallback.
function pickSimilar(cands, score, n, poolSize, fallback = []) {
  const sorted = cands.slice().sort((a, b) => score(a) - score(b));
  const out = D.sample(sorted.slice(0, Math.max(poolSize, n)), n);
  for (const f of fallback) { if (out.length >= n) break; if (!out.includes(f)) out.push(f); }
  return out.slice(0, n);
}

// ------------------------------------------------------------------ Countries
export const countriesGame = {
  id: "countries", title: "Countries",
  variants: null,
  help: {
    easy: "3 choices, far apart. 2 points first try, 1 point second try.",
    medium: "5 choices from the same continent, similar in size. 4 → 3 → 2 → 1 points.",
    hard: "Type the name (small typos are fine). 5 → 4 → 3 → 2 → 1 points.",
  },
  async init() {
    const [world, countries] = await Promise.all([D.world(), D.countries()]);
    this.world = world; this.c = countries;
    this.deal = D.deck(countries.list);
    this.entities = countries.list.map((c) => ({ key: c.iso, names: [c.n, ...(c.alt || [])] }));
  },
  next(mode) {
    const t = this.deal();
    const others = this.c.list.filter((c) => c !== t);
    let distractors = [];
    if (mode === "easy") {
      const far = others.filter((c) => c.cont !== t.cont && D.distKm(c.ctr, t.ctr) > FAR_KM);
      distractors = D.sample(far, 2);
    } else if (mode === "medium") {
      const same = others.filter((c) => c.cont === t.cont);
      const near = others.slice().sort((a, b) => D.distKm(a.ctr, t.ctr) - D.distKm(b.ctr, t.ctr));
      distractors = pickSimilar(same, (c) => sizeGap(c.area, t.area), 4, 6, near);
    }
    const r = Math.min(70, Math.max(7, halfDiagDeg(t.fb) * 1.7));
    return {
      prompt: "Which country is shaded?",
      choices: mode === "hard" ? null : D.shuffle([t, ...distractors]).map((c) => ({ key: c.iso, label: c.n })),
      entities: this.entities, correct: new Set([t.iso]), answer: t.n,
      learn: { label: `Learn about ${t.n}`, url: D.countryWiki(t) },
      show: (v) => { v.useGlobe(); v.globe.highlight({ countries: [t.iso], ringCenter: t.ctr }); v.globe.flyTo(t.ctr, r); v.recenter = () => v.globe.flyTo(t.ctr, r); },
      reveal: () => {},
    };
  },
};

// ------------------------------------------------------------------ Cities
export const citiesGame = {
  id: "cities", title: "Cities",
  variants: [
    { id: "capital", label: "Capital of…" },
    { id: "largest", label: "Largest city in…" },
    { id: "whatcity", label: "What city is this?" },
    { id: "mixed", label: "Mixed" },
  ],
  help: {
    easy: "3 choices, cities from other countries. 2 points first try, 1 point second try.",
    medium: "5 choices, cities from the same country. 4 → 3 → 2 → 1 points.",
    hard: "Type the city (small typos are fine). 5 → 4 → 3 → 2 → 1 points.",
  },
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
  next(mode, variant) {
    const v = variant === "mixed" ? D.pick(["capital", "capital", "largest", "whatcity", "whatcity"]) : variant;
    const { ci, c } = this;
    let target, country, correct, prompt, sub = "";
    if (v === "capital") {
      country = this.decks.capital();
      target = this.capOf(country.iso);
      correct = new Set(ci.byIso.get(country.iso).filter((x) => x.cap > 0).map((x) => x.id));
      prompt = `What is the capital of ${country.n}?`;
    } else if (v === "largest") {
      country = this.decks.largest();
      target = ci.byIso.get(country.iso).find((x) => x.lg);
      correct = new Set([target.id]);
      prompt = `What is the largest city in ${country.n}?`;
    } else {
      target = this.decks.whatcity();
      country = c.byIso.get(target.iso);
      correct = new Set([target.id]);
      prompt = "What city is this?";
      sub = `In ${country.n}`;
    }
    let distractors = [];
    const notCorrect = (x) => !correct.has(x.id) && !(correct.size > 1 && x.n === target.n);
    if (mode === "easy") {
      const farCountry = (iso) => { const o = c.byIso.get(iso); return o && o.cont !== country.cont && D.distKm(o.ctr, country.ctr) > FAR_KM; };
      let cands;
      if (v === "capital") cands = c.list.filter((o) => farCountry(o.iso)).map((o) => this.capOf(o.iso)).filter(Boolean);
      else if (v === "largest") cands = ci.list.filter((x) => (x.lg || (x.pool && !x.cap)) && farCountry(x.iso));
      else cands = this.pool.filter((x) => farCountry(x.iso));
      distractors = D.sample(cands, 2);
    } else if (mode === "medium") {
      const mine = ci.byIso.get(country.iso).filter(notCorrect);
      const ordered = [...mine.filter((x) => x.pool), ...mine.filter((x) => !x.pool)];
      distractors = D.sample(ordered.slice(0, 7), Math.min(4, ordered.length));
      if (distractors.length < 4) {
        // small countries: fill with the closest cities across the border
        const here = [target.lon, target.lat];
        const nearby = ci.list.filter((x) => x.iso !== country.iso && (x.pool || x.cap) && x.n !== target.n)
          .sort((a, b) => D.distKm([a.lon, a.lat], here) - D.distKm([b.lon, b.lat], here));
        for (const x of nearby) { if (distractors.length >= 4) break; if (!distractors.some((d) => d.n === x.n)) distractors.push(x); }
      }
    }
    const choices = mode === "hard" ? null : D.shuffle([target, ...distractors]).map((x) => ({ key: x.id, label: x.n }));
    const note = v === "capital" ? country.note : null;
    const cityList = ci.byIso.get(country.iso);
    let mapData = null;
    const mapP = D.countryMap(country.iso).then((m) => (mapData = m));
    const draw = (view, labels) => view.cmap.render({ meta: country, map: mapData, world: this.world, cities: cityList, targetId: target.id, labels, extraPoints: [[target.lon, target.lat]] });
    const acceptedNames = [...correct].map((id) => ci.list[id].n);
    return {
      prompt, sub,
      choices, entities: this.entities, correct,
      answer: correct.size > 1 ? acceptedNames.join(" / ") : target.n,
      learn: { label: `Learn about ${target.n}`, url: D.cityWiki(target, country.n) },
      note,
      ready: mapP,
      show: (view) => { view.useMap(); draw(view, "none"); view.recenter = () => view.cmap.reset(); },
      reveal: (view) => view.cmap.setLabels("all"),
    };
  },
};

// ------------------------------------------------------------------ Waterways
const TYPE_PROMPT = {
  ocean: "Which ocean is this?", sea: "Name this sea, gulf or bay.", lake: "Name this lake.", river: "Name this river.",
};
export const waterGame = {
  id: "water", title: "Waterways",
  variants: [
    { id: "all", label: "Everything" },
    { id: "seas", label: "Oceans & seas" },
    { id: "lake", label: "Lakes" },
    { id: "river", label: "Rivers" },
  ],
  help: {
    easy: "3 choices of the same kind, far apart. 2 points first try, 1 point second try.",
    medium: "5 choices of the same kind, same region and similar size. 4 → 3 → 2 → 1 points.",
    hard: "Type the name — \"Lake\" and \"River\" are optional, small typos are fine. 5 → 4 → 3 → 2 → 1 points.",
  },
  async init() {
    const [world, w] = await Promise.all([D.world(), D.water()]);
    Object.assign(this, { world, w });
    const f = (fn) => D.deck(w.list.filter(fn));
    this.decks = { all: f(() => true), seas: f((x) => x.t === "ocean" || x.t === "sea"), lake: f((x) => x.t === "lake"), river: f((x) => x.t === "river") };
    this.entities = w.list.map((x) => ({ key: x.id, names: [x.n, ...(x.alt || [])] }));
  },
  next(mode, variant) {
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
    const geo = this.w.geo.get(t.id);
    const feature = { type: "Feature", geometry: geo.geometry, properties: { kind: t.t } };
    const small = (t.t === "lake" && t.size < 4000) || (t.t === "river" && t.size < 700);
    const r = t.t === "ocean" ? 70 : Math.min(60, Math.max(t.t === "river" || t.t === "lake" ? 5 : 9, halfDiagDeg(t.b) * 1.5));
    return {
      prompt: TYPE_PROMPT[t.t],
      choices: mode === "hard" ? null : D.shuffle([t, ...distractors]).map((x) => ({ key: x.id, label: x.n })),
      entities: this.entities, correct: new Set([t.id]), answer: t.n,
      learn: { label: `Learn about ${t.n}`, url: D.wikiFromTitle(t.wt) },
      show: (v) => { v.useGlobe(); v.globe.highlight({ water: feature, ringAt: small ? t.ctr : null, ringAuto: false }); v.globe.flyTo(t.ctr, r); v.recenter = () => v.globe.flyTo(t.ctr, r); },
      reveal: () => {},
    };
  },
};
