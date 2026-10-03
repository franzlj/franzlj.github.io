"use strict";
/* ================= Model ================= */
const FIELDS = [
  {k:'title', sec:'Inhalt', label:'Titel', kind:'text', ph:'z. B. Waschmaschine', hint:'Kopfzeile. Wird beim Start gesetzt, Updates ändern ihn nicht.', top:true},
  {k:'message', sec:'Inhalt', label:'Nachricht', kind:'area', ph:'z. B. Programm läuft', hint:'Hauptzeile. Wird durch den Timer ersetzt, wenn chronometer aktiv ist.', top:true},
  {k:'critical_text', sec:'Inhalt', label:'Kurztext', kind:'text', ph:'z. B. 45 %', hint:'Oben rechts, wenn kein Fortschritt gesetzt ist. Im kompakten Dynamic Island sichtbar.'},
  {k:'progress', sec:'Fortschritt', label:'Wert', kind:'num', ph:'z. B. 45', half:true},
  {k:'progress_max', sec:'Fortschritt', label:'Maximum', kind:'num', ph:'z. B. 100', half:true},
  {k:'progress_bar_direction', sec:'Fortschritt', label:'Füllrichtung', kind:'select', opts:[['','Standard'],['increasing','increasing · füllt sich'],['decreasing','decreasing · leert sich']]},
  {k:'chronometer', sec:'Timer', label:'Timer anzeigen', kind:'bool'},
  {k:'when', sec:'Timer', label:'Zeitpunkt', kind:'num', ph:'z. B. 2700', hint:'Unix-Zeitstempel, oder Sekunden ab jetzt bei relativ.'},
  {k:'when_relative', sec:'Timer', label:'Relativ (Sekunden ab jetzt)', kind:'bool'},
  {k:'notification_icon', sec:'Icon & Farben', label:'Icon', kind:'icon', ph:'z. B. mdi:washing-machine'},
  {k:'notification_icon_color', sec:'Icon & Farben', label:'Icon-Farbe', kind:'color', ph:'z. B. #03A9F4', half:true},
  {k:'progress_bar_color', sec:'Icon & Farben', label:'Balkenfarbe', kind:'color', ph:'= Icon-Farbe', half:true},
  {k:'background_color', sec:'Icon & Farben', label:'Hintergrund', kind:'color', ph:'Standard: schwarz', half:true},
  {k:'text_color', sec:'Icon & Farben', label:'Textfarbe', kind:'color', ph:'automatisch', half:true},
  {k:'tag', sec:'Verhalten', label:'Tag', kind:'text', ph:'z. B. waschmaschine', hint:'Pflicht. Gleicher Tag aktualisiert die laufende Activity. Buchstaben, Ziffern, - und _, max. 64 Zeichen.', notpl:true},
  {k:'url', sec:'Verhalten', label:'Ziel beim Antippen', kind:'text', ph:'z. B. /lovelace/0'},
  {k:'relevance_score', sec:'Verhalten', label:'Relevanz (Beta)', kind:'num', ph:'z. B. 0.5', hint:'0.0 bis 1.0. Höchster Wert bekommt das Dynamic Island.', half:true},
  {k:'silent', sec:'Verhalten', label:'Leises Update', kind:'bool', hint:'Ohne Ton, niedrigere Priorität. Beim Start ohne Wirkung.'},
  {k:'android_color', sec:'Verhalten', label:'Android: color = Icon-Farbe ergänzen', kind:'bool', virt:true},
];
const FBY = Object.fromEntries(FIELDS.map(f=>[f.k,f]));
const NUMF = new Set(['progress','progress_max','when','relevance_score']);
const COLORF = new Set(['notification_icon_color','progress_bar_color','background_color','text_color']);
const ORDER = ['tag','live_update','critical_text','progress','progress_max','chronometer','when','when_relative','notification_icon','notification_icon_color','progress_bar_color','progress_bar_direction','background_color','text_color','url','silent','relevance_score','color'];
const TYPES = [['text','Text'],['number','Zahl'],['percent','Prozent'],['timestamp','Zeitpunkt'],['duration','Dauer (Sek.)'],['boolean','Ja/Nein'],['color','Farbe']];

