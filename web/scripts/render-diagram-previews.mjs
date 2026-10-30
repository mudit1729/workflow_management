// Writes the stand-in diagram previews: public/diagrams/<id>.html, one page per archify block
// of the workspace and of the sample world, and mock/diagram-previews.json (the ids that have a
// page). The shipped workspace (mock/workspace) has no issues, so the blocks come from the sample
// (mock/sample) until someone adds a diagram to the workspace; both folders are read, the shipped
// workspace first, and an id that both hold gets its page from the first.
//
// archify is not installed in this environment, so the prototype cannot render real
// diagrams. The blocks live in the markdown of the workspace (```archify <type> id=<id> in the
// goal.md and plan.md files under mock/<folder>/issues, contract 1.5); this script reads them
// from there and draws each valid one as a small self-contained page instead (layered layout,
// SVG curves, wf tokens, no external requests). The cards show the page while the DevPanel's
// "Archify available" switch is on (it starts on; off is the unavailable demo). A block with
// defects gets no page; the loader marks it invalid with the same checks.
//
// usage: node scripts/render-diagram-previews.mjs [--quiet]
//   The dev server runs it again when a workspace file with an archify block changes. It writes
//   only the files whose content differs.
//
// Page protocol (the bridge the daemon also injects into real archify pages):
//   ?embed=1            hide the page header, fit the width at full type size and scroll vertically
//                       (used inside ArchifyCard)
//   ?theme=light|dark   initial theme
//   -> parent           { type: "wf:size", h }      content height, once per frame
//   <- parent           { type: "wf:theme", theme } switch theme without a reload
//   <- parent           { type: "wf:scroll", dy }    scroll the embedded page by dy px (the card's
//                       overlay sits above the frame and forwards its wheel events with this)

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
/** The folders whose archify blocks get a preview, in the order they win an id. */
const FOLDERS = [join(WEB, "mock/workspace"), join(WEB, "mock/sample")];
const OUT = join(WEB, "public/diagrams");
const LIST = join(WEB, "mock/diagram-previews.json");
const quiet = process.argv.includes("--quiet");
const say = (line) => {
  if (!quiet) console.log(line);
};

// ---------------------------------------------------------------- styles
// Values copied from src/styles/tokens.css (light and dark).

