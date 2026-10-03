// Stilisierter Baum als Drahtgittermodell, prozedural erzeugt (fester Seed, daher immer gleich).
// Einheit: Meter, y = Höhe. Die Kamera folgt dem Scrollfortschritt: Start schräg von oben,
// beim Scrollen kreist sie um den Baum und senkt sich fast auf Augenhöhe.
import * as THREE from '../vendor/three-0.180.0/three.module.min.js';

const stage = document.querySelector('.tree-stage');
const canvas = stage && stage.querySelector('canvas');

// ---------- Hilfsfunktionen ----------

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

// Reproduzierbarer Zufall (mulberry32)
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Baum ----------

const RADIAL = 7;   // Segmente rund um einen Ast
const ALONG = 5;    // Ringe je Ast

// Verjüngte, leicht gebogene Röhre entlang einer Kurve: Füllfläche plus Gitterlinien
function tube(curve, r0, r1, out) {
  const frames = curve.computeFrenetFrames(ALONG, false);
  const base = out.pos.length / 3;
  const p = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= ALONG; i++) {
    curve.getPointAt(i / ALONG, p);
    const r = lerp(r0, r1, i / ALONG);
    for (let j = 0; j < RADIAL; j++) {
      const a = 2 * Math.PI * j / RADIAL;
      v.copy(frames.normals[i]).multiplyScalar(Math.cos(a) * r).addScaledVector(frames.binormals[i], Math.sin(a) * r).add(p);
      out.pos.push(v.x, v.y, v.z);
    }
  }
  const P = k => out.pos.slice(3 * k, 3 * k + 3);
  for (let i = 0; i <= ALONG; i++) {
    for (let j = 0; j < RADIAL; j++) {
      const a = base + i * RADIAL + j, b = base + i * RADIAL + (j + 1) % RADIAL;
      out.lines.push(...P(a), ...P(b));
      if (i < ALONG) {
        out.lines.push(...P(a), ...P(a + RADIAL));
        out.idx.push(a, a + RADIAL, b, b, a + RADIAL, b + RADIAL);
      }
    }
  }
}

// Rekursive Verzweigung: jeder Ast erzeugt 2–3 Kinder, die sich um die Achse verteilen
function buildTree() {
  const rand = rng(1780720);
  const wood = { pos: [], idx: [], lines: [] };
  const tips = [];
  const up = new THREE.Vector3(0, 1, 0);

  function branch(start, dir, length, radius, depth) {
    // Leicht gekrümmter Ast, Spitzen streben etwas nach oben
    const bend = new THREE.Vector3(rand() - 0.5, rand() * 0.3, rand() - 0.5).multiplyScalar(length * 0.18);
    const mid = start.clone().addScaledVector(dir, length * 0.5).add(bend);
    const end = start.clone().addScaledVector(dir, length).add(bend.multiplyScalar(1.4));
    const curve = new THREE.CatmullRomCurve3([start, mid, end]);
    const endRadius = radius * 0.62;
    tube(curve, radius, endRadius, wood);
    if (depth === 0) { tips.push({ pos: end, size: length }); return; }

    const tangent = curve.getTangentAt(1).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, up);
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    const count = depth > 2 ? 3 : 2 + (rand() < 0.5 ? 1 : 0);
    const twist = rand() * Math.PI * 2;
    for (let k = 0; k < count; k++) {
      const spread = THREE.MathUtils.degToRad(lerp(30, 52, rand()));
      const around = twist + k * (2 * Math.PI / count) + (rand() - 0.5) * 0.6;
      const child = tangent.clone().applyAxisAngle(side, spread).applyAxisAngle(tangent, around);
      child.lerp(up, 0.12).normalize();
      branch(end, child, length * lerp(0.66, 0.8, rand()), endRadius, depth - 1);
    }
    // Ein Mittelast setzt den Stamm bzw. Leitast fort
    if (depth > 2) branch(end, tangent.clone().lerp(up, 0.3).normalize(), length * 0.78, endRadius, depth - 1);
  }

  // Stamm mit Wurzelansätzen
  branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.04, 1, 0.02).normalize(), 1.35, 0.17, 4);
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * 2 * Math.PI + 0.4;
    const out = new THREE.Vector3(Math.cos(a), -0.05, Math.sin(a));
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * 0.05, 0.32, Math.sin(a) * 0.05),
      new THREE.Vector3(Math.cos(a) * 0.17, 0.08, Math.sin(a) * 0.17),
      new THREE.Vector3(0, 0, 0).addScaledVector(out, 0.42),
    ]);
    tube(curve, 0.07, 0.02, wood);
  }
  return { wood, tips };
}