const PRESETS = {
  waschmaschine:{name:'Waschmaschine', f:{title:'Waschmaschine', message:"{{ states('sensor.waschmaschine_programmphase') }}", tag:'waschmaschine', chronometer:true, when:"{{ as_timestamp(states('sensor.waschmaschine_endzeit')) | int }}", when_relative:false, progress_bar_direction:'', notification_icon:'mdi:washing-machine', notification_icon_color:'#2196F3', url:'/lovelace/haushalt'},
    t:{"states('sensor.waschmaschine_programmphase')":{type:'text',sample:'Spülen · 1 von 2'}, "as_timestamp(states('sensor.waschmaschine_endzeit'))":{type:'timestamp',sample:45}}},
  eauto:{name:'E-Auto laden', f:{title:'E-Auto', message:"Lädt · noch {{ states('sensor.ev_restzeit_min') }} min", critical_text:"{{ states('sensor.ev_akku') }} %", tag:'ev-charging', progress:"{{ states('sensor.ev_akku') | int(0) }}", progress_max:'100', notification_icon:'mdi:ev-station', notification_icon_color:'#4CAF50', silent:true, relevance_score:'0.6'},
    t:{"states('sensor.ev_restzeit_min')":{type:'number',sample:45}, "states('sensor.ev_akku')":{type:'percent',sample:62}}},
  spueler:{name:'Geschirrspüler', f:{title:'Geschirrspüler', message:'Vorspülen läuft', critical_text:'Vorspülen', tag:'dishwasher', progress:'20', progress_max:'100', notification_icon:'mdi:dishwasher', notification_icon_color:'#26C6DA', background_color:'#0E2A30'}, t:{}},
  timer:{name:'Küchentimer', f:{title:'Küchentimer', message:'Pasta', tag:'kitchen_timer', chronometer:true, when:'480', when_relative:true, notification_icon:'mdi:timer-outline', notification_icon_color:'#FF9800', relevance_score:'1.0'}, t:{}},
  tuer:{name:'Garagentor', f:{title:'Garagentor', message:"{% if is_state('cover.garage','open') %}Offen seit {{ relative_time(states.cover.garage.last_changed) }}{% else %}Geschlossen{% endif %}", critical_text:'Offen', tag:'garage', notification_icon:'mdi:garage-open-variant', notification_icon_color:'#F44336', relevance_score:'0.2', background_color:'#2A1414'},
    t:{"{% if is_state('cover.garage','open') %}Offen seit {{ relative_time(states.cover.garage.last_changed) }}{% else %}Geschlossen{% endif %}":{type:'text',sample:'Offen seit 12 Minuten'}}},
  leer:{name:'Leer', f:{tag:'meine_activity'}, t:{}},
};

function blankFields(){ const o={}; FIELDS.forEach(f=>o[f.k]= f.kind==='bool'?false:''); return o; }
let S = null;
S = loadState() || fromPreset('waschmaschine');
function fromPreset(id){ const p=PRESETS[id]; const f=Object.assign(blankFields(),JSON.parse(JSON.stringify(p.f))); return {fields:f, templates:JSON.parse(JSON.stringify(p.t)), service:(S&&S.service)||'notify.mobile_app_iphone', mode:'start', fmt:'automation', preset:id}; }
function loadState(){ try{ const s=JSON.parse(localStorage.getItem('la-studio-v2')); if(s&&s.fields){ s.fields=Object.assign(blankFields(),s.fields); return s;} }catch(e){} return null; }
function saveState(){ try{ localStorage.setItem('la-studio-v2', JSON.stringify(S)); }catch(e){} }
let sentAt = Date.now();

/* ================= Templates ================= */
const RE_EXPR = /\{\{([\s\S]*?)\}\}/g;
// Expressions that only differ by trailing filters (e.g. "| int(0)") share one sample value.
function splitExpr(e){ e=e.trim(); let depth=0, quote=null;
  for(let i=0;i<e.length;i++){ const c=e[i];
    if(quote){ if(c===quote) quote=null; continue; }
    if(c==="'"||c==='"'){ quote=c; continue; }
    if(c==='('||c==='[') depth++; else if(c===')'||c===']') depth--;
    else if(c==='|' && depth===0){ return {base:e.slice(0,i).trim(), filters:e.slice(i+1).split('|').map(x=>x.trim()).filter(Boolean)}; } }
  return {base:e, filters:[]}; }
function applyFilters(val, filters){ for(const f of filters){ const m=f.match(/^(int|float|round)\b\s*(?:\(([^)]*)\))?$/); if(!m) continue; const n=parseFloat(String(val).replace(',','.')); const d=parseFloat(m[2]); if(!isFinite(n)){ val = m[1]==='int'? (isFinite(d)?d:0) : val; continue; }
    val = m[1]==='int'? Math.trunc(n) : m[1]==='round'? +n.toFixed(isFinite(d)?d:0) : n; } return val; }
