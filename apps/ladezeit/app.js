const form = document.getElementById('calc');
const result = document.getElementById('result');
const val = (id) => parseFloat(document.getElementById(id).value);

function update() {
  const capacity = val('capacity');
  const from = val('from');
  const to = val('to');
  const power = val('power');
  const loss = val('loss');

  if (![capacity, from, to, power, loss].every(Number.isFinite) || power <= 0 || to <= from) {
    result.textContent = 'Bitte gültige Werte eingeben („bis“ muss größer als „von“ sein).';
    return;
  }

  const energy = capacity * (to - from) / 100;        // kWh in den Akku
  const grid = energy / (1 - loss / 100);             // kWh aus dem Netz
  const minutes = Math.round(grid / power * 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  result.textContent =
    `≈ ${h > 0 ? `${h} h ` : ''}${m} min · ${energy.toFixed(1)} kWh in den Akku, ${grid.toFixed(1)} kWh aus dem Netz`;
}

form.addEventListener('input', update);
update();