// Laubwolke: unregelmäßiges Ikosaeder, dessen Dreiecke das Gitter bilden
function foliage(center, radius, rand) {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const pos = geo.attributes.position, v = new THREE.Vector3();
  const seen = new Map(); // gleiche Ecken gleich verschieben, damit die Fläche geschlossen bleibt
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, lerp(0.8, 1.15, rand()));
    v.multiplyScalar(seen.get(key));
    v.y *= 0.82; // etwas abgeflacht
    pos.setXYZ(i, v.x + center.x, v.y + center.y, v.z + center.z);
  }
  return geo;
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
  const tree = new THREE.Group();
  scene.add(tree);

  const mats = {
    fill: new THREE.MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    wood: new THREE.LineBasicMaterial(),
    leaves: new THREE.LineBasicMaterial({ transparent: true }),
    ground: new THREE.LineBasicMaterial({ vertexColors: true }),
  };
  const lineSegments = (arr, mat) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return new THREE.LineSegments(g, mat);
  };

  // Stamm und Äste
  const { wood, tips } = buildTree();
  const woodGeo = new THREE.BufferGeometry();
  woodGeo.setAttribute('position', new THREE.Float32BufferAttribute(wood.pos, 3));
  woodGeo.setIndex(wood.idx);
  tree.add(new THREE.Mesh(woodGeo, mats.fill), lineSegments(wood.lines, mats.wood));

  // Krone: eine Laubwolke an jeder zweiten Astspitze, dazu wenige große Wolken als Volumen
  const rand = rng(42);
  const crownCenter = tips.reduce((c, t) => c.add(t.pos), new THREE.Vector3()).divideScalar(tips.length);
  const clusters = tips.filter((_, i) => i % 2 === 0).map(t => ({ c: t.pos, r: lerp(0.42, 0.62, rand()) }));
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * 2 * Math.PI;
    clusters.push({ c: crownCenter.clone().add(new THREE.Vector3(Math.cos(a) * 0.6, (rand() - 0.6) * 0.5, Math.sin(a) * 0.6)), r: 0.75 });
  }
  for (const { c, r } of clusters) {
    const geo = foliage(c, r, rand);
    tree.add(new THREE.Mesh(geo, mats.fill), new THREE.LineSegments(new THREE.WireframeGeometry(geo), mats.leaves));
  }

  // Boden: radiales Gitter, das nach außen in den Hintergrund ausblendet
  const ground = [], groundFade = [];
  const R_MAX = 3.2;
  const gp = (x, z) => { ground.push(x, 0, z); groundFade.push(clamp(Math.hypot(x, z) / R_MAX)); };
  for (let r = 0.4; r <= R_MAX; r += 0.4) {
    const n = 64;
    for (let i = 0; i < n; i++) {
      const a = 2 * Math.PI * i / n, b = 2 * Math.PI * (i + 1) / n;
      gp(Math.cos(a) * r, Math.sin(a) * r); gp(Math.cos(b) * r, Math.sin(b) * r);
    }
  }
  for (let i = 0; i < 24; i++) {
    const a = 2 * Math.PI * i / 24;
    gp(Math.cos(a) * 0.4, Math.sin(a) * 0.4); gp(Math.cos(a) * R_MAX, Math.sin(a) * R_MAX);
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
    const bg = c('--bg'), fg = c('--fg'), muted = c('--muted'), green = c('--cat-tech');
    mats.fill.color.copy(bg);
    mats.wood.color.copy(fg);
    mats.leaves.color.copy(green); mats.leaves.opacity = 0.75;
    tintGround(muted.clone().lerp(bg, 0.55), bg);
    scene.fog = new THREE.Fog(bg, 6, 16);
    requestRender();
  }

  // ---------- Kamera: Scrollfortschritt -> Kugelkoordinaten ----------
  const box = new THREE.Box3().setFromObject(tree);
  const target = new THREE.Vector3(0, box.max.y * 0.5, 0);
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [0, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    corners.push(new THREE.Vector3(x, y, z).sub(target));
  }
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();

  function placeCamera(p) {
    const e = p * p * (3 - 2 * p);
    const az = THREE.MathUtils.degToRad(lerp(20, 150, e));    // Umkreisen
    const el = THREE.MathUtils.degToRad(lerp(34, 6, e));      // Höhenwinkel: von oben auf Augenhöhe
    const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    // Abstand so wählen, dass der Baum mit Rand ins Bild passt
    fwd.copy(dir).negate();
    right.crossVectors(fwd, camera.up).normalize();
    up.crossVectors(right, fwd);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.96;
    const tanH = tanV * camera.aspect;
    let d = 0;
    for (const c of corners) {
      const depth = c.dot(dir);
      d = Math.max(d, depth + Math.abs(c.dot(right)) / tanH, depth + Math.abs(c.dot(up)) / tanV);
    }
    camera.position.copy(target).addScaledVector(dir, d);
    camera.lookAt(target);
    if (scene.fog) { scene.fog.near = d - 1; scene.fog.far = d + 6; }
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
