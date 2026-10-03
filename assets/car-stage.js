// Stilisiertes Drahtgittermodell eines Autos, prozedural erzeugt.
// Einheit: Meter. x = Längsachse (Front bei +x), y = Höhe, z = Breite (rechts bei +z).
// Die Kamera folgt dem Scrollfortschritt: Start seitlich von oben, Ende frontal.
import * as THREE from '../vendor/three-0.180.0/three.module.min.js';

const stage = document.querySelector('.car-stage');
const canvas = stage && stage.querySelector('canvas');

// ---------- Hilfsfunktionen ----------

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const bump = (d, r) => (Math.abs(d) < r ? 0.5 + 0.5 * Math.cos(Math.PI * d / r) : 0);

// Monotone kubische Interpolation (Fritsch-Carlson) durch Stützpunkte [x, y]
function spline(pairs) {
  const p = [...pairs].sort((a, b) => a[0] - b[0]);
  const x = p.map(q => q[0]), y = p.map(q => q[1]), n = p.length;
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (y[i + 1] - y[i]) / (x[i + 1] - x[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return t => {
    if (t <= x[0]) return y[0];
    if (t >= x[n - 1]) return y[n - 1];
    let i = 0;
    while (t > x[i + 1]) i++;
    const h = x[i + 1] - x[i], s = (t - x[i]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * y[i] + (s3 - 2 * s2 + s) * h * m[i]
      + (-2 * s3 + 3 * s2) * y[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}

// Polylinie gleichmäßig unterteilen, damit projizierte Linien der Oberfläche folgen
function resample(poly, step = 0.03, closed = false) {
  const pts = closed ? [...poly, poly[0]] : poly;
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Rechteck mit abgerundeten Ecken; Ecken [x, y] im Uhrzeigersinn, je Ecke eigener Radius
function roundedPoly(corners, radius, seg = 5) {
  const out = [];
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const p = corners[i], prev = corners[(i + n - 1) % n], next = corners[(i + 1) % n];
    const r = Array.isArray(radius) ? radius[i] : radius;
    const v1 = [prev[0] - p[0], prev[1] - p[1]], v2 = [next[0] - p[0], next[1] - p[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    const a = [p[0] + v1[0] / l1 * r, p[1] + v1[1] / l1 * r];
    const b = [p[0] + v2[0] / l2 * r, p[1] + v2[1] / l2 * r];
    for (let k = 0; k <= seg; k++) {
      const t = k / seg, u = 1 - t; // quadratische Bézierkurve über die Ecke
      out.push([u * u * a[0] + 2 * u * t * p[0] + t * t * b[0], u * u * a[1] + 2 * u * t * p[1] + t * t * b[1]]);
    }
  }
  return out;
}

const inset = (poly, cx, cy, f) => poly.map(([a, b]) => [cx + (a - cx) * f, cy + (b - cy) * f]);
const mirrorZ = poly => poly.map(([z, y]) => [-z, y]);

// ---------- Abmessungen (4,78 m lang, 1,85 m breit, 1,45 m hoch, Radstand 2,86 m) ----------

const HALF_L = 2.39;
const HALF_W = 0.925;
const AXLES = [1.53, -1.326];
const WHEEL_R = 0.355;
const ARCH_R = 0.405;
const TRACKS = [0.80, 0.815]; // halbe Spurweite vorn/hinten (1601/1630 mm)

// Mittellinie oben: Front, Motorhaube, Frontscheibe, Dach, Fastback, Heckklappe
const top = spline([
  [2.39, 0.64], [2.33, 0.735], [2.2, 0.79], [1.8, 0.845], [1.4, 0.885], [0.95, 0.945],
  [0.6, 1.17], [0.25, 1.37], [-0.05, 1.43], [-0.45, 1.42], [-0.9, 1.35],
  [-1.35, 1.22], [-1.8, 1.08], [-2.15, 1.02], [-2.3, 1.01], [-2.39, 0.95],
]);
// Schulter-/Gürtellinie, steigt leicht nach hinten
const shoulder = spline([
  [2.39, 0.6], [2.3, 0.7], [2.1, 0.77], [1.6, 0.84], [1.0, 0.92], [0, 0.96],
  [-1.2, 0.99], [-2.0, 0.99], [-2.3, 0.97], [-2.39, 0.93],
]);
const bottomBase = spline([
  [2.39, 0.24], [2.2, 0.17], [1.9, 0.14], [-1.9, 0.14], [-2.2, 0.22], [-2.39, 0.34],
]);
const glassHalfW = spline([[-2.39, 0.52], [-1.7, 0.56], [-0.6, 0.58], [0.4, 0.58], [1.0, 0.6]]);

function halfWidth(x) {
  let w = HALF_W;
  // Grundriss: abgerundete Ecken, an den Enden bleibt eine flache Stirnfläche
  if (x > 1.72) { const t = (x - 1.72) / (HALF_L - 1.72); w *= 0.5 + 0.5 * Math.pow(1 - Math.pow(t, 2), 1 / 2); }
  if (x < -1.8) { const t = (-1.8 - x) / (HALF_L - 1.8); w *= 0.62 + 0.38 * Math.pow(1 - Math.pow(t, 2.3), 1 / 2.3); }
  // ausgestellte Kotflügel, hinten kräftiger (breitere Spur)
  w += 0.026 * bump(x - AXLES[0], 0.6) + 0.045 * bump(x - AXLES[1], 0.75);
  return Math.max(0, w);
}

function bottom(x) {
  let b = bottomBase(x);
  for (const a of AXLES) {
    const d = x - a;
    if (Math.abs(d) < ARCH_R) b = Math.max(b, WHEEL_R + Math.sqrt(ARCH_R * ARCH_R - d * d));
  }
  return b;
}

// Halber Querschnitt als Kontrollpunkte [z, y], von unten Mitte bis oben Mitte
function sectionControl(x) {
  const w = halfWidth(x), b = bottom(x), sh = shoulder(x), tp = top(x);
  const s = Math.min(1, w / 0.5);
  const shelf = w - 0.085 * s;
  const g = Math.min(glassHalfW(x), shelf - 0.05) * s;
  const gh = smoothstep(0.05, 0.24, tp - sh);
  const hood6 = [w * 0.55, lerp(sh, tp, 0.82)], hood7 = [w * 0.25, lerp(sh, tp, 0.97)];
  const glass6 = [g, tp - 0.075], glass7 = [g * 0.5, tp - 0.012];
  return [
    // Schweller eingezogen, größte Breite auf Radmitte, darüber Schulter und Tumblehome
    [0, b], [w * 0.62, b], [w - 0.06 * s, b + 0.035 * s], [w, lerp(b, sh, 0.42)],
    [w - 0.025 * s, sh - 0.055 * s], [shelf, sh],
    [lerp(hood6[0], glass6[0], gh), lerp(hood6[1], glass6[1], gh)],
    [lerp(hood7[0], glass7[0], gh), lerp(hood7[1], glass7[1], gh)],
    [0, tp],
  ];
}

// Catmull-Rom über die Kontrollpunkte, feste Anzahl Samples je Querschnitt
const SEG_SAMPLES = 2;
function sectionPoints(x) {
  const c = sectionControl(x);
  const out = [];
  for (let i = 0; i < c.length - 1; i++) {
    const p0 = c[Math.max(0, i - 1)], p1 = c[i], p2 = c[i + 1], p3 = c[Math.min(c.length - 1, i + 2)];
    for (let k = 0; k < SEG_SAMPLES; k++) {
      const t = k / SEG_SAMPLES, t2 = t * t, t3 = t2 * t;
      const f = (a, b, cc, d) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(c[c.length - 1]);
  return out;
}

// Stationen: an den Enden dichter, zusätzliche Stationen an den Radlauf-Kanten
function stations(count) {
  const xs = [];
  for (let i = 0; i <= count; i++) {
    const u = i / count;
    xs.push(HALF_L * (0.72 * (2 * u - 1) - 0.28 * Math.cos(Math.PI * u)));
  }
  for (const a of AXLES) for (const e of [-1, 1]) xs.push(a + e * (ARCH_R - 0.004), a + e * (ARCH_R + 0.004));
  return xs.sort((a, b) => a - b);
}

// Front leicht nach hinten geneigt (Haubenkante und Lippe)
function lean(x, y) {
  const f = smoothstep(1.85, HALF_L, x);
  return f * (y > 0.42 ? 0.55 * (y - 0.42) ** 2 : 0.4 * (0.42 - y) ** 2);
}

function buildBody() {
  const xs = stations(64);
  const half = sectionPoints(0).length; // Punkte je Halbschnitt
  const ring = 2 * half - 2;            // geschlossener Ring, Mittelpunkte geteilt
  const pos = [];
  for (const x of xs) {
    const h = sectionPoints(x);
    const full = [...h, ...h.slice(1, -1).reverse().map(([z, y]) => [-z, y])];
    for (const [z, y] of full) pos.push(x - lean(x, y), y, z);
  }
  const idx = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j, b = i * ring + (j + 1) % ring, c = a + ring, d = b + ring;
      idx.push(a, c, b, b, c, d);
    }
  }
  // Stirnflächen vorn und hinten als Fächer schließen
  for (const [i, flip] of [[0, true], [xs.length - 1, false]]) {
    let cx = 0, cy = 0;
    for (let j = 0; j < ring; j++) { cx += pos[3 * (i * ring + j)]; cy += pos[3 * (i * ring + j) + 1]; }
    const c = pos.length / 3;
    pos.push(cx / ring, cy / ring, 0);
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j, b = i * ring + (j + 1) % ring;
      flip ? idx.push(c, a, b) : idx.push(c, b, a);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  // Gitterlinien: Querschnitte und Längslinien
  const ringSeg = [], longSeg = [];
  const P = k => [pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]];
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < ring; j++) ringSeg.push(...P(i * ring + j), ...P(i * ring + (j + 1) % ring));
  }
  for (let j = 0; j < ring; j++) {
    for (let i = 0; i < xs.length - 1; i++) longSeg.push(...P(i * ring + j), ...P((i + 1) * ring + j));
  }
  return { geo, ringSeg, longSeg };
}

// ---------- Szene ----------

function init() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    stage.hidden = true;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 2, 0.1, 60);
  const car = new THREE.Group();
  scene.add(car);

  const mats = {
    fill: new THREE.MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    grid: new THREE.LineBasicMaterial({ transparent: true }),
    line: new THREE.LineBasicMaterial(),
    accent: new THREE.LineBasicMaterial(),
    ground: new THREE.LineBasicMaterial({ vertexColors: true }),
  };

  const segments = (arr, mat) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const l = new THREE.LineSegments(g, mat);
    car.add(l);
    return l;
  };

  // Karosserie
  const { geo, ringSeg, longSeg } = buildBody();
  const body = new THREE.Mesh(geo, mats.fill);
  car.add(body);
  segments(ringSeg, mats.grid);
  segments(longSeg, mats.grid);

  // Details per Projektion auf die Karosserie
  body.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  const feat = { line: [], accent: [] };
  const views = {
    front: { o: ([z, y]) => new THREE.Vector3(5, y, z), d: new THREE.Vector3(-1, 0, 0) },
    rear: { o: ([z, y]) => new THREE.Vector3(-5, y, z), d: new THREE.Vector3(1, 0, 0) },
    right: { o: ([x, y]) => new THREE.Vector3(x, y, 3), d: new THREE.Vector3(0, 0, -1) },
    left: { o: ([x, y]) => new THREE.Vector3(x, y, -3), d: new THREE.Vector3(0, 0, 1) },
    top: { o: ([x, z]) => new THREE.Vector3(x, 4, z), d: new THREE.Vector3(0, -1, 0) },
  };
  function draw(poly, view, kind = 'line', { closed = false, step = 0.03 } = {}) {
    const v = views[view];
    const pts = resample(poly, step, closed).map(p => {
      ray.set(v.o(p), v.d);
      const hit = ray.intersectObject(body, false)[0];
      return hit ? hit.point.addScaledVector(v.d, -0.006) : null;
    });
    for (let i = 0; i < pts.length - 1; i++) {
      if (pts[i] && pts[i + 1]) feat[kind].push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
    }
  }
  const both = (poly, view, kind, opt) => { draw(poly, view, kind, opt); draw(mirrorZ(poly), view, kind, opt); };
  const sides = (poly, kind, opt) => { draw(poly, 'right', kind, opt); draw(poly, 'left', kind, opt); };

  // Front (nach Referenzfotos): sehr große Niere aus zwei
  // Segmenten bis fast zur Unterkante, oben V-förmig zur Mitte abfallend, mit Querrippen
  const kidney = roundedPoly([[0.025, 0.725], [0.3, 0.8], [0.36, 0.52], [0.33, 0.26], [0.025, 0.26]],
    [0.03, 0.08, 0.14, 0.07, 0.03]);
  both(kidney, 'front', 'line', { closed: true });
  both(inset(kidney, 0.18, 0.52, 0.92), 'front', 'line', { closed: true });
  const kidneyOuter = y => (y > 0.52 ? lerp(0.36, 0.3, (y - 0.52) / 0.28) : lerp(0.33, 0.36, (y - 0.26) / 0.26)) - 0.04;
  for (let y = 0.32; y < 0.72; y += 0.055) both([[0.05, y], [kidneyOuter(y), y + 0.006]], 'front', 'line');
  // Emblem auf der Haubenspitze
  const roundel = (cy, r) => Array.from({ length: 20 }, (_, i) => [Math.cos(i / 20 * 2 * Math.PI) * r, cy + Math.sin(i / 20 * 2 * Math.PI) * r]);
  draw(roundel(0.785, 0.036), 'front', 'accent', { closed: true, step: 0.01 });
  // Schlanke Scheinwerfer: innen an der oberen Nierenecke, nach außen ansteigend
  const lamp = roundedPoly([[0.33, 0.785], [0.83, 0.84], [0.875, 0.795], [0.36, 0.74]], [0.015, 0.05, 0.03, 0.015], 3);
  both(lamp, 'front', 'line', { closed: true, step: 0.02 });
  for (const z of [0.43, 0.53]) { // zwei vertikale L-förmige Tagfahrlicht-Elemente
    both([[z, 0.8], [z - 0.008, 0.758], [z + 0.045, 0.765]], 'front', 'accent', { step: 0.01 });
  }
  // M-Sport-Schürze: hohe seitliche Lufteinlässe mit Querstreben, Air Curtains außen, Lippe unten
  const intake = roundedPoly([[0.42, 0.6], [0.7, 0.66], [0.8, 0.3], [0.46, 0.27]], 0.03);
  both(intake, 'front', 'line', { closed: true });
  for (const y of [0.37, 0.45, 0.53]) both([[0.45, y - 0.01], [0.76, y + 0.02]], 'front', 'line');
  const curtain = roundedPoly([[0.85, 0.66], [0.885, 0.63], [0.895, 0.38], [0.865, 0.41]], 0.01, 2);
  both(curtain, 'front', 'line', { closed: true, step: 0.02 });
  for (const y of [0.46, 0.53, 0.6]) both([[0.855, y], [0.89, y]], 'front', 'line');
  draw([[-0.82, 0.215], [0.82, 0.215]], 'front', 'line');

  // Motorhaube: V-förmige Kanten laufen auf das Emblem zu, äußere Kanten auf die Scheinwerfer
  both([[0.95, 0.45], [1.6, 0.31], [2.2, 0.07]], 'top', 'line');
  both([[1.0, 0.7], [1.7, 0.66], [2.15, 0.52]], 'top', 'line');
  // Frontscheibe, Dachkanten, Heckscheibe, Spoilerlippe
  draw([[0.93, -0.66], [0.93, 0.66]], 'top', 'line');
  draw([[0.27, -0.52], [0.27, 0.52]], 'top', 'line');
  draw([[-0.85, -0.52], [-0.85, 0.52]], 'top', 'line');
  draw([[-1.82, -0.6], [-1.82, 0.6]], 'top', 'line');
  draw([[-2.26, -0.78], [-2.26, 0.78]], 'top', 'line');

  // Seite: Fensterlinie mit Hofmeister-Knick, B-Säule, Türen, Griffe, Schweller
  const dlo = [[0.93, 0.975], [0.6, 1.16], [0.25, 1.34], [-0.25, 1.39], [-0.8, 1.335],
    [-1.18, 1.19], [-1.36, 1.07], [-1.27, 1.01], [-0.3, 0.985], [0.93, 0.975]];
  sides(dlo, 'line', { step: 0.025 });
  sides([[-0.22, 0.99], [-0.25, 1.385]], 'line');                             // B-Säule
  sides([[-1.0, 1.29], [-1.07, 0.995]], 'line');                              // C-Säulen-Dreiecksfenster
  sides([[0.96, 0.95], [0.95, 0.3]], 'line');                                // Tür vorn
  sides([[1.085, 0.67], [1.05, 0.36]], 'line');                               // Air Breather hinter dem Vorderrad
  sides([[1.03, 0.67], [1.0, 0.38]], 'line');
  for (const y of [0.44, 0.52, 0.6]) sides([[1.075, y + 0.03], [1.01, y]], 'line');
  sides([[-0.22, 0.96], [-0.2, 0.3]], 'line');                                // Türfuge Mitte
  sides([[-1.07, 0.98], [-0.98, 0.78], [-0.9, 0.66]], 'line');                // Tür hinten
  sides([[1.06, 0.3], [-0.9, 0.3]], 'line');                                  // Türunterkante
  sides([[0.32, 0.86], [0.12, 0.862]], 'line');                               // bündige Griffe
  sides([[-0.62, 0.875], [-0.8, 0.877]], 'line');
  sides([[1.95, 0.8], [1.0, 0.86], [-1.0, 0.9], [-2.3, 0.92]], 'line');      // Schulterlinie
  sides([[-0.45, 0.76], [-1.3, 0.81], [-2.2, 0.77]], 'line');                 // Hüfte über dem Hinterrad
  sides([[1.0, 0.45], [-0.1, 0.5], [-0.88, 0.6]], 'line');                    // ansteigende Sicke
  for (const a of AXLES) { // Radlauf-Kante
    const arc = [];
    for (let k = 0; k <= 16; k++) { const t = Math.PI * k / 16; arc.push([a + Math.cos(t) * (ARCH_R + 0.02), WHEEL_R + Math.sin(t) * (ARCH_R + 0.02)]); }
    sides(arc, 'line');
  }
  sides([[1.08, 0.25], [-0.88, 0.235]], 'accent');                           // Schwellerleiste
  sides([[1.08, 0.2], [-0.88, 0.19]], 'accent');

  // Heck: schlanke L-Leuchten bis auf die Klappe, Kennzeichen, Emblem, schwarze Schürze
  const tail = roundedPoly([[0.27, 0.95], [0.88, 0.94], [0.905, 0.87], [0.64, 0.875], [0.3, 0.912]], 0.015, 3);
  both(tail, 'rear', 'accent', { closed: true, step: 0.015 });
  both([[0.4, 0.928], [0.84, 0.918], [0.86, 0.885]], 'rear', 'accent', { step: 0.015 });
  draw(roundedPoly([[-0.25, 0.89], [0.25, 0.89], [0.25, 0.78], [-0.25, 0.78]], 0.015), 'rear', 'line', { closed: true });
  draw(roundel(0.96, 0.035), 'rear', 'accent', { closed: true, step: 0.01 });
  both(roundedPoly([[0.6, 0.56], [0.86, 0.62], [0.9, 0.37], [0.68, 0.35]], 0.03), 'rear', 'line', { closed: true });
  both([[0.67, 0.45], [0.86, 0.47]], 'rear', 'accent');                    // Reflektor
  draw(roundedPoly([[-0.6, 0.4], [0.6, 0.4], [0.66, 0.22], [-0.66, 0.22]], 0.03), 'rear', 'line', { closed: true });
  for (const z of [-0.42, -0.25, 0.25, 0.42]) draw([[z, 0.38], [z, 0.24]], 'rear', 'line');

  segments(feat.line, mats.line);
  segments(feat.accent, mats.accent);

  // Außenspiegel: flaches Ellipsoid am Türdreieck mit Spiegelfuß
  for (const side of [1, -1]) {
    const shape = new THREE.SphereGeometry(1, 8, 4);
    const m = new THREE.Mesh(shape, mats.fill);
    m.scale.set(0.1, 0.055, 0.09);
    m.position.set(0.86, 1.02, side * 0.95);
    m.rotation.y = side * 0.2;
    car.add(m);
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(shape, 1), mats.line);
    wire.scale.copy(m.scale); wire.position.copy(m.position); wire.rotation.copy(m.rotation);
    car.add(wire);
    const foot = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.9, 0.975, side * 0.85), new THREE.Vector3(0.88, 0.99, side * 0.92),
      new THREE.Vector3(0.98, 0.955, side * 0.85), new THREE.Vector3(0.9, 0.985, side * 0.92),
    ]);
    car.add(new THREE.LineSegments(foot, mats.line));
  }

  // Räder: Reifen mit Laufflächen-Gitter, Felge mit fünf Doppelspeichen
  AXLES.forEach((ax, i) => { for (const side of [1, -1]) car.add(wheel(ax, side, TRACKS[i])); });
  function wheel(x, side, track) {
    const g = new THREE.Group();
    g.position.set(x, WHEEL_R, side * track);
    const width = 0.245;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, width, 40), mats.fill);
    cyl.rotation.x = Math.PI / 2;
    g.add(cyl);
    const zo = side * (width / 2 + 0.004), zi = -side * (width / 2);
    const lines = [], acc = [];
    const circle = (r, z, out, n = 48) => {
      for (let i = 0; i < n; i++) {
        const a = 2 * Math.PI * i / n, b = 2 * Math.PI * (i + 1) / n;
        out.push(Math.cos(a) * r, Math.sin(a) * r, z, Math.cos(b) * r, Math.sin(b) * r, z);
      }
    };
    circle(WHEEL_R, zo, lines); circle(WHEEL_R, zi, lines);
    circle(0.25, zo, lines); circle(0.235, zo, lines); circle(0.065, zo, acc, 20);
    for (let i = 0; i < 28; i++) { // Lauffläche
      const a = 2 * Math.PI * i / 28;
      lines.push(Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R, zo, Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R, zi);
    }
    for (let i = 0; i < 5; i++) { // Doppelspeichen
      const a = 2 * Math.PI * i / 5;
      for (const o of [-0.13, 0.13]) {
        lines.push(Math.cos(a) * 0.07, Math.sin(a) * 0.07, zo, Math.cos(a + o) * 0.235, Math.sin(a + o) * 0.235, zo);
      }
      lines.push(Math.cos(a - 0.05) * 0.07, Math.sin(a - 0.05) * 0.07, zo, Math.cos(a + 0.05) * 0.07, Math.sin(a + 0.05) * 0.07, zo);
    }
    const mk = (arr, mat) => {
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      return new THREE.LineSegments(bg, mat);
    };
    g.add(mk(lines, mats.line), mk(acc, mats.accent));
    return g;
  }

  // Boden: radiales Gitter, das nach außen in den Hintergrund ausblendet
  const ground = [], groundFade = [];
  const R_MAX = 3.6;
  const gp = (x, z) => { ground.push(x, 0, z); groundFade.push(clamp(Math.hypot(x / 1.3, z) / R_MAX)); };
  for (let r = 0.5; r <= R_MAX; r += 0.5) {
    const n = 72;
    for (let i = 0; i < n; i++) {
      const a = 2 * Math.PI * i / n, b = 2 * Math.PI * (i + 1) / n;
      gp(Math.cos(a) * r * 1.3, Math.sin(a) * r); gp(Math.cos(b) * r * 1.3, Math.sin(b) * r);
    }
  }
  for (let i = 0; i < 24; i++) {
    const a = 2 * Math.PI * i / 24;
    gp(Math.cos(a) * 0.65, Math.sin(a) * 0.5); gp(Math.cos(a) * R_MAX * 1.3, Math.sin(a) * R_MAX);
  }
  const groundGeo = new THREE.BufferGeometry();
  groundGeo.setAttribute('position', new THREE.Float32BufferAttribute(ground, 3));
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(groundFade.length * 3), 3));
  scene.add(new THREE.LineSegments(groundGeo, mats.ground));
  function tintGround(near, far) {
    const col = groundGeo.attributes.color, c = new THREE.Color();
    groundFade.forEach((f, i) => { c.copy(near).lerp(far, f ** 0.8); col.setXYZ(i, c.r, c.g, c.b); });
    col.needsUpdate = true;
  }

  // ---------- Farben aus den CSS-Tokens ----------
  function applyTheme() {
    const css = getComputedStyle(document.documentElement);
    const c = name => new THREE.Color(css.getPropertyValue(name).trim() || '#888');
    const bg = c('--bg'), fg = c('--fg'), muted = c('--muted'), accent = c('--accent');
    mats.fill.color.copy(bg);
    mats.grid.color.copy(muted); mats.grid.opacity = 0.4;
    mats.line.color.copy(fg);
    mats.accent.color.copy(accent);
    tintGround(muted.clone().lerp(bg, 0.55), bg);
    scene.fog = new THREE.Fog(bg, 6, 16);
    requestRender();
  }

  // ---------- Kamera: Scrollfortschritt -> Kugelkoordinaten ----------
  const target = new THREE.Vector3(0, 0.62, 0);
  const box = new THREE.Box3().setFromObject(car);
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [0, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    corners.push(new THREE.Vector3(x, y, z).sub(target));
  }
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();

  function placeCamera(p) {
    const e = p * p * (3 - 2 * p);
    const az = THREE.MathUtils.degToRad(lerp(76, 0, e));      // 90° = reine Seitenansicht
    const el = THREE.MathUtils.degToRad(lerp(30, 3, e));      // Höhenwinkel
    const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    // Abstand so wählen, dass das Auto mit Rand ins Bild passt
    fwd.copy(dir).negate();
    right.crossVectors(fwd, camera.up).normalize();
    up.crossVectors(right, fwd);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.88;
    const tanH = tanV * camera.aspect;
    let d = 0;
    for (const c of corners) {
      const depth = c.dot(dir);
      d = Math.max(d, depth + Math.abs(c.dot(right)) / tanH, depth + Math.abs(c.dot(up)) / tanV);
    }
    camera.position.copy(target).addScaledVector(dir, d);
    camera.lookAt(target);
    if (scene.fog) { scene.fog.near = d - 1; scene.fog.far = d + 7; }
  }

  // ---------- Rendern bei Bedarf ----------
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let goal = 0, current = 0, frame = 0, visible = true;

  // Layout-Position ohne Parallax-Versatz, damit der Fortschritt nicht vom Transform abhängt
  function scrollProgress() {
    if (reduceMotion.matches) return 0.35;
    const bottomEdge = stage.offsetTop + stage.offsetHeight;
    const end = Math.min(bottomEdge, document.documentElement.scrollHeight - window.innerHeight);
    return end > 1 ? clamp(window.scrollY / end) : 0;
  }
  // Modell scrollt langsamer als der Inhalt, der Inhalt schiebt sich darüber
  const PARALLAX = 0.4;
  function parallax() {
    const y = reduceMotion.matches ? 0 : Math.min(window.scrollY, stage.offsetTop + stage.offsetHeight) * PARALLAX;
    stage.style.transform = y ? `translate3d(0, ${y.toFixed(1)}px, 0)` : '';
  }
  function tick() {
    frame = 0;
    const snap = reduceMotion.matches || Math.abs(goal - current) < 0.0005;
    current = snap ? goal : lerp(current, goal, 0.18);
    placeCamera(current);
    renderer.render(scene, camera);
    if (current !== goal) requestRender();
  }
  function requestRender() { if (!frame && visible) frame = requestAnimationFrame(tick); }
  function onScroll() { parallax(); goal = scrollProgress(); requestRender(); }
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    onScroll();
  }

  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) requestRender(); }).observe(stage);
  window.addEventListener('scroll', onScroll, { passive: true });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  reduceMotion.addEventListener('change', onScroll);
  applyTheme();
  goal = current = scrollProgress();
  resize();
}

if (canvas) init();
