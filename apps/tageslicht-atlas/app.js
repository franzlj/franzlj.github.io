(() => {
const PRESETS = [
  ["Berlin",52.52,13.405,"Europe/Berlin"],["Hamburg",53.551,9.994,"Europe/Berlin"],
  ["München",48.137,11.575,"Europe/Berlin"],["Köln",50.938,6.96,"Europe/Berlin"],
  ["Frankfurt am Main",50.11,8.682,"Europe/Berlin"],["Stuttgart",48.776,9.183,"Europe/Berlin"],
  ["Wien",48.208,16.373,"Europe/Vienna"],["Zürich",47.377,8.541,"Europe/Zurich"],
  ["Oslo",59.914,10.752,"Europe/Oslo"],["Madrid",40.417,-3.704,"Europe/Madrid"],
  ["Tromsø",69.649,18.956,"Europe/Oslo"],["New York",40.713,-74.006,"America/New_York"]
];
const $ = id => document.getElementById(id);
const DAY = 86400000, RAD = Math.PI/180;
const MONTHS = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
const WD = ["So","Mo","Di","Mi","Do","Fr","Sa"];
const F_MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const F_SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// ---------- Sonnenstand (NOAA-Näherung) ----------
function sunTimes(dateUTCnoon, lat, lon){
  const JD = dateUTCnoon/DAY + 2440587.5;
  const n = Math.round(JD - 2451545.0 + 0.0008);
  const Js = n - lon/360;
  const M = ((357.5291 + 0.98560028*Js) % 360 + 360) % 360;
  const Mr = M*RAD;
  const C = 1.9148*Math.sin(Mr) + 0.02*Math.sin(2*Mr) + 0.0003*Math.sin(3*Mr);
  const L = ((M + C + 180 + 102.9372) % 360) * RAD;
  const Jt = 2451545 + Js + 0.0053*Math.sin(Mr) - 0.0069*Math.sin(2*L);
  const dec = Math.asin(Math.sin(L)*Math.sin(23.4397*RAD));
  const toMs = j => (j - 2440587.5)*DAY;
  const at = h => {
    const c = (Math.sin(h*RAD) - Math.sin(lat*RAD)*Math.sin(dec)) / (Math.cos(lat*RAD)*Math.cos(dec));
    if (c > 1) return {state:"night"};
    if (c < -1) return {state:"day"};
    const w = Math.acos(c)/(2*Math.PI);
    return {state:"ok", rise:toMs(Jt - w), set:toMs(Jt + w)};
  };
  return {noon:toMs(Jt), sun:at(-0.833), civ:at(-6)};
}

// ---------- Zeitzonen ----------
let fmtCache = {};
function tzOffsetMin(ms, tz){
  let f = fmtCache[tz];
  if (!f) f = fmtCache[tz] = new Intl.DateTimeFormat("en-US",{timeZone:tz,hourCycle:"h23",year:"numeric",month:"numeric",day:"numeric",hour:"numeric",minute:"numeric",second:"numeric"});
  const p = {}; for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  const asUTC = Date.UTC(+p.year, +p.month-1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUTC - Math.floor(ms/1000)*1000)/60000);
}
function validTz(tz){ try{ new Intl.DateTimeFormat("en",{timeZone:tz}); return true; }catch(e){ return false; } }

// ---------- Daten ----------
let S = {lat:52.52, lon:13.405, tz:"Europe/Berlin", name:"Berlin"};
let days = [], todayIdx = 0, dst = [];
function todayParts(tz){
  const p = {}; for (const x of new Intl.DateTimeFormat("en-US",{timeZone:tz,year:"numeric",month:"numeric",day:"numeric"}).formatToParts(new Date())) p[x.type]=x.value;
  return [+p.year, +p.month-1, +p.day];
}
function compute(){
  const [y,m,d] = todayParts(S.tz);
  const start = Date.UTC(y, m-2, d, 12), end = Date.UTC(y, m+10, d, 12), tday = Date.UTC(y,m,d,12);
  days = []; dst = [];
  for (let t = start, i = 0; t <= end; t += DAY, i++){
    const s = sunTimes(t, S.lat, S.lon);
    const off = tzOffsetMin(t, S.tz);           // Offset zur lokalen Mittagszeit
    const loc = ms => ((ms + off*60000) - (t - 12*3600000)) / 3600000;
    const dt = new Date(t);
    const rec = {t, off, date:dt, noon:loc(s.noon), sun:s.sun.state, civ:s.civ.state};
    if (s.sun.state==="ok"){ rec.rise=loc(s.sun.rise); rec.set=loc(s.sun.set); rec.len=rec.set-rec.rise; }
    else rec.len = s.sun.state==="day" ? 24 : 0;
    if (s.civ.state==="ok"){ rec.dawn=loc(s.civ.rise); rec.dusk=loc(s.civ.set); }
    if (i>0 && days[i-1].off !== off) dst.push({i, delta:(off - days[i-1].off)/60});
    if (t === tday) todayIdx = i;
    days.push(rec);
  }
}

// ---------- Formatierung ----------
const hm = h => { if (h==null||isNaN(h)) return "—"; h = ((h%24)+24)%24; let mm = Math.round(h*60); return String(Math.floor(mm/60)%24).padStart(2,"0")+":"+String(mm%60).padStart(2,"0"); };
const dur = h => { const mm = Math.round(h*60); return Math.floor(mm/60)+" h "+String(mm%60).padStart(2,"0")+" min"; };
const signMin = h => { const mm = Math.round(h*60); return (mm>0?"+":mm<0?"−":"±")+Math.abs(mm)+" min"; };
const dstr = (dt,long) => (long? WD[dt.getUTCDay()]+", ":"")+dt.getUTCDate()+". "+MONTHS[dt.getUTCMonth()]+" "+dt.getUTCFullYear();
const offStr = o => "UTC"+(o>=0?"+":"−")+Math.abs(o/60);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);

