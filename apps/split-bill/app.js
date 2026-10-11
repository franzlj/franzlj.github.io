(function () {
  var fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  function eur(c) { return fmt.format(c / 100); }
  function signed(c) { return (c > 0 ? '+' : c < 0 ? '−' : '') + eur(Math.abs(c)); }

  // Betrag als Text ("12,50", "12.5", "12") in Cent; null bei ungültiger Eingabe oder 0.
  function parseCents(s) {
    var m = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(String(s).trim().replace(/\s/g, ''));
    if (!m) return null;
    var c = parseInt(m[1], 10) * 100 + (m[2] ? parseInt(m[2].padEnd(2, '0'), 10) : 0);
    return c > 0 ? c : null;
  }

  // Gleiche Aufteilung in Cent. Ein Rest von weniger als n Cent geht je 1 Cent an die ersten Personen.
  // Ausgleich: größter Schuldner zahlt an größten Gläubiger, bis alles ausgeglichen ist.
  function compute(people, tx) {
    // Eine Ausgabe mit forId trägt diese Person komplett. Ohne forId geht sie in den Topf, der gleich auf alle geteilt wird.
    var n = people.length, paid = {}, direct = {}, total = 0, pool = 0, directTotal = 0;
    var has = function (id) { return Object.prototype.hasOwnProperty.call(paid, id); };
    people.forEach(function (p) { paid[p.id] = 0; direct[p.id] = 0; });
    tx.forEach(function (t) {
      if (!has(t.personId)) return;
      paid[t.personId] += t.cents; total += t.cents;
      if (t.forId && t.forId !== t.personId && has(t.forId)) { direct[t.forId] += t.cents; directTotal += t.cents; }
      else pool += t.cents;
    });
    if (n === 0) return { total: 0, pool: 0, directTotal: 0, base: 0, rem: 0, rows: [], transfers: [] };
    var base = Math.floor(pool / n), rem = pool - base * n;
    var rows = people.map(function (p, i) {
      var share = base + (i < rem ? 1 : 0) + direct[p.id];
      return { id: p.id, name: p.name, paid: paid[p.id], share: share, net: paid[p.id] - share };
    });
    var cred = rows.filter(function (r) { return r.net > 0; }).map(function (r) { return { name: r.name, left: r.net }; });
    var debt = rows.filter(function (r) { return r.net < 0; }).map(function (r) { return { name: r.name, left: -r.net }; });
    var byLeft = function (a, b) { return b.left - a.left; };
    cred.sort(byLeft); debt.sort(byLeft);
    var transfers = [], i = 0, j = 0;
    while (i < debt.length && j < cred.length) {
      var amt = Math.min(debt[i].left, cred[j].left);
      transfers.push({ from: debt[i].name, to: cred[j].name, cents: amt });
      debt[i].left -= amt; cred[j].left -= amt;
      if (debt[i].left === 0) i++;
      if (cred[j].left === 0) j++;
    }
    return { total: total, pool: pool, directTotal: directTotal, base: base, rem: rem, rows: rows, transfers: transfers };
  }
  // Markdown-Export. Reiner Text, Sonderzeichen in Namen und Beschreibungen werden maskiert.
  function esc(s) { return String(s).replace(/\s+/g, ' ').trim().replace(/[\\`*_\[\]<>|#]/g, '\\$&'); }
  function money(c) { return eur(c).replace(/ /g, ' '); }
  function moneySigned(c) { return signed(c).replace(/ /g, ' '); }
  function buildMarkdown(people, tx, dateText) {
    var r = compute(people, tx), L = [];
    var nameOf = {};
    people.forEach(function (p) { nameOf[p.id] = p.name; });
    L.push('# Split Bill', '', 'Stand: ' + dateText, '', '## Zahlungen', '');
    if (!r.transfers.length) L.push('Alles ausgeglichen.');
    r.transfers.forEach(function (t) { L.push('- ' + esc(t.from) + ' zahlt ' + money(t.cents) + ' an ' + esc(t.to)); });
    L.push('', '## Summen', '', '- Gesamt: ' + money(r.total));
    if (r.pool > 0) L.push('- ' + (r.rem ? 'Geteilt, pro Person (ca.): ' : 'Geteilt, pro Person: ') + money(r.base));
    if (r.directTotal > 0) L.push('- Komplett weiterverrechnet: ' + money(r.directTotal));
    L.push('', '## Salden', '', '| Person | Bezahlt | Anteil | Saldo |', '| --- | ---: | ---: | ---: |');
    r.rows.forEach(function (row) { L.push('| ' + esc(row.name) + ' | ' + money(row.paid) + ' | ' + money(row.share) + ' | ' + moneySigned(row.net) + ' |'); });
    L.push('', '## Ausgaben');
    people.forEach(function (p) {
      var mine = tx.filter(function (t) { return t.personId === p.id; });
      var sum = mine.reduce(function (a, t) { return a + t.cents; }, 0);
      L.push('', '### ' + esc(p.name) + ' (' + money(sum) + ')', '');
      if (!mine.length) { L.push('Keine Ausgaben.'); return; }
      L.push('| Beschreibung | Betrag | Getragen von |', '| --- | ---: | --- |');
      mine.forEach(function (t) {
        var who = t.forId && t.forId !== t.personId && nameOf[t.forId] ? 'Ganz ' + esc(nameOf[t.forId]) : 'Alle zu gleichen Teilen';
        L.push('| ' + esc(t.desc) + ' | ' + money(t.cents) + ' | ' + who + ' |');
      });
    });
    L.push('');
    return L.join('\n');
  }
  // JSON-Export und -Import. Beträge in Cent, Format "split-bill" Version 1.
  function buildJson(people, tx, iso) {
    return JSON.stringify({
      format: 'split-bill', version: 1, exportedAt: iso,
      people: people.map(function (p) { return { id: p.id, name: p.name }; }),
      tx: tx.map(function (t) {
        var o = { id: t.id, personId: t.personId, desc: t.desc, cents: t.cents };
        if (t.forId) o.forId = t.forId;
        return o;
      })
    }, null, 2) + '\n';
  }
  function parseImport(text) {
    var fail = function (m) { return { ok: false, error: m }; };
    var d;
    try { d = JSON.parse(text); } catch (e) { return fail('Kein gültiges JSON.'); }
    if (!d || typeof d !== 'object' || Array.isArray(d)) return fail('Erwartet ein Objekt mit people und tx.');
    if (d.format !== undefined && d.format !== 'split-bill') return fail('Unbekanntes Format.');
    if (d.version !== undefined && d.version !== 1) return fail('Version nicht unterstützt.');
    if (!Array.isArray(d.people) || !Array.isArray(d.tx)) return fail('people und tx müssen Listen sein.');
    if (d.people.length > 50) return fail('Höchstens 50 Personen.');
    if (d.tx.length > 1000) return fail('Höchstens 1000 Ausgaben.');
    var idOk = function (s) { return typeof s === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(s) && s !== '__proto__'; };
    var ids = Object.create(null), names = Object.create(null), people = [], txIds = Object.create(null), tx = [], i;
    for (i = 0; i < d.people.length; i++) {
      var p = d.people[i], n = i + 1;
      if (!p || typeof p !== 'object') return fail('Person ' + n + ': Objekt erwartet.');
      if (!idOk(p.id)) return fail('Person ' + n + ': ungültige ID.');
      if (ids[p.id]) return fail('Person ' + n + ': ID doppelt.');
      var name = typeof p.name === 'string' ? p.name.trim() : '';
      if (!name || name.length > 30) return fail('Person ' + n + ': Name leer oder länger als 30 Zeichen.');
      if (names[name.toLowerCase()]) return fail('Person ' + n + ': Name doppelt.');
      ids[p.id] = true; names[name.toLowerCase()] = true;
      people.push({ id: p.id, name: name });
    }
    for (i = 0; i < d.tx.length; i++) {
      var t = d.tx[i], m = i + 1;
      if (!t || typeof t !== 'object') return fail('Ausgabe ' + m + ': Objekt erwartet.');
      if (!idOk(t.id)) return fail('Ausgabe ' + m + ': ungültige ID.');
      if (txIds[t.id]) return fail('Ausgabe ' + m + ': ID doppelt.');
      if (typeof t.personId !== 'string' || !ids[t.personId]) return fail('Ausgabe ' + m + ': unbekannte Person bei personId.');
      if (!Number.isInteger(t.cents) || t.cents < 1 || t.cents > 99999999999) return fail('Ausgabe ' + m + ': cents muss eine ganze Zahl größer 0 sein.');
      var desc = t.desc === undefined ? '' : t.desc;
      if (typeof desc !== 'string') return fail('Ausgabe ' + m + ': desc muss Text sein.');
      desc = desc.trim() || 'Ausgabe';
      if (desc.length > 60) return fail('Ausgabe ' + m + ': Beschreibung länger als 60 Zeichen.');
      var item = { id: t.id, personId: t.personId, desc: desc, cents: t.cents };
      if (t.forId !== undefined && t.forId !== null) {
        if (typeof t.forId !== 'string' || !ids[t.forId] || t.forId === t.personId) return fail('Ausgabe ' + m + ': ungültige forId.');
        item.forId = t.forId;
      }
      txIds[t.id] = true; tx.push(item);
    }
    return { ok: true, people: people, tx: tx };
  }

  var numFmt = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var X_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  function icon() { var t = document.createElement('template'); t.innerHTML = X_SVG; return t.content.firstChild; }

  var $ = function (id) { return document.getElementById(id); };
  function h(tag, attrs) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === false || v == null) return;
      if (k === 'class') e.className = v;
      else e.setAttribute(k, v === true ? '' : v);
    });
    for (var a = 2; a < arguments.length; a++) {
      var kids = [].concat(arguments[a]);
      kids.forEach(function (k) { if (k == null || k === false) return; e.append(k.nodeType ? k : document.createTextNode(String(k))); });
    }
    return e;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  var state = { people: [], tx: [] };
  var storageOk = true;
  var armed = null, armTimer = 0, lastPayer = '';

  function setStatus(text, tone) {
    var s = $('status'); s.textContent = text; s.className = 'badge' + (tone ? ' badge-' + tone : '');
  }
  function showError(id, msg) { var e = $(id); e.hidden = !msg; e.textContent = msg || ''; }

  function normalize(d) {
    var people = Array.isArray(d && d.people) ? d.people.filter(function (p) { return p && typeof p.id === 'string' && typeof p.name === 'string'; }) : [];
    var tx = Array.isArray(d && d.tx) ? d.tx.filter(function (t) { return t && typeof t.id === 'string' && typeof t.personId === 'string' && Number.isInteger(t.cents) && t.cents > 0; }) : [];
    return { people: people, tx: tx };
  }

  // Speicherung im Browser (localStorage). Ohne Zugriff bleibt die Seite nutzbar, die Daten gehen dann beim Schließen verloren.
  var KEY = 'split-bill:v1';
  var NO_STORE = 'Speicher im Browser nicht verfügbar: Daten gehen beim Schließen verloren';
  function readStore() {
    var raw;
    try { raw = localStorage.getItem(KEY); } catch (e) { storageOk = false; return null; }
    if (!raw) return null;
    try { return normalize(JSON.parse(raw)); } catch (e) { return null; }
  }
  function persist() {
    if (!storageOk) { setStatus(NO_STORE, 'warning'); return; }
    try {
      localStorage.setItem(KEY, JSON.stringify({ people: state.people, tx: state.tx, updatedAt: Date.now() }));
      setStatus('Im Browser gespeichert', 'success');
    } catch (e) {
      setStatus(e && e.name === 'QuotaExceededError' ? 'Browser-Speicher voll, nicht gespeichert' : 'Speichern im Browser fehlgeschlagen', 'critical');
    }
  }
  function change() { render(); persist(); }

  function arm(key) {
    armed = key; clearTimeout(armTimer);
    armTimer = setTimeout(function () { armed = null; render(); }, 3500);
    render();
  }

  function tileValue(c) { return h('div', { class: 'tile-value' }, numFmt.format(c / 100), h('span', { class: 'tile-unit' }, '€')); }
  function sub(title, content) { return h('div', { class: 'sub' }, h('div', { class: 'cap' }, title), content); }

  function render() {
    var people = state.people, tx = state.tx;
    var nameOf = {};
    people.forEach(function (p) { nameOf[p.id] = p.name; });

    // Personen
    var ul = $('people'); ul.replaceChildren();
    people.forEach(function (p) {
      var isArmed = armed === 'p:' + p.id;
      ul.append(h('li', null,
        h('span', { class: 'name' }, p.name),
        h('button', { type: 'button', class: 'x' + (isArmed ? ' armed' : ''), 'data-del-person': p.id,
          'aria-label': p.name + ' entfernen' }, isArmed ? 'Mit Ausgaben löschen?' : icon())));
    });
    if (!people.length) ul.append(h('li', { class: 'hint' }, 'Noch keine Personen'));

    // Zahler-Auswahl
    var sel = $('tx-person'), prev = sel.value || lastPayer;
    sel.replaceChildren();
    people.forEach(function (p) { sel.append(h('option', { value: p.id }, p.name)); });
    if (people.some(function (p) { return p.id === prev; })) sel.value = prev;

    // Kostenträger: alle zu gleichen Teilen oder eine andere Person komplett
    var fsel = $('tx-for'), fprev = fsel.value;
    fsel.replaceChildren(h('option', { value: '' }, 'Allen zu gleichen Teilen'));
    people.forEach(function (p) { if (p.id !== sel.value) fsel.append(h('option', { value: p.id }, 'Ganz von ' + p.name)); });
    if (Array.prototype.some.call(fsel.options, function (o) { return o.value === fprev; })) fsel.value = fprev;

    var none = !people.length;
    ['tx-person', 'tx-amount', 'tx-desc', 'tx-for', 'tx-add'].forEach(function (id) { $(id).disabled = none; });

    // Ausgaben pro Person
    var groups = $('groups'); groups.replaceChildren();
    people.forEach(function (p) {
      var mine = tx.filter(function (t) { return t.personId === p.id; });
      var sum = mine.reduce(function (a, t) { return a + t.cents; }, 0);
      var list = h('ul', { class: 'tx' });
      if (!mine.length) list.append(h('li', { class: 'none' }, 'Keine Ausgaben'));
      mine.forEach(function (t) {
        list.append(h('li', null,
          h('span', { class: 'desc' }, t.desc,
            t.forId && t.forId !== t.personId && nameOf[t.forId] ? h('span', { class: 'badge' }, 'ganz von ' + nameOf[t.forId]) : null),
          h('span', { class: 'amt' }, eur(t.cents)),
          h('button', { type: 'button', class: 'x', 'data-del-tx': t.id, 'aria-label': 'Ausgabe ' + t.desc + ' löschen' }, icon())));
      });
      groups.append(h('div', { class: 'group' },
        h('div', { class: 'group-head' }, h('h3', null, p.name), h('span', { class: 'amt' }, eur(sum))),
        list));
    });

    // Ergebnis
    var res = $('result'); res.replaceChildren();
    var r = compute(people, tx);
    var canExport = people.length >= 2 && r.total > 0;
    ['md-save', 'md-copy'].forEach(function (id) { $(id).disabled = !canExport; });
    ['json-save', 'json-copy'].forEach(function (id) { $(id).disabled = !people.length; });
    if (people.length < 2 || r.total === 0) {
      res.append(h('p', { class: 'hint' }, people.length < 2
        ? 'Der Ausgleich erscheint ab zwei Personen und der ersten Ausgabe.'
        : 'Der Ausgleich erscheint nach der ersten Ausgabe.'));
    } else {
      if (!r.transfers.length) {
        res.append(sub('Zahlungen', h('div', null, h('span', { class: 'badge badge-success' }, 'Alles ausgeglichen'))));
      } else {
        var pay = h('ul', { class: 'pay' });
        r.transfers.forEach(function (t) {
          pay.append(h('li', { class: 'tile' },
            h('div', { class: 'tile-head' }, h('span', { class: 'who' }, t.from), ' zahlt an ', h('span', { class: 'who' }, t.to)),
            tileValue(t.cents)));
        });
        res.append(sub('Zahlungen', pay));
      }

      var tiles = h('div', { class: 'tiles' },
        h('div', { class: 'tile' }, h('div', { class: 'tile-head' }, 'Gesamt'), tileValue(r.total)));
      if (r.pool > 0) tiles.append(h('div', { class: 'tile' },
        h('div', { class: 'tile-head' }, r.rem ? 'Geteilt, pro Person (ca.)' : 'Geteilt, pro Person'), tileValue(r.base)));
      if (r.directTotal > 0) tiles.append(h('div', { class: 'tile' },
        h('div', { class: 'tile-head' }, 'Komplett weiterverrechnet'), tileValue(r.directTotal)));
      res.append(sub('Summen', tiles));

      var tbody = h('tbody');
      r.rows.forEach(function (row) {
        tbody.append(h('tr', null, h('td', null, row.name), h('td', null, eur(row.paid)), h('td', null, eur(row.share)),
          h('td', { class: row.net > 0 ? 'pos' : row.net < 0 ? 'neg' : '' }, signed(row.net))));
      });
      res.append(sub('Salden', h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Person'), h('th', null, 'Bezahlt'), h('th', null, 'Anteil'), h('th', null, 'Saldo'))), tbody))));
    }

    var rb = $('reset');
    rb.textContent = armed === 'reset' ? 'Wirklich alles löschen?' : 'Alles löschen';
    rb.className = 'btn' + (armed === 'reset' ? ' btn-danger' : '');
  }

  // Eingaben
  $('person-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('person-name'), name = input.value.trim();
    if (!name) { showError('person-error', 'Name eingeben.'); return; }
    if (state.people.some(function (p) { return p.name.toLowerCase() === name.toLowerCase(); })) {
      showError('person-error', 'Name bereits vergeben. Mit Nachnamen-Initial unterscheiden.'); return;
    }
    showError('person-error', '');
    state.people.push({ id: uid(), name: name });
    input.value = ''; input.focus();
    change();
  });

  $('tx-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var pid = $('tx-person').value, cents = parseCents($('tx-amount').value);
    if (!pid) { showError('tx-error', 'Zuerst eine Person hinzufügen.'); return; }
    if (cents === null) { showError('tx-error', 'Betrag größer 0 eingeben, z. B. 12,50.'); return; }
    showError('tx-error', '');
    lastPayer = pid;
    var forId = $('tx-for').value;
    var item = { id: uid(), personId: pid, desc: $('tx-desc').value.trim() || 'Ausgabe', cents: cents };
    if (forId && forId !== pid && state.people.some(function (p) { return p.id === forId; })) item.forId = forId;
    state.tx.push(item);
    $('tx-amount').value = ''; $('tx-desc').value = ''; $('tx-for').value = ''; $('tx-desc').focus();
    change();
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.delTx) {
      state.tx = state.tx.filter(function (t) { return t.id !== b.dataset.delTx; });
      change();
    } else if (b.dataset.delPerson) {
      var id = b.dataset.delPerson;
      var hasTx = state.tx.some(function (t) { return t.personId === id || t.forId === id; });
      if (hasTx && armed !== 'p:' + id) { arm('p:' + id); return; }
      armed = null;
      state.people = state.people.filter(function (p) { return p.id !== id; });
      state.tx = state.tx.filter(function (t) { return t.personId !== id && t.forId !== id; });
      change();
    } else if (b.id === 'reset') {
      if (armed !== 'reset') { arm('reset'); return; }
      armed = null; state = { people: [], tx: [] }; change();
    } else if (b.id === 'example') {
      var a = uid() + 'a', b2 = uid() + 'b', c = uid() + 'c';
      state = {
        people: [{ id: a, name: 'Anna' }, { id: b2, name: 'Ben' }, { id: c, name: 'Clara' }],
        tx: [
          { id: uid() + '1', personId: a, desc: 'Hotel', cents: 24000 },
          { id: uid() + '2', personId: b2, desc: 'Abendessen', cents: 8750 },
          { id: uid() + '3', personId: c, desc: 'Taxi', cents: 2340 },
          { id: uid() + '4', personId: b2, desc: 'Konzertkarte für Clara', cents: 1800, forId: c }
        ]
      };
      change();
    }
  });

  // Export und Import (Menü): Speichern über die Download-Funktion, Kopieren mit Auswahl-Fallback, JSON-Import mit Prüfung.
  var pending = null;
  function refreshIo() {
    var any = $('export-note').textContent || !$('out-text').hidden || !$('paste-box').hidden || !$('confirm-box').hidden;
    $('io-panel').hidden = !any;
  }
  function note(t) { $('export-note').textContent = t; refreshIo(); }
  function resetIo() {
    $('out-text').hidden = true; $('paste-box').hidden = true; $('confirm-box').hidden = true; pending = null;
    note('');
  }
  function count(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function isoDate() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function mdNow() { return buildMarkdown(state.people, state.tx, new Date().toLocaleDateString('de-DE')); }
  function jsonNow() { return buildJson(state.people, state.tx, new Date().toISOString()); }

  // Speichern als Datei-Download im Browser.
  function saveFile(name, data, ok) {
    try {
      var url = URL.createObjectURL(new Blob([data], { type: name.slice(-5) === '.json' ? 'application/json' : 'text/markdown' }));
      var a = h('a', { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      note(ok);
    } catch (e) { note('Speichern hier nicht möglich. Stattdessen kopieren.'); }
  }
  async function copyText(text, ok) {
    var out = $('out-text');
    try { await navigator.clipboard.writeText(text); out.hidden = true; note(ok); }
    catch (e) { out.value = text; out.hidden = false; out.focus(); out.select(); note('Kopieren nicht möglich. Text ist markiert, mit Strg/Cmd+C kopieren.'); }
  }

  function applyImport(r) {
    state = { people: r.people, tx: r.tx }; armed = null; lastPayer = ''; pending = null;
    $('paste-box').hidden = true; $('confirm-box').hidden = true; $('json-in').value = '';
    note('Importiert: ' + count(r.people.length, 'Person', 'Personen') + ', ' + count(r.tx.length, 'Ausgabe', 'Ausgaben'));
    change();
  }
  function stageImport(text) {
    var r = parseImport(text);
    if (!r.ok) { note('Import fehlgeschlagen: ' + r.error); return; }
    if (!state.people.length && !state.tx.length) { applyImport(r); return; }
    pending = r;
    $('paste-box').hidden = true;
    $('confirm-text').textContent = 'Der Import ersetzt die aktuellen Daten (' + count(state.people.length, 'Person', 'Personen') + ', ' +
      count(state.tx.length, 'Ausgabe', 'Ausgaben') + ') durch ' + count(r.people.length, 'Person', 'Personen') + ' und ' +
      count(r.tx.length, 'Ausgabe', 'Ausgaben') + '.';
    $('confirm-box').hidden = false;
    note('');
    $('confirm-yes').focus();
  }

  $('md-save').addEventListener('click', function () { resetIo(); saveFile('split-bill-' + isoDate() + '.md', mdNow(), 'Markdown gespeichert'); });
  $('md-copy').addEventListener('click', function () { resetIo(); copyText(mdNow(), 'Markdown kopiert'); });
  $('json-save').addEventListener('click', function () { resetIo(); saveFile('split-bill-' + isoDate() + '.json', jsonNow(), 'JSON gespeichert'); });
  $('json-copy').addEventListener('click', function () { resetIo(); copyText(jsonNow(), 'JSON kopiert'); });
  $('json-file').addEventListener('click', function () { resetIo(); $('json-input').click(); });
  $('json-paste').addEventListener('click', function () {
    resetIo(); $('json-in').value = ''; $('paste-box').hidden = false; refreshIo(); $('json-in').focus();
  });
  $('json-input').addEventListener('change', function () {
    var f = this.files && this.files[0]; this.value = '';
    if (!f) return;
    resetIo();
    if (f.size > 2 * 1024 * 1024) { note('Import fehlgeschlagen: Datei größer als 2 MB.'); return; }
    var rd = new FileReader();
    rd.onload = function () { stageImport(String(rd.result)); };
    rd.onerror = function () { note('Import fehlgeschlagen: Datei nicht lesbar.'); };
    rd.readAsText(f);
  });
  $('json-do').addEventListener('click', function () { stageImport($('json-in').value); });
  $('json-cancel').addEventListener('click', function () { resetIo(); });
  $('confirm-yes').addEventListener('click', function () { if (pending) applyImport(pending); });
  $('confirm-no').addEventListener('click', function () { resetIo(); });

  // Dropdown-Menü
  var menuBtn = $('io-btn'), menuList = $('io-list');
  function menuItems() { return Array.prototype.filter.call(menuList.querySelectorAll('[role=menuitem]'), function (b) { return !b.disabled && !b.hidden; }); }
  function openMenu(open) {
    menuList.hidden = !open; menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { var its = menuItems(); if (its.length) its[0].focus(); menuList.scrollIntoView({ block: 'nearest' }); }
  }
  menuBtn.addEventListener('click', function () { openMenu(menuList.hidden); });
  menuBtn.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown') { e.preventDefault(); openMenu(true); } });
  document.addEventListener('click', function (e) { if (!menuList.hidden && !$('io-menu').contains(e.target)) openMenu(false); });
  menuList.addEventListener('click', function (e) {
    if (!e.target.closest('[role=menuitem]')) return;
    var focusMoved = !menuList.contains(document.activeElement);
    openMenu(false);
    if (!focusMoved) menuBtn.focus();
  });
  menuList.addEventListener('keydown', function (e) {
    var its = menuItems(), i = its.indexOf(document.activeElement);
    if (!its.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); its[(i + 1) % its.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); its[(i - 1 + its.length) % its.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); its[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); its[its.length - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); openMenu(false); menuBtn.focus(); }
    else if (e.key === 'Tab') { openMenu(false); }
  });

  $('tx-person').addEventListener('change', render);
  render();

  // Start: gespeicherten Stand laden, andere Tabs desselben Browsers übernehmen.
  var stored = readStore();
  if (stored) { state = stored; render(); setStatus('Im Browser gespeichert', 'success'); }
  else if (storageOk) setStatus('Bereit, speichert im Browser');
  else setStatus(NO_STORE, 'warning');
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    state = readStore() || { people: [], tx: [] };
    render();
  });
})();
