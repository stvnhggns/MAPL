// Country detail map (SVG): the country with its neighbours, major rivers and lakes, and city dots.
// Labels can be hidden (during a question), shown for the target only, or shown for all major cities.
export function createCountryMap(svgEl) {
  const svg = d3.select(svgEl);
  let state = null;
  let zoom = null;
  let transform = d3.zoomIdentity;

  function render({ meta, map, world, cities = [], targetId = null, labels = "none", extraPoints = [] }) {
    state = { meta, map, world, cities, targetId, labels, extraPoints };
    transform = d3.zoomIdentity;
    draw();
  }

  function draw() {
    if (!state) return;
    const { meta, map, world, cities, targetId, labels, extraPoints } = state;
    const r = svgEl.getBoundingClientRect();
    const W = Math.max(1, r.width), H = Math.max(1, r.height);
    svg.attr("viewBox", `0 0 ${W} ${H}`).selectAll("*").remove();

    const projection = d3.geoAzimuthalEqualArea().rotate([-meta.ctr[0], -meta.ctr[1]]).clipAngle(100).precision(0.2);
    const fitPts = framePoints(meta.fb).concat(extraPoints);
    const pad = Math.min(W, H) * 0.08;
    projection.fitExtent([[pad, pad], [W - pad, H - pad]], { type: "MultiPoint", coordinates: fitPts });
    // never zoom in past ~5 km per pixel... except tiny countries which need it
    const path = d3.geoPath(projection);
    projection.clipExtent([[-50, -50], [W + 50, H + 50]]);

    svg.append("rect").attr("class", "cmap-ocean").attr("width", W).attr("height", H);
    const g = svg.append("g").attr("class", "content");
    // neighbours: detailed shapes shipped with the map, falling back to the globe data
    const others = map.others.length ? map.others : world.countries.filter((f) => f.properties.id !== meta.iso);
    g.append("path").attr("class", "cmap-other").attr("d", path({ type: "FeatureCollection", features: others }));
    g.append("path").attr("class", "cmap-land").attr("d", path(map.land));
    if (map.lakes.length) g.append("path").attr("class", "cmap-lake").attr("d", path({ type: "FeatureCollection", features: map.lakes }));
    if (map.rivers.length) g.append("path").attr("class", "cmap-river").attr("d", path({ type: "FeatureCollection", features: map.rivers }));

    const dots = svg.append("g").attr("class", "dots");
    const lbl = svg.append("g").attr("class", "labels");
    const placed = cities.map((c) => ({ c, p: projection([c.lon, c.lat]) })).filter((d) => d.p);
    const target = placed.find((d) => d.c.id === targetId);

    function layout(t) {
      dots.selectAll("*").remove();
      lbl.selectAll("*").remove();
      const pt = (d) => t.apply(d.p);
      for (const d of placed) {
        if (d === target) continue;
        const [x, y] = pt(d);
        dots.append("circle").attr("class", "cmap-city" + (d.c.cap ? " cap" : "")).attr("cx", x).attr("cy", y).attr("r", d.c.cap ? 4.2 : 3.2);
        if (d.c.cap) dots.append("circle").attr("cx", x).attr("cy", y).attr("r", 1.6).attr("fill", "#fff");
      }
      if (target) {
        const [x, y] = pt(target);
        dots.append("circle").attr("class", "cmap-ring").attr("cx", x).attr("cy", y).attr("r", 16);
        dots.append("circle").attr("class", "cmap-target").attr("cx", x).attr("cy", y).attr("r", 7);
      }
      // labels with greedy collision avoidance
      const boxes = [];
      const want = labels === "all" ? placed.slice().sort((a, b) => (b === target) - (a === target) || (b.c.cap > 0) - (a.c.cap > 0) || b.c.pop - a.c.pop)
        : labels === "target" && target ? [target] : [];
      let count = 0;
      for (const d of want) {
        if (count >= 18 && d !== target) break;
        const [x, y] = pt(d);
        if (x < 0 || y < 0 || x > W || y > H) continue;
        const isT = d === target;
        const fs = isT ? 15 : 12;
        const w = d.c.n.length * fs * 0.56 + 4, h = fs + 2;
        const cands = [[x + 8, y + 4], [x - 8 - w, y + 4], [x - w / 2, y - 10], [x - w / 2, y + 18]];
        let spot = null;
        for (const [lx, ly] of cands) {
          const b = [lx, ly - h + 2, lx + w, ly + 2];
          if (b[0] < 2 || b[2] > W - 2 || b[1] < 2 || b[3] > H - 2) continue;
          if (!boxes.some((o) => !(b[2] < o[0] || b[0] > o[2] || b[3] < o[1] || b[1] > o[3]))) { spot = [lx, ly, b]; break; }
        }
        if (!spot && isT) spot = [x + 10, y + 5, [x + 10, y - 10, x + 10 + w, y + 7]];
        if (!spot) continue;
        boxes.push(spot[2]);
        lbl.append("text").attr("class", "cmap-label" + (d.c.cap ? " cap" : "") + (isT ? " target" : "")).attr("x", spot[0]).attr("y", spot[1]).text(d.c.n);
        count++;
      }
    }

    zoom = d3.zoom().scaleExtent([1, 24]).on("zoom", (e) => {
      transform = e.transform;
      g.attr("transform", transform);
      g.selectAll("path").attr("vector-effect", "non-scaling-stroke");
      layout(transform);
    });
    svg.call(zoom).on("dblclick.zoom", null);
    svg.call(zoom.transform, transform);
    layout(transform);
  }

  function framePoints(fb) {
    let [[w, s], [e, n]] = fb;
    let width = w <= e ? e - w : e + 360 - w;
    // tiny countries: show at least ~60 km around them for context
    const MIN = 0.6;
    if (width < MIN) { w -= (MIN - width) / 2; width = MIN; }
    if (n - s < MIN) { const m = (n + s) / 2; s = m - MIN / 2; n = m + MIN / 2; }
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      let lon = w + (width * i) / 6;
      if (lon > 180) lon -= 360;
      pts.push([lon, s], [lon, n], [lon, (s + n) / 2]);
    }
    return pts;
  }

  new ResizeObserver(() => draw()).observe(svgEl);
  return {
    render,
    zoomBy(f) { if (zoom) svg.transition().duration(250).call(zoom.scaleBy, f); },
    reset() { if (zoom) svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity); },
    setLabels(mode) { if (state) { state.labels = mode; draw(); } },
  };
}
