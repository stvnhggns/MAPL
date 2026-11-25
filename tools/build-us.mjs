// Builds MAPL's United States data (states, territories, cities, parks, waterways) and copies flags.
// Usage: node tools/build-us.mjs <raw dir> [<state flag svg dir>] [<flag-icons 4x3 dir>]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import * as d3 from "d3-geo";
import { topology } from "topojson-server";
import { neighbors } from "topojson-client";
import { STATES, STATE_ALIASES, METRO_NOTES, US_EXTRA_CITIES, PARKS, PARK_ALIASES, US_WATER } from "./curated/us.mjs";
import { CITY_ALIASES } from "./curated/countries.mjs";

const require = createRequire(import.meta.url);
const mapshaper = require("mapshaper");
const [RAW = "raw", STATE_FLAGS, COUNTRY_FLAGS] = process.argv.slice(2);
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../data");
const load = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f + ".geojson"), "utf8"));
const R = 6371.0088;
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\bsaint\b/g, "st").replace(/[^a-z0-9]+/g, " ").trim();
const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const warn = [];

function rewindGeom(g) {
  const fix = (rings) => (d3.geoArea({ type: "Polygon", coordinates: rings }) > 2 * Math.PI ? rings.map((r) => r.slice().reverse()) : rings);
  if (g && g.type === "Polygon") g.coordinates = fix(g.coordinates);
  else if (g && g.type === "MultiPolygon") g.coordinates = g.coordinates.map(fix);
  return g;
}
function toFC(text) {
  const gj = JSON.parse(text);
  const fc = gj.type === "GeometryCollection" ? { type: "FeatureCollection", features: gj.geometries.map((g) => ({ type: "Feature", geometry: g, properties: {} })) } : gj;
  fc.features.forEach((f) => rewindGeom(f.geometry));
  return fc;
}
async function ms(cmd, input) {
  const out = await mapshaper.applyCommands(cmd, { "in.json": input });
  return toFC(out["out.json"]);
}
const bboxHit = (b, box) => !box || (b[0][1] <= box[3] && box[1] <= b[1][1] && b[0][0] <= box[2] && box[0] <= b[1][0]);
const bboxIn = (b, box) => b[0][0] >= box[0] && b[0][1] >= box[1] && b[1][0] <= box[2] && b[1][1] <= box[3];

// ---------------- states + territories ----------------
const TERR = { PRI: "PR", GUM: "GU", VIR: "VI", ASM: "AS", MNP: "MP" };
const admin1 = load("ne_10m_admin_1_states_provinces").features.filter((f) => f.properties.adm0_a3 === "USA");
const wd = {};
const stateFeats = admin1.map((f) => { wd[f.properties.postal] = f.properties.wikidataid; return { type: "Feature", geometry: f.geometry, properties: { id: f.properties.postal } }; });
const admin0 = load("ne_10m_admin_0_countries").features;
for (const f of admin0) if (TERR[f.properties.ADM0_A3]) { wd[TERR[f.properties.ADM0_A3]] = f.properties.WIKIDATAID; stateFeats.push({ type: "Feature", geometry: f.geometry, properties: { id: TERR[f.properties.ADM0_A3] } }); }
const statesFC = await ms("-i in.json -simplify interval=700 keep-shapes -o out.json format=geojson", { type: "FeatureCollection", features: stateFeats });
const byPostal = new Map(statesFC.features.map((f) => [f.properties.id, f]));
for (const s of STATES) if (!byPostal.has(s[0])) warn.push("missing state shape " + s[0]);

