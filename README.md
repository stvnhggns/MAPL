# MAPL — geography games

Browser geography games that all run from one page (`index.html`):

- **Countries**: a country is shaded on a spinning globe. Name it.
- **Cities**: "What is the capital of…", "What is the largest city in…", "What city is this?", or a mix. The city is highlighted on its country's map.
- **Waterways**: oceans, seas/gulfs/bays, lakes and rivers highlighted on the globe.
- **Atlas**: explore the globe and open any country's map with its major cities, rivers and lakes.

Every round ends with a **Learn about …** link to the Wikipedia article.

## Difficulty and scoring

| Mode | How you answer | Points |
|---|---|---|
| Easy | 3 choices. Wrong choices are far away (another continent or 3,000+ km). | 2 on the first try, 1 on the second, 0 after two misses |
| Medium | 5 choices. Countries: same continent, closest in area. Cities: same country. Waterways: same kind, same region, similar size. | 4 → 3 → 2 → 1, 0 after four misses |
| Hard | Type the answer | 5 → 4 → 3 → 2 → 1, 0 after five misses |

On hard mode, accents, capital letters and alternate names (USA, Burma, Ivory Coast, Kiev, Bombay, East Sea…) are all accepted, as are small typos. A typo only counts if your guess is closer to the right answer than to any other name in the game, so "Niger" never passes for "Nigeria" and "Iran" never passes for "Iraq". "Lake", "River" and "Sea" are optional.

## Content decisions

- **Countries (197):** the 193 UN members, Vatican City and Palestine (UN observers), Taiwan and Kosovo. Somaliland is shaded as part of Somalia and Northern Cyprus as part of Cyprus. Other territories (Greenland, Western Sahara, Puerto Rico…) appear on the globe but aren't asked.
- **Capitals:** checked as of November 2026. Where a country has more than one capital (South Africa, Bolivia, Netherlands, Malaysia, Sri Lanka, Benin, Eswatini…), any of them is accepted. For contested capitals (Israel, Palestine), either city is accepted and a short note explains the status. Equatorial Guinea's capital is Ciudad de la Paz (moved from Malabo in January 2026). Jakarta remains Indonesia's capital until a presidential decree moves it to Nusantara.
- **Largest city:** only asked where it isn't the capital (28 countries), measured by metro area.
- **"What city is this?":** each country's capital and largest city, plus every city over 1 million people (about 610 cities).
- **Waterways (199):** the 5 oceans, 55 seas, gulfs and bays (including the Caspian), 47 lakes (all over ~10,000 km² plus famous smaller ones), and 92 rivers (over ~1,500 km plus famous shorter ones such as the Thames, Seine, Tiber and Jordan). Sub-seas are merged into their parent sea (the Aegean and Adriatic count as part of the Mediterranean). The full list is in `tools/curated/waterways.mjs`.
- **Tiny countries** are drawn with rings around them (each island of a small island nation gets its own ring).

## Running it

The game loads its map data with `fetch`, so it must be served over http. Opening `index.html` directly from disk won't work.

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

On GitHub Pages: Settings → Pages → Deploy from branch → `main` / root.

## Layout

```
index.html          the single page (menu, games, atlas)
css/style.css
js/app.js           menu, game loop, scoring, atlas
js/games.js         the three games: question, distractors, answers, Wikipedia links
js/globe.js         canvas orthographic globe (drag, zoom, fly-to, highlights, rings)
js/cmap.js          SVG country map (cities, rivers, lakes, neighbours, labels)
js/match.js         typed-answer matching with typo tolerance
js/data.js          data loading and link helpers
data/               generated map data (world globe, per-country maps, cities, waterways)
vendor/             D3 v7 and topojson-client (ISC licence)
tools/              data build scripts and the curated country/waterway lists
```

## Rebuilding the data

The map data comes from [Natural Earth](https://www.naturalearthdata.com/) (public domain). To change the curated lists or refresh the data:

```bash
cd tools
npm install
npm run fetch   # downloads Natural Earth GeoJSON into tools/raw
npm run build   # writes ../data
```
