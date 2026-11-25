// United States map (SVG) with Alaska, Hawaii and the territories as insets.
// Shows states, water (bays, lakes, rivers), point markers (cities, parks, peaks) and labels,
// supports zoom/pan and clicking states, points or water.
export function createUSMap(svgEl, { onPick } = {}) {
  const svg = d3.select(svgEl);
  let data = null;   // { states: [features], water: Map(id→feature), meta, world }
  let opts = null;
  let zoom = null;
  let transform = d3.zoomIdentity;
  let projection = null;

  function load({ topo, meta, world }) {
    const states = topojson.feature(topo, topo.objects.states).features;
    const water = new Map(topojson.feature(topo, topo.objects.water).features.map((f) => [f.properties.id, f]));
    const wmeta = new Map(meta.water.map((w) => [w.id, w]));
    for (const [id, f] of water) f.properties.kind = wmeta.get(id)?.t;
    const smeta = new Map(meta.states.map((s) => [s.id, s]));
    data = { states, water, meta, world, smeta };
  }

  function render(o) {
    opts = Object.assign({ showTerr: true, fills: {}, points: [], water: {}, pick: {}, focus: null, labels: [], context: true }, o);
    transform = null;
    draw();
  }

  const isLine = (f) => /LineString/.test(f.geometry.type);

  function draw() {
    if (!data || !opts) return;
    const r = svgEl.getBoundingClientRect();
    const W = Math.max(1, r.width), H = Math.max(1, r.height);
    svg.attr("viewBox", `0 0 ${W} ${H}`).selectAll("*").remove();
    const shown = data.states.filter((f) => opts.showTerr || !data.smeta.get(f.properties.id)?.terr);
    projection = d3.geoAlbersUsaTerritories();
    projection.fitExtent([[12, 12], [W - 12, H - 12]], { type: "FeatureCollection", features: shown });
    const path = d3.geoPath(projection);
    const fills = opts.fills, wcls = opts.water, pick = opts.pick;

    svg.append("rect").attr("class", "us-ocean").attr("width", W).attr("height", H);
    const g = svg.append("g").attr("class", "content");
    // neighbouring countries for context
    g.append("path").attr("class", "us-other").attr("d", path({ type: "FeatureCollection", features: data.world.countries.filter((f) => f.properties.id !== "USA") }));
    // seas / bays (under the land), only when highlighted or pickable
    const seaPick = (id) => pick.water instanceof Set && pick.water.has(id);
    for (const [id, f] of data.water) {
      if (isLine(f) || f.properties.kind === "lake") continue;
      const cls = wcls[id];
      const pickable = seaPick(id);
      if (!cls && !pickable) continue;
      g.append("path").attr("class", "us-sea" + (cls ? " " + cls : "")).attr("d", path(f)).attr("data-id", id)
        .style("pointer-events", pickable ? "fill" : "none")
        .on("click", pickable ? (e) => { e.stopPropagation(); onPick && onPick({ kind: "water", id }); } : null);
    }
    // states
    for (const f of shown) {
      const id = f.properties.id;
      const cls = fills[id];
      const p = g.append("path").attr("class", "us-state" + (cls ? " " + cls : "") + (pick.states ? " pick" : "")).attr("d", path(f)).attr("data-id", id);
      const canPick = pick.states === true || (pick.states instanceof Set && pick.states.has(id));
      if (canPick) {
        p.on("click", (e) => { e.stopPropagation(); onPick && onPick({ kind: "state", id }); });
        const sm = data.smeta.get(id);
        if (!sm || sm.area < 16000) {
          // small states and territories get a wider click target
          g.append("path").attr("class", "us-hit").attr("d", path(f)).on("click", (e) => { e.stopPropagation(); onPick && onPick({ kind: "state", id }); });
        }
      } else p.style("pointer-events", pick.states ? "none" : null);
    }
    // lakes and rivers on top of the land
    for (const [id, f] of data.water) {
      if (!isLine(f) && f.properties.kind !== "lake") continue;
      const cls = wcls[id];
      const pickable = seaPick(id);
      if (!cls && !opts.context && !pickable) continue;
      const line = isLine(f);
      g.append("path").attr("class", (line ? "us-river" : "us-lake") + (cls ? " " + cls : "")).attr("d", path(f)).style("pointer-events", "none");
      if (pickable) {
        g.append("path").attr("class", line ? "us-hit-line" : "us-hit-poly").attr("d", path(f)).attr("data-id", id)
          .on("click", (e) => { e.stopPropagation(); onPick && onPick({ kind: "water", id }); });
      }
    }
    // frames around the Alaska, Hawaii and territory insets
    if (opts.showTerr && projection.getCompositionBorders) g.append("path").attr("class", "us-insets").attr("d", projection.getCompositionBorders());
    g.selectAll("path").attr("vector-effect", "non-scaling-stroke");
    const marks = svg.append("g").attr("class", "marks");

    function layout(t) {
      marks.selectAll("*").remove();
      // rings around highlighted states too small to see
      for (const [id, cls] of Object.entries(fills)) {
        if (!["target", "right"].includes(cls)) continue;
        const f = shown.find((x) => x.properties.id === id); if (!f) continue;
        const b = path.bounds(f);
        const sz = Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1]) * t.k;
        if (sz < 12) {
          const [x, y] = t.apply([(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2]);
          marks.append("circle").attr("class", "us-ring").attr("cx", x).attr("cy", y).attr("r", 15);
        }
      }
      for (const pt of opts.points) {
        const pp = projection([pt.lon, pt.lat]);
        if (!pp) continue;
        const [x, y] = t.apply(pp);
        const cls = `us-pt ${pt.kind || "city"} ${pt.cls || ""}`;
        if (pt.kind === "peak") {
          const s = pt.cls ? 9 : 6;
          marks.append("path").attr("class", cls).attr("d", `M${x},${y - s}L${x + s * 0.9},${y + s * 0.6}L${x - s * 0.9},${y + s * 0.6}Z`);
        } else if (pt.cls === "target") {
          marks.append("circle").attr("class", "cmap-ring").attr("cx", x).attr("cy", y).attr("r", 16);
          marks.append("circle").attr("class", cls).attr("cx", x).attr("cy", y).attr("r", 7);
        } else {
          marks.append("circle").attr("class", cls).attr("cx", x).attr("cy", y).attr("r", pt.cls ? 6 : pt.kind === "park" ? 4.5 : 3.2);
        }
        if (opts.pick.points && pt.pick !== false) {
          marks.append("circle").attr("class", "hit").attr("cx", x).attr("cy", y).attr("r", 12).attr("data-id", pt.key)
            .on("click", (e) => { e.stopPropagation(); onPick && onPick({ kind: "point", id: pt.key }); });
        }
      }
      const boxes = [];
      for (const lb of opts.labels) {
        const pp = projection([lb.lon, lb.lat]);
        if (!pp) continue;
        const [x, y] = t.apply(pp);
        const fs = lb.cls === "target" ? 15 : 12;
        const w = lb.text.length * fs * 0.56 + 4, h = fs + 2;
        const cands = [[x + 9, y + 4], [x - 9 - w, y + 4], [x - w / 2, y - 11], [x - w / 2, y + 19]];
        let spot = null;
        for (const [lx, ly] of cands) {
          const b = [lx, ly - h + 2, lx + w, ly + 2];
          if (b[0] < 2 || b[2] > W - 2 || b[1] < 2 || b[3] > H - 2) continue;
          if (!boxes.some((o) => !(b[2] < o[0] || b[0] > o[2] || b[3] < o[1] || b[1] > o[3]))) { spot = [lx, ly, b]; break; }
        }
        if (!spot && lb.cls === "target") spot = [x + 10, y + 5, [x + 10, y - 10, x + 10 + w, y + 7]];
        if (!spot) continue;
        boxes.push(spot[2]);
        marks.append("text").attr("class", "cmap-label" + (lb.cls ? " " + lb.cls : "")).attr("x", spot[0]).attr("y", spot[1]).text(lb.text);
      }
    }

    zoom = d3.zoom().scaleExtent([1, 40]).on("zoom", (e) => { transform = e.transform; g.attr("transform", transform); layout(transform); });
    svg.call(zoom).on("dblclick.zoom", null);
    if (!transform) transform = focusTransform(W, H);
    svg.call(zoom.transform, transform);
  }

  // zoom transform that frames the focus points (or the whole map)
  function focusTransform(W, H) {
    if (!opts.focus || !opts.focus.length) return d3.zoomIdentity;
    const pts = opts.focus.map((p) => projection(p)).filter(Boolean);
    if (!pts.length) return d3.zoomIdentity;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = Math.max(1, Math.min(opts.maxZoom || 12, 0.8 / Math.max((x1 - x0) / W, (y1 - y0) / H, 0.02)));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return d3.zoomIdentity.translate(W / 2 - k * cx, H / 2 - k * cy).scale(k);
  }

  new ResizeObserver(() => { if (opts) { transform = null; draw(); } }).observe(svgEl);
  return {
    load, render,
    update(patch) { if (!opts) return; Object.assign(opts, patch); draw(); },
    setFill(id, cls) { if (opts) { if (cls) opts.fills[id] = cls; else delete opts.fills[id]; draw(); } },
    setWater(id, cls) { if (opts) { if (cls) opts.water[id] = cls; else delete opts.water[id]; draw(); } },
    setPoint(key, cls) { if (opts) { const p = opts.points.find((x) => x.key === key); if (p) p.cls = cls; draw(); } },
    zoomBy(f) { if (zoom) svg.transition().duration(250).call(zoom.scaleBy, f); },
    reset() { if (zoom && opts) { const r = svgEl.getBoundingClientRect(); svg.transition().duration(300).call(zoom.transform, focusTransform(r.width, r.height)); } },
    get stateFeature() { return (id) => data && data.states.find((f) => f.properties.id === id); },
  };
}
