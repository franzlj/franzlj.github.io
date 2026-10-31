// Filtert die Notizen nach Thema (Tags stehen in data-tags am Listeneintrag)
(function () {
  const buttons = document.querySelectorAll('.filter button');
  const items = document.querySelectorAll('#posts > li[data-tags]');

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const tag = button.dataset.tag;
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      items.forEach((li) => { li.hidden = tag !== '' && !li.dataset.tags.split(' ').includes(tag); });
    });
  });
})();
