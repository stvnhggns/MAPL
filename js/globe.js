// Interactive orthographic globe on a <canvas>: drag to spin, wheel/pinch to zoom, fly-to animation,
// highlighting of countries or a water body, and a ring marker for targets too small to see.
const COLORS = {
  ocean: "#cfe2ee", graticule: "rgba(70,110,140,.12)", land: "#ece6d6", border: "#a99f8b", coast: "#8f8672",
  lake: "#cfe2ee", accent: "#d9481e", water: "#d9481e", outline: "#7d97a8",
};

export function createGlobe(canvas, { onClick } = {}) {
  const ctx = canvas.getContext("2d");
  const projection = d3.geoOrthographic().clipAngle(90).precision(0.4);
  const path = d3.geoPath(projection, ctx);
  const graticule = d3.geoGraticule10();
  let W = 0, H = 0, DPR = 1, base = 1, k = 1;
  let world = null;
  let hl = { countries: new Set(), water: null, ringAt: null, ringAuto: true };
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

  function draw() {
    if (!W) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const sphere = { type: "Sphere" };
    ctx.beginPath(); path(sphere); ctx.fillStyle = COLORS.ocean; ctx.fill();
    ctx.beginPath(); path(graticule); ctx.strokeStyle = COLORS.graticule; ctx.lineWidth = 0.6; ctx.stroke();
    if (!world) return;
    const w = hl.water;
    const wIsLine = w && /LineString/.test(w.geometry.type);
    if (w && !wIsLine && w.properties.kind !== "lake") { ctx.beginPath(); path(w); ctx.fillStyle = COLORS.water; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1; }
    // land
    ctx.beginPath();
    for (const f of world.countries) if (!hl.countries.has(f.properties.id)) path(f);
    ctx.fillStyle = COLORS.land; ctx.fill();
    if (hl.countries.size) {
      ctx.beginPath();
      for (const id of hl.countries) { const f = world.byId.get(id); if (f) path(f); }
      ctx.fillStyle = COLORS.accent; ctx.fill();
    }
    ctx.beginPath(); for (const l of world.lakes) path(l); ctx.fillStyle = COLORS.lake; ctx.fill();
    ctx.beginPath(); path(world.borders); ctx.strokeStyle = COLORS.border; ctx.lineWidth = Math.min(1.2, 0.5 + k * 0.05); ctx.stroke();
    ctx.beginPath(); path(world.coast); ctx.strokeStyle = COLORS.coast; ctx.lineWidth = 0.6; ctx.stroke();
    if (w && w.properties.kind === "lake") { ctx.beginPath(); path(w); ctx.fillStyle = COLORS.water; ctx.fill(); ctx.strokeStyle = "#8a2a0f"; ctx.lineWidth = 0.8; ctx.stroke(); }
    if (wIsLine) {
      ctx.beginPath(); path(w); ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 6; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
      ctx.beginPath(); path(w); ctx.strokeStyle = COLORS.water; ctx.lineWidth = 3.2; ctx.stroke();
    }
    // rings for targets too small to see (each island of a small island nation gets one)
    const front = [-projection.rotate()[0], -projection.rotate()[1]];
    for (const pt of ringPoints()) {
      if (d3.geoDistance(pt, front) >= Math.PI / 2) continue;
      const p = projection(pt);
      if (!p) continue;
      for (const [r, a] of [[14, 1], [22, 0.45]]) {
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(217,72,30,${a})`; ctx.lineWidth = 2.5; ctx.stroke();
      }
    }
    ctx.beginPath(); path(sphere); ctx.strokeStyle = COLORS.outline; ctx.lineWidth = 1; ctx.stroke();
  }

  function ringPoints() {
    if (hl.ringAt) return [hl.ringAt];
    if (!hl.ringAuto || !hl.countries.size) return [];
    const bpath = d3.geoPath(projection);
    const size = (g) => { const b = bpath.bounds(g); return isFinite(b[0][0]) ? Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1]) : 0; };
    const pts = [];
    for (const id of hl.countries) {
      const f = world.byId.get(id); if (!f) continue;
      const tiny = size(f) < 14;
      const islandNation = d3.geoArea(f) * 6371 ** 2 < 30000;
      if (!tiny && !islandNation) continue;
      const parts = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates.map((c) => ({ type: "Polygon", coordinates: c })) : [f.geometry];
      for (const part of parts) if (size(part) < 10) pts.push(d3.geoCentroid(part));
      if (tiny && !pts.length && hl.ringCenter) pts.push(hl.ringCenter);
    }
    // merge rings that would overlap on screen
    const out = [];
    for (const pt of pts) {
      const p = projection(pt);
      if (!p) continue;
      if (!out.some((o) => Math.hypot(o.p[0] - p[0], o.p[1] - p[1]) < 26)) out.push({ pt, p });
    }
    return out.map((o) => o.pt);
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
    // zoom out a little in the middle of long flights
    const far = d3.geoDistance([-r0[0], -r0[1]], center);
    const kMid = Math.min(k0, k1, far > 0.6 ? 1 : Math.min(k0, k1));
    const ir = d3.interpolate(r0, r1);
    anim = d3.timer((t) => {
      const u = Math.min(1, t / ms);
      const e = d3.easeCubicInOut(u);
      const kz = u < 0.5 ? k0 + (kMid - k0) * d3.easeCubicOut(u * 2) : kMid + (k1 - kMid) * d3.easeCubicIn((u - 0.5) * 2);
      setView(ir(e), kz);
      if (u >= 1) { anim.stop(); anim = null; }
    });
  }
  function zoomBy(f) { if (anim) { anim.stop(); anim = null; } setView(projection.rotate(), k * f); }

  // ---- interaction ----
  const pointers = new Map();
  let downAt = null, moved = 0, pinch0 = null;
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (anim) { anim.stop(); anim = null; }
    downAt = [e.clientX, e.clientY]; moved = 0;
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
      const ll = projection.invert([e.clientX - rect.left, e.clientY - rect.top]);
      if (ll && d3.geoDistance(ll, [-projection.rotate()[0], -projection.rotate()[1]]) < Math.PI / 2) {
        const hit = world.countries.find((f) => d3.geoContains(f, ll));
        onClick(hit ? hit.properties.id : null, ll);
      }
    }
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  new ResizeObserver(resize).observe(canvas);

  return {
    setWorld(w) { world = w; draw(); },
    highlight({ countries = [], water = null, ringAt = null, ringCenter = null, ringAuto = true } = {}) {
      hl = { countries: new Set(countries), water, ringAt, ringCenter, ringAuto };
      draw();
    },
    flyTo, zoomBy, resize, draw,
    get k() { return k; },
  };
}
