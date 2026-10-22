const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { JSDOM } = require('jsdom');
const JSZip = require('jszip');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- ambiente DOM + finta API di Obsidian ---------- */
const dom = new JSDOM('<body class="theme-light"></body>', { pretendToBeVisual: true });
const w = dom.window;
global.window = w; global.document = w.document;
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
global.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(t) { this.cb([{ isIntersecting: true, target: t }]); } unobserve() {} disconnect() {} };
w.Element.prototype.scrollIntoView = function () {};
w.HTMLElement.prototype.showPicker = function () {};
w.HTMLElement.prototype.getClientRects = function () { return [1]; };
Object.assign(w.HTMLElement.prototype, {
  empty() { this.innerHTML = ''; },
  addClass(c) { this.classList.add(c); },
  setText(t) { this.textContent = t; },
  createEl(tag, o = {}) { const e = w.document.createElement(tag); if (o.text) e.textContent = o.text; if (o.cls) e.className = o.cls; this.appendChild(e); return e; },
  createDiv(o = {}) { return this.createEl('div', o); },
});

const notices = [];
const obsidianStub = {
  Plugin: class { constructor(app) { this.app = app; this.cmds = {}; this.views = {}; this.saved = 0; }
    loadData() { return Promise.resolve({}); } saveData() { this.saved++; return Promise.resolve(); }
    registerView(t, f) { this.views[t] = f; } addCommand(c) { this.cmds[c.id] = c; } addRibbonIcon() {} addSettingTab() {}
    registerMarkdownCodeBlockProcessor(l, f) { this.proc = f; } },
  ItemView: class { constructor(leaf) { this.leaf = leaf; this.contentEl = w.document.createElement('div'); w.document.body.appendChild(this.contentEl); } async setState() {} },
  Modal: class { constructor(app) { this.app = app; this.contentEl = w.document.createElement('div'); this.titleEl = w.document.createElement('div'); } open() { this.onOpen && this.onOpen(); } close() {} },
  PluginSettingTab: class { constructor(app, plugin) { this.containerEl = w.document.createElement('div'); } },
  Setting: class { constructor() {} setName() { return this; } setDesc() { return this; } addText(cb) { cb({ setPlaceholder() { return this; }, setValue() { return this; }, onChange() { return this; }, inputEl: {} }); return this; } addButton(cb) { cb({ setButtonText() { return this; }, setCta() { return this; }, onClick() { return this; } }); return this; } },
  Notice: class { constructor(m) { notices.push(m); } },
  normalizePath: (p) => p.replace(/\\/g, '/').replace(/\/+/g, '/'),
};
const origLoad = Module._load;
Module._load = function (req, ...rest) { return req === 'obsidian' ? obsidianStub : origLoad.call(this, req, ...rest); };

