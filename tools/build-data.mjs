// Builds MAPL's game data from Natural Earth (public domain) into ../data.
// Usage: node tools/build-data.mjs <path-to-raw-natural-earth-geojson-dir>
// Needs: npm i mapshaper d3-geo topojson-server topojson-simplify topojson-client (see tools/package.json)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import * as d3 from "d3-geo";
import { topology } from "topojson-server";
import { presimplify, simplify, quantile } from "topojson-simplify";
import { COUNTRIES, MERGE_INTO, CITY_ALIASES, EXTRA_CITIES, CAPITAL_NOTES } from "./curated/countries.mjs";
import { WATERWAYS } from "./curated/waterways.mjs";

const require = createRequire(import.meta.url);
const mapshaper = require("mapshaper");

const RAW = process.argv[2] || "raw";
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../data");
fs.mkdirSync(path.join(OUT, "maps"), { recursive: true });
const load = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f + ".geojson"), "utf8"));
const R_EARTH = 6371.0088;
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const warn = [];

// d3-geo wants clockwise exterior rings (opposite of RFC 7946). Flip any polygon that d3 reads as > hemisphere.
function rewindGeom(g) {
  if (!g) return g;
  const fix = (rings) => (d3.geoArea({ type: "Polygon", coordinates: rings }) > 2 * Math.PI ? rings.map((r) => r.slice().reverse()) : rings);
  if (g.type === "Polygon") g.coordinates = fix(g.coordinates);
  else if (g.type === "MultiPolygon") g.coordinates = g.coordinates.map(fix);
  return g;
}
function rewind(gj) {
  // mapshaper writes a GeometryCollection when a layer has no attributes
  const fc = gj.type === "GeometryCollection" ? { type: "FeatureCollection", features: gj.geometries.map((g) => ({ type: "Feature", geometry: g, properties: {} })) } : gj;
  for (const f of fc.features) rewindGeom(f.geometry);
  return fc;
}
async function ms(cmd, inputs) {
  const out = await mapshaper.applyCommands(cmd, inputs);
  if (out["out.json"]) out["out.json"] = JSON.stringify(rewind(JSON.parse(out["out.json"])));
  return out;
}

const GAME = new Map(COUNTRIES.map(([iso, name, continent, caps, largest, aliases]) => [iso, {
  iso, name, continent, capitals: caps.split("|"), largest: largest || null,
  aliases: aliases ? aliases.split("|") : [],
}]));
const idOf = (a3) => MERGE_INTO[a3] || a3;

// ---------- 1. World (globe) ----------
async function buildWorld() {
  const src = load("ne_50m_admin_0_countries");
  for (const f of src.features) {
    const a3 = f.properties.ADM0_A3;
    f.properties = { id: idOf(a3) };
  }
  // Small countries (island nations, microstates) come from the 10m data so every island is present
  const small10 = load("ne_10m_admin_0_countries");
  const areaKm2 = (f) => d3.geoArea({ type: "Feature", geometry: rewindGeom(JSON.parse(JSON.stringify(f.geometry))) }) * R_EARTH ** 2;
  const smallIds = new Set(small10.features.filter((f) => GAME.has(idOf(f.properties.ADM0_A3)) && areaKm2(f) < 30000).map((f) => idOf(f.properties.ADM0_A3)));
  src.features = src.features.filter((f) => !smallIds.has(f.properties.id));
  const smallFc = { type: "FeatureCollection", features: small10.features.filter((f) => smallIds.has(idOf(f.properties.ADM0_A3)))
    .map((f) => ({ type: "Feature", geometry: f.geometry, properties: { id: idOf(f.properties.ADM0_A3) } })) };
  // simplify separately: a global percentage would erase small islands
  const bigOut = await ms("-i in.json -dissolve id -simplify 30% keep-shapes -o out.json format=geojson", { "in.json": src });
  const smallOut = await ms("-i in.json -dissolve id -simplify interval=120 keep-shapes -o out.json format=geojson", { "in.json": smallFc });
  const gj = { type: "FeatureCollection", features: [...JSON.parse(bigOut["out.json"]).features, ...JSON.parse(smallOut["out.json"]).features].filter((f) => f.geometry) };
  for (const f of gj.features) f.properties = { id: f.properties.id, g: GAME.has(f.properties.id) ? 1 : 0 };
  // Big lakes to draw on the globe (cosmetic)
  const lakes = rewind(load("ne_50m_lakes"));
  lakes.features = lakes.features.filter((f) => f.properties.scalerank <= 1).map((f) => ({ type: "Feature", geometry: f.geometry, properties: {} }));
  const topo = topology({ countries: gj, lakes }, 1e6);
  fs.writeFileSync(path.join(OUT, "world.json"), JSON.stringify(topo));
  const missing = [...GAME.keys()].filter((k) => !gj.features.find((f) => f.properties.id === k));
  if (missing.length) warn.push("world: game countries missing from 50m data: " + missing.join(","));
  return gj;
}