// ---------- Kennzahlen ----------
function renderStats(){
  const t = days[todayIdx];
  let lo = 0, hi = 0;
  days.forEach((r,i)=>{ if (r.len < days[lo].len) lo=i; if (r.len > days[hi].len) hi=i; });
  const next = dst.find(x => x.i > todayIdx) || dst.find(x=>x.i===todayIdx);
  const html = [
    ["Heute", t.sun==="ok" ? hm(t.rise)+" – "+hm(t.set) : (t.sun==="day"?"Polartag":"Polarnacht"), dur(t.len)],
    ["Kürzester Tag", dur(days[lo].len), dstr(days[lo].date)],
    ["Längster Tag", dur(days[hi].len), dstr(days[hi].date)],
    ["Nächste Zeitumstellung", next ? dstr(days[next.i].date) : "keine im Zeitraum", next ? (next.delta<0?"Uhr 1 h zurück":"Uhr 1 h vor")+" · "+offStr(days[next.i].off) : esc(S.tz)]
  ].map(([k,v,d])=>`<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join("");
  $("stats").innerHTML = html;
  $("subtitle").textContent = `${S.name} · ${S.lat.toFixed(2)}°, ${S.lon.toFixed(2)}° · ${S.tz}`;
}

// ---------- Ansicht ----------
let v0 = 0, v1 = 1, sel = 0;
const N = () => days.length;
function setView(a, b){
  const minSpan = 7, maxSpan = N();
  let span = Math.min(maxSpan, Math.max(minSpan, b - a));
  let c = (a + b)/2; a = c - span/2; b = c + span/2;
  if (a < 0){ b -= a; a = 0; } if (b > N()){ a -= (b - N()); b = N(); }
  v0 = Math.max(0,a); v1 = Math.min(N(), b);
  const s = v1 - v0;
  [["z-all", s > 300],["z-3m", s>80 && s<100],["z-1m", s>25 && s<35]].forEach(([id,on])=>$(id).setAttribute("aria-pressed", on));
  draw();
}
function zoomTo(span){ const c = sel + 0.5; setView(c - span/2, c + span/2); }
function zoomBy(f, anchor){ anchor = anchor ?? (v0+v1)/2; setView(anchor - (anchor - v0)*f, anchor + (v1 - anchor)*f); }

// ---------- Zeichnen ----------
const cv = $("cv"), ctx = cv.getContext("2d");
let W = 0, H = 0, L = 54, R = 14, T = 30, mainH = 0, gap = 26, stripH = 0, B = 34;
let C = {};
// Tokens können color-mix() enthalten; über ein Hilfselement in rgb() auflösen, damit Canvas sie versteht
const probe = document.createElement("span");
probe.style.display = "none";
document.body.appendChild(probe);
function readColors(){
  ["bg","surface","fg","muted","line","night","twilight","day","day-edge","noon","today","dst","grid"].forEach(k => {
    probe.style.color = `var(--${k})`;
    C[k] = getComputedStyle(probe).color;
  });
}
function layout(){
  const box = $("box"), w = box.clientWidth;
  W = w; H = w < 560 ? 520 : Math.min(640, Math.max(520, w*0.52));
  L = w < 560 ? 44 : 54;
  stripH = Math.round(H*0.18); mainH = H - T - gap - stripH - B;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr); cv.style.height = H+"px";
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
const pw = () => W - L - R;
const X = d => L + (d - v0)/(v1 - v0)*pw();
const Y = h => T + (h/24)*mainH;
function dayAtX(px){ return v0 + (px - L)/pw()*(v1 - v0); }

function draw(){
  if (!W) return;
  ctx.clearRect(0,0,W,H);
  const mono = "11px " + F_MONO;
  ctx.font = mono;
  const i0 = Math.max(0, Math.floor(v0)), i1 = Math.min(N()-1, Math.ceil(v1));
  const pxDay = pw()/(v1-v0);

  // Hauptfläche
  ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw(), mainH); ctx.clip();
  ctx.fillStyle = C.night; ctx.fillRect(L, T, pw(), mainH);
  for (let i = i0; i <= i1; i++){
    const r = days[i], xa = Math.floor(X(i)), xb = Math.ceil(X(i+1)), w = xb - xa;
    if (r.civ==="day"){ ctx.fillStyle=C.twilight; ctx.fillRect(xa,T,w,mainH); }
    else if (r.civ==="ok"){ ctx.fillStyle=C.twilight; ctx.fillRect(xa, Y(r.dawn), w, Y(r.dusk)-Y(r.dawn)); }
    if (r.sun==="day"){ ctx.fillStyle=C.day; ctx.fillRect(xa,T,w,mainH); }
    else if (r.sun==="ok"){ ctx.fillStyle=C.day; ctx.fillRect(xa, Y(r.rise), w, Y(r.set)-Y(r.rise)); }
  }
  // Stundenraster
  const step = mainH < 300 ? 3 : 2;
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  for (let h = step; h < 24; h += step){ ctx.beginPath(); ctx.moveTo(L, Math.round(Y(h))+.5); ctx.lineTo(W-R, Math.round(Y(h))+.5); ctx.stroke(); }
  // Monatslinien
  for (let i = i0; i <= i1; i++) if (days[i].date.getUTCDate()===1){ const x=Math.round(X(i))+.5; ctx.beginPath(); ctx.moveTo(x,T); ctx.lineTo(x,T+mainH); ctx.stroke(); }
  // Sonnenhöchststand
  ctx.strokeStyle = C.noon; ctx.lineWidth = 1.5; ctx.setLineDash([4,4]); ctx.beginPath();
  for (let i = i0; i <= i1; i++){ const x = X(i+0.5), y = Y(days[i].noon); if (i===i0 || days[i].off!==days[i-1].off) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();

  // Zeitachse links
  ctx.fillStyle = C.muted; ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (let h = 0; h <= 24; h += step) ctx.fillText(String(h).padStart(2,"0")+":00", L-6, Y(h));

  // Tageslängen-Streifen
  const sT = T + mainH + gap, sB = sT + stripH;
  let mn = 24, mx = 0; days.forEach(r=>{ mn=Math.min(mn,r.len); mx=Math.max(mx,r.len); });
  mn = Math.max(0, Math.floor(mn) - 1); mx = Math.min(24, Math.ceil(mx) + 1);
  const SY = v => sB - (v - mn)/(mx - mn)*stripH;
  ctx.fillStyle = C.muted; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillText("Tageslänge", L, sT - 8);
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  const sStep = (mx-mn) > 12 ? 4 : 2;
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  for (let v = Math.ceil(mn/sStep)*sStep; v <= mx; v += sStep){ const y=Math.round(SY(v))+.5; ctx.beginPath(); ctx.moveTo(L,y); ctx.lineTo(W-R,y); ctx.stroke(); ctx.fillText(v+" h", L-6, y); }
  ctx.save(); ctx.beginPath(); ctx.rect(L, sT, pw(), stripH); ctx.clip();
  ctx.beginPath(); ctx.moveTo(X(i0+.5), sB);
  for (let i=i0;i<=i1;i++) ctx.lineTo(X(i+.5), SY(days[i].len));
  ctx.lineTo(X(i1+.5), sB); ctx.closePath();
  ctx.globalAlpha = .45; ctx.fillStyle = C.day; ctx.fill(); ctx.globalAlpha = 1;
  ctx.beginPath(); for (let i=i0;i<=i1;i++){ const x=X(i+.5),y=SY(days[i].len); i===i0?ctx.moveTo(x,y):ctx.lineTo(x,y); }
  ctx.strokeStyle = C["day-edge"]; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();

  // Datumsachse
  ctx.fillStyle = C.muted; ctx.textAlign = "center"; ctx.textBaseline = "top";
  const yA = sB + 8;
  if (pxDay >= 14){
    const every = pxDay >= 26 ? 1 : 7;
    for (let i=i0;i<=i1;i++){
      const dt = days[i].date;
      if (every===1 || dt.getUTCDay()===1){ const x = X(i+.5); if (x<L||x>W-R) continue;
        ctx.fillText(String(dt.getUTCDate()), x, yA);
      }
      if (dt.getUTCDate()===1 || i===i0){ const x=Math.max(L+14, X(i+.5)); ctx.fillStyle=C.fg; ctx.fillText(MONTHS[dt.getUTCMonth()], x, yA+14); ctx.fillStyle=C.muted; }
    }
  } else {
    const narrow = pxDay*30 < 34;
    for (let i=i0;i<=i1;i++){ const dt = days[i].date; if (dt.getUTCDate()!==1) continue;
      if (narrow && dt.getUTCMonth()%2) continue;
      const x = X(i+15); if (x<L||x>W-R) continue;
      ctx.fillText(MONTHS[dt.getUTCMonth()] + (dt.getUTCMonth()===0 ? " "+String(dt.getUTCFullYear()).slice(2) : ""), x, yA);
    }
  }

  // Zeitumstellungen
  ctx.textBaseline = "alphabetic";
  dst.forEach(d => {
    const x = Math.round(X(d.i))+.5; if (x < L || x > W-R) return;
    ctx.strokeStyle = C.dst; ctx.lineWidth = 2; ctx.setLineDash([5,4]);
    ctx.beginPath(); ctx.moveTo(x, T-6); ctx.lineTo(x, sB); ctx.stroke(); ctx.setLineDash([]);
    const lbl = (d.delta<0 ? "−1 h " : "+1 h ") + days[d.i].date.getUTCDate()+". "+MONTHS[days[d.i].date.getUTCMonth()];
    ctx.font = "600 11px " + F_SANS; ctx.fillStyle = C.dst;
    const tw = ctx.measureText(lbl).width;
    ctx.textAlign = x + tw + 6 > W - R ? "right" : "left";
    ctx.fillText(lbl, ctx.textAlign==="left" ? x+5 : x-5, T-10);
    ctx.font = mono;
  });

  // Heute
  const xt = X(todayIdx+.5);
  if (xt >= L && xt <= W-R){
    ctx.strokeStyle = C.today; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(xt, T); ctx.lineTo(xt, sB); ctx.stroke();
  }

  // Auswahl
  const xs = X(sel+.5);
  if (xs >= L && xs <= W-R){
    const r = days[sel];
    ctx.strokeStyle = C.fg; ctx.lineWidth = 1; ctx.globalAlpha=.8;
    ctx.beginPath(); ctx.moveTo(Math.round(xs)+.5, T); ctx.lineTo(Math.round(xs)+.5, sB); ctx.stroke(); ctx.globalAlpha=1;
    const dot = (y,col) => { ctx.beginPath(); ctx.arc(xs,y,4,0,2*Math.PI); ctx.fillStyle=col; ctx.fill(); ctx.strokeStyle=C.surface; ctx.lineWidth=1.5; ctx.stroke(); };
    if (r.sun==="ok"){
      dot(Y(r.rise), C["day-edge"]); dot(Y(r.set), C["day-edge"]);
      ctx.font = "500 11px " + F_MONO; ctx.fillStyle = C.fg; ctx.textBaseline="middle";
      const right = xs < L + pw()*0.75; ctx.textAlign = right ? "left" : "right";
      const ox = right ? 8 : -8;
      const tag = (y, s) => { const tw = ctx.measureText(s).width; ctx.fillStyle = C.surface; ctx.globalAlpha=.9; ctx.fillRect(right? xs+ox-3 : xs+ox-tw-3, y-8, tw+6, 16); ctx.globalAlpha=1; ctx.fillStyle=C.fg; ctx.fillText(s, xs+ox, y); };
      tag(Y(r.rise), hm(r.rise)); tag(Y(r.set), hm(r.set));
      ctx.font = mono;
    }
    dot(SY(r.len), C["day-edge"]);
  }
  ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(L+.5, T+.5, pw()-1, mainH-1);
  renderReadout();
}

function renderReadout(){
  const r = days[sel], p = days[sel-1];
  const parts = [`<b>${dstr(r.date,true)}</b>`];
  if (r.sun==="ok"){
    parts.push(`Aufgang ${hm(r.rise)}`, `Untergang ${hm(r.set)}`, `Tageslicht ${dur(r.len)}${p?" ("+signMin(r.len-p.len)+")":""}`);
  } else parts.push(r.sun==="day" ? "Polartag" : "Polarnacht");
  if (r.civ==="ok") parts.push(`Dämmerung ${hm(r.dawn)} / ${hm(r.dusk)}`);
  parts.push(offStr(r.off));
  $("readout").innerHTML = parts.map(s=>`<span>${s}</span>`).join("");
}

// ---------- Interaktion ----------
const pts = new Map(); let drag = null, pinch = null, moved = false;
const relX = e => e.clientX - cv.getBoundingClientRect().left;
function selectAt(px){ const d = Math.floor(dayAtX(px)); if (d>=0 && d<N()){ sel = d; draw(); } }
cv.addEventListener("pointerdown", e => {
  cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, relX(e)); moved = false;
  if (pts.size === 1) drag = {x:relX(e), a:v0, b:v1};
  if (pts.size === 2){ const [a,b] = [...pts.values()]; pinch = {d:Math.abs(a-b), mid:dayAtX((a+b)/2), a:v0, b:v1}; drag = null; }
});
cv.addEventListener("pointermove", e => {
  const x = relX(e);
  if (!pts.has(e.pointerId)){ if (e.pointerType==="mouse") selectAt(x); return; }
  pts.set(e.pointerId, x);
  if (pinch && pts.size === 2){
    const [a,b] = [...pts.values()]; const d = Math.max(10, Math.abs(a-b));
    const f = pinch.d / d, span = (pinch.b - pinch.a)*f;
    const frac = ((a+b)/2 - L)/pw();
    setView(pinch.mid - frac*span, pinch.mid - frac*span + span); moved = true; return;
  }
  if (drag){
    const dx = x - drag.x;
    if (Math.abs(dx) > 4){ moved = true; cv.classList.add("dragging"); }
    if (moved){ const shift = dx/pw()*(drag.b-drag.a); setView(drag.a - shift, drag.b - shift); }
    else selectAt(x);
  }
});
const end = e => {
  if (!moved && pts.size===1) selectAt(relX(e));
  pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
  if (pts.size === 0){ drag = null; cv.classList.remove("dragging"); }
};
cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
cv.addEventListener("wheel", e => {
  e.preventDefault();
  const f = Math.exp((e.deltaY || e.deltaX) * 0.0015);
  zoomBy(f, dayAtX(relX(e)));
}, {passive:false});
cv.addEventListener("keydown", e => {
  const k = e.key;
  if (k==="ArrowLeft"||k==="ArrowRight"){
    sel = Math.max(0, Math.min(N()-1, sel + (k==="ArrowRight"?1:-1)));
    if (sel < v0) setView(sel, sel + (v1-v0)); else if (sel+1 > v1) setView(sel+1-(v1-v0), sel+1); else draw();
    e.preventDefault();
  } else if (k==="+"||k==="="){ zoomBy(.7, sel+.5); } else if (k==="-"){ zoomBy(1/.7, sel+.5); }
});
$("z-all").onclick = () => setView(0, N());
$("z-3m").onclick = () => zoomTo(91);
$("z-1m").onclick = () => zoomTo(30);
$("z-in").onclick = () => zoomBy(.6, sel+.5);
$("z-out").onclick = () => zoomBy(1/.6, sel+.5);

// ---------- Ort ----------
const preset = $("preset");
preset.innerHTML = PRESETS.map((p,i)=>`<option value="${i}">${p[0]}</option>`).join("") + `<option value="custom">Eigene Koordinaten</option>`;
function applyPreset(i){
  const p = PRESETS[i]; S = {name:p[0], lat:p[1], lon:p[2], tz:p[3]};
  $("lat").value = p[1]; $("lon").value = p[2]; $("tz").value = p[3];
  rebuild();
}
function rebuild(keepView){
  const span = v1 - v0, rel0 = v0;
  compute(); sel = todayIdx; renderStats();
  if (keepView) setView(rel0, rel0 + span); else setView(0, N());
}
preset.onchange = () => { if (preset.value !== "custom"){ applyPreset(+preset.value); save(); } };
function fromInputs(){
  const lat = parseFloat($("lat").value), lon = parseFloat($("lon").value), tz = $("tz").value.trim();
  if (isNaN(lat) || isNaN(lon) || Math.abs(lat) >= 90 || Math.abs(lon) > 180) return;
  if (!validTz(tz)){ $("tz").setCustomValidity("Unbekannte Zeitzone, z. B. Europe/Berlin"); $("tz").reportValidity(); return; }
  $("tz").setCustomValidity("");
  preset.value = "custom"; S = {name:"Eigener Ort", lat, lon, tz}; rebuild(true); save();
}
["lat","lon","tz"].forEach(id => $(id).addEventListener("change", fromInputs));
function save(){ try{ localStorage.setItem("tageslicht-ort", JSON.stringify({p:preset.value, S})); }catch(e){} }
function load(){
  try{ const o = JSON.parse(localStorage.getItem("tageslicht-ort")); if (o && o.S && validTz(o.S.tz)){
    preset.value = o.p; S = o.S; $("lat").value = S.lat; $("lon").value = S.lon; $("tz").value = S.tz; return true; } }catch(e){}
  return false;
}

// ---------- Start ----------
readColors();
if (!load()) { preset.value = "0"; $("lat").value = S.lat; $("lon").value = S.lon; $("tz").value = S.tz; }
compute(); sel = todayIdx; renderStats();
layout(); setView(0, N());
new ResizeObserver(() => { layout(); draw(); }).observe($("box"));
const mq = matchMedia("(prefers-color-scheme: dark)");
const recolor = () => { readColors(); draw(); };
mq.addEventListener ? mq.addEventListener("change", recolor) : mq.addListener(recolor);
})();