// ---------------- water ----------------
const src = {
  marine: load("ne_10m_geography_marine_polys").features,
  lakes: [...load("ne_10m_lakes").features, ...load("ne_10m_lakes_north_america").features],
  na: [...load("ne_10m_lakes_north_america").features, ...load("ne_10m_lakes").features],
  rivers: [...load("ne_10m_rivers_north_america").features, ...load("ne_10m_rivers_lake_centerlines").features].filter((f) => f.geometry),
};
for (const list of Object.values(src)) for (const f of list) if (f.geometry) { rewindGeom(f.geometry); f.b = d3.geoBounds(f); }
const waterParts = [];
const waterMeta = [];
for (const w of US_WATER) {
  const pool = src[w.src];
  let parts = pool.filter((f) => f.geometry && w.ne.some((n) => n.toLowerCase() === (f.properties.name || "").toLowerCase())
    && (w.within ? bboxIn(f.b, w.bbox) : bboxHit(f.b, w.bbox)) && !(w.exclude && bboxIn(f.b, w.exclude)));
  // the same lake can be in two files; keep the first copy of identical names when polygons
  if (w.type !== "river") {
    const seen = new Set();
    parts = parts.filter((p) => { const k = p.properties.name + Math.round(p.b[0][0] * 10); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  if (!parts.length) { warn.push("water not found: " + w.id); continue; }
  for (const p of parts) waterParts.push({ type: "Feature", geometry: p.geometry, properties: { id: w.id } });
  const fc = { type: "FeatureCollection", features: parts.map((p) => ({ type: "Feature", geometry: p.geometry, properties: {} })) };
  const b = d3.geoBounds(fc), c = d3.geoCentroid(fc);
  waterMeta.push({ id: w.id, n: w.name, t: w.type, size: w.size, wt: w.wiki, alt: w.aliases.length ? w.aliases : undefined,
    ctr: [round(c[0], 2), round(c[1], 2)], b: [[round(b[0][0], 2), round(b[0][1], 2)], [round(b[1][0], 2), round(b[1][1], 2)]] });
}
const isLine = (f) => /LineString/.test(f.geometry.type);
const wPoly = await ms("-i in.json -dissolve id -simplify interval=600 keep-shapes -o out.json format=geojson", { type: "FeatureCollection", features: waterParts.filter((f) => !isLine(f)) });
const wLine = await ms("-i in.json -dissolve id -simplify interval=500 -o out.json format=geojson", { type: "FeatureCollection", features: waterParts.filter(isLine) });
// which states does each waterway touch (for "similar" distractors)
const stateOfPoint = (pt) => { for (const f of statesFC.features) if (d3.geoContains(f, pt)) return f.properties.id; return null; };

// ---------------- cities ----------------
const STATE_NAME = Object.fromEntries(STATES.map((s) => [norm(s[1]), s[0]]));
const places = load("ne_10m_populated_places").features.filter((f) => ["USA", ...Object.keys(TERR)].includes(f.properties.ADM0_A3)).map((f) => {
  const p = f.properties;
  const st = TERR[p.ADM0_A3] || STATE_NAME[norm(p.ADM1NAME)] || (norm(p.ADM1NAME) === "district of columbia" ? "DC" : null);
  return { name: p.NAME.replace(/\s+/g, " ").replace(/^Ft\. /, "Fort ").replace(/^St\. /, "St. "), st, lat: p.LATITUDE, lon: p.LONGITUDE, pop: p.POP_MAX || 0, wd: p.WIKIDATAID };
}).filter((p) => p.st);
for (const [name, lat, lon, wiki] of US_EXTRA_CITIES) {
  const st = stateOfPoint([lon, lat]) || (name === "Saipan" ? "MP" : name === "Pago Pago" || name === "Tafuna" ? "AS" : name === "Charlotte Amalie" ? "VI" : name === "Hagåtña" || name === "Dededo" ? "GU" : null);
  if (!st) { warn.push("no state for extra city " + name); continue; }
  if (!places.find((p) => p.st === st && norm(p.name) === norm(name))) places.push({ name, st, lat, lon, pop: 0, wd: null, wt: wiki });
}
const US_CITY_ALIASES = { "Saint Paul": ["St. Paul", "St Paul"], "New York City": ["New York", "NYC"], "Washington, D.C.": ["Washington", "Washington DC", "DC"],
  "St. Louis": ["Saint Louis"], "Hagåtña": ["Hagatna", "Agana"], "Honolulu": ["Urban Honolulu"], "Fort Worth": ["Ft. Worth"], "Boise": ["Boise City"],
  "Las Vegas": ["Vegas"], "Los Angeles": ["LA", "L.A."], "San Francisco": ["SF"], "Oklahoma City": ["OKC"], "Salt Lake City": ["Salt Lake"], "Kansas City": ["KC"] };
const findCity = (st, name) => {
  const keys = [name, ...(US_CITY_ALIASES[name] || []), ...(CITY_ALIASES[name] || [])].map(norm);
  return places.find((p) => p.st === st && keys.includes(norm(p.name)));
};
const cities = [];
const cityIdx = new Map();
const addCity = (p, displayName, flags = {}) => {
  let c = cityIdx.get(p);
  if (!c) {
    c = { id: cities.length, n: displayName || p.name, st: p.st, lat: round(p.lat), lon: round(p.lon), pop: Math.round(p.pop), wd: p.wd || undefined, wt: p.wt || undefined, pool: 0 };
    cities.push(c); cityIdx.set(p, c);
  }
  if (displayName) c.n = displayName;
  Object.assign(c, flags);
  const al = [...(US_CITY_ALIASES[c.n] || []), ...(CITY_ALIASES[c.n] || [])];
  if (norm(p.name) !== norm(c.n)) al.push(p.name);
  if (al.length) c.alt = [...new Set(al)];
  return c;
};
const states = [];
for (const s of STATES) {
  const [postal, name, capital, largest, metro, metroAns, metroCity, hp, hpAlt, ft, hlat, hlon, terr] = s;
  const capP = findCity(postal, capital); if (!capP) warn.push(`capital not found ${capital} ${postal}`);
  const lgP = findCity(postal, largest); if (!lgP) warn.push(`largest not found ${largest} ${postal}`);
  // the metro's highlighted city may be in another state (Boston for NH)
  const mP = findCity(postal, metroCity) || places.find((p) => norm(p.name) === norm(metroCity) && p.pop > 0) || findCity(postal, metroCity.replace(/^St\. /, "Saint "));
  if (!mP) warn.push(`metro city not found ${metroCity} ${postal}`);
  const cap = capP && addCity(capP, capital, { cap: 1, pool: 1 });
  const lg = lgP && addCity(lgP, largest, { lg: 1, pool: 1 });
  const mc = mP && addCity(mP, mP.st === postal ? metroCity : null, { pool: 1 });
  const f = byPostal.get(postal);
  const ctr = f ? d3.geoCentroid(f) : [hlon, hlat];
  const b = f ? d3.geoBounds(f) : [[hlon - 1, hlat - 1], [hlon + 1, hlat + 1]];
  states.push({
    id: postal, n: name, terr: terr ? 1 : undefined, alt: STATE_ALIASES[postal]?.length ? STATE_ALIASES[postal] : undefined,
    cap: cap?.id, lg: lg?.id, metro: { n: metro, ans: metroAns.split("|"), city: mc?.id }, metroNote: METRO_NOTES[postal],
    hp: { n: hp, alt: hpAlt ? hpAlt.split("|") : undefined, ft, lat: hlat, lon: hlon }, wd: wd[postal],
    area: f ? Math.round(d3.geoArea(f) * R * R) : 0, ctr: [round(ctr[0], 2), round(ctr[1], 2)],
    b: [[round(b[0][0], 2), round(b[0][1], 2)], [round(b[1][0], 2), round(b[1][1], 2)]],
  });
}
// major cities: everything with a metro-level population of 500k+, plus a few dots per state for context
for (const p of places.filter((p) => p.pop >= 500000 && p.st !== "DC")) addCity(p, null, { pool: 1 });
const DC = places.find((p) => p.st === "DC"); if (DC) addCity(DC, "Washington, D.C.", { dc: 1 });
for (const s of STATES) places.filter((p) => p.st === s[0] && p.wd).sort((a, b) => b.pop - a.pop).slice(0, 6).forEach((p) => addCity(p));

// ---------------- parks ----------------
const parks = PARKS.map(([n, sts, lat, lon, wiki], i) => ({ id: i, n, st: sts.split("|"), lat, lon, wt: wiki, alt: PARK_ALIASES[n] }));
if (parks.length !== 64) warn.push("expected 64 parks, got " + parks.length);
for (const p of parks) { const s = stateOfPoint([p.lon, p.lat]); if (s && !p.st.includes(s)) warn.push(`park ${p.n} point lies in ${s}, listed ${p.st}`); if (!s) warn.push(`park ${p.n} point not inside a state (offshore?)`); }
// high points should sit in their state
for (const s of states) { const at = stateOfPoint([s.hp.lon, s.hp.lat]); if (at !== s.id) warn.push(`high point ${s.hp.n} lies in ${at}, not ${s.id}`); }

// ---------------- neighbours ----------------
const topo = topology({ states: statesFC, water: { type: "FeatureCollection", features: [...wPoly.features, ...wLine.features] } }, 1e6);
const geoms = topo.objects.states.geometries;
const nb = neighbors(geoms);
for (const s of states) {
  const i = geoms.findIndex((g) => g.properties.id === s.id);
  s.nb = i < 0 ? [] : nb[i].map((j) => geoms[j].properties.id).filter((id) => id !== "DC");
}
// waterway → states touched (sampled), for medium distractors
for (const w of waterMeta) {
  const f = [...wPoly.features, ...wLine.features].find((x) => x.properties.id === w.id);
  const pts = [];
  const walk = (c) => (typeof c[0] === "number" ? pts.push(c) : c.forEach(walk));
  walk(f.geometry.coordinates);
  const st = new Set();
  for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 40))) { const s = stateOfPoint(pts[i]); if (s) st.add(s); }
  w.st = [...st];
}

