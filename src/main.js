/* Parley — plugin Obsidian (solo desktop).
   Legge zip o cartelle esportati da WhatsApp/Telegram direttamente dal disco: nel vault non viene creato né copiato nulla. */
var VIEW_TYPE = 'parley-view';
var HOME_TYPE = 'parley-home';
var DEFAULTS = { me: {}, recent: [], libraries: [], meta: {}, lang: 'auto' };
var tr = I18N.t, trn = I18N.tn;

/* ---------- utilità ---------- */
function escHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function el(parent, tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
function iconEl(parent, name) { var s = el(parent, 'span'); s.style.display = 'contents'; s.innerHTML = Reader.ic(name); return s; }
function lowerNorm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function hueOf(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
function stripExt(n) { return n.replace(/\.(zip|txt|json)$/i, ''); }
function guessName(p) {
  var base = stripExt(path.basename(p));
  var n = null;
  try { n = P.deriveWaName([base]); } catch (e) { /* ignore */ }
  return n || base;
}

/* ---------- percorso -> Source (cartella, zip o file singolo) ---------- */
async function walkDir(dir, base, out) {
  var list = await fs.promises.readdir(dir, { withFileTypes: true });
  for (var i = 0; i < list.length; i++) {
    var d = list[i];
    if (d.name.charAt(0) === '.') continue;
    var full = path.join(dir, d.name), rel = base ? base + '/' + d.name : d.name;
    if (d.isDirectory()) await walkDir(full, rel, out);
    else if (d.isFile()) out.push({ full: full, rel: rel });
  }
}

async function openSource(p) {
  var st = await fs.promises.stat(p);
  var src = new Reader.Source(path.basename(p));
  if (st.isDirectory()) {
    var files = [];
    await walkDir(p, '', files);
    var zips = [];
    for (var i = 0; i < files.length; i++) {
      (function (f) {
        /* zip dentro la cartella (es. "Nome/Nome.zip"): ne leggo il contenuto come se fosse una sottocartella */
        if (/\.zip$/i.test(f.rel)) { zips.push(f); return; }
        src.add(f.rel, null, function () { return fs.promises.readFile(f.full); });
      })(files[i]);
    }
    for (var z = 0; z < zips.length; z++) {
      await (async function (zf) {
        try {
          var zr2 = await ZipReader.open(zf.full);
          zf.reader = zr2;
          zr2.entries.forEach(function (e) {
            if (/\/$/.test(e.name) || /^__MACOSX\//.test(e.name) || /(^|\/)(\._|\.DS_Store)/.test(e.name)) return;
            src.add(zf.rel + '/' + e.name, e.usize, function () { return zr2.read(e); });
          });
        } catch (x) { /* zip illeggibile: lo salto */ }
      })(zips[z]);
    }
    return { src: src, close: function () { return Promise.all(zips.map(function (f) { return f.reader ? f.reader.close() : null; })); } };
  }
  if (/\.zip$/i.test(p)) {
    var zr = await ZipReader.open(p);
    zr.entries.forEach(function (e) {
      if (/\/$/.test(e.name) || /^__MACOSX\//.test(e.name) || /(^|\/)(\._|\.DS_Store)/.test(e.name)) return;
      src.add(e.name, e.usize, function () { return zr.read(e); });
    });
    return { src: src, close: function () { return zr.close(); } };
  }
  // .txt / .json singolo: nessun media collegato
  src.add(path.basename(p), st.size, function () { return fs.promises.readFile(p); });
  return { src: src, close: function () {} };
}

/* una cartella "contenitore" non è una chat: non ha file di chat al primo livello ma contiene più cartelle/zip (una per chat) */
async function isChatContainer(dir) {
  var list;
  try { list = await fs.promises.readdir(dir, { withFileTypes: true }); } catch (e) { return false; }
  var kids = 0;
  for (var i = 0; i < list.length; i++) {
    var d = list[i];
    if (d.name.charAt(0) === '.') continue;
    if (d.isFile() && /\.(txt|json|html?)$/i.test(d.name)) return false;
    if (d.isDirectory() || (d.isFile() && /\.zip$/i.test(d.name))) kids++;
  }
  return kids >= 2;
}

/* elenco di una cartella-libreria: un livello, solo cartelle / zip / txt / json */
async function scanLibrary(dir) {
  var list = await fs.promises.readdir(dir, { withFileTypes: true });
  var items = [];
  for (var i = 0; i < list.length; i++) {
    var d = list[i];
    if (d.name.charAt(0) === '.') continue;
    var full = path.join(dir, d.name), kind = null;
    if (d.isDirectory()) kind = 'dir';
    else if (d.isFile() && /\.zip$/i.test(d.name)) kind = 'zip';
    else if (d.isFile() && /\.(txt|json)$/i.test(d.name)) kind = 'file';
    if (!kind) continue;
    var mt = 0;
    try { mt = (await fs.promises.stat(full)).mtimeMs; } catch (e) { /* ignore */ }
    items.push({ source: full, kind: kind, ts: mt });
  }
  /* stessa chat presente sia come cartella sia come zip (o più copie): ne mostro una sola, la più recente */
  var byKey = new Map();
  items.forEach(function (it) {
    var k = dedupeKey(it.source);
    var cur = byKey.get(k);
    if (!cur) { it.alt = []; byKey.set(k, it); return; }
    var keep = it.ts > cur.ts ? it : cur, drop = keep === it ? cur : it;
    keep.alt = (keep.alt || []).concat(drop.alt || [], [drop.source]);
    byKey.set(k, keep);
  });
  items = Array.from(byKey.values());
  items.sort(function (a, b) { return b.ts - a.ts; });
  return items;
}
function dedupeKey(p) {
  var n = path.basename(p).replace(/\.(zip|txt|json)$/i, '');
  n = lowerNorm(n).replace(/whatsapp chat with|chat whatsapp con|chat di whatsapp con|telegram chat|chatexport[_ ]*/g, '')
    .replace(/\(\d+\)\s*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return n || lowerNorm(path.basename(p));
}

/* ---------- selezione file/cartella (dialogo di sistema) ---------- */
function filePathOf(f) {
  try {
    var e = require('electron');
    if (e && e.webUtils && e.webUtils.getPathForFile) return e.webUtils.getPathForFile(f);
  } catch (x) { /* ignore */ }
  return f.path || '';
}
function pickPath(kind) {
  return new Promise(function (resolve) {
    var inp = document.createElement('input');
    inp.type = 'file';
    if (kind === 'dir') inp.webkitdirectory = true; else inp.accept = '.zip,.txt,.json';
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (!f) return resolve('');
      var abs = filePathOf(f);
      if (!abs) return resolve('');
      if (kind === 'dir') {
        var rel = f.webkitRelativePath || '', top = rel.split('/')[0];
        resolve(abs.slice(0, abs.length - rel.length) + top);
      } else resolve(abs);
    });
    inp.click();
  });
}

/* ---------- vista: lettore ---------- */
class ChatView extends obsidian.ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; this.vstate = {}; this.reader = null; this.opened = null; }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return this.vstate.title || 'Parley'; }
  getIcon() { return 'messages-square'; }
  getState() { return this.vstate; }
  async setState(state, result) {
    this.vstate = state || {};
    await this.load();
    await super.setState(state, result);
  }
  async onOpen() { this.contentEl.addClass('pl-host'); }
  async onClose() { this.teardown(); }
  teardown() {
    if (this.reader) { this.reader.destroy(); this.reader = null; }
    if (this.opened) { var o = this.opened; this.opened = null; Promise.resolve(o.close()).catch(function () {}); }
  }
  status(html) { this.contentEl.empty(); var d = this.contentEl.createDiv({ cls: 'pl-status' }); d.innerHTML = html; return d; }
  async load() {
    var s = this.vstate, self = this;
    this.teardown();
    if (!s.source) { this.status('<div>' + escHtml(tr('Nessuna chat aperta. Sceglila dalla home di Parley.')) + '</div>'); return; }
    var status = this.status('<div><div class="pl-spin"></div><div class="pl-msg">' + escHtml(tr('Apro {0}…', path.basename(s.source))) + '</div></div>');
    var say = function (m) { var e = status.querySelector('.pl-msg'); if (e) e.textContent = m; };
    try {
      this.opened = await openSource(s.source);
      var chats = await Reader.detectChats(this.opened.src, this.plugin.meStore(), say);
      if (!chats.length) {
        var seen = this.opened.src.entries.map(function (en) { return en.path; }), more = seen.length > 12 ? '\n' + tr('… e altri {0}', seen.length - 12) : '';
        this.teardown();
        this.status('<div><b>' + escHtml(tr('Non ho trovato chat WhatsApp o Telegram in:')) + '</b><pre>' + escHtml(s.source) + '</pre><b>' + escHtml(tr('Contenuto trovato ({0} file):', seen.length)) + '</b><pre>' + escHtml(seen.slice(0, 12).join('\n') + more || tr('(vuoto)')) + '</pre></div>');
        return;
      }
      this.plugin.remember(s.source, chats);
      if (s.chat) {
        var wanted = chats.filter(function (c) { return c.name.toLowerCase() === String(s.chat).toLowerCase(); });
        if (wanted.length) chats = wanted;
      }
      chats.sort(function (a, b) { return b.last - a.last; });
      this.vstate.title = s.title || chats[0].name;
      this.contentEl.empty();
      this.reader = Reader.createReader(this.contentEl, {
        chats: chats, store: this.plugin.meStore(),
        onHome: function () { self.plugin.activateHome(self.leaf); }
      });
      this.leaf.updateHeader && this.leaf.updateHeader();
    } catch (err) {
      this.teardown();
      var hint = err && err.code === 'ENOENT' ? tr('Il file o la cartella non esiste più in questo percorso.') : (err && err.message || String(err));
      this.status('<div><b>' + escHtml(tr('Non riesco ad aprire questa chat')) + '</b><pre>' + escHtml(s.source) + '\n\n' + escHtml(hint) + '</pre></div>');
    }
  }
}

