// Statically converts React.createElement(...) flag components to SVG strings by walking the AST.
// The component code is parsed as data, never executed.
import fs from "node:fs";
import path from "node:path";
import * as acorn from "acorn";
const [dir, out] = process.argv.slice(2);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const attrName = (k) => ({ className: "class", xlinkHref: "xlink:href", xmlSpace: "xml:space", xmlnsXlink: "xmlns:xlink", gradientUnits: "gradientUnits", gradientTransform: "gradientTransform", viewBox: "viewBox", preserveAspectRatio: "preserveAspectRatio", patternUnits: "patternUnits", patternTransform: "patternTransform", clipPathUnits: "clipPathUnits", spreadMethod: "spreadMethod", markerWidth: "markerWidth" }[k] || k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()));
const isCE = (n) => n && n.type === "CallExpression" && n.callee.type === "MemberExpression" && n.callee.object.name === "React" && n.callee.property.name === "createElement";
function literal(n) {
  if (!n) return undefined;
  if (n.type === "Literal") return n.value;
  if (n.type === "TemplateLiteral" && n.expressions.length === 0) return n.quasis.map((q) => q.value.cooked).join("");
  if (n.type === "UnaryExpression" && n.operator === "-" && n.argument.type === "Literal") return -n.argument.value;
  return undefined;
}
function props(n) {
  if (!n) return {};
  if (n.type === "ObjectExpression") {
    const o = {};
    for (const p of n.properties) {
      if (p.type !== "Property") continue;
      const k = p.key.type === "Identifier" ? p.key.name : p.key.value;
      if (k === "dangerouslySetInnerHTML" && p.value.type === "ObjectExpression") {
        const h = p.value.properties.find((q) => (q.key.name || q.key.value) === "__html");
        const v = h && literal(h.value);
        if (typeof v === "string") o.__raw = v;
        continue;
      }
      const v = literal(p.value);
      if (v !== undefined) o[k] = v;
    }
    return o;
  }
  // Object.assign({...}, props) -> take literal objects only
  if (n.type === "CallExpression" && n.callee.type === "MemberExpression" && n.callee.property.name === "assign")
    return Object.assign({}, ...n.arguments.map(props));
  return {};
}
function render(n) {
  if (isCE(n)) {
    const [tagN, propsN, ...kids] = n.arguments;
    const tag = literal(tagN);
    const p = props(propsN);
    const raw = p.__raw || "";
    const attrs = Object.entries(p).filter(([k]) => !["style", "width", "height", "role", "aria-label", "__raw"].includes(k)).map(([k, v]) => ` ${attrName(k)}="${esc(v)}"`).join("");
    return `<${tag}${attrs}>${raw}${kids.map(render).join("")}</${tag}>`;
  }
  if (n.type === "ArrayExpression") return n.elements.map(render).join("");
  const v = literal(n);
  return v === undefined || v === null ? "" : esc(v);
}
let ok = 0;
for (const f of fs.readdirSync(dir).filter((f) => /^Flag[A-Z]{2}\.js$/.test(f))) {
  const ast = acorn.parse(fs.readFileSync(path.join(dir, f), "utf8"), { ecmaVersion: "latest", sourceType: "module" });
  let root = null;
  (function walk(n) { if (root || !n || typeof n !== "object") return; if (isCE(n) && literal(n.arguments[0]) === "svg") { root = n; return; } for (const k in n) if (k !== "parent") { const c = n[k]; if (Array.isArray(c)) c.forEach(walk); else if (c && typeof c.type === "string") walk(c); } })(ast);
  if (!root) { console.log("no svg in", f); continue; }
  let svg = render(root);
  if (!/xmlns="/.test(svg.slice(0, 300))) svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  if (svg.includes("xlink:") && !svg.includes("xmlns:xlink")) svg = svg.replace("<svg", '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  fs.writeFileSync(path.join(out, f.slice(4, 6) + ".svg"), svg);
  ok++;
}
console.log("converted", ok);