// ---------- helpers ----------
function polygonsOf(geom) {
  if (!geom) return [];
  return geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
}
function bboxIntersects(b, box) {
  // b, box = [[w,s],[e,n]] where w > e means antimeridian crossing
  const lonOverlap = (a0, a1, b0, b1) => {
    const segs = (x0, x1) => (x0 <= x1 ? [[x0, x1]] : [[x0, 180], [-180, x1]]);
    return segs(a0, a1).some(([p, q]) => segs(b0, b1).some(([r, t]) => p <= t && r <= q));
  };
  return b[0][1] <= box[1][1] && box[0][1] <= b[1][1] && lonOverlap(b[0][0], b[1][0], box[0][0], box[1][0]);
}
function expand(b, frac) {
  const w = b[0][0], e = b[1][0];
  const width = w <= e ? e - w : e + 360 - w;
  const dx = Math.max(width * frac, 0.3), dy = Math.max((b[1][1] - b[0][1]) * frac, 0.3);
  const wrap = (x) => (x > 180 ? x - 360 : x < -180 ? x + 360 : x);
  return [[wrap(w - dx), Math.max(-89, b[0][1] - dy)], [wrap(e + dx), Math.min(89, b[1][1] + dy)]];
}
function expandAbs(b, dy, dx) {
  const wrap = (x) => (x > 180 ? x - 360 : x < -180 ? x + 360 : x);
  const w = b[0][0], e = b[1][0];
  const width = w <= e ? e - w : e + 360 - w;
  if (width + 2 * dx >= 359) return [[-180, Math.max(-89, b[0][1] - dy)], [180, Math.min(89, b[1][1] + dy)]];
  return [[wrap(w - dx), Math.max(-89, b[0][1] - dy)], [wrap(e + dx), Math.min(89, b[1][1] + dy)]];
}
// "Main" framing for a country: polygons near the largest one (keeps France to Europe, USA to the lower 48)
function framePolys(geom) {
  const polys = polygonsOf(geom).map((c) => ({ c, f: { type: "Polygon", coordinates: c } }));
  polys.forEach((p) => { p.a = d3.geoArea(p.f) * R_EARTH ** 2; p.ctr = d3.geoCentroid(p.f); });
  const total = polys.reduce((s, p) => s + p.a, 0);
  if (total < 30000) return polys.map((p) => p.c); // island nations: keep everything
  const big = polys.reduce((a, b) => (b.a > a.a ? b : a));
  return polys.filter((p) => p === big || (p.a >= big.a * 0.002 && d3.geoDistance(p.ctr, big.ctr) * R_EARTH < 2200)).map((p) => p.c);
}