const CSS = `
:root,[data-theme="light"]{color-scheme:light;
--wf-bg:#fff;--wf-bg-subtle:#f7f7f8;--wf-bg-muted:#efeff1;--wf-border:#e5e5e8;--wf-border-strong:#d3d3d8;
--wf-text:#18181b;--wf-text-muted:#5f5f6b;--wf-text-faint:#8e8e99;
--wf-accent:#5e6ad2;--wf-accent-subtle:#eef0fb;
--wf-hue-1:#2a78d6;--wf-hue-2:#eb6834;--wf-hue-3:#1baf7a;--wf-hue-4:#eda100;--wf-hue-5:#e87ba4;--wf-hue-6:#008300;--wf-hue-7:#6250d6;--wf-hue-8:#e34948}
[data-theme="dark"]{color-scheme:dark;
--wf-bg:#0f0f11;--wf-bg-subtle:#151517;--wf-bg-muted:#1c1c1f;--wf-border:#26262a;--wf-border-strong:#34343a;
--wf-text:#ededef;--wf-text-muted:#a1a1aa;--wf-text-faint:#6e6e78;
--wf-accent:#7c85e0;--wf-accent-subtle:#1e2040;
--wf-hue-1:#3987e5;--wf-hue-2:#d95926;--wf-hue-3:#199e70;--wf-hue-4:#c98500;--wf-hue-5:#d55181;--wf-hue-6:#008300;--wf-hue-7:#9085e9;--wf-hue-8:#e66767}
*{box-sizing:border-box}
html{background:var(--wf-bg);scrollbar-width:thin;scrollbar-color:var(--wf-border-strong) transparent}
body{margin:0;display:flex;flex-direction:column;min-height:100vh;background:var(--wf-bg);color:var(--wf-text);
font:13px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
html[data-embed]{overflow-x:hidden;overflow-y:auto;scrollbar-width:none}
html[data-embed]::-webkit-scrollbar{display:none}
header.top{display:flex;align-items:center;gap:10px;height:40px;padding:0 16px;border-bottom:1px solid var(--wf-border);background:var(--wf-bg-subtle);flex:none}
html[data-embed] header.top{display:none}
.ttl{font-size:13px;font-weight:600}
.chip{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:4px;background:var(--wf-bg-muted);color:var(--wf-text-muted);font-size:11px;font-weight:500}
.meta{color:var(--wf-text-faint);font-size:11px;font-variant-numeric:tabular-nums}
main{flex:1;display:flex;flex-direction:column;justify-content:center;min-width:0}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;padding:10px 16px 0;font-size:11px;color:var(--wf-text-muted)}
html[data-embed] .legend{padding:8px 12px 0;font-size:10.5px}
.legend:empty{display:none}
.legend i{display:inline-block;width:7px;height:7px;margin-right:5px;border-radius:50%;vertical-align:0}
#stage{display:flex;min-width:0}
#stage svg{display:block;margin:0 auto;flex:none;overflow:visible}
footer{flex:none;padding:8px 16px 10px;text-align:center;font-size:10.5px;color:var(--wf-text-faint)}
html[data-embed] footer{padding:4px 12px 8px}
html.clipped::after{content:"";position:fixed;left:0;right:0;bottom:0;height:40px;pointer-events:none;background:linear-gradient(to bottom,transparent,var(--wf-bg))}
.band rect{fill:var(--wf-bg-subtle);stroke:var(--wf-border)}
.band text{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;fill:var(--wf-text-faint)}
.edge path{fill:none;stroke:var(--wf-text-faint);stroke-width:1.25;stroke-linecap:round;transition:stroke .12s}
.edge path.fwd{marker-end:url(#ah)}
.edge path.bwd{marker-start:url(#ah)}
.edge.dash path{stroke-dasharray:4 3}
.edge text{font-size:10.5px;fill:var(--wf-text-muted);stroke:var(--wf-bg);stroke-width:4px;paint-order:stroke;stroke-linejoin:round;text-anchor:middle}
html[data-embed] .edge text{font-size:10px}
.node{cursor:default}
.node .sh{fill:var(--wf-bg);stroke:var(--wf-border-strong);stroke-width:1;transition:stroke .12s}
.node:hover .sh{stroke:var(--wf-text-faint)}
.node.k-start .sh{fill:var(--wf-accent-subtle);stroke:var(--wf-accent)}
.node.k-end .sh,.node.k-actor .sh{fill:var(--wf-bg-muted)}
.node.k-decision .sh{fill:var(--wf-bg-subtle);stroke:var(--wf-text-faint)}
.node.k-crosscut .sh{stroke-dasharray:4 3}
.node .ln{stroke:var(--wf-border-strong);stroke-width:1}
.node .t{font-size:12.5px;font-weight:500;fill:var(--wf-text);text-anchor:middle}
.node .n{font-size:10.5px;fill:var(--wf-text-faint);text-anchor:middle}
html[data-embed] .node .t{font-size:11px}
.hl .edge:not(.on){opacity:.2}
.hl .node:not(.on){opacity:.4}
.hl .edge.on path{stroke:var(--wf-accent)}
.hl .edge.on path.fwd{marker-end:url(#ah-on)}
.hl .edge.on path.bwd{marker-start:url(#ah-on)}
#ah path{fill:var(--wf-text-faint)}
#ah-on path{fill:var(--wf-accent)}
`;

// ---------------------------------------------------------------- bridge
// Runs in the page. Posts the content height, applies theme messages. Kept to about 20 lines.

function bridge() {
  var queued = false;
  function post() {
    queued = false;
    if (window.parent === window) return;
    var h = Math.ceil(document.body.getBoundingClientRect().height);
    window.parent.postMessage({ type: "wf:size", h: h }, "*");
  }
  new ResizeObserver(function () {
    if (!queued) {
      queued = true;
      requestAnimationFrame(post);
    }
  }).observe(document.documentElement);
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (d && d.type === "wf:theme" && (d.theme === "light" || d.theme === "dark")) {
      document.documentElement.setAttribute("data-theme", d.theme);
    }
    if (d && d.type === "wf:scroll" && typeof d.dy === "number" && isFinite(d.dy)) window.scrollBy(0, d.dy);
  });
}