/* ---------- vista: home ---------- */
function fmtWhen(ts) {
  if (!ts) return '';
  var d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return I18N.dt('t').format(d);
  if (d.getFullYear() === now.getFullYear()) return I18N.dt('dm').format(d);
  return I18N.dt('my').format(d);
}

class HomeView extends obsidian.ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; this.filter = ''; this.scans = {}; this.root = null; this.sections = null; this.menu = null; this.offMenu = null; }
  getViewType() { return HOME_TYPE; }
  getDisplayText() { return 'Parley'; }
  getIcon() { return 'messages-square'; }
  async onOpen() { this.contentEl.addClass('pl-home-host'); this.build(); this.rescanAll(false); }
  async onClose() { this.closeMenu(); this.contentEl.empty(); }

  build() {
    var self = this, c = this.contentEl;
    c.empty();
    var root = this.root = el(c, 'div', 'pl-home');

    /* barra superiore fissa: titolo, "+" e ricerca */
    var bar = el(root, 'div', 'pl-bar');
    var row = el(bar, 'div', 'pl-bar-row');
    var brand = el(row, 'h1', 'pl-brand');
    var logo = el(brand, 'span', 'pl-logo');
    logo.innerHTML = '<svg viewBox="0 0 256 256" aria-hidden="true"><rect width="256" height="256" rx="58" class="pl-logo-bg"/><path d="M82 200V70h54a44 44 0 0 1 0 88h-22" fill="none" class="pl-logo-fg" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/><path d="M114 158l30 34v-34z" class="pl-logo-fgf"/></svg>';
    el(brand, 'span', null, 'Parley');
    var add = el(row, 'button', 'pl-plus');
    add.setAttribute('type', 'button'); add.setAttribute('aria-label', tr('Aggiungi una chat')); add.title = tr('Aggiungi una chat');
    iconEl(add, 'plus');
    add.addEventListener('click', function (e) { e.stopPropagation(); if (self.menu) self.closeMenu(); else self.openMenu(add); });
    var sw = el(bar, 'label', 'pl-searchwrap');
    iconEl(sw, 'search');
    var inp = el(sw, 'input', 'pl-search');
    inp.type = 'text'; inp.placeholder = tr('Cerca');
    inp.value = this.filter;
    inp.addEventListener('input', function () { self.filter = inp.value; self.renderSections(); });
    this.input = inp;

    this.sections = el(root, 'div', 'pl-sections');
    this.renderSections();
  }

  /* menu a comparsa del "+" */
  openMenu(anchor) {
    var self = this;
    var m = this.menu = el(anchor.parentNode, 'div', 'pl-menu');
    var item = function (label, fn) {
      var b = el(m, 'button', 'pl-menu-i', label); b.setAttribute('type', 'button');
      b.addEventListener('click', function (e) { e.stopPropagation(); self.closeMenu(); fn(); });
    };
    item(tr('Apri file zip…'), async function () { var p = await pickPath('file'); if (p) self.plugin.openPath(p, { here: true }); });
    item(tr('Apri cartella…'), async function () { var p = await pickPath('dir'); if (p) self.plugin.openPath(p, { here: true }); });
    el(m, 'div', 'pl-menu-sep');
    item(tr('Aggiungi cartella di export…'), async function () { var p = await pickPath('dir'); if (p) await self.plugin.addLibrary(p); });
    var off = function (e) { if (e.type === 'keydown' && e.key !== 'Escape') return; self.closeMenu(); };
    this.offMenu = off;
    setTimeout(function () { document.addEventListener('click', off); document.addEventListener('keydown', off); }, 0);
  }
  closeMenu() {
    if (this.menu && this.menu.parentNode) this.menu.parentNode.removeChild(this.menu);
    this.menu = null;
    if (this.offMenu) { document.removeEventListener('click', this.offMenu); document.removeEventListener('keydown', this.offMenu); this.offMenu = null; }
  }

  async rescanAll(force) {
    var libs = this.plugin.data.libraries || [], self = this;
    await Promise.all(libs.map(function (lib) {
      if (!force && self.scans[lib]) return null;
      return self.rescan(lib, true);
    }));
    this.renderSections();
  }
  async rescan(lib, silent) {
    try { this.scans[lib] = { items: await scanLibrary(lib) }; }
    catch (e) { this.scans[lib] = { items: [], error: e && e.code === 'ENOENT' ? tr('Cartella non trovata') : (e && e.message || tr('Errore')) }; }
    if (!silent) this.renderSections();
  }
  render() { if (this.sections) this.renderSections(); }

  describe(item) {
    var m = this.plugin.data.meta[item.source] || null;
    var name = (m && m.name) || guessName(item.source);
    var parts = [];
    if (m && m.platform) {
      parts.push(m.platform === 'telegram' ? 'Telegram' : 'WhatsApp');
      if (m.count) parts.push(trn(m.count, '{0} messaggio', '{0} messaggi'));
      if (m.first && m.last) {
        var a = new Date(m.first), b = new Date(m.last);
        parts.push(a.getFullYear() === b.getFullYear() ? String(a.getFullYear()) : a.getFullYear() + '–' + b.getFullYear());
      }
    } else {
      parts.push(item.kind === 'zip' ? tr('Zip') : item.kind === 'dir' ? tr('Cartella') : tr('File'));
      parts.push(tr('da aprire'));
    }
    return { name: name, line: parts.join(' · '), when: fmtWhen((m && m.last) || item.ts) };
  }

  matches(item) {
    var f = lowerNorm(this.filter.trim());
    if (!f) return true;
    return lowerNorm(this.describe(item).name + ' ' + path.basename(item.source)).indexOf(f) >= 0;
  }

  card(parent, item, removable) {
    var self = this, d = this.describe(item);
    var card = el(parent, 'div', 'pl-card');
    card.setAttribute('role', 'button'); card.setAttribute('tabindex', '0');
    el(card, 'div', 'pl-card-av', (d.name.match(/[\p{L}\p{N}]/u) || ['?'])[0]);
    var body = el(card, 'div', 'pl-card-body');
    el(body, 'div', 'pl-card-name', d.name);
    el(body, 'div', 'pl-card-meta', d.line + (item.alt && item.alt.length ? ' · ' + trn(item.alt.length, '+{0} copia', '+{0} copie') : ''));
    el(card, 'div', 'pl-card-when', d.when);
    card.title = item.source + (item.alt && item.alt.length ? '\n\n' + tr('Anche in:') + '\n' + item.alt.join('\n') : '');
    var open = function () { self.plugin.openPath(item.source, { here: true }); };
    card.addEventListener('click', open);
    card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    if (removable) {
      var x = el(card, 'button', 'pl-card-x', '×');
      x.setAttribute('type', 'button'); x.setAttribute('aria-label', tr('Rimuovi dai recenti')); x.title = tr('Rimuovi dai recenti');
      x.addEventListener('click', function (e) { e.stopPropagation(); self.plugin.removeRecent(item.source); });
    }
    return card;
  }

  renderSections() {
    var self = this, host = this.sections, plugin = this.plugin;
    host.innerHTML = '';
    var shown = 0;

    var recents = (plugin.data.recent || []).map(function (r) { return { source: r.source, kind: /\.zip$/i.test(r.source) ? 'zip' : /\.(txt|json)$/i.test(r.source) ? 'file' : 'dir', ts: r.ts || 0 }; })
      .filter(function (it) { return self.matches(it); });
    if (recents.length) {
      var s1 = el(host, 'section'), h1 = el(s1, 'div', 'pl-sec-h'); el(h1, 'h2', null, tr('Aperte di recente'));
      var g1 = el(s1, 'div', 'pl-cards');
      recents.forEach(function (it) { self.card(g1, it, true); });
      shown += recents.length;
    }

    var libs = plugin.data.libraries || [];
    libs.forEach(function (lib) {
      var sc = self.scans[lib], items = sc ? sc.items.filter(function (it) { return self.matches(it); }) : [];
      var f = lowerNorm(self.filter.trim());
      if (f && !items.length) return;
      var s = el(host, 'section'), h = el(s, 'div', 'pl-sec-h');
      var h2 = el(h, 'h2', null, path.basename(lib) || lib); h2.title = lib;
      el(h, 'span', 'pl-grow');
      var rb = el(h, 'button', 'pl-link', tr('Aggiorna')); rb.setAttribute('type', 'button');
      rb.addEventListener('click', function () { self.rescan(lib, false); });
      var xb = el(h, 'button', 'pl-link', tr('Rimuovi')); xb.setAttribute('type', 'button'); xb.title = tr('Smette di mostrare questa cartella (i file non vengono toccati)');
      xb.addEventListener('click', function () { plugin.removeLibrary(lib); });
      if (!sc) { el(s, 'div', 'pl-empty', tr('Leggo la cartella…')); return; }
      if (sc.error) { el(s, 'div', 'pl-empty', sc.error + ': ' + lib); return; }
      if (!items.length) { el(s, 'div', 'pl-empty', tr('Nessuna chat in questa cartella: cerco zip, cartelle e file .txt/.json.')); return; }
      var g = el(s, 'div', 'pl-cards');
      items.forEach(function (it) { self.card(g, it, false); });
      shown += items.length;
    });

    if (!shown && !self.filter.trim() && !libs.length) {
      var e = el(host, 'div', 'pl-empty pl-welcome');
      el(e, 'b', null, tr('Nessuna chat ancora'));
      el(e, 'p', null, tr('Scegli la cartella con i tuoi export di WhatsApp e Telegram. Le chat compariranno qui; i file restano dove sono e non viene copiato nulla.'));
      var wb = el(e, 'button', 'pl-textbtn', tr('Aggiungi cartella di export…')); wb.setAttribute('type', 'button');
      wb.addEventListener('click', async function () { var p = await pickPath('dir'); if (p) await plugin.addLibrary(p); });
    } else if (!shown && self.filter.trim()) {
      el(host, 'div', 'pl-empty', tr('Nessun risultato per «{0}».', self.filter.trim()));
    }
  }
}