function tplKeys(v){ if(typeof v!=='string'||!v.includes('{')) return []; if(v.includes('{%')) return [v.trim()]; const out=[]; v.replace(RE_EXPR,(m,e)=>{ out.push(splitExpr(e).base); return m; }); return out; }
function hasTpl(v){ return typeof v==='string' && (/\{\{[\s\S]*?\}\}/.test(v) || v.includes('{%')); }
function guessType(fk, key){
  if(COLORF.has(fk)) return 'color';
  if(fk==='when') return S.fields.when_relative ? 'duration' : 'timestamp';
  if(fk==='progress'||fk==='progress_max') return /akku|battery|percent|prozent|soc|level/i.test(key)?'percent':'number';
  if(NUMF.has(fk)) return 'number';
  if(/as_timestamp|last_changed|last_updated|timestamp/i.test(key)) return 'timestamp';
  if(/\|\s*(int|float|round)/.test(key)) return 'number';
  return 'text';
}
function defSample(type){ return {text:'Beispiel', number:42, percent:50, timestamp:30, duration:1800, boolean:true, color:'#03A9F4'}[type]; }
function usage(){ const u={}; FIELDS.forEach(f=>{ tplKeys(S.fields[f.k]).forEach(k=>{ (u[k]=u[k]||[]); if(!u[k].includes(f.k)) u[k].push(f.k); }); }); return u; }
function ensureTemplates(){ const u=usage(); Object.entries(u).forEach(([k,fs])=>{ if(!S.templates[k]){ const t=guessType(fs[0],k); S.templates[k]={type:t, sample:defSample(t)}; } }); return u; }
function fmtDur(sec){ sec=Math.round(sec); const h=Math.floor(sec/3600), m=Math.round((sec%3600)/60); return h? `${h} h ${String(m).padStart(2,'0')} min` : `${m} min`; }
function renderTpl(key, ctx){
  const t=S.templates[key]; if(!t) return ctx==='num'?'0':'…';
  const v=t.sample;
  switch(t.type){
    case 'timestamp': { const ms=sentAt+Number(v||0)*60000; return ctx==='num'? String(Math.round(ms/1000)) : new Date(ms).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}); }
    case 'duration': return ctx==='num'? String(Number(v)||0) : fmtDur(Number(v)||0);
    case 'boolean': return ctx==='num'? (v?'1':'0') : (v?'true':'false');
    case 'number': case 'percent': return String(v===''||v==null?0:v);
    default: return String(v==null?'':v);
  }
}
function resolve(v, ctx){ if(typeof v!=='string') return v; if(v.includes('{%')) return renderTpl(v.trim(),ctx); return v.replace(RE_EXPR,(m,e)=>{ const x=splitExpr(e); const t=S.templates[x.base];
  if(x.filters.length && t && ['number','percent','text'].includes(t.type)) return String(applyFilters(t.sample, x.filters));
  return renderTpl(x.base,ctx); }); }
function num(k){ const v=S.fields[k]; if(v===''||v==null) return null; const n=parseFloat(String(resolve(String(v),'num')).replace(',','.')); return isFinite(n)?n:null; }
function txt(k){ const v=S.fields[k]; return v? String(resolve(v,'text')) : ''; }