// Runs in <head>, before first paint: theme and embed flags from the query string.
function boot() {
  var p = new URLSearchParams(location.search);
  var root = document.documentElement;
  var theme = p.get("theme");
  if (theme !== "light" && theme !== "dark") {
    theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  root.setAttribute("data-theme", theme);
  if (p.get("embed") === "1") root.setAttribute("data-embed", "");
}

// ---------------------------------------------------------------- the drawing
// Runs in the page, so it must not reference anything outside itself. It is serialized with
// Function.prototype.toString. Layered (top to bottom) layout:
//   1. cut cycles (loop-back edges are reversed and drawn dashed)
//   2. layer = longest path from the roots; roots move down next to their first target
//   3. groups become bands when their layers do not interleave, else nodes get a hue dot
//   4. long edges get invisible dummy nodes, one per layer they cross
//   5. barycenter sweeps order each layer, then isotonic placement sets the x positions
//   6. edges are cubic curves with vertical tangents; labels avoid nodes and each other

function drawDiagram(spec) {
  var doc = document;
  var EMBED = doc.documentElement.hasAttribute("data-embed");
  var NS = "http://www.w3.org/2000/svg";
  var HUE_ORDER = [7, 3, 2, 1, 4, 5, 6, 8];
  var FONT = getComputedStyle(doc.body).fontFamily;
  var S = EMBED
    ? { label: "500 11px " + FONT, edge: "400 10px " + FONT, labelLH: 14, noteLH: 0, padY: 5, minW: 80, maxW: 168, layerGap: 18, crossGap: 12, boundary: 22, bandLabel: 15, bandPad: 8, margin: 12 }
    : { label: "500 12.5px " + FONT, note: "400 10.5px " + FONT, edge: "400 10.5px " + FONT, labelLH: 16, noteLH: 13, padY: 8, minW: 104, maxW: 204, layerGap: 40, crossGap: 22, boundary: 22, bandLabel: 20, bandPad: 12, margin: 28 };

  // ---- model
  var groups = (spec.groups || []).map(function (g, i) {
    return { id: g.id, label: g.label || g.id, hue: HUE_ORDER[i % HUE_ORDER.length] };
  });
  var groupById = {};
  groups.forEach(function (g) { groupById[g.id] = g; });
  var nodes = [];
  var byId = {};
  (spec.nodes || []).forEach(function (n) {
    if (!n || !n.id || byId[n.id]) return;
    var node = { id: n.id, label: n.label || n.id, kind: n.kind || "step", note: n.note || "", group: groupById[n.group] || null, real: true, preds: [], succs: [] };
    byId[n.id] = node;
    nodes.push(node);
  });
  var edges = [];
  (spec.edges || []).forEach(function (e) {
    var a = byId[e.from];
    var b = byId[e.to];
    if (!a || !b || a === b) return;
    edges.push({ from: a, to: b, label: e.label || "", back: false, dash: a.kind === "crosscut" });
  });

  // ---- 1. cut cycles
  var outs = {};
  nodes.forEach(function (n) { outs[n.id] = []; });
  var hasIn = {};
  edges.forEach(function (e) { outs[e.from.id].push(e); hasIn[e.to.id] = true; });
  var mark = {};
  function visit(n) {
    mark[n.id] = 1;
    outs[n.id].forEach(function (e) {
      var m = mark[e.to.id] || 0;
      if (m === 1) { e.back = true; e.dash = true; } else if (m === 0) visit(e.to);
    });
    mark[n.id] = 2;
  }
  nodes.forEach(function (n) { if (!hasIn[n.id] && !mark[n.id]) visit(n); });
  nodes.forEach(function (n) { if (!mark[n.id]) visit(n); });
  var dag = edges.map(function (e) {
    return { e: e, u: e.back ? e.to : e.from, v: e.back ? e.from : e.to, ch: [] };
  });

  // ---- 2. layers
  var layer = {};
  var indeg = {};
  nodes.forEach(function (n) { layer[n.id] = 0; indeg[n.id] = 0; });
  dag.forEach(function (d) { indeg[d.v.id]++; });
  var queue = nodes.filter(function (n) { return indeg[n.id] === 0; });
  for (var qi = 0; qi < queue.length; qi++) {
    var qn = queue[qi];
    dag.forEach(function (d) {
      if (d.u !== qn) return;
      layer[d.v.id] = Math.max(layer[d.v.id], layer[qn.id] + 1);
      if (--indeg[d.v.id] === 0) queue.push(d.v);
    });
  }
  nodes.forEach(function (n) {
    var firstTarget = Infinity;
    var isRoot = true;
    dag.forEach(function (d) {
      if (d.v === n) isRoot = false;
      if (d.u === n) firstTarget = Math.min(firstTarget, layer[d.v.id]);
    });
    if (isRoot && firstTarget < Infinity) layer[n.id] = firstTarget - 1;
  });

  // ---- 3. bands or hue dots
  var bands = false;
  var tint = false;
  var used = {};
  nodes.forEach(function (n) { if (n.group) used[n.group.id] = true; });
  if (Object.keys(used).length) {
    var ext = {};
    nodes.forEach(function (n) {
      var k = n.group ? n.group.id : "~";
      var l = layer[n.id];
      ext[k] = ext[k] ? [Math.min(ext[k][0], l), Math.max(ext[k][1], l)] : [l, l];
    });
    var keys = Object.keys(ext).sort(function (a, b) { return ext[a][0] - ext[b][0] || ext[a][1] - ext[b][1]; });
    var clean = true;
    for (var ki = 1; ki < keys.length; ki++) {
      if (ext[keys[ki]][0] < ext[keys[ki - 1]][1]) clean = false;
    }
    if (clean) {
      // Pack the groups one after another so each owns a run of layers.
      var end = -1;
      var shift = {};
      keys.forEach(function (k) {
        shift[k] = end + 1 - ext[k][0];
        end = ext[k][1] + shift[k];
      });
      nodes.forEach(function (n) { layer[n.id] += shift[n.group ? n.group.id : "~"]; });
      bands = true;
    } else {
      tint = true;
    }
  }
  var base = Infinity;
  nodes.forEach(function (n) { base = Math.min(base, layer[n.id]); });
  nodes.forEach(function (n) { n.layer = layer[n.id] - base; });
  var LAYERS = nodes.reduce(function (m, n) { return Math.max(m, n.layer + 1); }, 0);
  var layers = [];
  for (var li = 0; li < LAYERS; li++) layers.push([]);
  nodes.forEach(function (n) { layers[n.layer].push(n); });

  // ---- sizes
  var ctx = doc.createElement("canvas").getContext("2d");
  function tw(text, font) { ctx.font = font; return ctx.measureText(text).width; }
  function wrap(text, maxW, font, maxLines) {
    var words = text.split(/\s+/);
    var lines = [];
    var cur = "";
    words.forEach(function (w) {
      var t = cur ? cur + " " + w : w;
      if (cur && tw(t, font) > maxW) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var last = lines[maxLines - 1];
      while (last.length > 1 && tw(last + "…", font) > maxW) last = last.slice(0, -1);
      lines[maxLines - 1] = last + "…";
    }
    return lines;
  }
  nodes.forEach(function (n) {
    var padX = n.kind === "decision" ? 28 : 14;
    var dot = tint && n.group ? 9 : 0;
    var inner = S.maxW - 2 * padX - dot;
    n.lines = wrap(n.label, inner, S.label, 2);
    n.noteLines = !EMBED && n.note ? wrap(n.note, inner, S.note, 2) : [];
    var widest = 0;
    n.lines.forEach(function (l) { widest = Math.max(widest, tw(l, S.label)); });
    n.noteLines.forEach(function (l) { widest = Math.max(widest, tw(l, S.note)); });
    n.w = Math.max(S.minW, Math.ceil(widest + 2 * padX + dot));
    n.h = Math.round(2 * S.padY + S.labelLH * n.lines.length + (n.noteLines.length ? 3 + S.noteLH * n.noteLines.length : 0));
    n.dot = dot;
    n.cs = n.w;
  });

  // ---- 4. dummy nodes for edges that cross layers
  dag.forEach(function (d) {
    d.ch.push(d.u);
    for (var l = d.u.layer + 1; l < d.v.layer; l++) {
      var dm = { real: false, layer: l, cs: 10, preds: [], succs: [] };
      layers[l].push(dm);
      d.ch.push(dm);
    }
    d.ch.push(d.v);
    for (var i = 0; i + 1 < d.ch.length; i++) {
      d.ch[i].succs.push(d.ch[i + 1]);
      d.ch[i + 1].preds.push(d.ch[i]);
    }
  });

  // ---- 5. order, then place
  function reindex() { layers.forEach(function (arr) { arr.forEach(function (n, i) { n.pos = i; }); }); }
  function mean(list, key, fallback) {
    if (!list.length) return fallback;
    var s = 0;
    list.forEach(function (m) { s += m[key]; });
    return s / list.length;
  }
  reindex();
  for (var sweep = 0; sweep < 8; sweep++) {
    for (var a = 1; a < LAYERS; a++) {
      layers[a].sort(function (p, q) { return mean(p.preds, "pos", p.pos) - mean(q.preds, "pos", q.pos) || p.pos - q.pos; });
      reindex();
    }
    for (var b = LAYERS - 2; b >= 0; b--) {
      layers[b].sort(function (p, q) { return mean(p.succs, "pos", p.pos) - mean(q.succs, "pos", q.pos) || p.pos - q.pos; });
      reindex();
    }
  }
  function sep(p, q) { return (p.cs + q.cs) / 2 + (p.real && q.real ? S.crossGap : 8); }
  function place(arr, want) {
    var off = [0];
    var i;
    for (i = 1; i < arr.length; i++) off[i] = off[i - 1] + sep(arr[i - 1], arr[i]);
    var blocks = [];
    for (i = 0; i < arr.length; i++) {
      blocks.push({ sum: want[i] - off[i], cnt: 1, start: i });
      while (blocks.length > 1) {
        var last = blocks[blocks.length - 1];
        var prev = blocks[blocks.length - 2];
        if (prev.sum / prev.cnt <= last.sum / last.cnt) break;
        prev.sum += last.sum;
        prev.cnt += last.cnt;
        blocks.pop();
      }
    }
    blocks.forEach(function (blk) {
      var q = blk.sum / blk.cnt;
      for (var k = blk.start; k < blk.start + blk.cnt; k++) arr[k].x = q + off[k];
    });
  }
  layers.forEach(function (arr) { place(arr, arr.map(function () { return 0; })); });
  for (var it = 0; it < 12; it++) {
    for (var c = 1; c < LAYERS; c++) {
      place(layers[c], layers[c].map(function (n) { return mean(n.preds, "x", n.x); }));
    }
    for (var e2 = LAYERS - 2; e2 >= 0; e2--) {
      place(layers[e2], layers[e2].map(function (n) { return mean(n.succs, "x", n.x); }));
    }
  }
  var minX = Infinity;
  var maxX = -Infinity;
  layers.forEach(function (arr) {
    arr.forEach(function (n) {
      minX = Math.min(minX, n.x - n.cs / 2);
      maxX = Math.max(maxX, n.x + n.cs / 2);
    });
  });
  var M = S.margin;
  var shiftX = M + (bands ? 10 : 0) - minX;
  layers.forEach(function (arr) { arr.forEach(function (n) { n.x += shiftX; }); });
  var W = maxX - minX + 2 * M + (bands ? 20 : 0);

  // layer positions
  function groupOfLayer(l) {
    for (var i = 0; i < layers[l].length; i++) if (layers[l][i].real) return layers[l][i].group ? layers[l][i].group.id : "~";
    return "~";
  }
  var layerTop = [];
  var layerH = [];
  var y = M + (bands ? S.bandLabel : 0);
  for (var l2 = 0; l2 < LAYERS; l2++) {
    var th = 8;
    layers[l2].forEach(function (n) { if (n.real) th = Math.max(th, n.h); });
    layerH[l2] = th;
    layerTop[l2] = y;
    layers[l2].forEach(function (n) { n.y = y + th / 2; });
    var gap = S.layerGap;
    if (bands && l2 + 1 < LAYERS && groupOfLayer(l2) !== groupOfLayer(l2 + 1)) gap += S.boundary;
    y += th + (l2 + 1 < LAYERS ? gap : 0);
  }
  var H = y + M + (bands ? 8 : 0);

  // ---- 6. edges
  var maxEdgeSpread = 14;
  nodes.forEach(function (n) { n.outs = []; n.ins = []; });
  dag.forEach(function (d) { d.u.outs.push(d); d.v.ins.push(d); });
  function spread(list, nextKey) {
    list.sort(function (p, q) { return nextKey(p) - nextKey(q); });
  }
  nodes.forEach(function (n) {
    spread(n.outs, function (d) { return d.ch[1].x; });
    spread(n.ins, function (d) { return d.ch[d.ch.length - 2].x; });
    var room = Math.max(0, n.w - (n.kind === "decision" ? 64 : 36));
    n.outs.forEach(function (d, i) {
      var step = n.outs.length > 1 ? Math.min(maxEdgeSpread, room / (n.outs.length - 1)) : 0;
      d.x0 = n.x + (i - (n.outs.length - 1) / 2) * step;
    });
    n.ins.forEach(function (d, i) {
      var step = n.ins.length > 1 ? Math.min(maxEdgeSpread, room / (n.ins.length - 1)) : 0;
      d.x1 = n.x + (i - (n.ins.length - 1) / 2) * step;
    });
  });
  var taken = [];
  nodes.forEach(function (n) { taken.push({ x0: n.x - n.w / 2 - 3, y0: n.y - n.h / 2 - 3, x1: n.x + n.w / 2 + 3, y1: n.y + n.h / 2 + 3 }); });
  function bez(s, t) {
    var u = 1 - t;
    return [
      u * u * u * s[0][0] + 3 * u * u * t * s[1][0] + 3 * u * t * t * s[2][0] + t * t * t * s[3][0],
      u * u * u * s[0][1] + 3 * u * u * t * s[1][1] + 3 * u * t * t * s[2][1] + t * t * t * s[3][1],
    ];
  }
  function overlap(r) {
    var area = 0;
    for (var i = 0; i < taken.length; i++) {
      var o = taken[i];
      var w = Math.min(r.x1, o.x1) - Math.max(r.x0, o.x0);
      var h = Math.min(r.y1, o.y1) - Math.max(r.y0, o.y0);
      if (w > 0 && h > 0) area += w * h;
    }
    return area;
  }
  dag.forEach(function (d) {
    var pts = d.ch.map(function (n, i) {
      if (!n.real) return [n.x, n.y];
      return i === 0 ? [d.x0, n.y + n.h / 2] : [d.x1, n.y - n.h / 2 - (d.e.back ? 0 : 1)];
    });
    if (d.e.back) pts[0][1] += 1;
    d.segs = [];
    for (var i = 0; i + 1 < pts.length; i++) {
      var p = pts[i];
      var q = pts[i + 1];
      var half = (q[1] - p[1]) / 2;
      d.segs.push([p, [p[0], p[1] + half], [q[0], q[1] - half], q]);
    }
    d.d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
    d.segs.forEach(function (s) {
      d.d += "C" + s[1][0].toFixed(1) + " " + s[1][1].toFixed(1) + " " + s[2][0].toFixed(1) + " " + s[2][1].toFixed(1) + " " + s[3][0].toFixed(1) + " " + s[3][1].toFixed(1);
    });
  });
  // Labels sit on the edge, nudged along it, then beside it, until the least is in the way.
  dag.forEach(function (d) {
    d.lab = null;
    if (!d.e.label) return;
    var w = tw(d.e.label, S.edge) + 6;
    var hh = 13;
    var side = w / 2 + 5;
    var tries = [];
    d.segs.forEach(function (seg, si) {
      (si === 0 ? [0.5, 0.4, 0.6, 0.3, 0.7] : [0.5, 0.3, 0.7]).forEach(function (t) { tries.push([seg, t, 0]); });
    });
    [0.5, 0.35, 0.65].forEach(function (t) {
      tries.push([d.segs[0], t, side]);
      tries.push([d.segs[0], t, -side]);
    });
    var best = null;
    for (var i = 0; i < tries.length; i++) {
      var pt = bez(tries[i][0], tries[i][1]);
      var x = pt[0] + tries[i][2];
      var r = { x0: x - w / 2, y0: pt[1] - hh / 2, x1: x + w / 2, y1: pt[1] + hh / 2 };
      var score = overlap(r);
      if (!best || score < best.score) best = { score: score, x: x, y: pt[1], r: r };
      if (score === 0) break;
    }
    taken.push(best.r);
    d.lab = [best.x, best.y];
  });

  // ---- draw
  function el(name, attrs, parent, text) {
    var node = doc.createElementNS(NS, name);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) node.setAttribute(k, attrs[k]);
    if (text !== undefined) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }
  var scale;
  if (EMBED) {
    // Fit the width and keep the type at its size: a tall diagram scrolls inside the frame (a fade
    // at the bottom edge says so) instead of shrinking until its labels cannot be read.
    scale = Math.min(1, Math.max(160, innerWidth) / W);
  } else {
    var aw = Math.max(240, innerWidth);
    var ah = Math.max(240, innerHeight - 40 - 40 - (tint ? 28 : 0));
    scale = Math.max(0.7, Math.min(1.2, aw / W, ah / H));
  }
  var svg = el("svg", { viewBox: "0 0 " + W.toFixed(0) + " " + H.toFixed(0), width: (W * scale).toFixed(0), height: (H * scale).toFixed(0), role: "img", "aria-label": spec.meta && spec.meta.title ? spec.meta.title : "Diagram" });
  var defs = el("defs", {}, svg);
  ["ah", "ah-on"].forEach(function (id) {
    var mk = el("marker", { id: id, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "8", markerHeight: "8", markerUnits: "userSpaceOnUse", orient: "auto-start-reverse" }, defs);
    el("path", { d: "M1.5 1.5L9 5L1.5 8.5z" }, mk);
  });

  if (bands) {
    var bandLayer = el("g", {}, svg);
    groups.forEach(function (g) {
      var lo = Infinity;
      var hi = -Infinity;
      nodes.forEach(function (n) { if (n.group === g) { lo = Math.min(lo, n.layer); hi = Math.max(hi, n.layer); } });
      if (lo === Infinity) return;
      var top = layerTop[lo] - S.bandLabel - S.bandPad;
      var bottom = layerTop[hi] + layerH[hi] + S.bandPad;
      var bg = el("g", { class: "band" }, bandLayer);
      el("rect", { x: 2, y: top.toFixed(1), width: (W - 4).toFixed(1), height: (bottom - top).toFixed(1), rx: 10 }, bg);
      el("circle", { cx: 16, cy: (top + 14).toFixed(1), r: 3, fill: "var(--wf-hue-" + g.hue + ")" }, bg);
      el("text", { x: 25, y: (top + 17.5).toFixed(1) }, bg, g.label);
    });
  }

  var edgeEls = [];
  var edgeLayer = el("g", {}, svg);
  dag.forEach(function (d) {
    var g = el("g", { class: "edge" + (d.e.dash ? " dash" : "") }, edgeLayer);
    el("path", { d: d.d, class: d.e.back ? "bwd" : "fwd" }, g);
    if (d.lab) el("text", { x: d.lab[0].toFixed(1), y: (d.lab[1] + 3.5).toFixed(1) }, g, d.e.label);
    d.el = g;
    edgeEls.push(g);
  });

  var nodeLayer = el("g", {}, svg);
  nodes.forEach(function (n) {
    var x0 = n.x - n.w / 2;
    var y0 = n.y - n.h / 2;
    var g = el("g", { class: "node k-" + n.kind, transform: "translate(" + x0.toFixed(1) + " " + y0.toFixed(1) + ")" }, nodeLayer);
    var tip = n.label + (n.note ? " — " + n.note : "");
    el("title", {}, g, tip);
    if (n.kind === "decision") {
      var i = 14;
      el("polygon", { class: "sh", points: [i, 0, n.w - i, 0, n.w, n.h / 2, n.w - i, n.h, i, n.h, 0, n.h / 2].join(" ") }, g);
    } else {
      var pill = n.kind === "start" || n.kind === "end" || n.kind === "actor";
      el("rect", { class: "sh", x: 0.5, y: 0.5, width: n.w - 1, height: n.h - 1, rx: pill ? Math.min(n.h / 2, 15) : 6 }, g);
      if (n.kind === "store") el("line", { class: "ln", x1: 0.5, x2: n.w - 0.5, y1: 7, y2: 7 }, g);
    }
    if (n.dot) el("circle", { cx: 11, cy: n.h / 2, r: 3, fill: "var(--wf-hue-" + n.group.hue + ")" }, g);
    var cx = n.w / 2 + n.dot / 2;
    var ty = S.padY + S.labelLH / 2 + 4.2;
    n.lines.forEach(function (line, li2) { el("text", { class: "t", x: cx.toFixed(1), y: (ty + li2 * S.labelLH).toFixed(1) }, g, line); });
    var ny = S.padY + S.labelLH * n.lines.length + 3 + S.noteLH / 2 + 3.6;
    n.noteLines.forEach(function (line, ni) { el("text", { class: "n", x: cx.toFixed(1), y: (ny + ni * S.noteLH).toFixed(1) }, g, line); });
    n.el = g;
    g.addEventListener("mouseenter", function () {
      svg.classList.add("hl");
      g.classList.add("on");
      dag.forEach(function (d) {
        if (d.u !== n && d.v !== n) return;
        d.el.classList.add("on");
        (d.u === n ? d.v : d.u).el.classList.add("on");
      });
    });
    g.addEventListener("mouseleave", function () {
      svg.classList.remove("hl");
      nodes.forEach(function (m) { m.el.classList.remove("on"); });
      edgeEls.forEach(function (m) { m.classList.remove("on"); });
    });
  });

  var stage = doc.getElementById("stage");
  stage.replaceChildren(svg);
  var legend = doc.getElementById("legend");
  legend.replaceChildren();
  if (tint) {
    groups.forEach(function (g) {
      if (!used[g.id]) return;
      var item = doc.createElement("span");
      var swatch = doc.createElement("i");
      swatch.style.background = "var(--wf-hue-" + g.hue + ")";
      item.appendChild(swatch);
      item.appendChild(doc.createTextNode(g.label));
      legend.appendChild(item);
    });
  }
  doc.getElementById("meta").textContent = nodes.length + " nodes · " + edges.length + " edges";
}

// ---------------------------------------------------------------- page

function run(spec) {
  var root = document.documentElement;
  var queued = false;
  var lastW = -1;
  // A soft fade at the bottom edge while an embedded page has more below the frame.
  function clip() {
    root.classList.toggle(
      "clipped",
      root.hasAttribute("data-embed") && root.scrollHeight > innerHeight + 2 && root.scrollTop + innerHeight < root.scrollHeight - 2
    );
  }
  function draw() {
    queued = false;
    lastW = innerWidth;
    drawDiagram(spec);
    clip();
  }
  draw();
  addEventListener("scroll", clip, { passive: true });
  addEventListener("resize", function () {
    clip();
    if (queued || innerWidth === lastW) return;
    queued = true;
    requestAnimationFrame(draw);
  });
}

/** Everything the page needs, escaped for an inline script. */
function inline(value) {
  const lineSeparators = new RegExp(`${String.fromCharCode(0x2028)}|${String.fromCharCode(0x2029)}`, "g");
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(lineSeparators, " ");
}

function page(id, type, spec) {
  const title = spec.meta?.title ?? id;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<script>(${boot.toString()})();</script>
<style>${CSS}</style>
</head>
<body>
<header class="top"><span class="ttl">${esc(title)}</span><span class="chip">${esc(type)}</span><span class="meta" id="meta"></span></header>
<main>
<div class="legend" id="legend"></div>
<div id="stage"></div>
</main>
<footer>Stand-in preview · archify is not installed here</footer>
<script>(${bridge.toString()})();</script>
<script>(${run.toString()})(${inline(spec)});
${drawDiagram.toString()}</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------- main

/** The checks `archify finalize` makes before it draws (the loader makes the same ones). */
function problems(spec) {
  if (typeof spec !== "object" || spec === null || Array.isArray(spec)) return ["$ is not an object"];
  const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];
  const edges = Array.isArray(spec.edges) ? spec.edges : [];
  const groups = new Set((Array.isArray(spec.groups) ? spec.groups : []).map((g) => g?.id));
  const ids = new Set();
  const out = [];
  nodes.forEach((n, i) => {
    if (!n.id) out.push(`nodes[${i}].id is missing`);
    else if (ids.has(n.id)) out.push(`nodes[${i}].id is a duplicate`);
    else ids.add(n.id);
    if (!n.label?.trim()) out.push(`nodes[${i}].label is missing`);
    if (n.group && !groups.has(n.group)) out.push(`nodes[${i}].group is unknown`);
  });
  const exits = new Map();
  edges.forEach((e, i) => {
    if (!ids.has(e.from)) out.push(`edges[${i}].from is unknown`);
    if (!ids.has(e.to)) out.push(`edges[${i}].to is unknown`);
    if (ids.has(e.from) && ids.has(e.to)) exits.set(e.from, (exits.get(e.from) ?? 0) + 1);
  });
  nodes.forEach((n, i) => {
    if (n.kind === "decision" && (exits.get(n.id) ?? 0) < 2) out.push(`nodes[${i}] is a decision with fewer than 2 exits`);
  });
  return out;
}

/** goal.md and plan.md files under issues/, in path order (the order the loader reads them). */
function issueFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".git") walk(full);
      } else if (entry.name === "goal.md" || entry.name === "plan.md") out.push(full);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

