// Downloads the Natural Earth GeoJSON files the build needs into ./raw
import fs from "node:fs";
const BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/";
const FILES = ["ne_50m_admin_0_countries", "ne_10m_admin_0_countries", "ne_10m_populated_places", "ne_10m_rivers_lake_centerlines",
  "ne_10m_lakes", "ne_50m_lakes", "ne_10m_geography_marine_polys",
  "ne_10m_admin_1_states_provinces", "ne_10m_rivers_north_america", "ne_10m_lakes_north_america"];
fs.mkdirSync("raw", { recursive: true });
for (const f of FILES) {
  const res = await fetch(BASE + f + ".geojson");
  if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
  fs.writeFileSync(`raw/${f}.geojson`, Buffer.from(await res.arrayBuffer()));
  console.log("saved", f);
}
