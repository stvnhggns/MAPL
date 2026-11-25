// Data loading (cached) and Wikipedia link helpers.
const cache = new Map();
function getJSON(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Failed to load ${url} (${r.status})`);
      return r.json();
    }));
  }
  return cache.get(url);
}

let worldP, countriesP, citiesP, waterP;
export function world() {
  return (worldP ||= getJSON("data/world.json").then((topo) => {
    const countries = topojson.feature(topo, topo.objects.countries).features;
    const lakes = topojson.feature(topo, topo.objects.lakes).features;
    const borders = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
    const coast = topojson.mesh(topo, topo.objects.countries, (a, b) => a === b);
    const byId = new Map(countries.map((f) => [f.properties.id, f]));
    return { topo, countries, lakes, borders, coast, byId };
  }));
}
export function countries() {
  return (countriesP ||= getJSON("data/countries.json").then((list) => {
    const byIso = new Map(list.map((c) => [c.iso, c]));
    return { list, byIso };
  }));
}
export function cities() {
  return (citiesP ||= getJSON("data/cities.json").then((list) => {
    const byIso = new Map();
    for (const c of list) {
      if (!byIso.has(c.iso)) byIso.set(c.iso, []);
      byIso.get(c.iso).push(c);
    }
    for (const arr of byIso.values()) arr.sort((a, b) => b.pop - a.pop);
    return { list, byIso };
  }));
}
export function water() {
  return (waterP ||= Promise.all([getJSON("data/water.json"), getJSON("data/waterways.json")]).then(([topo, list]) => {
    const feats = topojson.feature(topo, topo.objects.water).features;
    const geo = new Map(feats.map((f) => [f.properties.id, f]));
    return { list: list.filter((w) => geo.has(w.id)), geo };
  }));
}
export function countryMap(iso) {
  return getJSON(`data/maps/${iso}.json`).then((topo) => ({
    land: topojson.feature(topo, topo.objects.land),
    others: topo.objects.others ? topojson.feature(topo, topo.objects.others).features : [],
    rivers: topo.objects.rivers ? topojson.feature(topo, topo.objects.rivers).features : [],
    lakes: topo.objects.lakes ? topojson.feature(topo, topo.objects.lakes).features : [],
  }));
}

// ---- Wikipedia links ----
export function wikiFromWikidata(qid) {
  return `https://www.wikidata.org/wiki/Special:GoToLinkedPage?site=enwiki&itemid=${encodeURIComponent(qid)}`;
}
export function wikiFromTitle(title) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}
export function wikiSearch(q) {
  return `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}&go=Go`;
}
export function countryWiki(c) {
  return c.wd ? wikiFromWikidata(c.wd) : wikiSearch(c.n);
}
export function cityWiki(city, countryName) {
  if (city.wd) return wikiFromWikidata(city.wd);
  if (city.wt) return wikiFromTitle(city.wt);
  return wikiSearch(`${city.n}, ${countryName}`);
}

// ---- small utils ----
export const R_EARTH = 6371;
export const distKm = (a, b) => d3.geoDistance(a, b) * R_EARTH;
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const sample = (arr, n) => shuffle(arr).slice(0, n);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Deck that deals every item once (shuffled) before repeating.
export function deck(items) {
  let pile = [];
  return () => {
    if (!pile.length) pile = shuffle(items);
    return pile.pop();
  };
}