fs.writeFileSync(path.join(OUT, "us.json"), JSON.stringify(topo));
fs.writeFileSync(path.join(OUT, "us-meta.json"), JSON.stringify({ states, cities, parks, water: waterMeta }));

// ---------------- flags ----------------
if (STATE_FLAGS) {
  fs.mkdirSync(path.join(OUT, "flags/us"), { recursive: true });
  for (const s of STATES) {
    const f = path.join(STATE_FLAGS, s[0] + ".svg");
    if (fs.existsSync(f)) fs.copyFileSync(f, path.join(OUT, "flags/us", s[0] + ".svg")); else warn.push("no flag for " + s[0]);
  }
}
if (COUNTRY_FLAGS) {
  fs.mkdirSync(path.join(OUT, "flags/world"), { recursive: true });
  const countries = JSON.parse(fs.readFileSync(path.join(OUT, "countries.json"), "utf8"));
  const iso2 = {};
  for (const f of admin0) iso2[f.properties.ADM0_A3] = (f.properties.ISO_A2_EH || f.properties.ISO_A2 || "").toLowerCase();
  Object.assign(iso2, { KOS: "xk", SDS: "ss", PSX: "ps", FRA: "fr", NOR: "no" });
  for (const c of countries) {
    const f = path.join(COUNTRY_FLAGS, iso2[c.iso] + ".svg");
    if (iso2[c.iso] && fs.existsSync(f)) fs.copyFileSync(f, path.join(OUT, "flags/world", c.iso + ".svg")); else warn.push("no flag for " + c.iso);
  }
}
const pool = cities.filter((c) => c.pool).length;
console.log(`states ${states.length}, cities ${cities.length} (pool ${pool}), parks ${parks.length}, water ${waterMeta.length}`);
console.log(warn.length ? "WARNINGS:\n  " + warn.join("\n  ") : "no warnings");
