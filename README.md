# MAPL — geography games

Browser geography games that all run from one page (`index.html`).

**World**
- **Countries**: a country shaded on a spinning globe.
- **Cities**: capitals, largest cities and "what city is this?", on each country's map.
- **Waterways**: oceans, seas/gulfs/bays, lakes and rivers on the globe.
- **Flags**: every country's flag.
- **Atlas**: explore the globe and open any country's map with its major cities, rivers and lakes.

**United States**
- **States**: the 50 states (optionally plus the 5 inhabited territories).
- **Capitals & cities**: state capitals, largest city (city limits), largest metro area, and "what city is this?".
- **U.S. waterways**: oceans, gulfs, bays and sounds; the Great Lakes and other lakes; major rivers.
- **National parks**: all 64 parks — which state each is in, and where it is.
- **Borders**: "Name a state that borders Missouri", "Which state borders both Utah and Nevada?".
- **State high points**: Denali to Britton Hill.
- **Postal codes**: two-letter abbreviations.
- **State flags**.

Every game can be played in two directions, or mixed:
- **Name it** — something is highlighted (or a flag is shown); say what it is.
- **Find it** — you're given a name; click it on the globe or map. A wrong click tells you what you clicked.

Every round ends with a **Learn about …** link to the Wikipedia article.

## Difficulty and scoring

| Mode | Name it | Find it | Points |
|---|---|---|---|
| Easy | 3 choices; the wrong ones are far away | 3 places highlighted, far apart | 2 on the first try, 1 on the second, 0 after two misses |
| Medium | 5 choices that are close or similar | 5 nearby or similar places highlighted | 4 → 3 → 2 → 1, 0 after four misses |
| Hard | Type the answer | Nothing highlighted: find it yourself | 5 → 4 → 3 → 2 → 1, 0 after five misses |

"Similar" means: countries on the same continent and close in area; cities in the same country (or state); waterways of the same kind in the same region and of similar size; neighbouring states.

Typed answers accept accents, capital letters and alternate names (USA, Burma, Ivory Coast, Kiev, Bombay, East Sea, Gulf of Mexico…), and small typos. A typo only counts if your guess is closer to the right answer than to any other name in the game, so "Niger" never passes for "Nigeria". Words like "Lake", "River", "Mount" and "National Park" are optional.

Clicks are forgiving: tiny countries, states and territories can be clicked from just outside their edge, and a click on nothing (open ocean, an unhighlighted place on easy/medium) doesn't cost a try. Clicking the same wrong place twice only counts once.

## Content decisions

**World**
- **Countries (197):** the 193 UN members, Vatican City and Palestine (UN observers), Taiwan and Kosovo. Somaliland is shaded as part of Somalia and Northern Cyprus as part of Cyprus. Other territories appear on the globe but aren't asked.
- **Capitals:** checked as of November 2026. Where a country has more than one capital (South Africa, Bolivia, Netherlands, Malaysia, Sri Lanka, Benin, Eswatini…), any of them is accepted. For contested capitals (Israel, Palestine), either city is accepted and a short note explains the status. Equatorial Guinea's capital is Ciudad de la Paz (moved from Malabo in January 2026). Jakarta remains Indonesia's capital until a presidential decree moves it to Nusantara.
- **Largest city:** only asked where it isn't the capital (28 countries), measured by metro area.
- **"What city is this?":** each country's capital and largest city, plus every city over 1 million people (about 610 cities).
- **Waterways (199):** the 5 oceans, 55 seas, gulfs and bays (including the Caspian), 47 lakes and 92 rivers. Sub-seas are merged into their parent sea. Full list: `tools/curated/waterways.mjs`.

**United States** (full lists in `tools/curated/us.mjs`)
- **Territories** (Puerto Rico, Guam, U.S. Virgin Islands, American Samoa, Northern Mariana Islands) are shown in insets and can be switched on for States, Capitals & cities, High points, Postal codes and State flags. Washington, D.C. is on the map but isn't asked.
- **Largest city** uses population within city limits (Charlotte, Huntsville, Charleston SC…). **Largest metro** is the metropolitan area where most of the state's residents live, so some answers cross state lines (New Jersey → New York metro, Delaware → Philadelphia, New Hampshire → Boston, Virginia → Washington, D.C.); a note explains these. Metro questions are Name-it only.
- **Gulf of America (formerly Gulf of Mexico)** in the U.S. games; either name is accepted. The world game keeps Gulf of Mexico. Alaska's high point is shown as Denali (Mount McKinley); either name is accepted.
- **National parks:** all 64, including Chiricahua (Arizona, October 2026) and the two in territories. Parks in more than one state (Yellowstone, Great Smoky Mountains, Death Valley) accept any of their states.
- **Borders** come from the map data, so water boundaries count (Michigan borders Minnesota and Illinois across the lakes). Corner-only contact (Four Corners) does not.

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
js/app.js           menu, setup, game loop, scoring, click handling, atlas
js/games.js         world games: countries, cities, waterways, flags
js/usgames.js       U.S. games
js/globe.js         canvas globe (drag, zoom, fly-to, highlights, rings, click picking)
js/cmap.js          SVG country map (cities, rivers, lakes, neighbours, labels, clickable dots)
js/usmap.js         SVG U.S. map with Alaska/Hawaii/territory insets
js/match.js         typed-answer matching with typo tolerance
js/data.js          data loading and link helpers
data/               generated data: world globe, per-country maps, cities, waterways, U.S. data, flags
vendor/             D3 v7, topojson-client (ISC), d3-composite-projections (BSD-3)
tools/              data build scripts and the curated lists
```

## Rebuilding the data

Map data: [Natural Earth](https://www.naturalearthdata.com/) (public domain). Country flags: [flag-icons](https://github.com/lipis/flag-icons) (MIT). State flags: the `us-state-flags` npm package (ISC), converted to plain SVG by parsing its source (`tools/flags-ast.mjs`) rather than running it.

```bash
cd tools
npm install
npm run fetch   # downloads Natural Earth GeoJSON into tools/raw
npm run flags   # converts the state flags into tools/raw/state-flags
npm run build   # writes ../data
```