/** The archify fences of a markdown text: [{ type, id, body }]. */
function blocksOf(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^ {0,3}(`{3,}|~{3,})\s*archify(?:\s+(.*))?$/.exec(lines[i]);
    if (!open) continue;
    const mark = open[1];
    let close = i + 1;
    const end = new RegExp(`^ {0,3}${mark[0]}{${mark.length},}\\s*$`);
    while (close < lines.length && !end.test(lines[close])) close++;
    const words = (open[2] ?? "").split(/\s+/).filter(Boolean);
    const id = words.find((w) => w.startsWith("id="))?.slice(3);
    const type = words.find((w) => !w.startsWith("id=")) ?? "";
    if (id) out.push({ type, id, body: lines.slice(i + 1, close).join("\n") });
    i = close;
  }
  return out;
}

/** Write a file only when its content differs. Returns true when it wrote. */
function put(file, content) {
  if (existsSync(file) && readFileSync(file, "utf8") === content) return false;
  writeFileSync(file, content);
  return true;
}

mkdirSync(OUT, { recursive: true });
const written = [];
for (const folder of FOLDERS) {
  // The loader numbers a repeated id inside one workspace (`id-2`), so the count is per folder.
  const taken = new Map();
  for (const file of issueFiles(join(folder, "issues"))) {
    for (const block of blocksOf(readFileSync(file, "utf8"))) {
      // The loader keeps the first block of an id and numbers later ones (`id-2`).
      let id = block.id;
      for (let n = 2; taken.has(id); n++) id = `${block.id}-${n}`;
      taken.set(id, file);
      if (written.includes(id)) {
        say(`skipped ${id}: an earlier folder already drew it`);
        continue;
      }
      let spec;
      try {
        spec = JSON.parse(block.body);
      } catch (err) {
        say(`skipped ${id}: invalid JSON (${err.message})`);
        continue;
      }
      const bad = problems(spec);
      if (bad.length) {
        say(`skipped ${id}: ${bad.length} defects (${bad[0]})`);
        continue;
      }
      const html = page(id, block.type, spec);
      const changed = put(join(OUT, `${id}.html`), html);
      written.push(id);
      say(`${changed ? "wrote" : "kept "} public/diagrams/${id}.html (${(html.length / 1024).toFixed(1)} KB)`);
    }
  }
}

// Pages of blocks that are gone (or turned invalid) are removed, so the store never offers them.
const before = existsSync(LIST) ? JSON.parse(readFileSync(LIST, "utf8")) : [];
for (const id of before) {
  if (written.includes(id)) continue;
  rmSync(join(OUT, `${id}.html`), { force: true });
  say(`removed public/diagrams/${id}.html`);
}
// Written the way `biome format` prints a JSON array (the file is under mock/, which biome checks):
// one line with spaces while it fits in 100 columns, one id per line after that.
const ids = [...written].sort().map((id) => JSON.stringify(id));
const oneLine = `[${ids.join(", ")}]`;
put(LIST, oneLine.length <= 100 ? `${oneLine}\n` : `[\n${ids.map((id) => `  ${id}`).join(",\n")}\n]\n`);
