// Interactive orthographic globe on a <canvas>: drag to spin, wheel/pinch to zoom, fly-to animation,
// country fills, water highlights, ring markers for targets too small to see, and click picking.
export const COLORS = {
  ocean: "#cfe2ee", graticule: "rgba(70,110,140,.12)", land: "#ece6d6", border: "#a99f8b", coast: "#8f8672",
  lake: "#cfe2ee", accent: "#d9481e", outline: "#7d97a8",
  cand: "#e7b84f", wrong: "#c23b3b", right: "#2f8f4e",
};

export function createGlobe(canvas, { onClick } = {}) {
  const ctx = canvas.getContext("2d");
  const projection = d3.geoOrthographic().clipAngle(90).precision(0.4);
  const path = d3.geoPath(projection, ctx);
  const graticule = d3.geoGraticule10();
  let W = 0, H = 0, DPR = 1, base = 1, k = 1;
  let world = null;
  let small = []; // [{id, ctr}] small countries, picked by distance to their centre
  let hl = { fills: new Map(), waters: [], ringAt: null, ringCenter: null, ringAuto: true };
  let anim = null;

  function resize() {
    const r = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    base = Math.min(W, H) * 0.46;
    projection.translate([W / 2, H / 2]).scale(base * k);
    draw();
  }
  const front = () => [-projection.rotate()[0], -projection.rotate()[1]];
  const isLine = (f) => /LineString/.test(f.geometry.type);

  function draw() {
    if (!W) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const sphere = { type: "Sphere" };
    ctx.beginPath(); path(sphere); ctx.fillStyle = COLORS.ocean; ctx.fill();
    ctx.beginPath(); path(graticule); ctx.strokeStyle = COLORS.graticule; ctx.lineWidth = 0.6; ctx.stroke();
    if (!world) return;
    // seas and oceans sit under the land
    for (const w of hl.waters) if (!isLine(w.feature) && w.feature.properties.kind !== "lake") {
      ctx.beginPath(); path(w.feature); ctx.fillStyle = w.color; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    for (const f of world.countries) if (!hl.fills.has(f.properties.id)) path(f);
    ctx.fillStyle = COLORS.land; ctx.fill();
    const byColor = new Map();
    for (const [id, color] of hl.fills) { if (!byColor.has(color)) byColor.set(color, []); byColor.get(color).push(id); }
    for (const [color, ids] of byColor) {
      ctx.beginPath(); for (const id of ids) { const f = world.byId.get(id); if (f) path(f); }
      ctx.fillStyle = color; ctx.fill();
    }
    ctx.beginPath(); for (const l of world.lakes) path(l); ctx.fillStyle = COLORS.lake; ctx.fill();
    ctx.beginPath(); path(world.borders); ctx.strokeStyle = COLORS.border; ctx.lineWidth = Math.min(1.2, 0.5 + k * 0.05); ctx.stroke();
    ctx.beginPath(); path(world.coast); ctx.strokeStyle = COLORS.coast; ctx.lineWidth = 0.6; ctx.stroke();
    for (const w of hl.waters) if (!isLine(w.feature) && w.feature.properties.kind === "lake") {
      ctx.beginPath(); path(w.feature); ctx.fillStyle = w.color; ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 0.8; ctx.stroke();
    }
    for (const w of hl.waters) if (isLine(w.feature)) {
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath(); path(w.feature); ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 6; ctx.stroke();
      ctx.beginPath(); path(w.feature); ctx.strokeStyle = w.color; ctx.lineWidth = 3.2; ctx.stroke();
    }
    for (const r of ringPoints()) {
      if (d3.geoDistance(r.pt, front()) >= Math.PI / 2) continue;
      const p = projection(r.pt);
      if (!p) continue;
      for (const [rad, a] of [[14, 1], [22, 0.45]]) {
        ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 2 * Math.PI);
        ctx.globalAlpha = a; ctx.strokeStyle = r.color; ctx.lineWidth = 2.5; ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
    ctx.beginPath(); path(sphere); ctx.strokeStyle = COLORS.outline; ctx.lineWidth = 1; ctx.stroke();
  }

  // rings around filled countries that are too small to see (each island of a small island nation)
  function ringPoints() {
    if (hl.ringAt) return [{ pt: hl.ringAt, color: COLORS.accent }];
    if (!hl.ringAuto || !hl.fills.size) return [];
    const bpath = d3.geoPath(projection);
    const size = (g) => { const b = bpath.bounds(g); return isFinite(b[0][0]) ? Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1]) : 0; };
    const pts = [];
    for (const [id, color] of hl.fills) {
      const f = world.byId.get(id); if (!f) continue;
      const tiny = size(f) < 14;
      const islandNation = d3.geoArea(f) * 6371 ** 2 < 30000;
      if (!tiny && !islandNation) continue;
      const parts = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates.map((c) => ({ type: "Polygon", coordinates: c })) : [f.geometry];
      const before = pts.length;
      for (const part of parts) if (size(part) < 10) pts.push({ pt: d3.geoCentroid(part), color });
      if (tiny && pts.length === before) {
        const s = small.find((x) => x.id === id);
        pts.push({ pt: s ? s.ctr : (hl.ringCenter || d3.geoCentroid(f)), color });
      }
    }
    const out = [];
    for (const r of pts) {
      const p = projection(r.pt);
      if (p && !out.some((o) => Math.hypot(o.p[0] - p[0], o.p[1] - p[1]) < 26)) out.push({ ...r, p });
    }
    return out;
  }

  // ---- picking ----
  function lonlatAt(px) {
    const ll = projection.invert(px);
    return ll && d3.geoDistance(ll, front()) < Math.PI / 2 ? ll : null;
  }
  // Country under a screen point, with a tolerance so tiny countries can be clicked.
  function pickCountry(px, { among = null, tol = 14 } = {}) {
    if (!world) return null;
    const ok = (id) => !among || among.has(id);
    const ll = lonlatAt(px);
    if (ll) {
      const hit = world.countries.find((f) => ok(f.properties.id) && d3.geoContains(f, ll));
      if (hit) return hit.properties.id;
    }
    let best = null, bd = tol;
    for (const s of small) {
      if (!ok(s.id) || d3.geoDistance(s.ctr, front()) >= Math.PI / 2) continue;
      const p = projection(s.ctr);
      const d = p ? Math.hypot(p[0] - px[0], p[1] - px[1]) : Infinity;
      if (d < bd) { bd = d; best = s.id; }
    }
    if (best) return best;
    if (among) {
      // a near miss on a shaded candidate still counts
      for (const id of among) { const f = world.byId.get(id); if (f && distToFeature(f, px) < tol) return id; }
    }
    return null;
  }
  // Screen distance (px) from a point to a feature; 0 when inside a polygon.
  function distToFeature(f, px) {
    const ll = lonlatAt(px);
    if (ll && !isLine(f) && d3.geoContains(f, ll)) return 0;
    let best = Infinity;
    const fr = front();
    const visit = (line) => {
      let prev = null;
      for (const c of line) {
        const p = d3.geoDistance(c, fr) < Math.PI / 2 ? projection(c) : null;
        if (p && prev) best = Math.min(best, segDist(px, prev, p));
        else if (p) best = Math.min(best, Math.hypot(px[0] - p[0], px[1] - p[1]));
        prev = p;
      }
    };
    const g = f.geometry;
    if (g.type === "LineString") visit(g.coordinates);
    else if (g.type === "MultiLineString" || g.type === "Polygon") g.coordinates.forEach(visit);
    else if (g.type === "MultiPolygon") g.coordinates.forEach((p) => p.forEach(visit));
    return best;
  }
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  // ---- view control ----
  function setView(rotate, kk) {
    k = Math.max(0.9, Math.min(80, kk));
    projection.rotate(rotate).scale(base * k);
    draw();
  }
  function flyTo(center, radiusDeg = 30, ms = 1100) {
    if (anim) anim.stop();
    const r0 = projection.rotate();
    let lon = -center[0];
    while (lon - r0[0] > 180) lon -= 360;
    while (lon - r0[0] < -180) lon += 360;
    const r1 = [lon, -center[1], 0];
    const rr = Math.max(1.2, Math.min(80, radiusDeg));
    const k1 = Math.max(1, 0.82 / Math.sin(rr * Math.PI / 180));
    const k0 = k;
    const far = d3.geoDistance([-r0[0], -r0[1]], center);
    const kMid = far > 0.6 ? Math.min(k0, k1, 1) : Math.min(k0, k1);
    const ir = d3.interpolate(r0, r1);
    anim = d3.timer((t) => {
      const u = Math.min(1, t / ms);
      const e = d3.easeCubicInOut(u);
      const kz = u < 0.5 ? k0 + (kMid - k0) * d3.easeCubicOut(u * 2) : kMid + (k1 - kMid) * d3.easeCubicIn((u - 0.5) * 2);
      setView(ir(e), kz);
      if (u >= 1) { anim.stop(); anim = null; }
    });
  }
  // Fly so that all points are in view.
  function fit(points, minRadius = 8) {
    if (!points.length) return;
    let x = 0, y = 0, z = 0;
    for (const [lon, lat] of points) {
      const l = lon * Math.PI / 180, p = lat * Math.PI / 180;
      x += Math.cos(p) * Math.cos(l); y += Math.cos(p) * Math.sin(l); z += Math.sin(p);
    }
    const c = [Math.atan2(y, x) * 180 / Math.PI, Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI];
    const r = Math.max(...points.map((p) => d3.geoDistance(p, c))) * 180 / Math.PI;
    flyTo(c, Math.max(minRadius, r * 1.25 + 4));
  }
  function zoomBy(f) { if (anim) { anim.stop(); anim = null; } setView(projection.rotate(), k * f); }

  // ---- interaction ----
  const pointers = new Map();
  let moved = 0, pinch0 = null;
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (anim) { anim.stop(); anim = null; }
    moved = 0;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k }; }
    canvas.classList.add("dragging");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2 && pinch0) {
      const [a, b] = [...pointers.values()];
      setView(projection.rotate(), pinch0.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch0.d);
      moved += 10; return;
    }
    const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
    moved += Math.abs(dx) + Math.abs(dy);
    const s = 180 / Math.PI / (base * k);
    const r = projection.rotate();
    setView([r[0] + dx * s, Math.max(-90, Math.min(90, r[1] - dy * s)), r[2]], k);
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = null;
    canvas.classList.remove("dragging");
    if (e.type === "pointerup" && moved < 6 && onClick && world && pointers.size === 0) {
      const rect = canvas.getBoundingClientRect();
      const px = [e.clientX - rect.left, e.clientY - rect.top];
      const ll = lonlatAt(px);
      const hit = ll && world.countries.find((f) => d3.geoContains(f, ll));
      onClick(hit ? hit.properties.id : null, ll, px);
    }
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  new ResizeObserver(resize).observe(canvas);

  return {
    setWorld(w) { world = w; draw(); },
    setSmall(list) { small = list; },
    // fills: {id: color} or `countries` (accent); waters: [{feature, color}] or a single `water` feature (accent)
    highlight({ countries = [], fills = null, water = null, waters = null, ringAt = null, ringCenter = null, ringAuto = true } = {}) {
      const f = new Map(fills ? Object.entries(fills) : countries.map((id) => [id, COLORS.accent]));
      const ws = waters || (water ? [{ feature: water, color: COLORS.accent }] : []);
      hl = { fills: f, waters: ws, ringAt, ringCenter, ringAuto };
      draw();
    },
    setFill(id, color) { if (color) hl.fills.set(id, color); else hl.fills.delete(id); draw(); },
    setWaterColor(id, color) { for (const w of hl.waters) if (w.feature.properties.id === id) w.color = color; draw(); },
    addWater(feature, color) { hl.waters.push({ feature, color }); draw(); },
    pickCountry, distToFeature, flyTo, fit, zoomBy, resize, draw,
    project(ll) { return d3.geoDistance(ll, front()) < Math.PI / 2 ? projection(ll) : null; },
    get k() { return k; },
  };
}
