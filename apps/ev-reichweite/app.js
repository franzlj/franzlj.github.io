// EV Reichweitenrechner: Reichweite = Netto-Kapazität × SoH ÷ Verbrauch; Jahreszeiten über Faktoren ggü. Sommer.
const DEF={net:80.7,soh:97,cons:19.5,season:"summer"};
const SEASONS=[
  {k:"spring",n:"Frühling",f:1.08},
  {k:"summer",n:"Sommer",f:1.00},
  {k:"autumn",n:"Herbst",f:1.10},
  {k:"winter",n:"Winter",f:1.30}
];
const KM_PER_MI=1.609344;
const $=id=>document.getElementById(id);
const fmt=(x,d=0)=>isFinite(x)?x.toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d}):"–";

function calc(usable,cons){
  const r100=usable/cons*100;
  return {r100,r80:r100*0.8,mikwh:100/cons/KM_PER_MI,kmkwh:100/cons};
}

function render(){
  const net=+$("net").value, soh=+$("soh").value, cons=+$("cons").value, sk=$("season").value;
  const ok=net>0&&soh>0&&soh<=100&&cons>0;
  const usable=net*soh/100;
  const ref=SEASONS.find(s=>s.k===sk);
  $("seasonName").textContent=ref.n;
  if(!ok){["r100","r80","mikwh","usable"].forEach(i=>$(i).textContent="–");$("tbody").innerHTML="";$("chain").textContent="Bitte gültige Werte eingeben (SoH 1–100 %).";return;}
  const c=calc(usable,cons);
  $("r100").innerHTML=fmt(c.r100)+" <small>km</small>";
  $("r100mi").textContent=fmt(c.r100/KM_PER_MI)+" mi";
  $("r80").innerHTML=fmt(c.r80)+" <small>km</small>";
  $("r80mi").textContent=fmt(c.r80/KM_PER_MI)+" mi";
  $("mikwh").innerHTML=fmt(c.mikwh,2)+" <small>mi/kWh</small>";
  $("kmkwh").textContent=fmt(c.kmkwh,2)+" km/kWh";
  $("usable").innerHTML=fmt(usable,1)+" <small>kWh</small>";
  $("lost").textContent="−"+fmt(net-usable,1)+" kWh durch SoH";
  $("chain").innerHTML=`<span>${fmt(net,1)} kWh</span><i>×</i><span>${fmt(soh,1)} %</span><i>=</i><span>${fmt(usable,1)} kWh</span><i>÷</i><span>${fmt(cons,1)} kWh/100 km</span><i>=</i><span>${fmt(c.r100)} km</span><i>× 0,8 =</i><span>${fmt(c.r80)} km</span>`;

  const base=cons/ref.f; // auf Sommer normiert
  const rows=SEASONS.map(s=>({s,cons:base*s.f,...calc(usable,base*s.f)}));
  const max=Math.max(...rows.map(r=>r.r100));
  const tb=$("tbody");
  // Faktor-Inputs erhalten, wenn Fokus drin liegt
  const active=document.activeElement&&document.activeElement.dataset.k;
  tb.innerHTML=rows.map(r=>`<tr class="${r.s.k===sk?"ref":""}">
    <td>${r.s.n}${r.s.k===sk?'<span class="tag">Eingabe</span>':""}</td>
    <td><input type="number" step="0.01" min="0.5" id="f_${r.s.k}" data-k="${r.s.k}" value="${r.s.f.toFixed(2)}" aria-label="Faktor ${r.s.n}"></td>
    <td>${fmt(r.cons,1)}</td>
    <td>${fmt(r.mikwh,2)}</td>
    <td>${fmt(r.r100)} km<div class="bar"><b style="width:${r.r100/max*100}%"></b></div></td>
    <td>${fmt(r.r80)} km</td></tr>`).join("");
  tb.querySelectorAll("input").forEach(inp=>inp.addEventListener("change",e=>{
    const v=+e.target.value; const s=SEASONS.find(x=>x.k===e.target.dataset.k);
    if(v>0){s.f=v;render();}
  }));
  if(active){const el=$("f_"+active); if(el) el.focus();}
}
["net","soh","cons","season"].forEach(id=>$(id).addEventListener("input",render));
$("reset").addEventListener("click",()=>{$("net").value=DEF.net;$("soh").value=DEF.soh;$("cons").value=DEF.cons;$("season").value=DEF.season;render();});
render();
