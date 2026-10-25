// Filtert die Kacheln nach Titel, Beschreibung und Kategorie
(function () {
  const input = document.getElementById('app-filter');
  const empty = document.getElementById('app-empty');
  const sections = document.querySelectorAll('.app-section');
  const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function apply() {
    const terms = norm(input.value).split(/\s+/).filter(Boolean);
    let total = 0;
    sections.forEach((section) => {
      const category = section.querySelector('h2').textContent;
      let visible = 0;
      section.querySelectorAll('.app-grid > li').forEach((li) => {
        const text = norm(li.textContent + ' ' + category);
        const match = terms.every((t) => text.includes(t));
        li.hidden = !match;
        if (match) visible++;
      });
      section.hidden = visible === 0;
      total += visible;
    });
    empty.hidden = total > 0;
  }

  input.addEventListener('input', apply);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; apply(); }
  });
})();