/* ================= Icons ================= */
let MDI=null, MDI_NAMES=[];
const camel = n => 'mdi'+n.split('-').map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join('');
const kebab = c => c.slice(3).replace(/([a-z])([A-Z0-9])/g,'$1-$2').replace(/([0-9])([A-Z])/g,'$1-$2').toLowerCase();
const FALLBACK_PATH = 'M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4Z';
function iconPath(name){ name=String(name||'').trim().replace(/^mdi:/,''); if(MDI&&name){ const p=MDI[camel(name)]; if(p) return p; } return MDI? FALLBACK_PATH : null; }
function iconSvg(name, color){ const p=iconPath(name||'home-assistant'); return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="${esc(color)}" d="${p||FALLBACK_PATH}"/></svg>`; }
import('./mdi.js').then(m=>{ MDI=m; MDI_NAMES=Object.keys(m).filter(k=>k.startsWith('mdi')).map(kebab); renderPreview(); renderIconPick(); }).catch(()=>{ renderPreview(); });

/* ================= Colors ================= */
const cvs=document.createElement('canvas').getContext('2d');
function toHex(c, fb){ if(!c) return fb; cvs.fillStyle='#010203'; cvs.fillStyle=c; const r=cvs.fillStyle; if(r==='#010203' && c.toLowerCase()!=='#010203') return fb; return r.startsWith('#')?r:fb; }
function lum(hex){ const n=parseInt(hex.slice(1),16), ch=[n>>16&255,n>>8&255,n&255].map(x=>{x/=255;return x<=.03928?x/12.92:((x+.055)/1.055)**2.4}); return .2126*ch[0]+.7152*ch[1]+.0722*ch[2]; }
function mix(hex, a, base){ const p=h=>{const n=parseInt(h.slice(1),16);return[n>>16&255,n>>8&255,n&255]}; const x=p(hex), b=p(base); return '#'+x.map((v,i)=>Math.round(v*a+b[i]*(1-a)).toString(16).padStart(2,'0')).join(''); }

/* ================= Preview ================= */
const $=id=>document.getElementById(id);
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function timerState(){
  if(!S.fields.chronometer) return null;
  const w=num('when'); if(w==null) return null;
  const target = S.fields.when_relative ? sentAt + w*1000 : w*1000;
  const now=Date.now(); const total=target-sentAt; const rem=target-now;
  return {target, total, rem, countdown: total>0};
}
function fmtClock(ms){ const s=Math.max(0,Math.floor(ms/1000)); const h=Math.floor(s/3600), m=Math.floor(s%3600/60), x=s%60; return h? `${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}` : `${m}:${String(x).padStart(2,'0')}`; }
function timerText(ts){ if(!ts) return ''; return ts.countdown ? fmtClock(Math.max(0,ts.rem)) : fmtClock(Date.now()-ts.target); }
function view(){
  const p=num('progress'), pm=num('progress_max'); const hasProg = p!=null && pm!=null && pm>0;
  const ts=timerState();
  const iconC=toHex(txt('notification_icon_color'),'#03A9F4');
  const barC=toHex(txt('progress_bar_color'), iconC);
  const bg=toHex(txt('background_color'),'#000000');
  const fg=toHex(txt('text_color'), lum(bg)>0.45?'#000000':'#FFFFFF');
  const dir=S.fields.progress_bar_direction;
  let fill=null;
  if(hasProg){ const r=Math.max(0,Math.min(1,p/pm)); fill = dir==='decreasing'?1-r:r; }
  else if(ts && ts.countdown){ const r=Math.max(0,Math.min(1,ts.rem/ts.total)); fill = dir==='increasing'?1-r:r; }
  const pct = hasProg ? Math.round(p/pm*100)+'%' : '';
  return {hasProg, ts, iconC, barC, bg, fg, fill, pct, crit:txt('critical_text'), title:txt('title'), msg:txt('message'), icon:txt('notification_icon')};
}
function setEditable(el, k, text){ if(document.activeElement===el) return; el.textContent=text; }
function renderPreview(){
  const v=view();
  const card=$('laCard'); card.style.background=v.bg; card.style.color=v.fg;
  const tile = lum(v.bg)>0.45 ? mix(v.iconC,.18,'#ffffff') : mix(v.iconC,.2,'#000000');
  $('laIcon').style.background=tile; $('laIcon').innerHTML=iconSvg(v.icon, v.iconC);
  setEditable(card.querySelector('[data-f=title]'),'title',v.title);
  const showTimer=!!v.ts;
  $('laMsg').hidden=showTimer; $('laTimer').hidden=!showTimer;
  setEditable($('laMsg'),'message',v.msg);
  $('laCrit').hidden=v.hasProg; $('laPct').hidden=!v.hasProg; $('laPct').textContent=v.pct;
  setEditable($('laCrit'),'critical_text',v.crit);
  const bar=$('laBar'); bar.hidden=v.fill==null; if(v.fill!=null){ const i=bar.firstElementChild; i.style.width=(v.fill*100).toFixed(1)+'%'; i.style.background=v.barC; }
  // Dynamic Island (system dark style)
  $('diCIcon').innerHTML=iconSvg(v.icon,v.iconC); $('diMin').innerHTML=iconSvg(v.icon,v.iconC);
  $('diEIcon').style.background=mix(v.iconC,.2,'#000000'); $('diEIcon').innerHTML=iconSvg(v.icon,v.iconC);
  $('diETitle').textContent=v.title; $('diETr').textContent= v.hasProg? v.pct : v.crit;
  $('diEBody').textContent=v.msg; $('diEBody').classList.toggle('la-timer',false);
  const eb=$('diEBar'); eb.hidden=v.fill==null; if(v.fill!=null){ const i=eb.firstElementChild; i.style.width=(v.fill*100).toFixed(1)+'%'; i.style.background=v.barC; }
  tick();
}
function tick(){
  const now=new Date();
  $('lkClock').textContent=now.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
  $('lkDate').textContent=now.toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'});
  const ts=timerState(); const t=timerText(ts);
  if(ts){ $('laTimer').textContent=t; }
  const v=view();
  $('diCTr').textContent = ts? t : (v.crit || v.pct);
  if(ts && !v.hasProg && v.fill!=null){ [$('laBar'),$('diEBar')].forEach(b=>{ b.firstElementChild.style.width=(v.fill*100).toFixed(1)+'%'; }); }
  if(ts){ $('diEBody').textContent=t; $('diEBody').classList.add('la-timer'); }
}
setInterval(tick, 500);

// WYSIWYG editing directly in the preview
document.querySelectorAll('#laCard [data-f]').forEach(el=>{
  el.addEventListener('focus',()=>{ el.textContent=S.fields[el.dataset.f]||''; });
  el.addEventListener('input',()=>{ const k=el.dataset.f; S.fields[k]=el.textContent.replace(/\n+/g,' '); const inp=$('f_'+k); if(inp) inp.value=S.fields[k]; changed(k,true); });
  el.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); el.blur(); } });
  el.addEventListener('blur',()=>renderPreview());
});
document.querySelectorAll('[data-jump]').forEach(el=>el.addEventListener('click',()=>jump(el.dataset.jump)));
function jump(k){ const inp=$('f_'+k); if(!inp) return; const fl=inp.closest('.fld'); fl.scrollIntoView({block:'center',behavior:'smooth'}); fl.classList.remove('flash'); void fl.offsetWidth; fl.classList.add('flash'); setTimeout(()=>inp.focus({preventScroll:true}),250); }
$('optHints').addEventListener('change',e=>{ $('stage').classList.toggle('hints',e.target.checked); document.querySelectorAll('#laCard [data-f]').forEach(el=>el.contentEditable=e.target.checked?'plaintext-only':'false'); });
$('btnRestart').addEventListener('click',()=>{ sentAt=Date.now(); renderPreview(); });

/* ================= Form ================= */
function buildForm(){
  const form=$('form'); form.innerHTML='';
  const secs={};
  FIELDS.forEach(f=>{
    if(!secs[f.sec]){ const s=document.createElement('div'); s.className='sec'; s.innerHTML=`<h3>${esc(f.sec)}</h3>`; form.appendChild(s); secs[f.sec]={el:s, half:null}; }
    const sec=secs[f.sec];
    const el=document.createElement('div'); el.className='fld';
    const keyLabel = f.virt? '' : `<code>${f.k}</code>`;
    if(f.kind==='bool'){
      el.innerHTML=`<label class="sw" for="f_${f.k}" style="justify-content:flex-start"><input type="checkbox" id="f_${f.k}"> <span>${esc(f.label)}</span> ${keyLabel}</label>${f.hint?`<div class="hint">${esc(f.hint)}</div>`:''}`;
    } else if(f.kind==='select'){
      el.innerHTML=`<label for="f_${f.k}">${esc(f.label)} ${keyLabel}</label><div class="inp"><select id="f_${f.k}">${f.opts.map(o=>`<option value="${o[0]}">${esc(o[1])}</option>`).join('')}</select></div>`;
    } else {
      const area=f.kind==='area';
      const ctl= area? `<textarea id="f_${f.k}" rows="2" spellcheck="false" placeholder="${esc(f.ph||'')}"></textarea>` : `<input id="f_${f.k}" class="tplish" spellcheck="false" autocomplete="off" placeholder="${esc(f.ph||'')}" ${f.kind==='num'?'inputmode="decimal"':''}>`;
      const color= f.kind==='color'? `<input type="color" id="c_${f.k}" aria-label="${esc(f.label)} wählen">` : '';
      const tplBtn= f.notpl? '' : `<button class="ib" type="button" data-ins="${f.k}" title="Template einfügen">{ }</button>`;
      el.innerHTML=`<label for="f_${f.k}">${esc(f.label)} ${keyLabel}</label><div class="inp">${color}${ctl}${tplBtn}</div>${f.hint?`<div class="hint">${esc(f.hint)}</div>`:''}${f.kind==='icon'?'<div class="iconpick" id="iconPick"></div>':''}`;
    }
    if(f.half){ if(!sec.half||sec.half.childElementCount>=2){ sec.half=document.createElement('div'); sec.half.className='row2'; sec.el.appendChild(sec.half);} sec.half.appendChild(el); }
    else { sec.half=null; sec.el.appendChild(el); }
  });
  FIELDS.forEach(f=>{
    const inp=$('f_'+f.k);
    if(f.kind==='bool'){ inp.addEventListener('change',()=>{ S.fields[f.k]=inp.checked; changed(f.k); }); }
    else { inp.addEventListener('input',()=>{ S.fields[f.k]=inp.value; changed(f.k); }); }
    const c=$('c_'+f.k); if(c) c.addEventListener('input',()=>{ inp.value=c.value.toUpperCase(); S.fields[f.k]=inp.value; changed(f.k); });
  });
  form.querySelectorAll('[data-ins]').forEach(b=>b.addEventListener('click',()=>insertTpl(b.dataset.ins)));
  fillForm();
}
function fillForm(){
  FIELDS.forEach(f=>{ const inp=$('f_'+f.k); if(f.kind==='bool') inp.checked=!!S.fields[f.k]; else inp.value=S.fields[f.k]??''; syncColor(f.k); });
  $('f_service').value=S.service; segSync(); renderIconPick();
}
function syncColor(k){ const c=$('c_'+k); if(!c) return; const v=S.fields[k]; const h=hasTpl(v)? toHex(txt(k),null) : toHex(v,null); c.value = h || (k==='background_color'?'#000000':k==='text_color'?'#ffffff':'#03a9f4'); }
function insertTpl(k){
  const inp=$('f_'+k); const isNum=NUMF.has(k);
  const snip = k==='when' ? (S.fields.when_relative? "{{ (states('sensor.restzeit_min') | int(0)) * 60 }}" : "{{ as_timestamp(states('sensor.endzeit')) | int }}")
    : isNum ? "{{ states('sensor.beispiel') | int(0) }}" : COLORF.has(k) ? "{{ '#4CAF50' if is_state('binary_sensor.beispiel','on') else '#9E9E9E' }}" : "{{ states('sensor.beispiel') }}";
  const s=inp.selectionStart??inp.value.length, e=inp.selectionEnd??s;
  const replace = isNum||COLORF.has(k);
  inp.value = replace? snip : inp.value.slice(0,s)+snip+inp.value.slice(e);
  S.fields[k]=inp.value; changed(k);
  inp.focus(); const at=inp.value.indexOf('sensor.'); if(at>=0){ const end=inp.value.indexOf("'",at); inp.setSelectionRange(at,end>at?end:at+7); }
}
function renderIconPick(){
  const box=$('iconPick'); if(!box) return;
  if(!MDI){ box.innerHTML='<div class="empty">Icons werden geladen …</div>'; return; }
  const q=String(S.fields.notification_icon||'').replace(/^mdi:/,'').trim().toLowerCase();
  let list = q ? MDI_NAMES.filter(n=>n.includes(q)) : ['washing-machine','tumble-dryer','dishwasher','ev-station','car-electric','battery-charging','timer-outline','garage-open-variant','door-open','lightbulb','thermometer','solar-power','home-assistant','bell-ring','package-variant','shield-home','robot-vacuum','coffee-maker','fan','water'];
  if(q) list.sort((a,b)=>(a.startsWith(q)?0:1)-(b.startsWith(q)?0:1)||a.length-b.length);
  list=list.slice(0,48);
  box.innerHTML = list.length? list.map(n=>`<button type="button" title="mdi:${n}" data-ic="${n}"><svg viewBox="0 0 24 24"><path d="${MDI[camel(n)]||FALLBACK_PATH}"/></svg></button>`).join('') : '<div class="empty">Kein Icon gefunden. Eigener Name wird trotzdem übernommen.</div>';
}
document.addEventListener('click',e=>{ const b=e.target.closest('[data-ic]'); if(!b) return; S.fields.notification_icon='mdi:'+b.dataset.ic; $('f_notification_icon').value=S.fields.notification_icon; changed('notification_icon'); });

function changed(k, fromPreview){
  if(k==='when'||k==='when_relative'||k==='chronometer') sentAt=Date.now();
  if(COLORF.has(k)) syncColor(k);
  if(k==='notification_icon') renderIconPick();
  S.preset=null; presetSync();
  ensureTemplates(); renderTemplates(); if(!fromPreview) renderPreview(); else renderPreviewExcept(); renderYaml(); saveState();
}
function renderPreviewExcept(){ renderPreview(); }

/* ================= Templates panel ================= */
function renderTemplates(){
  const u=ensureTemplates(); const box=$('tpls'); const keys=Object.keys(u);
  if(!keys.length){ box.innerHTML='<div class="tpl-empty">Noch keine Templates. Schreib <code>{{ states(\'sensor.x\') }}</code> in ein Feld oder nutze <code>{ }</code>. Jeder Ausdruck erscheint hier mit Typ und Beispielwert.</div>'; return; }
  // keep rows that still exist, so focused inputs survive
  const existing={}; box.querySelectorAll('.tpl').forEach(r=>existing[r.dataset.key]=r);
  if(!box.querySelector('.tpl')) box.innerHTML='';
  const want=new Set(keys);
  Object.entries(existing).forEach(([k,r])=>{ if(!want.has(k)) r.remove(); });
  keys.forEach((k,i)=>{
    let row=existing[k];
    if(!row){ row=buildTplRow(k); }
    row.querySelector('.tpl-used').innerHTML=u[k].map(f=>`<span>${f}</span>`).join('');
    if(box.children[i]!==row) box.insertBefore(row, box.children[i]||null);
  });
}
function buildTplRow(k){
  const row=document.createElement('div'); row.className='tpl'; row.dataset.key=k;
  const isBlock=k.includes('{%');
  row.innerHTML=`<div class="tpl-expr">${isBlock?esc(k):'<b>{{ </b>'+esc(k)+'<b> }}</b>'}</div><div class="tpl-used"></div><div class="note" style="margin-top:-4px">${isBlock?'Ganzer Block, ein Beispielergebnis.':'Gilt auch mit Filtern wie | int(0); int, float und round werden simuliert.'}</div><div class="tpl-ctl"><select aria-label="Typ">${TYPES.map(t=>`<option value="${t[0]}">${t[1]}</option>`).join('')}</select><div class="tpl-val"></div></div>`;
  const sel=row.querySelector('select'); sel.value=S.templates[k].type;
  sel.addEventListener('change',()=>{ const t=sel.value; S.templates[k]={type:t, sample:coerce(S.templates[k].sample,t)}; buildVal(row,k); tplChanged(k); });
  buildVal(row,k); return row;
}
function coerce(v,t){ if(t==='text') return String(v??''); if(t==='boolean') return !!v&&v!=='false'; if(t==='color') return /^#/.test(v)?v:'#03A9F4'; const n=parseFloat(v); if(t==='percent') return isFinite(n)?Math.max(0,Math.min(100,n)):50; if(t==='timestamp') return isFinite(n)&&Math.abs(n)<100000?n:30; return isFinite(n)?n:defSample(t); }
function buildVal(row,k){
  const t=S.templates[k]; const box=row.querySelector('.tpl-val'); const id='tv_'+Math.abs(hash(k));
  const set=(v)=>{ S.templates[k].sample=v; tplChanged(k); };
  switch(t.type){
    case 'percent': box.innerHTML=`<input type="range" min="0" max="100" step="1" id="${id}r" aria-label="Beispielwert"><input class="n" type="number" min="0" max="100" id="${id}">`;
      { const r=box.querySelector('[type=range]'), n=box.querySelector('.n'); r.value=n.value=t.sample; r.oninput=()=>{n.value=r.value;set(+r.value)}; n.oninput=()=>{r.value=n.value;set(+n.value)}; } break;
    case 'number': box.innerHTML=`<input type="number" step="any" id="${id}" aria-label="Beispielwert">`; { const n=box.querySelector('input'); n.value=t.sample; n.oninput=()=>set(n.value===''?0:+n.value); } break;
    case 'timestamp': box.innerHTML=`<input class="n" type="number" step="1" id="${id}" aria-label="Minuten ab jetzt"><small></small>`;
      { const n=box.querySelector('input'), sm=box.querySelector('small'); const upd=()=>{ const d=new Date(Date.now()+(+n.value||0)*60000); sm.textContent=`Min. ab jetzt · ${d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})} Uhr`; }; n.value=t.sample; upd(); n.oninput=()=>{upd();set(+n.value||0)}; } break;
    case 'duration': box.innerHTML=`<input class="n" type="number" step="1" min="0" id="${id}" aria-label="Sekunden"><small></small>`;
      { const n=box.querySelector('input'), sm=box.querySelector('small'); const upd=()=>sm.textContent='Sek. · '+fmtDur(+n.value||0); n.value=t.sample; upd(); n.oninput=()=>{upd();set(+n.value||0)}; } break;
    case 'boolean': box.innerHTML=`<label class="sw"><input type="checkbox" id="${id}"> wahr</label>`; { const c=box.querySelector('input'); c.checked=!!t.sample; c.onchange=()=>set(c.checked); } break;
    case 'color': box.innerHTML=`<input type="color" id="${id}" aria-label="Beispielfarbe"><small></small>`; { const c=box.querySelector('input'), sm=box.querySelector('small'); c.value=toHex(t.sample,'#03a9f4'); sm.textContent=c.value.toUpperCase(); c.oninput=()=>{sm.textContent=c.value.toUpperCase();set(c.value.toUpperCase())}; } break;
    default: box.innerHTML=`<input type="text" id="${id}" aria-label="Beispieltext">`; { const n=box.querySelector('input'); n.value=t.sample; n.oninput=()=>set(n.value); }
  }
}
function hash(s){ let h=0; for(const c of s) h=(h*31+c.charCodeAt(0))|0; return h; }
function tplChanged(k){ const u=usage(); if((u[k]||[]).includes('when')) sentAt=Date.now(); COLORF.forEach(syncColor); renderPreview(); renderYaml(); saveState(); }

/* ================= YAML ================= */
function q(s){ return '"'+String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n')+'"'; }
function scalar(k,v){
  if(typeof v==='boolean') return String(v);
  const s=String(v).trim();
  if(NUMF.has(k) && !hasTpl(s) && /^-?\d+(\.\d+)?$/.test(s.replace(',','.'))) return s.replace(',','.');
  if(/^[A-Za-z0-9_\-\/.]+$/.test(s) && !/^(true|false|yes|no|on|off|null|~|-?\d[\d.]*)$/i.test(s)) return s;
  return q(s);
}
function payload(){
  const F=S.fields;
  if(S.mode==='end') return {top:{message:'clear_notification'}, inner:{tag:F.tag||'meine_activity'}};
  const top={}; if(F.title) top.title=F.title; if(F.message) top.message=F.message;
  const inner={tag:F.tag, live_update:true};
  ORDER.forEach(k=>{ if(k==='tag'||k==='live_update'||k==='color') return; const f=FBY[k]; if(!f) return; const v=F[k];
    if(f.kind==='bool'){ if(v) inner[k]=true; return; }
    if(v!==''&&v!=null) inner[k]=v; });
  if(F.android_color && F.notification_icon_color) inner.color=F.notification_icon_color;
  if(!inner.tag) delete inner.tag;
  return {top, inner};
}
function yamlText(){
  const {top,inner}=payload(); const lines=[];
  const list=S.fmt==='automation'; const b= list? '  ' : '';
  lines.push((list?'- ':'')+'action: '+(S.service||'notify.mobile_app_iphone'));
  lines.push(b+'data:');
  Object.entries(top).forEach(([k,v])=>lines.push(b+'  '+k+': '+scalar(k,v)));
  lines.push(b+'  data:');
  ORDER.forEach(k=>{ if(k in inner) lines.push(b+'    '+k+': '+scalar(k,inner[k])); });
  return lines.join('\n');
}
function hl(line){
  const m=line.match(/^(\s*-?\s*)([A-Za-z_]+)(:)(.*)$/); if(!m) return esc(line);
  let val=m[4]; let vh=esc(val);
  if(/^\s*"/.test(val)) vh=`<span class="s">${esc(val).replace(/(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\})/g,'<span class="t">$1</span>')}</span>`;
  else if(/^\s*(-?\d|true|false)/.test(val)) vh=`<span class="n">${esc(val)}</span>`;
  else if(val.trim()) vh=`<span class="s">${esc(val)}</span>`;
  return esc(m[1])+`<span class="k">${esc(m[2])}</span>${m[3]}`+vh;
}
function renderYaml(){
  const t=yamlText(); $('yaml').innerHTML=t.split('\n').map(hl).join('\n');
  $('outInfo').textContent = S.fmt==='automation' ? 'für actions: in Automation oder Skript' : 'für Entwicklerwerkzeuge → Aktionen (YAML-Modus)';
  renderIssues();
}
function renderIssues(){
  const F=S.fields, out=[];
  const add=(t,c)=>out.push([t,c||'']);
  if(!F.tag) add('Tag fehlt. Ohne tag startet keine Live Activity.','err');
  else if(!/^[A-Za-z0-9_-]{1,64}$/.test(F.tag)) add('Tag darf nur Buchstaben, Ziffern, - und _ enthalten (max. 64 Zeichen).','err');
  if(S.mode==='end'){ add('Beendet die Activity mit diesem Tag per clear_notification.','ok'); }
  else {
    const p=F.progress!=='', pm=F.progress_max!=='';
    if(p!==pm) add('Fortschrittsbalken erscheint nur, wenn progress und progress_max gesetzt sind.');
    if(F.chronometer && F.when==='') add('Timer braucht einen Zeitpunkt (when).','err');
    if(!F.chronometer && F.when!=='') add('when ist gesetzt, aber der Timer (chronometer) ist aus.');
    if(F.chronometer && !F.when_relative && !hasTpl(F.when) && num('when')!=null && num('when')<1e9) add('when sieht nach Sekunden aus, nicht nach einem Unix-Zeitstempel. „Relativ“ aktivieren?');
    if(F.chronometer && F.message) add('Nachricht wird auf dem Sperrbildschirm durch den Timer ersetzt.');
    const r=num('relevance_score'); if(r!=null && (r<0||r>1)) add('relevance_score wird auf 0.0 bis 1.0 begrenzt.');
    if(!F.title) add('Android zeigt ohne title nur eine normale Benachrichtigung.');
    ['progress','progress_max'].forEach(k=>{ if(F[k]!==''&&!hasTpl(F[k])&&!/^-?\d+$/.test(String(F[k]).trim())) add(`${k} erwartet eine ganze Zahl.`); });
    if(hasTpl(F.tag)) add('Templates im tag sind riskant: ein anderer Wert startet eine neue Activity.');
    if(F.silent) add('silent wirkt nur bei Updates, nicht beim ersten Start.');
    if(F.relevance_score!=='') add('relevance_score bei jedem Update mitsenden, sonst bleibt er nicht garantiert erhalten.');
    if(!out.some(o=>o[1]==='err')) out.push(['Gleicher Tag aktualisiert die laufende Activity. Titel bleibt bei Updates unverändert.','ok']);
  }
  $('issues').innerHTML=out.map(([t,c])=>`<li class="${c}">${esc(t)}</li>`).join('');
}
$('btnCopy').addEventListener('click',async()=>{
  const t=yamlText(), b=$('btnCopy');
  try{ await navigator.clipboard.writeText(t); b.textContent='Kopiert'; }
  catch(e){ const r=document.createRange(); r.selectNodeContents($('yaml')); const s=getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent='Markiert, Strg/⌘+C'; }
  setTimeout(()=>b.textContent='Kopieren',1800);
});
$('f_service').addEventListener('input',e=>{ S.service=e.target.value.trim(); renderYaml(); saveState(); });
function segSync(){ document.querySelectorAll('#segMode button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===S.mode)); document.querySelectorAll('#segFmt button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===S.fmt)); }
document.querySelectorAll('#segMode button').forEach(b=>b.addEventListener('click',()=>{ S.mode=b.dataset.v; segSync(); renderYaml(); saveState(); }));
document.querySelectorAll('#segFmt button').forEach(b=>b.addEventListener('click',()=>{ S.fmt=b.dataset.v; segSync(); renderYaml(); saveState(); }));

/* ================= Import ================= */
function findPayload(node){
  if(!node||typeof node!=='object') return null;
  if(Array.isArray(node)){ for(const x of node){ const r=findPayload(x); if(r) return r; } return null; }
  const act=node.action||node.service;
  if(typeof act==='string' && /^notify\./.test(act) && node.data && typeof node.data==='object') return {service:act, data:node.data};
  if(node.data && typeof node.data==='object' && !Array.isArray(node.data) && ('tag' in node.data || 'live_update' in node.data) && ('message' in node || 'title' in node)) return {data:node};
  for(const v of Object.values(node)){ const r=findPayload(v); if(r) return r; }
  return null;
}
$('btnImport').addEventListener('click',()=>{
  const m=$('impMsg'); m.className='msg';
  if(!window.jsyaml){ m.className='msg err'; m.textContent='YAML-Parser nicht geladen. Seite neu laden.'; return; }
  let doc; try{ doc=jsyaml.load($('impText').value); }catch(e){ m.className='msg err'; m.textContent='YAML nicht lesbar: '+(e.reason||e.message); return; }
  const p=findPayload(doc); if(!p){ m.className='msg err'; m.textContent='Kein notify-Aufruf mit data.data gefunden.'; return; }
  const f=blankFields(); const d=p.data, inner=d.data||{};
  if(d.title!=null) f.title=String(d.title); if(d.message!=null) f.message=String(d.message);
  FIELDS.forEach(x=>{ if(x.k in inner){ const v=inner[x.k]; f[x.k]= x.kind==='bool' ? (v===true||v==='true') : String(v); } });
  if(inner.color && !inner.notification_icon_color) f.notification_icon_color=String(inner.color);
  if(inner.color) f.android_color=true;
  S.fields=f; if(p.service) S.service=p.service; S.mode = d.message==='clear_notification'?'end':'start'; S.preset=null;
  sentAt=Date.now(); fillForm(); presetSync(); renderTemplates(); renderPreview(); renderYaml(); saveState();
  const n=Object.keys(usage()).length; m.className='msg ok'; m.textContent='Übernommen'+(n?` · ${n} Template${n>1?'s':''} gefunden, Typen unten prüfen`:'');
});

/* ================= Presets & boot ================= */
function presetSync(){ document.querySelectorAll('#presets .chip').forEach(c=>c.setAttribute('aria-pressed',c.dataset.p===S.preset)); }
Object.entries(PRESETS).forEach(([id,p])=>{ const c=document.createElement('button'); c.type='button'; c.className='chip'; c.dataset.p=id; c.textContent=p.name; c.addEventListener('click',()=>{ const keepSvc=S.service; S=fromPreset(id); S.service=keepSvc; sentAt=Date.now(); fillForm(); $('tpls').innerHTML=''; renderTemplates(); renderPreview(); renderYaml(); presetSync(); saveState(); }); $('presets').appendChild(c); });
buildForm(); ensureTemplates(); renderTemplates(); renderPreview(); renderYaml(); presetSync();