(async () => {
  const PluginClass = require('../dist/parley/main.js');
  assert.strictEqual(typeof PluginClass, 'function', 'main.js esporta la classe del plugin');

  /* ---------- dati di prova su disco ---------- */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crp-'));
  const waLines = [];
  for (let i = 0; i < 400; i++) waLines.push(`[${String(1 + (i % 28)).padStart(2, '0')}/03/23, 10:${String(i % 60).padStart(2, '0')}:00] ${i % 3 ? 'Anna' : 'Marco'}: messaggio numero ${i}`);
  waLines.push('[29/03/23, 11:00:00] Anna: ‎<allegato: 00000001-PHOTO-2023.jpg>');
  waLines.push('[29/03/23, 11:01:00] Marco: ‎<allegato: 00000002-AUDIO-2023.opus>');
  waLines.push('[29/03/23, 11:02:00] Anna: ‎<allegato: 00000003-STICKER-2023.webp>');
  waLines.push('[29/03/23, 11:03:00] Marco: ‎<allegato: 00000004-ANIM.gif>');
  const z = new JSZip();
  z.file('_chat.txt', waLines.join('\n'));
  z.file('00000001-PHOTO-2023.jpg', PNG);
  z.file('00000002-AUDIO-2023.opus', Buffer.from('OggS0123456789ab'));
  z.file('00000003-STICKER-2023.webp', PNG);
  z.file('00000004-ANIM.gif', PNG);
  const zipPath = path.join(tmp, 'Chat WhatsApp con Anna.zip');
  fs.writeFileSync(zipPath, await z.generateAsync({ type: 'nodebuffer' }));

  const tgDir = path.join(tmp, 'ChatExport');
  fs.mkdirSync(path.join(tgDir, 'photos'), { recursive: true });
  fs.writeFileSync(path.join(tgDir, 'photos/p1.jpg'), PNG);
  fs.writeFileSync(path.join(tgDir, 'result.json'), JSON.stringify({ name: 'Gruppo Calcetto', type: 'private_group', id: 9, messages: [
    { id: 1, type: 'service', date: '2023-01-01T10:00:00', date_unixtime: '1672563600', actor: 'Luca', action: 'create_group', title: 'Gruppo Calcetto' },
    { id: 2, type: 'message', date: '2023-01-01T10:01:00', date_unixtime: '1672563660', from: 'Luca', from_id: 'user2', text: 'ciao', text_entities: [{ type: 'plain', text: 'ciao' }] },
    { id: 3, type: 'message', date: '2023-01-01T10:02:00', date_unixtime: '1672563720', from: 'Marco', from_id: 'user1', photo: 'photos/p1.jpg', text: '', text_entities: [] },
    { id: 4, type: 'message', date: '2023-01-01T10:03:00', date_unixtime: '1672563780', from: 'Luca', from_id: 'user2', reply_to_message_id: 3, text: 'bella', text_entities: [{ type: 'plain', text: 'bella' }] },
  ] }));

  /* ---------- plugin ---------- */
  const leafStates = []; const homeLeaves = [];
  const app = {
    workspace: {
      getLeaf: () => ({ setViewState: async (s) => { leafStates.push(s); }, openFile: async () => {} }),
      getLeavesOfType: (t) => homeLeaves.filter((l) => l.view.getViewType() === t),
      revealLeaf() {}, detachLeavesOfType() {},
      getActiveFile: () => ({ basename: 'Anna Rossi', extension: 'md' }),
    },
    vault: {
      read: async () => '---\ntipo: chat\n---\n# Anna\n\n```chat-reader\nsource: ' + zipPath + '\n```\n',
      getAbstractFileByPath: () => null,
      createFolder: async () => {},
      create: async (p, body) => { app.vault.lastCreate = { p, body }; return { path: p, basename: 'Bea Verdi' }; },
    },
  };
  const plugin = new PluginClass(app);
  await plugin.onload();
  assert.deepStrictEqual(Object.keys(plugin.cmds), ['open-home'], 'un solo comando');
  assert.ok(plugin.views['parley-view'] && plugin.views['parley-home'], 'viste registrate');
  console.log('✓ plugin caricato: comando «Apri Parley» + lettore + home');

  const mkView = () => plugin.views['parley-view']({ updateHeader() {}, setViewState: async (s) => { leafStates.push(s); }, });

  /* WhatsApp da zip */
  const v1 = mkView();
  await v1.onOpen();
  await v1.setState({ source: zipPath }, {});
  await sleep(150);
  const c1 = v1.contentEl;
  assert.ok(c1.classList.contains('pl'), 'lettore montato');
  assert.strictEqual(c1.querySelector('.pl-title b').textContent, 'Anna');
  const rows = c1.querySelectorAll('.pl-rows .row');
  assert.ok(rows.length >= 300, 'messaggi renderizzati: ' + rows.length);
  assert.ok(c1.querySelector('.row.out') && c1.querySelector('.row.in'), 'lati dedotti dal nome chat');
  assert.ok(c1.querySelector('.m.img img'), 'foto dallo zip');
  assert.ok(c1.querySelector('.m.aud'), 'vocale dallo zip');
  await sleep(50);
  assert.ok(c1.querySelector('.m.img img').getAttribute('src'), 'foto decompressa e caricata');
  console.log('✓ WhatsApp da zip: ' + rows.length + ' righe, foto e vocale collegati, lettura lazy');

  // data fluttuante durante lo scorrimento
  const rowsAll = Array.from(c1.querySelectorAll('.pl-rows .row[data-i]'));
  rowsAll.forEach((r) => { r.getBoundingClientRect = () => ({ top: 0, bottom: 150 }); });
  c1.querySelector('.pl-msgs').dispatchEvent(new w.Event('scroll')); await sleep(30);
  const chip = c1.querySelector('.pl-daychip');
  assert.ok(!chip.hidden && /marzo 2023/.test(chip.textContent), 'data fluttuante: ' + chip.textContent);
  console.log('✓ data fluttuante durante lo scorrimento: ' + chip.textContent);

  /* funzioni: ricerca, data, galleria, lightbox */
  // Cmd/Ctrl+F apre la ricerca anche con il focus sul body
  w.document.body.focus();
  const cf = new w.KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true, cancelable: true }); w.document.body.dispatchEvent(cf);
  assert.ok(!c1.querySelector('.pl-sbar').hidden && cf.defaultPrevented, 'Cmd+F apre la ricerca');
  c1.querySelector('[data-a="qclose"]').click();
  c1.querySelector('[data-a="search"]').click();
  const qi = c1.querySelector('.pl-sbar .pl-field'); qi.value = 'numero 33'; qi.dispatchEvent(new w.Event('input'));
  await sleep(450);
  assert.ok(c1.querySelector('.pl-rows mark'), 'ricerca evidenzia');
  assert.ok(/di \d+/.test(c1.querySelector('.pl-count').textContent));
  c1.querySelector('[data-a="qclose"]').click();
  c1.querySelector('.m.img').click(); await sleep(80);
  assert.ok(!c1.querySelector('.pl-lb').hidden && c1.querySelector('.pl-lbm img'), 'lightbox');
  // Esc chiude solo l'anteprima, anche con il focus fuori dal lettore, e non arriva a Obsidian
  let leaked = false; const spy = () => { leaked = true; }; w.document.body.addEventListener('keydown', spy);
  w.document.body.focus();
  const esc1 = new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); w.document.body.dispatchEvent(esc1);
  assert.ok(c1.querySelector('.pl-lb').hidden, 'Esc chiude l\'anteprima');
  assert.ok(!leaked && esc1.defaultPrevented, 'Esc con anteprima aperta non arriva a Obsidian');
  const esc2 = new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); w.document.body.dispatchEvent(esc2);
  assert.ok(leaked && !esc2.defaultPrevented, 'senza anteprima aperta Esc passa a Obsidian');
  w.document.body.removeEventListener('keydown', spy);
  c1.querySelector('.m.img').click(); await sleep(80);
  c1.querySelector('[data-lb="close"]').click();
  c1.querySelector('[data-a="media"]').click(); await sleep(60);
  assert.strictEqual(c1.querySelectorAll('.pl-th').length, 1, 'galleria: solo la foto vera');
  assert.ok(/Foto e video \(1\)/.test(c1.textContent) && /GIF e sticker \(2\)/.test(c1.textContent), 'tab con conteggi separati');
  c1.querySelector('[data-tab="anim"]').click(); await sleep(40);
  assert.strictEqual(c1.querySelectorAll('.pl-th').length, 2, 'GIF e sticker in una sezione a parte');
  c1.querySelector('[data-close]').click();
  const di = c1.querySelector('.pl-date'); di.value = '2023-03-05'; di.dispatchEvent(new w.Event('change')); await sleep(60);
  assert.ok(c1.querySelector('.row.flash'), 'salto a data');
  console.log('✓ ricerca, lightbox, galleria, salto a data');

  /* "chi sono io" persistito nei dati del plugin */
  const saved0 = plugin.saved;
  c1.querySelector('[data-a="menu"]').click();
  Array.from(c1.querySelectorAll('.pl-pop button')).find((b) => b.dataset.me === 'Anna').click(); await sleep(30);
  assert.ok(plugin.saved > saved0 && Object.values(plugin.data.me).includes('Anna'), 'scelta "chi sono io" salvata');
  console.log('✓ "chi sono io" salvato in data.json');
  await v1.onClose();

  /* Telegram da cartella */
  const v2 = mkView(); await v2.onOpen();
  await v2.setState({ source: tgDir }, {}); await sleep(150);
  const c2 = v2.contentEl;
  assert.strictEqual(c2.querySelector('.pl-title b').textContent, 'Gruppo Calcetto');
  assert.ok(c2.querySelector('.row.sys') && c2.querySelector('.reply') && c2.querySelector('.m.img'), 'Telegram: servizio, risposta, foto');
  console.log('✓ Telegram da cartella');
  await v2.onClose();

  /* percorso inesistente */
  const v3 = mkView(); await v3.onOpen();
  await v3.setState({ source: path.join(tmp, 'non-esiste.zip') }, {}); await sleep(100);
  assert.ok(/Impossibile aprire/.test(v3.contentEl.textContent) && /non esiste più/.test(v3.contentEl.textContent), 'errore chiaro: ' + v3.contentEl.textContent.slice(0, 120));
  console.log('✓ percorso mancante → messaggio chiaro');

  /* zip non valido */
  const badZip = path.join(tmp, 'rotto.zip'); fs.writeFileSync(badZip, 'non sono uno zip');
  const v4 = mkView(); await v4.onOpen();
  await v4.setState({ source: badZip }, {}); await sleep(100);
  assert.ok(/zip valido/.test(v4.contentEl.textContent));
  console.log('✓ zip corrotto → messaggio chiaro');

  /* apertura da percorso + recenti */
  await plugin.openPath(zipPath); await sleep(20);
  let st = leafStates.pop();
  assert.strictEqual(st.type, 'parley-view'); assert.strictEqual(st.state.source, zipPath);
  await plugin.openPath(tgDir); await sleep(20); leafStates.pop();
  await plugin.openPath(zipPath); await sleep(20); leafStates.pop();
  assert.deepStrictEqual(plugin.data.recent.map((r) => r.source), [zipPath, tgDir], 'recenti senza doppioni, ultima in cima');
  assert.strictEqual(plugin.data.recent[0].name, 'Chat WhatsApp con Anna');
  await plugin.openPath(path.join(tmp, 'sparito.zip')); assert.ok(/non trovato/.test(notices.pop()));
  assert.ok(!leafStates.length, 'percorso inesistente: nessuna tab aperta');
  console.log('✓ apertura da percorso, recenti (senza doppioni), percorso mancante segnalato');

  /* ---------- HOME ---------- */
  const lib = path.join(tmp, 'Export');
  fs.mkdirSync(lib);
  fs.copyFileSync(zipPath, path.join(lib, 'Chat WhatsApp con Anna.zip'));
  fs.cpSync(tgDir, path.join(lib, 'Gruppo Calcetto'), { recursive: true });
  fs.mkdirSync(path.join(lib, 'Anna'));                         // stessa chat già in zip: un'unica card
  fs.writeFileSync(path.join(lib, 'note.pdf'), 'x');           // ignorato
  fs.writeFileSync(path.join(lib, '.nascosto.zip'), 'x');      // ignorato
  const hl = { view: null };
  const hv = plugin.views['parley-home'](hl); hl.view = hv; homeLeaves.push(hl);
  await hv.onOpen(); await sleep(30);
  const hc = hv.contentEl;
  assert.ok(hc.classList.contains('pl-home-host') && hc.querySelector('.pl-home h1').textContent === 'Parley');
  assert.ok(/Nessuna chat ancora/.test(hc.textContent) === false, 'ci sono già recenti');
  assert.strictEqual(hc.querySelectorAll('.pl-cards .pl-card').length, 2, 'recenti: 2 card');
  assert.ok(Array.from(hc.querySelectorAll('.pl-card-meta')).some((m) => /WhatsApp · 404 messaggi · 2023/.test(m.textContent)), 'meta della chat WhatsApp: ' + hc.querySelector('.pl-card-meta').textContent);
  assert.ok(Array.from(hc.querySelectorAll('.pl-card-meta')).some((m) => /Allegato|audio|AUDIO|opus/i.test(m.textContent) || m.textContent.length > 2), 'anteprima ultimo messaggio');
  assert.ok(Array.from(hc.querySelectorAll('.pl-card-meta')).some((m) => /Telegram · 4 messaggi/.test(m.textContent)));
  await plugin.addLibrary(lib); await sleep(50);
  assert.deepStrictEqual(plugin.data.libraries, [lib]);
  const secs = hc.querySelectorAll('section');
  assert.strictEqual(secs.length, 2, 'recenti + libreria');
  assert.strictEqual(secs[1].querySelectorAll('.pl-card').length, 2, 'libreria: zip + cartella, niente pdf né file nascosti');
  assert.ok(/Anna/.test(secs[1].textContent) && /Gruppo Calcetto/.test(secs[1].textContent));
  assert.ok(/\+1 copia/.test(secs[1].textContent), 'doppione cartella+zip unito: ' + secs[1].textContent);
  // filtro
  hv.input.value = 'calcetto'; hv.input.dispatchEvent(new w.Event('input'));
  assert.strictEqual(hc.querySelectorAll('.pl-card').length, 2, 'filtro: 1 recente + 1 libreria');
  hv.input.value = 'zzzz'; hv.input.dispatchEvent(new w.Event('input'));
  assert.ok(/Nessun risultato/.test(hc.textContent));
  hv.input.value = ''; hv.input.dispatchEvent(new w.Event('input'));
  // click su una card apre la chat in una tab
  leafStates.length = 0;
  secs[1] && hc.querySelectorAll('section')[1].querySelector('.pl-card').click(); await sleep(30);
  assert.strictEqual(leafStates.pop().type, 'parley-view', 'click card → lettore');
  // rimuovi recente
  const nRec = plugin.data.recent.length;
  hc.querySelector('.pl-card-x').click(); await sleep(20);
  assert.strictEqual(plugin.data.recent.length, nRec - 1, 'recente rimosso');
  assert.ok(fs.existsSync(zipPath) && fs.existsSync(tgDir), 'rimuovere dai recenti non tocca i file');
  // "Apri cartella" su una cartella che contiene più chat (niente file di chat al primo livello) → libreria, non un'unica chat
  const cont = path.join(tmp, 'conversazioni'); fs.mkdirSync(path.join(cont, 'Camilla Tirelli'), { recursive: true }); fs.mkdirSync(path.join(cont, 'Chiara Arena'));
  leafStates.length = 0;
  await plugin.openPath(cont, { here: true }); await sleep(50);
  assert.ok(plugin.data.libraries.includes(cont), 'cartella contenitore aggiunta come libreria');
  assert.ok(!leafStates.some((x) => x.type === 'parley-view'), 'nessuna chat unica aperta');
  await plugin.removeLibrary(cont); await sleep(20);
  // cartella "persona" che contiene uno zip annidato → la chat si legge lo stesso
  const nest = path.join(tmp, 'Persona Annidata'); fs.mkdirSync(nest); fs.copyFileSync(zipPath, path.join(nest, 'export.zip'));
  const ns = mkView(); await ns.setState({ source: nest }, {}); await sleep(400);
  assert.ok(!/Non ho trovato/.test(ns.contentEl.textContent || '') && /Anna|Chat/.test(ns.contentEl.textContent || ''), 'zip annidato letto: ' + (ns.contentEl.textContent || '').slice(0, 200));
  // messaggi fuori ordine nell'export → mostrati in ordine cronologico
  const unordered = path.join(tmp, 'FuoriOrdine'); fs.mkdirSync(unordered);
  fs.writeFileSync(path.join(unordered, 'result.json'), JSON.stringify({ name: 'Tizio', type: 'personal_chat', id: 1, messages: [
    { id: 3, type: 'message', date: '2024-03-03T10:00:00', from: 'Tizio', from_id: 'user1', text: 'terzo', text_entities: [{ type: 'plain', text: 'terzo' }] },
    { id: 1, type: 'message', date: '2024-03-01T10:00:00', from: 'Tizio', from_id: 'user1', text: 'primo', text_entities: [{ type: 'plain', text: 'primo' }] },
    { id: 2, type: 'message', date: '2024-03-02T10:00:00', from: 'Tizio', from_id: 'user1', text: 'secondo', text_entities: [{ type: 'plain', text: 'secondo' }] } ] }));
  const uv = mkView(); await uv.setState({ source: unordered }, {}); await sleep(400);
  const utxt = Array.from(uv.contentEl.querySelectorAll('.txt')).map((n) => n.textContent).join(',');
  assert.strictEqual(utxt, 'primo,secondo,terzo', 'ordine cronologico: ' + utxt);
  // libreria mancante → messaggio, rimozione libreria
  await plugin.addLibrary(path.join(tmp, 'sparita')); await sleep(30);
  assert.ok(/Cartella non trovata/.test(hc.textContent));
  await plugin.removeLibrary(path.join(tmp, 'sparita')); await plugin.removeLibrary(lib); await sleep(20);
  assert.deepStrictEqual(plugin.data.libraries, []);
  assert.ok(fs.existsSync(lib), 'rimuovere la libreria non tocca i file');
  // il pulsante home riporta alla home nella stessa tab (così la freccia indietro di Obsidian funziona)
  leafStates.length = 0;
  // pulsante home nel lettore
  const vh = mkView(); await vh.onOpen(); await vh.setState({ source: zipPath }, {}); await sleep(120);
  const hb = vh.contentEl.querySelector('[data-a="home"]');
  assert.ok(hb && !hb.hidden, 'pulsante home nel lettore');
  hb.click(); await sleep(20);
  assert.strictEqual(leafStates.pop().type, 'parley-home', 'home aperta nella stessa tab');
  await plugin.activateHome(); assert.ok(true);
  await hv.onClose(); await vh.onClose();
  console.log('✓ home: recenti, librerie (scansione, filtro, rimozione), card → lettore, pulsante home');

  assert.strictEqual(app.vault.lastCreate, undefined, 'il plugin non crea file nel vault');
  console.log('✓ nessuna nota o file creati nel vault');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\nPlugin OK');
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