/* ---------- impostazioni ---------- */
var SettingsBase = obsidian.PluginSettingTab || class {};
class ParleySettings extends SettingsBase {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    var self = this, c = this.containerEl;
    c.empty();
    new obsidian.Setting(c).setName(tr('Lingua')).setDesc(tr('Lingua dell\'interfaccia di Parley.')).addDropdown(function (d) {
      d.addOption('auto', tr('Automatica (segue Obsidian)')).addOption('it', 'Italiano').addOption('en', 'English')
        .setValue(self.plugin.data.lang || 'auto')
        .onChange(async function (v) { self.plugin.data.lang = v; await self.plugin.savePlugin(); self.plugin.relocalize(); self.display(); });
    });
  }
}

/* ---------- plugin ---------- */
class ParleyPlugin extends obsidian.Plugin {
  async onload() {
    var self = this;
    var loaded = await this.loadData();
    this.data = Object.assign({}, DEFAULTS, loaded || {});
    if (!this.data.me) this.data.me = {};
    if (!this.data.recent) this.data.recent = [];
    if (!this.data.libraries) this.data.libraries = [];
    if (!this.data.meta) this.data.meta = {};
    this.applyLocale();
    this.registerView(VIEW_TYPE, function (leaf) { return new ChatView(leaf, self); });
    this.registerView(HOME_TYPE, function (leaf) { return new HomeView(leaf, self); });
    if (obsidian.PluginSettingTab && obsidian.Setting) this.addSettingTab(new ParleySettings(this.app, this));
    this.addRibbonIcon('messages-square', tr('Apri Parley'), function () { self.activateHome(); });
    this.addCommand({ id: 'open-home', name: tr('Apri Parley'), callback: function () { self.activateHome(); } });
  }
  /* lingua: "auto" segue Obsidian (it → italiano, altre → inglese); si può forzare dalle impostazioni */
  applyLocale() {
    var l = this.data.lang && this.data.lang !== 'auto' ? this.data.lang : I18N.detect();
    I18N.setLocale(l);
    P.setTranslator(I18N.t);
  }
  relocalize() {
    this.applyLocale();
    var ws = this.app.workspace;
    (ws.getLeavesOfType ? ws.getLeavesOfType(HOME_TYPE) : []).forEach(function (l) { if (l.view && l.view.build) l.view.build(); });
    (ws.getLeavesOfType ? ws.getLeavesOfType(VIEW_TYPE) : []).forEach(function (l) { if (l.view && l.view.load) l.view.load(); });
  }
  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(HOME_TYPE);
  }
  async savePlugin() { await this.saveData(this.data); }
  meStore() {
    var self = this;
    return {
      get: function (k) { return Object.prototype.hasOwnProperty.call(self.data.me, k) ? self.data.me[k] : null; },
      set: function (k, v) { self.data.me[k] = v; self.savePlugin(); }
    };
  }
  homes() {
    var ws = this.app.workspace;
    return (ws.getLeavesOfType ? ws.getLeavesOfType(HOME_TYPE) : []).map(function (l) { return l.view; }).filter(function (v) { return v && v.render; });
  }
  refreshHomes() { this.homes().forEach(function (v) { v.render(); }); }

  async activateHome(fromLeaf) {
    var ws = this.app.workspace;
    if (fromLeaf) { await fromLeaf.setViewState({ type: HOME_TYPE, active: true }); ws.revealLeaf(fromLeaf); return; }
    var ex = ws.getLeavesOfType ? ws.getLeavesOfType(HOME_TYPE) : [];
    if (ex.length) { ws.revealLeaf(ex[0]); return; }
    var leaf = ws.getLeaf('tab');
    await leaf.setViewState({ type: HOME_TYPE, active: true });
    ws.revealLeaf(leaf);
  }

  /* memorizza nome / piattaforma / conteggi per le card della home (solo in data.json) */
  remember(source, chats) {
    if (!chats || !chats.length) return;
    var total = 0, first = 0, last = 0;
    chats.forEach(function (c) {
      total += c.messages.length;
      if (c.first && (!first || c.first < first)) first = c.first;
      if (c.last > last) last = c.last;
    });
    var one = chats.length === 1;
    this.data.meta[source] = {
      name: one ? chats[0].name : guessName(source),
      platform: chats[0].platform, count: total, chats: chats.length, first: first, last: last
    };
    this.savePlugin();
    this.refreshHomes();
  }
  async addLibrary(dir) {
    if (this.data.libraries.indexOf(dir) < 0) this.data.libraries.push(dir);
    await this.savePlugin();
    var self = this;
    await Promise.all(this.homes().map(function (v) { return v.rescan(dir, true).then(function () { v.render(); }); }));
    if (!this.homes().length) new obsidian.Notice(tr('Cartella aggiunta: {0}', dir));
  }
  async removeLibrary(dir) {
    this.data.libraries = this.data.libraries.filter(function (l) { return l !== dir; });
    await this.savePlugin();
    this.refreshHomes();
  }
  async removeRecent(source) {
    this.data.recent = this.data.recent.filter(function (r) { return r.source !== source; });
    await this.savePlugin();
    this.refreshHomes();
  }
  async openPath(p, opts) {
    var pst;
    try { pst = await fs.promises.stat(p); } catch (e) { new obsidian.Notice(tr('Percorso non trovato: {0}', p)); return; }
    if (pst.isDirectory() && await isChatContainer(p)) {
      /* cartella con tante chat dentro: la tratto come libreria (una card per chat) invece di fonderle in una sola */
      await this.addLibrary(p);
      await this.activateHome(opts && opts.here ? opts.fromLeaf || null : null);
      return;
    }
    var name = stripExt(path.basename(p));
    this.data.recent = [{ source: p, name: name, ts: Date.now() }].concat((this.data.recent || []).filter(function (r) { return r.source !== p; })).slice(0, 8);
    await this.savePlugin();
    this.refreshHomes();
    var leaf = this.app.workspace.getLeaf(opts && opts.here ? false : 'tab');
    await leaf.setViewState({ type: VIEW_TYPE, active: true, state: { source: p, title: '' } });
    this.app.workspace.revealLeaf(leaf);
  }
}
