const DEF={km:15000,preset:"18.5",evc:18.5,loss:10,pHome:0.37,pAC:0.49,pDC:0.59,fee:0,sHome:70,sAC:20,fuel:"e10",pf:2.15,icepreset:"7",icec:7.0};
const FUEL={e10:2.15,diesel:2.25};
const ids=Object.keys(DEF);
const $=id=>document.getElementById(id);
const eur=(v,d=2)=>v.toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d})+" €";
const num=(v,d=1)=>v.toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d});
const KEY="ev-kostenvergleich-v2";

function load(){let s={};try{s=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){}
  ids.forEach(k=>{$(k).value=(s[k]!==undefined?s[k]:DEF[k])})}
function save(){const s={};ids.forEach(k=>s[k]=$(k).value);let ok=true;try{localStorage.setItem(KEY,JSON.stringify(s));ok=localStorage.getItem(KEY)!==null}catch(e){ok=false}
  $("saveState").textContent=ok?"Eingaben werden automatisch in diesem Browser gespeichert.":"Speichern nicht möglich – der Browser blockiert lokalen Speicher (z. B. privates Fenster).";$("saveState").classList.toggle("err",!ok)}
const f=id=>{const v=parseFloat(String($(id).value).replace(",","."));return isFinite(v)?v:0};

// Reine Rechenfunktion
function calc(i){
  const h=Math.min(100,Math.max(0,i.sHome));
  const a=Math.min(100-h,Math.max(0,i.sAC));
  const d=100-h-a;
  const mix=(h*i.pHome+a*i.pAC+d*i.pDC)/100;
  const grid=i.evc*(1+i.loss/100);
  const ev100=grid*mix;
  const ice100=i.icec*i.pf;
  const yr=i.km/100;
  const evYear=ev100*yr+i.fee*12;
  const iceYear=ice100*yr;
  const ev100eff=i.km>0?evYear/yr:ev100;
  return {h,a,d,clipped:i.sAC>a,mix,grid,ev100,ev100eff,ice100,evYear,iceYear,
    be: i.km>0? (iceYear-i.fee*12)/yr/grid : ice100/grid,
    eqL: ev100eff/i.pf};
}

function render(){
  const i={};ids.forEach(k=>{if(k!=="preset"&&k!=="fuel"&&k!=="icepreset")i[k]=f(k)});
  const r=calc(i);
  $("sAC").value=r.a;
  $("sHomeV").textContent=r.h+" %";$("sACV").textContent=r.a+" %";$("sDCV").textContent=r.d+" %";
  $("mbH").style.cssText=`width:${r.h}%;background:var(--ev)`;
  $("mbA").style.cssText=`width:${r.a}%;background:color-mix(in srgb,var(--ev) 60%,var(--surface))`;
  $("mbD").style.cssText=`width:${r.d}%;background:color-mix(in srgb,var(--ev) 30%,var(--surface))`;
  $("mixWarn").hidden=!r.clipped;
  $("mixPrice").textContent="Ø "+num(r.mix*100,1)+" ct/kWh";

  const diff=r.iceYear-r.evYear;
  const cheaper=diff>=0;
  $("verdict").innerHTML=cheaper
    ?`Laden spart <b>${eur(diff,0)}</b> pro Jahr`
    :`Laden kostet <b class="more">${eur(-diff,0)}</b> mehr pro Jahr`;
  $("verdictSub").textContent=`${num(r.ev100eff,2)} € statt ${num(r.ice100,2)} € pro 100 km – das sind ${r.ice100>0?num(Math.abs(1-r.ev100eff/r.ice100)*100,0):0} % ${cheaper?"weniger":"mehr"}.`;

  const mx=Math.max(r.evYear,r.iceYear,1);
  $("barEv").style.width=(r.evYear/mx*100)+"%";$("barIce").style.width=(r.iceYear/mx*100)+"%";
  $("barEvV").textContent=eur(r.evYear,0)+"/J.";$("barIceV").textContent=eur(r.iceYear,0)+"/J.";

  const rows=[["pro 100 km",r.ev100eff,r.ice100,2],["pro Monat",r.evYear/12,r.iceYear/12,0],["pro Jahr",r.evYear,r.iceYear,0],["pro Tankfüllung-Äquivalent (500 km)",r.ev100eff*5,r.ice100*5,2]];
  $("tbody").innerHTML=rows.map(([l,e,c,d])=>{const df=c-e;return `<tr><td>${l}</td><td class="c-ev">${eur(e,d)}</td><td class="c-ice">${eur(c,d)}</td><td class="${df>=0?"c-good":"c-warn"}">${df>=0?"−":"+"}${eur(Math.abs(df),d)}</td></tr>`}).join("");

  $("kMix").textContent=num(r.mix*100,1)+" ct/kWh";
  $("kBe").textContent=num(r.be*100,1)+" ct/kWh";
  $("kGrid").textContent=num(r.grid,1)+" kWh/100 km";
  $("kEq").textContent=num(r.eqL,1)+" l/100 km";

  $("steps").innerHTML=[
    ["Netzbezug inkl. Ladeverluste",`${num(i.evc,1)} kWh × (1 + ${num(i.loss,0)} %) = ${num(r.grid,2)} kWh/100 km`],
    ["Gewichteter Strompreis",`${r.h} % × ${num(i.pHome,2)} + ${r.a} % × ${num(i.pAC,2)} + ${r.d} % × ${num(i.pDC,2)} = ${num(r.mix,3)} €/kWh`],
    ["Stromkosten",`${num(r.grid,2)} kWh × ${num(r.mix,3)} € = ${num(r.ev100,2)} €/100 km`+(i.fee>0?` (+ ${eur(i.fee,2)}/Monat Gebühr → ${num(r.ev100eff,2)} €)`:"")],
    ["Spritkosten",`${num(i.icec,1)} l × ${num(i.pf,2)} € = ${num(r.ice100,2)} €/100 km`],
    ["Hochrechnung",`× ${num(i.km/100,0)} (${num(i.km,0)} km) → ${eur(r.evYear,0)} vs. ${eur(r.iceYear,0)} pro Jahr`],
  ].map(([t,c])=>`<div class="step"><div><p>${t}</p><code>${c}</code></div></div>`).join("");
  save();
}

$("preset").addEventListener("change",e=>{if(e.target.value!=="custom")$("evc").value=e.target.value;render()});
$("evc").addEventListener("input",()=>{$("preset").value=[...$("preset").options].some(o=>o.value===String(f("evc")))?String(f("evc")):"custom"});
$("icepreset").addEventListener("change",e=>{if(e.target.value!=="custom")$("icec").value=e.target.value;render()});
$("icec").addEventListener("input",()=>{const v=String(f("icec"));$("icepreset").value=[...$("icepreset").options].some(o=>o.value===v)?v:"custom"});
$("fuel").addEventListener("change",e=>{if(FUEL[e.target.value])$("pf").value=FUEL[e.target.value];render()});
$("pf").addEventListener("input",()=>{const v=f("pf");$("fuel").value=Object.keys(FUEL).find(k=>FUEL[k]===v)||"custom"});
$("reset").addEventListener("click",()=>{try{localStorage.removeItem(KEY)}catch(e){}ids.forEach(k=>$(k).value=DEF[k]);render()});
document.querySelectorAll("input,select").forEach(el=>el.addEventListener("input",render));
load();render();