// ---------- 2. Countries, cities, per-country maps ----------
async function buildCountries(world50) {
  const src10 = load("ne_10m_admin_0_countries");
  for (const f of src10.features) {
    const p = f.properties;
    f.properties = { id: idOf(p.ADM0_A3), wd: p.WIKIDATAID, pop: p.POP_EST };
  }
  // Dissolve merged units (no simplification yet: each country map is simplified at its own scale)
  const out = await ms("-i in.json -dissolve id copy-fields=wd,pop -o out.json format=geojson", { "in.json": src10 });
  const all10 = JSON.parse(out["out.json"]).features.filter((f) => f.geometry);
  all10.forEach((f) => (f.b = d3.geoBounds(f)));
  const c10 = new Map(all10.filter((f) => GAME.has(f.properties.id)).map((f) => [f.properties.id, f]));
  // Wikidata for merged units comes from the target's own record
  const wdById = {};
  for (const f of load("ne_10m_admin_0_countries").features) if (GAME.has(f.properties.ADM0_A3)) wdById[f.properties.ADM0_A3] = f.properties.WIKIDATAID;

  const places = load("ne_10m_populated_places").features.map((f) => {
    const p = f.properties;
    const a3 = { SSD: "SDS", SOL: "SOM", CYN: "CYP" }[p.ADM0_A3] || p.ADM0_A3;
    return {
      name: p.NAME, ascii: p.NAMEASCII, alt: p.NAMEALT, iso: a3, lat: p.LATITUDE, lon: p.LONGITUDE,
      pop: Math.max(p.POP_MAX || 0, p.POP2025 || 0), wd: p.WIKIDATAID, cap: /Admin-0 capital/.test(p.FEATURECLA),
    };
  });
  const rivers = load("ne_10m_rivers_lake_centerlines").features.filter((f) => f.geometry);
  const lakes = rewind(load("ne_10m_lakes")).features.filter((f) => f.geometry);
  rivers.forEach((f) => (f.b = d3.geoBounds(f)));
  lakes.forEach((f) => (f.b = d3.geoBounds(f)));

  const meta = [];
  const cities = [];
  let cityId = 0;
  for (const c of GAME.values()) {
    const f = c10.get(c.iso);
    if (!f) { warn.push("10m missing " + c.iso); continue; }
    const area = d3.geoArea(f) * R_EARTH ** 2;
    const frame = { type: "MultiPolygon", coordinates: framePolys(f.geometry) };
    const fb = d3.geoBounds(frame);
    const ctr = d3.geoCentroid(frame);

    // --- cities for this country
    let mine = places.filter((p) => p.iso === c.iso);
    for (const x of EXTRA_CITIES.filter((x) => x.iso === c.iso)) {
      if (!mine.find((p) => norm(p.name) === norm(x.name))) mine.push({ ...x, wd: null, cap: false });
    }
    const find = (name) => {
      const keys = [name, ...(CITY_ALIASES[name] || [])].map(norm);
      return mine.find((p) => keys.includes(norm(p.name))) || mine.find((p) => keys.includes(norm(p.ascii || ""))) ||
        mine.find((p) => (p.alt || "").split(/[|,;]/).map(norm).some((a) => keys.includes(a)));
    };
    const capRecs = c.capitals.map((n) => { const r = find(n); if (!r) warn.push(`capital not found: ${n} (${c.iso})`); return r && { r, n }; }).filter(Boolean);
    const lgRec = c.largest ? find(c.largest) : null;
    if (c.largest && !lgRec) warn.push(`largest not found: ${c.largest} (${c.iso})`);
    const chosen = new Map();
    const add = (r, displayName, flags) => {
      const key = r;
      const e = chosen.get(key) || { r, n: displayName || r.name, cap: 0, lg: 0, pool: 0 };
      Object.assign(e, flags);
      if (displayName) e.n = displayName;
      chosen.set(key, e);
    };
    capRecs.forEach(({ r, n }, i) => add(r, n, { cap: i === 0 ? 1 : 2, pool: 1 }));
    if (lgRec) add(lgRec, c.largest, { lg: 1, pool: 1 });
    // other cities: skip records without a Wikidata link (a few Natural Earth points are misplaced)
    const solid = mine.filter((p) => p.wd);
    solid.filter((p) => p.pop >= 1000000).forEach((p) => add(p, null, { pool: 1 }));
    solid.sort((a, b) => b.pop - a.pop).slice(0, 14).forEach((p) => add(p, null, {}));
    for (const e of chosen.values()) {
      const r = e.r;
      const ex = EXTRA_CITIES.find((x) => x.iso === c.iso && norm(x.name) === norm(e.n));
      cities.push({
        id: cityId++, n: e.n, iso: c.iso, lat: round(r.lat, 4), lon: round(r.lon, 4), pop: Math.round(r.pop || 0),
        cap: e.cap, lg: e.lg, pool: e.pool, wd: r.wd || undefined, wt: !r.wd && ex ? ex.wiki : undefined,
        alt: (CITY_ALIASES[e.n] || []).length ? CITY_ALIASES[e.n] : undefined,
      });
    }

    // --- per-country map: country shape, neighbours, rivers and lakes, simplified for this map's scale
    const diag = d3.geoDistance(fb[0], fb[1]) * R_EARTH; // km across
    const spanLon = fb[0][0] <= fb[1][0] ? fb[1][0] - fb[0][0] : fb[1][0] + 360 - fb[0][0];
    const span = Math.max(spanLon * Math.cos((ctr[1] * Math.PI) / 180), fb[1][1] - fb[0][1], 0.6);
    const pad = span * 0.6 + 0.4;
    const box = expandAbs(fb, pad, pad / Math.max(0.2, Math.cos((ctr[1] * Math.PI) / 180)));
    const rThr = diag > 2500 ? 5 : diag > 1200 ? 6 : diag > 500 ? 8 : 10;
    const lThr = diag > 2500 ? 3 : diag > 1200 ? 5 : 8;
    const interval = Math.round(Math.max(15, Math.min(4000, diag * 0.45))); // metres
    const FC = (features) => ({ type: "FeatureCollection", features });
    const strip = (f, props = {}) => ({ type: "Feature", geometry: f.geometry, properties: props });
    const layers = {
      "land.json": FC([strip(f)]),
      "others.json": FC(all10.filter((o) => o !== f && bboxIntersects(o.b, box)).map((o) => strip(o))),
      "rivers.json": FC(rivers.filter((r) => r.properties.scalerank <= rThr && bboxIntersects(r.b, box)).map((r) => strip(r))),
      "lakes.json": FC(lakes.filter((l) => l.properties.scalerank <= lThr && bboxIntersects(l.b, box)).map((l) => strip(l))),
    };
    const wraps = box[0][0] > box[1][0];
    const clip = wraps ? "" : `-clip bbox=${box[0][0]},${box[0][1]},${box[1][0]},${box[1][1]} target=others,rivers,lakes`;
    const names = Object.keys(layers).filter((k) => layers[k].features.length);
    const res = await mapshaper.applyCommands(
      `-i ${names.join(" ")} combine-files -simplify interval=${interval} keep-shapes ${clip} -o format=geojson target=*`, layers);
    const objs = {};
    for (const k of names) {
      const key = k.replace(".json", "");
      const outName = Object.keys(res).find((n) => n.startsWith(key));
      if (!outName) continue;
      const fc = rewind(JSON.parse(res[outName]));
      fc.features = fc.features.filter((x) => x.geometry).map((x) => ({ type: "Feature", geometry: x.geometry, properties: {} }));
      if (fc.features.length) objs[key] = fc;
    }
    const topo = topology(objs, 1e5);
    fs.writeFileSync(path.join(OUT, "maps", c.iso + ".json"), JSON.stringify(topo));

    meta.push({
      iso: c.iso, n: c.name, cont: c.continent, alt: c.aliases.length ? c.aliases : undefined,
      area: Math.round(area), ctr: [round(ctr[0], 2), round(ctr[1], 2)],
      fb: [[round(fb[0][0], 2), round(fb[0][1], 2)], [round(fb[1][0], 2), round(fb[1][1], 2)]],
      wd: wdById[c.iso] || f.properties.wd, note: CAPITAL_NOTES[c.iso],
    });
  }
  // neighbours (share a border or are within 600 km) for distractor fallbacks
  for (const m of meta) {
    const a = c10.get(m.iso);
    m.nb = meta.filter((o) => o !== m && d3.geoDistance(m.ctr, o.ctr) * R_EARTH < 2500)
      .sort((x, y) => d3.geoDistance(m.ctr, x.ctr) - d3.geoDistance(m.ctr, y.ctr)).slice(0, 8).map((o) => o.iso);
    void a;
  }
  fs.writeFileSync(path.join(OUT, "countries.json"), JSON.stringify(meta));
  fs.writeFileSync(path.join(OUT, "cities.json"), JSON.stringify(cities));
  return { meta, cities };
}

// ---------- 3. Waterways ----------
async function buildWater() {
  const marine = load("ne_10m_geography_marine_polys").features;
  const lakes = load("ne_10m_lakes").features;
  const rivers = load("ne_10m_rivers_lake_centerlines").features.filter((f) => f.geometry);
  rivers.forEach((f) => (f.b = d3.geoBounds(f)));
  const feats = [];
  const meta = [];
  const dup = WATERWAYS.map((w) => w.id).filter((id, i, a) => a.indexOf(id) !== i);
  if (dup.length) throw new Error("duplicate waterway ids: " + dup.join(","));
  for (const w of WATERWAYS) {
    let parts = [];
    if (w.type === "river") {
      const box = [[w.bbox[0], w.bbox[1]], [w.bbox[2], w.bbox[3]]];
      parts = rivers.filter((r) => w.ne.includes(r.properties.name) && bboxIntersects(r.b, box));
    } else {
      const pool = w.type === "lake" && w.src !== "marine" ? lakes : marine;
      parts = pool.filter((f) => w.ne.some((n) => n.toLowerCase() === (f.properties.name || "").toLowerCase()));
    }
    const got = new Set(parts.map((p) => p.properties.name.toLowerCase()));
    const miss = w.ne.filter((n) => !got.has(n.toLowerCase()));
    if (!parts.length) { warn.push(`water: nothing found for ${w.id}`); continue; }
    if (miss.length && w.type !== "river") warn.push(`water: ${w.id} missing parts ${miss.join(",")}`);
    for (const p of parts) feats.push({ type: "Feature", geometry: p.geometry, properties: { id: w.id } });
    const fc = { type: "FeatureCollection", features: parts.map((p) => ({ type: "Feature", geometry: p.geometry, properties: {} })) };
    const b = d3.geoBounds(fc);
    const ctr = d3.geoCentroid(fc);
    meta.push({ id: w.id, n: w.name, t: w.type, reg: w.region, size: w.size, wt: w.wiki, alt: w.aliases.length ? w.aliases : undefined,
      ctr: [round(ctr[0], 2), round(ctr[1], 2)], b: [[round(b[0][0], 2), round(b[0][1], 2)], [round(b[1][0], 2), round(b[1][1], 2)]] });
  }
  // dissolve parts by id with mapshaper, simplify
  const isLine = (f) => /LineString/.test(f.geometry.type);
  const polyOut = await ms("-i in.json -dissolve id -simplify 55% keep-shapes -o out.json format=geojson", { "in.json": { type: "FeatureCollection", features: feats.filter((f) => !isLine(f)) } });
  const lineOut = await ms("-i in.json -dissolve id -simplify 75% -o out.json format=geojson", { "in.json": { type: "FeatureCollection", features: feats.filter(isLine) } });
  const gj = { type: "FeatureCollection", features: [...JSON.parse(polyOut["out.json"]).features, ...JSON.parse(lineOut["out.json"]).features] };
  const topo = topology({ water: gj }, 2e5);
  fs.writeFileSync(path.join(OUT, "water.json"), JSON.stringify(topo));
  fs.writeFileSync(path.join(OUT, "waterways.json"), JSON.stringify(meta));
  return meta;
}

const world = await buildWorld();
const { meta, cities } = await buildCountries(world);
const water = await buildWater();
console.log(`countries ${meta.length}, cities ${cities.length} (pool ${cities.filter((c) => c.pool).length}), waterways ${water.length}`);
console.log(warn.length ? "WARNINGS:\n  " + warn.join("\n  ") : "no warnings");
