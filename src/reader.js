'use strict';
/* Interfaccia "lettore chat" per Obsidian. Dipende da P (ChatParsers) e non tocca il filesystem:
   riceve una Source le cui voci espongono getBuffer(). */
var PAGE = 300;

/* ---------- utilità ---------- */
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var escRe = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
var hue = function (s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
var fmtSize = function (n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return Math.round(n / 1024) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1).replace('.0', '') + ' MB';
  return (n / 1073741824).toFixed(1) + ' GB';
};
var normPath = function (p) {
  var parts = [], segs = String(p).replace(/\\/g, '/').split('/');
  for (var i = 0; i < segs.length; i++) { var s = segs[i]; if (!s || s === '.') continue; if (s === '..') parts.pop(); else parts.push(s); }
  return parts.join('/');
};
var lc = function (p) { return normPath(p).normalize('NFC').toLowerCase(); };
var dirOf = function (p) { var n = normPath(p), i = n.lastIndexOf('/'); return i < 0 ? '' : n.slice(0, i); };
var tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };

var ICONS = {
  chev: '<path d="m15 18-6-6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/>',
  more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  play: '<polygon points="7 4 20 12 7 20 7 4" fill="currentColor"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  event: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  photos: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>'
};
var ic = function (n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[n] + '</svg>'; };

/* ---------- date ---------- */
var tFmt = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
var dLong = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
var dMed = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
var dMonth = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
var dayKey = function (m) {
  if (m._dk === undefined) { var d = new Date(m.ts); m._dk = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  return m._dk;
};
function dayLabel(m) {
  var d = new Date(), t = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(), k = dayKey(m);
  if (k === t) return 'Oggi';
  d.setDate(d.getDate() - 1);
  if (k === d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) return 'Ieri';
  var s = dLong.format(new Date(m.ts));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function isoDay(ts) { var d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

/* ---------- riconoscimento formato dai primi byte ---------- */
function sniff(b) {
  if (!b || b.length < 12) return '';
  var h = function (i, s) { for (var k = 0; k < s.length; k++) if (b[i + k] !== s.charCodeAt(k)) return false; return true; };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && h(1, 'PNG')) return 'image/png';
  if (h(0, 'GIF8')) return 'image/gif';
  if (h(0, 'RIFF') && h(8, 'WEBP')) return 'image/webp';
  if (h(4, 'ftyp')) {
    var br = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (/^(heic|heix|hevc|heim|heis|mif1|msf1)/.test(br)) return 'image/heic';
    if (br === 'avif') return 'image/avif';
    if (br === 'qt  ') return 'video/quicktime';
    return 'video/mp4';
  }
  return '';
}

/* ---------- sorgente file (cartella o zip), voci con getBuffer() ---------- */
function Source(label) { this.label = label || ''; this.entries = []; this.byPath = new Map(); this.byBase = new Map(); }
Source.prototype.add = function (path, size, getBuffer) {
  var e = { path: normPath(path), size: size, getBuffer: getBuffer, url: null };
  e.getBlob = function () {
    return getBuffer().then(function (buf) { return new Blob([buf], { type: sniff(buf) || P.mimeOf(path) || '' }); });
  };
  this.entries.push(e);
  this.byPath.set(lc(path), e);
  var b = lc(P.baseName(path));
  if (!this.byBase.has(b)) this.byBase.set(b, []);
  this.byBase.get(b).push(e);
  return e;
};
Source.prototype.find = function (rel, dir) {
  if (!rel) return null;
  var tries = [];
  if (dir) tries.push(lc(dir + '/' + rel));
  tries.push(lc(rel));
  for (var i = 0; i < tries.length; i++) if (this.byPath.has(tries[i])) return this.byPath.get(tries[i]);
  var list = this.byBase.get(lc(P.baseName(rel)));
  if (!list) return null;
  if (dir) {
    var d = lc(dir);
    for (var j = 0; j < list.length; j++) if (lc(dirOf(list[j].path)) === d) return list[j];
  }
  return list[0];
};

async function readText(entry) {
  var buf = await entry.getBuffer();
  var s = typeof buf === 'string' ? buf : buf.toString('utf8');
  if (s === '[object Uint8Array]') s = new TextDecoder('utf-8').decode(buf);
  return s.replace(/^﻿/, '');
}

/* ---------- rilevamento chat in una sorgente ---------- */
function buildChat(o, store) {
  var msgs = o.messages, byId = new Map();
  /* ordine cronologico garantito (anche se l'export mescola file/pagine): ordinamento stabile per data */
  var sorted = true;
  for (var si = 1; si < msgs.length; si++) if (msgs[si].ts < msgs[si - 1].ts) { sorted = false; break; }
  if (!sorted) msgs = msgs.map(function (m, k) { return { m: m, k: k }; }).sort(function (a, b) { return (a.m.ts - b.m.ts) || (a.k - b.k); }).map(function (x) { return x.m; });
  msgs.forEach(function (m, i) { m.i = i; byId.set(m.id, i); });
  var group = o.type ? !/personal_chat|saved_messages|bot_chat/.test(o.type) : o.participants.length > 2;
  var chat = {
    platform: o.platform, name: o.name, src: o.src, dir: o.dir,
    messages: msgs, byId: byId, participants: o.participants, group: group,
    first: msgs.length ? msgs[0].ts : 0, last: msgs.length ? msgs[msgs.length - 1].ts : 0, me: null, meSure: false
  };
  chat.storeKey = 'me.' + o.platform + '|' + o.name + '|' + chat.first + '|' + msgs.length;
  var stored = store ? store.get(chat.storeKey) : null;
  if (stored !== null && stored !== undefined && (stored === '' || o.participants.indexOf(stored) >= 0)) { chat.me = stored || null; chat.meSure = true; }
  else if (o.meName && o.participants.indexOf(o.meName) >= 0) { chat.me = o.meName; chat.meSure = true; }
  else if (!group && o.participants.length >= 1) {
    var other = o.participants.filter(function (p) { return norm(p) === norm(o.name); })[0];
    if (other) { chat.me = o.participants.filter(function (p) { return p !== other; })[0] || null; chat.meSure = !!chat.me; }
    else if (o.participants.length === 2) chat.me = o.participants[1];
  }
  return chat;
}

async function detectChats(src, store, progress) {
  var out = [], i, e, say = progress || function () {};
  for (i = 0; i < src.entries.length; i++) {
    e = src.entries[i];
    if (!/\.json$/i.test(e.path) || (e.size && e.size > 450e6)) continue;
    var obj;
    say('Leggo ' + P.baseName(e.path) + '…');
    try { obj = JSON.parse(await readText(e)); } catch (x) { continue; }
    var parsed = P.parseTelegramJson(obj || {});
    for (var j = 0; j < parsed.length; j++) out.push(buildChat(Object.assign({ platform: 'telegram', src: src, dir: dirOf(e.path) }, parsed[j]), store));
    await tick();
  }
  var groups = new Map();
  src.entries.forEach(function (en) {
    var m = /(^|\/)messages(\d*)\.html?$/i.exec(en.path);
    if (!m) return;
    var d = dirOf(en.path);
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push({ e: en, n: m[2] ? +m[2] : 1 });
  });
  for (var g of groups) {
    var arr = g[1].sort(function (a, b) { return a.n - b.n; }), htmls = [];
    say('Leggo la cronologia HTML…');
    for (i = 0; i < arr.length; i++) htmls.push(await readText(arr[i].e));
    var r = P.parseTelegramHtml(htmls);
    if (r.messages.length) out.push(buildChat({ platform: 'telegram', src: src, dir: g[0], name: r.name, messages: r.messages, participants: r.participants }, store));
    await tick();
  }
  for (i = 0; i < src.entries.length; i++) {
    e = src.entries[i];
    if (!/\.txt$/i.test(e.path) || (e.size && e.size > 300e6)) continue;
    say('Leggo ' + P.baseName(e.path) + '…');
    var t = await readText(e);
    if (!P.looksLikeWhatsApp(t)) continue;
    var w = P.parseWhatsApp(t);
    if (!w.messages.length) continue;
    var name = P.deriveWaName([src.label, P.baseName(e.path)]) || ('Chat con ' + w.participants.slice(0, 3).join(', '));
    out.push(buildChat({ platform: 'whatsapp', src: src, dir: dirOf(e.path), name: name, messages: w.messages, participants: w.participants }, store));
    await tick();
  }
  return out;
}

/* ---------- formattazione testo ---------- */
function linkify(s) {
  return s.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/gi, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>'; });
}
function fmtWa(t) {
  var stash = [], keep = function (h) { stash.push(h); return '\u0000' + (stash.length - 1) + '\u0000'; };
  var s = esc(t);
  s = s.replace(/```([\s\S]+?)```/g, function (_, c) { return keep('<pre>' + c.replace(/^\n|\n$/g, '') + '</pre>'); });
  s = s.replace(/`([^`\n]+)`/g, function (_, c) { return keep('<code>' + c + '</code>'); });
  s = s.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/gi, function (u) { return keep('<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>'); });
  s = s.replace(/(^|[\s(])\*([^\s*](?:[^*\n]*[^\s*])?)\*(?=$|[\s.,;:!?)])/g, '$1<b>$2</b>');
  s = s.replace(/(^|[\s(])_([^\s_](?:[^_\n]*[^\s_])?)_(?=$|[\s.,;:!?)])/g, '$1<i>$2</i>');
  s = s.replace(/(^|[\s(])~([^\s~](?:[^~\n]*[^\s~])?)~(?=$|[\s.,;:!?)])/g, '$1<s>$2</s>');
  return s.replace(/\u0000(\d+)\u0000/g, function (_, n) { return stash[+n]; });
}
function fmtEntities(ents) {
  return ents.map(function (e) {
    var s = esc(e.s);
    switch (e.t) {
      case 'bold': return '<b>' + s + '</b>';
      case 'italic': return '<i>' + s + '</i>';
      case 'underline': return '<u>' + s + '</u>';
      case 'strike': return '<s>' + s + '</s>';
      case 'code': return '<code>' + s + '</code>';
      case 'pre': return '<pre>' + s + '</pre>';
      case 'quote': return '<blockquote>' + s + '</blockquote>';
      case 'spoiler': return '<span class="pl-spoiler">' + s + '</span>';
      case 'link':
        if (/^(https?:|mailto:|tel:)/i.test(e.href || '')) return '<a href="' + esc(e.href) + '" target="_blank" rel="noopener noreferrer">' + s + '</a>';
        return s;
      default: return linkify(s);
    }
  }).join('');
}
function highlight(html, q) {
  if (!q) return html;
  var re = new RegExp(escRe(esc(q)), 'gi');
  return html.split(/(<[^>]*>)/).map(function (p) {
    if (p.charAt(0) === '<') return p;
    return p.split(/(&[a-z#0-9]+;)/i).map(function (q2) { return q2.charAt(0) === '&' && /;$/.test(q2) ? q2 : q2.replace(re, function (m) { return '<mark>' + m + '</mark>'; }); }).join('');
  }).join('');
}
var EMOJI_ONLY = null;
try { EMOJI_ONLY = new RegExp('^(?:\\p{Extended_Pictographic}[\\uFE0F\\u200D\\u{1F3FB}-\\u{1F3FF}\\p{Extended_Pictographic}]*\\s*){1,3}$', 'u'); } catch (e) { /* ignore */ }

function snippet(m) {
  if (!m) return '';
  var md = m.media && m.media[0], s = (m.plain || '').replace(/\s+/g, ' ').trim();
  if (md && !s) return { image: '📷 Foto', video: '🎬 Video', audio: '🎤 Audio' }[md.kind] || '📎 Documento';
  return s;
}

var TEMPLATE =
  '<div class="pl-head">' +
  '<button class="pl-ib" data-a="home" hidden title="Indietro: elenco delle chat (Cmd+[)" aria-label="Indietro">' + ic('chev') + '</button>' +
  '<div class="pl-av"></div>' +
  '<div class="pl-title"><b></b><span></span></div>' +
  '<select class="pl-sel" hidden aria-label="Chat"></select>' +
  '<button class="pl-ib" data-a="search" title="Cerca nella chat (Ctrl/Cmd+F)">' + ic('search') + '</button>' +
  '<button class="pl-ib" data-a="date" title="Vai a una data">' + ic('event') + '</button>' +
  '<button class="pl-ib" data-a="media" title="Media, documenti e link">' + ic('photos') + '</button>' +
  '<button class="pl-ib" data-a="menu" title="Altro">' + ic('more') + '</button>' +
  '<input type="date" class="pl-date" tabindex="-1" aria-hidden="true">' +
  '</div>' +
  '<div class="pl-sbar" hidden><input class="pl-field" type="search" placeholder="Cerca nei messaggi" autocomplete="off">' +
  '<span class="pl-count"></span>' +
  '<button class="pl-ib" data-a="qup" title="Risultato precedente">' + ic('up') + '</button>' +
  '<button class="pl-ib" data-a="qdown" title="Risultato successivo">' + ic('down') + '</button>' +
  '<button class="pl-ib" data-a="qclose" title="Chiudi ricerca">' + ic('close') + '</button></div>' +
  '<div class="pl-daychip" hidden></div>' +
  '<div class="pl-hint" hidden></div>' +
  '<div class="pl-msgs" tabindex="0"><div class="pl-rows"></div></div>' +
  '<button class="pl-jump" hidden title="Vai all\'ultimo messaggio">' + ic('down') + '</button>' +
  '<div class="pl-pop" hidden></div>' +
  '<div class="pl-modal" hidden></div>' +
  '<div class="pl-lb" hidden></div>' +
  '<div class="pl-busy" hidden><div class="pl-busybox"><div class="pl-spin"></div><div class="pl-busymsg"></div></div></div>' +
  '<div class="pl-toast" hidden></div>';

/* ---------- il lettore ---------- */
function createReader(root, opts) {
  var store = opts.store, chats = opts.chats;
  var st = { cur: null, win: { start: 0, end: 0 }, hits: [], hitPos: -1, q: '' };
  var lb = { list: [], pos: 0 };
  var toastT, io = null, scrollQueued = false, destroyed = false;

  root.classList.add('pl');
  root.innerHTML = TEMPLATE;
  var q = function (s) { return root.querySelector(s); };
  var el = {
    head: q('.pl-head'), av: q('.pl-av'), title: q('.pl-title'), sel: q('.pl-sel'), date: q('.pl-date'),
    sbar: q('.pl-sbar'), q: q('.pl-sbar .pl-field'), count: q('.pl-count'), hint: q('.pl-hint'),
    msgs: q('.pl-msgs'), rows: q('.pl-rows'), jump: q('.pl-jump'), pop: q('.pl-pop'),
    modal: q('.pl-modal'), daychip: q('.pl-daychip'), lb: q('.pl-lb'), busy: q('.pl-busy'), toast: q('.pl-toast')
  };

  function toast(msg) {
    el.toast.textContent = msg; el.toast.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { el.toast.hidden = true; }, 4200);
  }

  /* ---- media ---- */
  function entryOf(chat, md) {
    if (md._e !== undefined) return md._e;
    md._e = md.omitted ? null : chat.src.find(md.path || md.name, chat.dir);
    return md._e;
  }
  function blobUrl(chat, md) {
    var e = entryOf(chat, md);
    if (!e) return Promise.resolve(null);
    if (e.url) return Promise.resolve(e.url);
    return e.getBlob().then(function (b) { e.url = URL.createObjectURL(b); return e.url; });
  }
  function readHead(entry) {
    return entry.getBuffer().then(function (b) { return b.slice(0, 16); }).catch(function () { return null; });
  }
  function diag(chat, md) {
    var e = entryOf(chat, md);
    if (!e) return Promise.resolve('file non trovato');
    return readHead(e).then(function (u8) {
      var hex = u8 ? Array.prototype.map.call(Array.prototype.slice.call(u8, 0, 8), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(' ') : '?';
      var real = sniff(u8);
      return (md.name || e.path) + ' · ' + fmtSize(e.size) + ' · formato rilevato: ' + (real || 'sconosciuto') + ' · primi byte: ' + hex +
        (real === 'image/heic' ? ' · HEIC non supportato da questo visualizzatore' : '');
    });
  }
  function download(chat, md) {
    var e = entryOf(chat, md); if (!e) return;
    blobUrl(chat, md).then(function (u) {
      if (!u) return;
      var a = document.createElement('a'); a.href = u;
      a.download = md.name || P.baseName(md.path || e.path || 'file');
      root.appendChild(a); a.click(); a.remove();
    });
  }
  function openExternal(chat, md) {
    // per i PDF e simili: scarica e lascia che sia il sistema ad aprirli
    download(chat, md);
  }

  function mediaHTML(chat, i, k, md) {
    var at = ' data-i="' + i + '" data-k="' + k + '"';
    if (md.omitted) return '<div class="m miss">' + ({ image: '📷', video: '🎬', audio: '🎤' }[md.kind] || '📎') + ' ' + esc(md.title || 'Media non incluso nell\'export') + '</div>';
    var e = entryOf(chat, md);
    if (!e) return '<div class="m miss">⚠ File non trovato: ' + esc(md.name || md.path) + '</div>';
    var nm = md.name || P.baseName(e.path);
    switch (md.kind) {
      case 'image':
        return '<div class="m img' + (md.sticker ? ' sticker' : '') + '"' + at + '><img data-lazy alt="' + esc(nm) + '"></div>';
      case 'video':
        return '<div class="m vid' + (md.round ? ' round' : '') + '"' + at + ' role="button" tabindex="0"><div class="pl-play">' + ic('play') + '</div><div class="cap">' + esc(nm) + (md.dur ? ' · ' + P.fmtDur(md.dur) : (e.size ? ' · ' + fmtSize(e.size) : '')) + '</div></div>';
      case 'audio':
        return '<div class="m aud"' + at + '><button class="play" aria-label="Riproduci">' + ic('play') + '</button><div class="info"><b>' + (md.voice || /^(PTT|AUD)-/i.test(nm) ? 'Nota vocale' : esc(nm)) + '</b><span>' + (md.dur ? P.fmtDur(md.dur) : fmtSize(e.size)) + '</span></div></div>';
      default:
        return '<div class="m doc"' + at + ' role="button" tabindex="0"><span class="ic">' + ic('file') + '</span><div class="info"><b>' + esc(md.title || nm) + '</b><span>' + esc((P.extOf(nm) || 'file').toUpperCase()) + (e.size ? ' · ' + fmtSize(e.size) : '') + '</span></div><span class="ic">' + ic('download') + '</span></div>';
    }
  }

  function hydrate(r) {
    if (!io) {
      io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          if (!en.isIntersecting) return;
          io.unobserve(en.target); loadImg(en.target);
        });
      }, { root: el.msgs, rootMargin: '500px' });
    }
    r.querySelectorAll('img[data-lazy]').forEach(function (img) { io.observe(img); });
  }
  /* ancora di scroll: ricordo quale messaggio sta in cima e a che altezza; se un'immagine cambia le altezze
     (caricamento, errore) rimetto quel messaggio dov'era, così la vista non "scende da sola" */
  var anc = { row: null, off: 0, top: -1 };
  function saveAnchor() {
    var mt = el.msgs.getBoundingClientRect().top, rows = el.rows.children;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i].getBoundingClientRect();
      if (r.bottom > mt + 1 && rows[i].dataset && rows[i].dataset.i !== undefined) { anc.row = rows[i]; anc.off = r.top - mt; anc.top = el.msgs.scrollTop; return; }
    }
    anc.row = null;
  }
  function fixAnchor() {
    if (destroyed || !anc.row || !anc.row.isConnected) return;
    if (Math.abs(el.msgs.scrollTop - anc.top) > 1) { saveAnchor(); return; }
    var d = anc.row.getBoundingClientRect().top - el.msgs.getBoundingClientRect().top - anc.off;
    if (Math.abs(d) > 0.5) { el.msgs.scrollTop += d; anc.top = el.msgs.scrollTop; }
  }
  function loadImg(img) {
    var box = img.closest('.m'), c = st.cur; if (!box || !c) return;
    var md = c.messages[+box.dataset.i].media[+box.dataset.k];
    blobUrl(c, md).then(function (u) {
      if (!u) return;
      img.onerror = function () {
        box.className = 'm doc'; setTimeout(fixAnchor, 0);
        box.innerHTML = '<span class="ic">' + ic('file') + '</span><div class="info"><b>' + esc(md.name || 'immagine') + '</b><span>Anteprima non disponibile · clic per scaricare</span></div>';
        diag(c, md).then(function (t) { var s = box.querySelector('.info span'); if (s) s.textContent = t; });
      };
      img.addEventListener('load', fixAnchor, { once: true });
      img.removeAttribute('data-lazy'); img.src = u;
    });
  }
  async function playInline(box, md, tag) {
    var c = st.cur, u = await blobUrl(c, md); if (!u) return;
    var node = document.createElement(tag);
    node.controls = true; node.autoplay = true; node.src = u;
    node.addEventListener('error', function () {
      box.className = 'm doc';
      box.innerHTML = '<span class="ic">' + ic('file') + '</span><div class="info"><b>' + esc(md.name || 'file') + '</b><span>Formato non riproducibile · clic per scaricare</span></div>';
    });
    box.innerHTML = ''; box.appendChild(node);
    if (tag === 'video') { box.removeAttribute('role'); box.style.cursor = 'default'; }
  }

  /* ---- messaggi ---- */
  function msgHTML(chat, i) {
    var m = chat.messages[i], prev = chat.messages[i - 1], html = '';
    if (!prev || dayKey(prev) !== dayKey(m)) html += '<div class="day"><span>' + esc(dayLabel(m)) + '</span></div>';
    if (m.system) return html + '<div class="row sys" data-i="' + i + '"><div class="chip">' + highlight(esc(m.text), st.q) + '</div></div>';
    var out = !!chat.me && m.from === chat.me;
    var cont = !!prev && !prev.system && prev.from === m.from && dayKey(prev) === dayKey(m) && (m.ts - prev.ts) < 300000;
    var showName = !out && chat.group && !cont;
    var onlySticker = m.media.length === 1 && m.media[0].sticker && !(m.plain || '').trim();
    var body = '';
    if (m.fwd) body += '<div class="fwd">Inoltrato da ' + esc(m.fwd) + '</div>';
    if (m.replyTo != null) {
      var ri = chat.byId.get(typeof m.replyTo === 'string' && !isNaN(+m.replyTo) ? +m.replyTo : m.replyTo), rm = ri != null ? chat.messages[ri] : null;
      body += rm
        ? '<div class="reply" data-rid="' + esc(m.replyTo) + '"><b>' + esc(rm.from || '') + '</b><span>' + esc(snippet(rm) || '…') + '</span></div>'
        : '<div class="reply"><b>Risposta</b><span>messaggio non disponibile</span></div>';
    }
    m.media.forEach(function (md, k) { body += mediaHTML(chat, i, k, md); });
    var txt = m.entities ? fmtEntities(m.entities) : fmtWa(m.text || '');
    if ((m.plain || '').trim() || (m.entities && m.entities.length)) {
      var emoji = EMOJI_ONLY && !m.media.length && EMOJI_ONLY.test((m.plain || '').trim());
      body += '<div class="txt' + (emoji ? ' emoji' : '') + (m.deleted ? ' deleted' : '') + '">' + highlight(txt, st.q) + '</div>';
    }
    var meta = (m.edited ? 'modificato · ' : '') + tFmt.format(new Date(m.ts));
    var react = m.reactions ? '<div class="reacts">' + m.reactions.map(function (r) { return '<span>' + esc(r.e) + (r.n > 1 ? ' ' + r.n : '') + '</span>'; }).join('') + '</div>' : '';
    return html + '<div class="row ' + (out ? 'out' : 'in') + (cont ? ' cont' : '') + '" data-i="' + i + '">' +
      '<div class="bubble' + (onlySticker ? ' plain' : '') + '">' +
      (showName ? '<div class="who" style="--h:' + hue(m.from) + '">' + esc(m.from) + '</div>' : '') +
      body + '<div class="meta">' + meta + '</div>' + react + '</div></div>';
  }
  function chunkHTML(chat, a, b) { var h = []; for (var i = a; i < b; i++) h.push(msgHTML(chat, i)); return h.join(''); }

  function renderWindow(anchor) {
    var c = st.cur; if (!c) return;
    el.rows.innerHTML = chunkHTML(c, st.win.start, st.win.end);
    hydrate(el.rows);
    if (anchor != null) {
      var a = el.rows.querySelector('[data-i="' + anchor + '"]');
      if (a) el.msgs.scrollTop = a.offsetTop - 60;
    }
    updateJump(); saveAnchor();
  }
  function firstVisible() {
    var rows = el.rows.children, top = el.msgs.scrollTop;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].dataset && rows[i].dataset.i !== undefined && rows[i].offsetTop + rows[i].offsetHeight > top) return +rows[i].dataset.i;
    }
    return st.win.start;
  }
  function scrollBottom() { el.msgs.scrollTop = el.msgs.scrollHeight; updateJump(); }
  function loadUp() {
    var c = st.cur, s = st.win.start; if (!c || s <= 0) return;
    var ns = Math.max(0, s - PAGE), h0 = el.msgs.scrollHeight, t0 = el.msgs.scrollTop;
    var tmp = document.createElement('div'); tmp.innerHTML = chunkHTML(c, ns, s);
    var first = el.rows.firstChild;
    while (tmp.firstChild) el.rows.insertBefore(tmp.firstChild, first);
    st.win.start = ns;
    el.msgs.scrollTop = t0 + (el.msgs.scrollHeight - h0);
    hydrate(el.rows);
  }
  function loadDown() {
    var c = st.cur, e = st.win.end; if (!c || e >= c.messages.length) return;
    var ne = Math.min(c.messages.length, e + PAGE);
    el.rows.insertAdjacentHTML('beforeend', chunkHTML(c, e, ne));
    st.win.end = ne; hydrate(el.rows);
  }
  function updateJump() {
    var c = st.cur; if (!c) return;
    var gap = el.msgs.scrollHeight - el.msgs.scrollTop - el.msgs.clientHeight;
    el.jump.hidden = !(st.win.end < c.messages.length || gap > 700);
  }
  function onScroll() {
    if (scrollQueued) return; scrollQueued = true;
    requestAnimationFrame(function () {
      scrollQueued = false;
      var c = st.cur; if (!c || destroyed) return;
      var gap = el.msgs.scrollHeight - el.msgs.scrollTop - el.msgs.clientHeight;
      if (el.msgs.scrollTop < 500 && st.win.start > 0) loadUp();
      else if (gap < 800 && st.win.end < c.messages.length) loadDown();
      updateJump();
      updateDayChip();
      saveAnchor();
    });
  }
  /* data fluttuante come su iMessage/WhatsApp: mostra il giorno del primo messaggio visibile mentre scorri */
  var dayChipT = null;
  function updateDayChip() {
    var c = st.cur; if (!c || !el.daychip) return;
    var top = el.msgs.getBoundingClientRect().top + 70, rows = el.rows.querySelectorAll('.row[data-i]'), hit = null;
    for (var i = 0; i < rows.length; i++) { if (rows[i].getBoundingClientRect().bottom > top) { hit = rows[i]; break; } }
    if (!hit) return;
    var m = c.messages[+hit.dataset.i]; if (!m) return;
    el.daychip.textContent = dayLabel(m);
    el.daychip.hidden = false;
    clearTimeout(dayChipT);
    dayChipT = setTimeout(function () { if (el.daychip) el.daychip.hidden = true; }, 1300);
  }
  function jumpTo(i, o) {
    var c = st.cur; if (!c) return;
    o = o || {};
    if (i < st.win.start || i >= st.win.end || o.rerender) {
      var N = c.messages.length;
      st.win = { start: Math.max(0, i - PAGE / 2), end: Math.min(N, i + PAGE / 2) };
      renderWindow();
    }
    var row = el.rows.querySelector('[data-i="' + i + '"]');
    if (!row) return;
    row.scrollIntoView({ block: 'center' });
    row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
    var mk = row.querySelectorAll('mark'); mk.forEach(function (x) { x.classList.remove('now'); });
    if (mk[0]) mk[0].classList.add('now');
    updateJump();
  }
  function jumpToId(id) {
    var c = st.cur; if (!c) return;
    var i = c.byId.get(isNaN(+id) ? id : +id);
    if (i != null) jumpTo(i); else toast('Messaggio non presente nell\'export');
  }

  /* ---- apertura chat ---- */
  function openChat(c) {
    st.cur = c;
    closeSearch(true); closePop();
    el.av.textContent = Array.from(c.name)[0] || '?'; el.av.style.background = 'hsl(' + hue(c.name) + ' 28% 46%)';
    el.title.querySelector('b').textContent = c.name;
    el.title.querySelector('span').textContent = (c.group ? c.participants.length + ' partecipanti · ' : '') +
      c.messages.length.toLocaleString('it-IT') + ' messaggi · ' + dMed.format(new Date(c.first)) + ' – ' + dMed.format(new Date(c.last));
    el.date.min = isoDay(c.first); el.date.max = isoDay(c.last); el.date.value = '';
    var N = c.messages.length;
    st.win = { start: Math.max(0, N - PAGE), end: N };
    renderWindow(); scrollBottom(); showHint();
  }
  function showHint() {
    var c = st.cur;
    if (!c || c.meSure || c.meDismissed || !c.participants.length) { el.hint.hidden = true; return; }
    el.hint.innerHTML = '<div class="pl-hintbox">Chi sei tu in questa chat? ' +
      c.participants.slice(0, 4).map(function (p) { return '<button data-me="' + esc(p) + '">' + esc(p) + '</button>'; }).join('') +
      '<button data-meclose="1" aria-label="Chiudi">✕</button></div>';
    el.hint.hidden = false;
  }
  function setMe(name) {
    var c = st.cur; if (!c) return;
    c.me = name || null; c.meSure = true;
    if (store) store.set(c.storeKey, name || '');
    showHint(); renderWindow(firstVisible());
  }

  /* ---- ricerca ---- */
  function openSearch() { if (!st.cur) return; el.sbar.hidden = false; el.q.focus(); el.q.select(); }
  function closeSearch(silent) {
    el.sbar.hidden = true; el.q.value = ''; el.count.textContent = '';
    var had = !!st.q;
    st.q = ''; st.hits = []; st.hitPos = -1;
    if (had && !silent && st.cur) renderWindow(firstVisible());
  }
  function runSearch() {
    var c = st.cur; if (!c) return;
    var s = el.q.value.trim(); st.q = s; st.hits = []; st.hitPos = -1;
    if (!s) { el.count.textContent = ''; renderWindow(firstVisible()); return; }
    var nq = norm(s);
    c.messages.forEach(function (m, i) {
      if (m._n === undefined) m._n = norm((m.plain || '') + ' ' + m.media.map(function (x) { return x.name || x.title || ''; }).join(' '));
      if (m._n.indexOf(nq) >= 0) st.hits.push(i);
    });
    if (!st.hits.length) { el.count.textContent = 'Nessun risultato'; renderWindow(firstVisible()); return; }
    st.hitPos = st.hits.length - 1;
    el.count.textContent = (st.hitPos + 1) + ' di ' + st.hits.length;
    jumpTo(st.hits[st.hitPos], { rerender: true });
  }
  function stepHit(d) {
    var n = st.hits.length; if (!n) return;
    st.hitPos = (st.hitPos + d + n) % n;
    el.count.textContent = (st.hitPos + 1) + ' di ' + n;
    var i = st.hits[st.hitPos];
    jumpTo(i, { rerender: !(i >= st.win.start && i < st.win.end) });
  }
  function jumpToDate(v) {
    var c = st.cur; if (!c || !v) return;
    var p = v.split('-').map(Number), ts = new Date(p[0], p[1] - 1, p[2]).getTime();
    var lo = 0, hi = c.messages.length - 1, ans = hi;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (c.messages[mid].ts >= ts) { ans = mid; hi = mid - 1; } else lo = mid + 1; }
    jumpTo(ans, { rerender: true });
  }

  /* ---- menu, info, galleria ---- */
  function closePop() { el.pop.hidden = true; }
  function openPop() {
    var c = st.cur; if (!c) return;
    var h = '<div class="pl-lbl">Chi sei tu?</div>';
    c.participants.slice(0, 12).forEach(function (p) { h += '<button data-me="' + esc(p) + '"' + (c.me === p ? ' class="on"' : '') + '>' + esc(p) + '</button>'; });
    h += '<button data-me=""' + (!c.me ? ' class="on"' : '') + '>Nessuno (tutti a sinistra)</button><div class="pl-sep"></div>' +
      '<button data-act="info">Informazioni sulla chat</button><button data-act="media">Media, documenti e link</button>';
    el.pop.innerHTML = h; el.pop.hidden = false;
  }
  function modal(title, bodyHTML) {
    el.modal.innerHTML = '<div class="pl-sheet" role="dialog"><header><h3>' + esc(title) + '</h3><button class="pl-ib" data-close aria-label="Chiudi">' + ic('close') + '</button></header>' + bodyHTML + '</div>';
    el.modal.hidden = false;
  }
  function closeModal() { el.modal.hidden = true; el.modal.innerHTML = ''; }
  function openInfo() {
    var c = st.cur; if (!c) return;
    var counts = {}, media = 0;
    c.messages.forEach(function (m) { if (!m.system) counts[m.from] = (counts[m.from] || 0) + 1; media += m.media.filter(function (x) { return !x.omitted; }).length; });
    var rows = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).map(function (n) {
      return '<tr><td>' + esc(n) + (c.me === n ? ' <small>(tu)</small>' : '') + '</td><td>' + counts[n].toLocaleString('it-IT') + ' messaggi</td></tr>';
    }).join('');
    modal('Informazioni sulla chat', '<div class="pl-scroll"><p><b>' + esc(c.name) + '</b><br><span class="pl-muted">' + (c.platform === 'telegram' ? 'Telegram' : 'WhatsApp') + ' · ' +
      c.messages.length.toLocaleString('it-IT') + ' messaggi · ' + media.toLocaleString('it-IT') + ' file multimediali<br>dal ' + dLong.format(new Date(c.first)) + ' al ' + dLong.format(new Date(c.last)) + '</span></p><table class="pl-stats">' + rows + '</table></div>');
  }
  /* GIF e sticker vanno separati dalle foto vere */
  function isLoop(md) {
    var nm = md.name || '';
    return !!(md.sticker || md.gif || P.extOf(nm) === 'gif' || /(^|[^a-z])gif([^a-z]|$)/i.test(nm) || /sticker|STK-/i.test(nm));
  }
  function collectMedia(c) {
    var vis = [], anim = [], docs = [], links = [];
    c.messages.forEach(function (m, i) {
      m.media.forEach(function (md, k) {
        if (md.omitted || !entryOf(c, md)) return;
        if (md.kind === 'image' || md.kind === 'video') (isLoop(md) ? anim : vis).push({ i: i, k: k, md: md }); else docs.push({ i: i, k: k, md: md });
      });
      var re = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi, mm, s = m.plain || '';
      while ((mm = re.exec(s))) links.push({ i: i, url: mm[0], from: m.from, ts: m.ts });
    });
    return { vis: vis, anim: anim, docs: docs, links: links };
  }
  function openGallery(tab) {
    var c = st.cur; if (!c) return;
    var data = collectMedia(c);
    var body = '<div class="pl-tabs">' +
      '<button data-tab="media" class="' + (tab === 'media' ? 'on' : '') + '">Foto e video (' + data.vis.length + ')</button>' +
      '<button data-tab="anim" class="' + (tab === 'anim' ? 'on' : '') + '">GIF e sticker (' + data.anim.length + ')</button>' +
      '<button data-tab="docs" class="' + (tab === 'docs' ? 'on' : '') + '">Documenti (' + data.docs.length + ')</button>' +
      '<button data-tab="links" class="' + (tab === 'links' ? 'on' : '') + '">Link (' + data.links.length + ')</button></div><div class="pl-scroll pl-gscroll"></div>';
    modal('Media, documenti e link', body);
    var box = q('.pl-gscroll');
    if (tab === 'media' || tab === 'anim') {
      var grid = tab === 'anim' ? data.anim : data.vis;
      if (!grid.length) { box.innerHTML = '<div class="pl-note">' + (tab === 'anim' ? 'Nessuna GIF o sticker in questa chat.' : 'Nessuna foto o video in questa chat.') + '</div>'; return; }
      /* dalla più recente alla più vecchia, con l'intestazione del mese come su Foto */
      var ordered = grid.slice().sort(function (x, y) { return (c.messages[y.i].ts - c.messages[x.i].ts) || (y.i - x.i) || (y.k - x.k); }), lastMon = null, gh = '';
      ordered.forEach(function (x) {
        var dt = new Date(c.messages[x.i].ts), mon = dt.getFullYear() * 12 + dt.getMonth();
        if (mon !== lastMon) { if (lastMon !== null) gh += '</div>'; gh += '<div class="pl-mon">' + esc(dMonth.format(dt)) + '</div><div class="pl-grid' + (tab === 'anim' ? ' pl-grid-anim' : '') + '">'; lastMon = mon; }
        gh += '<div class="pl-th" title="' + esc(dMed.format(dt)) + '" data-i="' + x.i + '" data-k="' + x.k + '">' + (x.md.kind === 'image' ? '<img data-lazy-g alt="">' : ic('play')) + (x.md.kind === 'video' ? '<span class="vi">' + ic('play') + '</span>' : '') + '</div>';
      });
      box.innerHTML = gh + '</div>';
      var gio = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          if (!en.isIntersecting) return; gio.unobserve(en.target);
          var th = en.target.closest('.pl-th'), md = c.messages[+th.dataset.i].media[+th.dataset.k];
          blobUrl(c, md).then(function (u) {
            if (!u) return;
            en.target.onerror = function () { diag(c, md).then(function (t) { th.title = t; th.innerHTML = '<span class="pl-bad">⚠ ' + esc(t.split(' · ').slice(0, 3).join(' · ')) + '</span>'; }); };
            en.target.src = u;
          });
        });
      }, { root: box, rootMargin: '300px' });
      box.querySelectorAll('img[data-lazy-g]').forEach(function (im) { gio.observe(im); });
    } else if (tab === 'docs') {
      box.innerHTML = data.docs.length ? '<div class="pl-list">' + data.docs.slice().reverse().map(function (x) {
        var e = entryOf(c, x.md), nm = x.md.name || P.baseName(e.path);
        return '<div class="pl-li" data-dl="' + x.i + ':' + x.k + '"><span class="ic">' + ic(x.md.kind === 'audio' ? 'mic' : 'file') + '</span><div class="info"><b>' + esc(nm) + '</b><span>' + esc(dMed.format(new Date(c.messages[x.i].ts))) + (e.size ? ' · ' + fmtSize(e.size) : '') + '</span></div><button class="pl-btn" data-go="' + x.i + '">Vai</button></div>';
      }).join('') + '</div>' : '<div class="pl-note">Nessun documento o audio.</div>';
    } else {
      box.innerHTML = data.links.length ? '<div class="pl-list">' + data.links.slice().reverse().map(function (x) {
        return '<div class="pl-li" data-url="' + esc(x.url) + '"><span class="ic">' + ic('link') + '</span><div class="info"><b>' + esc(x.url) + '</b><span>' + esc(x.from || '') + ' · ' + esc(dMed.format(new Date(x.ts))) + '</span></div><button class="pl-btn" data-go="' + x.i + '">Vai</button></div>';
      }).join('') + '</div>' : '<div class="pl-note">Nessun link.</div>';
    }
  }

  /* ---- lightbox ---- */
  function openLightbox(i, k) {
    var c = st.cur; if (!c) return;
    var cm = collectMedia(c), inAnim = cm.anim.some(function (x) { return x.i === i && x.k === k; });
    lb.list = inAnim ? cm.anim : cm.vis;
    lb.pos = Math.max(0, lb.list.findIndex(function (x) { return x.i === i && x.k === k; }));
    el.lb.hidden = false; showLb();
  }
  async function showLb() {
    var c = st.cur, x = lb.list[lb.pos]; if (!x) return;
    var m = c.messages[x.i], md = x.md;
    el.lb.innerHTML = '<div class="top"><div class="cap">' + esc((m.from || '') + ' · ' + dMed.format(new Date(m.ts)) + ' ' + tFmt.format(new Date(m.ts)) + ' · ' + (lb.pos + 1) + '/' + lb.list.length) + '</div>' +
      '<button class="pl-btn" data-lb="go">Vai al messaggio</button>' +
      '<button class="pl-ib" data-lb="dl" aria-label="Scarica">' + ic('download') + '</button>' +
      '<button class="pl-ib" data-lb="close" aria-label="Chiudi">' + ic('close') + '</button></div>' +
      '<div class="stage"><button class="nav l" data-lb="prev" aria-label="Precedente">' + ic('back') + '</button><div class="pl-lbm"></div><button class="nav r" data-lb="next" aria-label="Successivo">' + ic('back') + '</button></div>';
    var u = await blobUrl(c, md); if (!u || lb.list[lb.pos] !== x) return;
    var holder = q('.pl-lbm'); if (!holder) return;
    var node = document.createElement(md.kind === 'video' ? 'video' : 'img');
    if (md.kind === 'video') { node.controls = true; node.autoplay = true; }
    node.src = u;
    node.addEventListener('error', function () {
      holder.innerHTML = '<p class="pl-bad2">Impossibile mostrare questo file. Usa «Scarica».<br><small class="pl-lbd">Analizzo il file…</small></p>';
      diag(c, md).then(function (t) { var d = q('.pl-lbd'); if (d) d.textContent = t; });
    });
    holder.appendChild(node);
  }
  function closeLightbox() { el.lb.hidden = true; el.lb.innerHTML = ''; }

  /* ---- eventi ---- */
  var on = function (target, type, fn, o) { target.addEventListener(type, fn, o); };
  on(el.head, 'click', function (ev) {
    var b = ev.target.closest('[data-a]'); if (!b) { if (ev.target.closest('.pl-title')) openInfo(); return; }
    var a = b.dataset.a;
    if (a === 'home') { if (opts.onHome) opts.onHome(); }
    else if (a === 'search') { el.sbar.hidden ? openSearch() : closeSearch(); }
    else if (a === 'date') { try { el.date.showPicker ? el.date.showPicker() : el.date.click(); } catch (e) { el.date.click(); } }
    else if (a === 'media') openGallery('media');
    else if (a === 'menu') { ev.stopPropagation(); el.pop.hidden ? openPop() : closePop(); }
  });
  on(el.sbar, 'click', function (ev) {
    var b = ev.target.closest('[data-a]'); if (!b) return;
    if (b.dataset.a === 'qup') stepHit(-1); else if (b.dataset.a === 'qdown') stepHit(1); else if (b.dataset.a === 'qclose') closeSearch();
  });
  var qt;
  on(el.q, 'input', function () { clearTimeout(qt); qt = setTimeout(runSearch, 220); });
  on(el.q, 'keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); if (!st.hits.length) runSearch(); else stepHit(e.shiftKey ? 1 : -1); }
  });
  on(el.date, 'change', function () { var v = el.date.value; el.date.value = ''; jumpToDate(v); });
  on(el.sel, 'change', function () { openChat(chats[+el.sel.value]); });
  on(el.pop, 'click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.me !== undefined) { setMe(b.dataset.me); closePop(); return; }
    var a = b.dataset.act; closePop();
    if (a === 'info') openInfo(); else if (a === 'media') openGallery('media');
  });
  on(el.hint, 'click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.me !== undefined) setMe(b.dataset.me);
    else if (b.dataset.meclose) { st.cur.meDismissed = true; showHint(); }
  });
  on(el.msgs, 'click', function (ev) {
    var c = st.cur, t = ev.target;
    var sp = t.closest('.pl-spoiler'); if (sp) { sp.classList.toggle('on'); return; }
    var rep = t.closest('.reply'); if (rep && rep.dataset.rid) { jumpToId(rep.dataset.rid); return; }
    var m = t.closest('.m'); if (!m || m.dataset.i === undefined || !c) return;
    var i = +m.dataset.i, k = +m.dataset.k, md = c.messages[i].media[k];
    if (m.classList.contains('img')) openLightbox(i, k);
    else if (m.classList.contains('vid')) { if (!m.querySelector('video')) playInline(m, md, 'video'); }
    else if (m.classList.contains('aud')) { if (!m.querySelector('audio')) playInline(m, md, 'audio'); }
    else if (m.classList.contains('doc')) openExternal(c, md);
  });
  on(el.msgs, 'scroll', onScroll, { passive: true });
  on(el.jump, 'click', function () {
    var c = st.cur; if (!c) return; var N = c.messages.length;
    st.win = { start: Math.max(0, N - PAGE), end: N }; renderWindow(); scrollBottom();
  });
  on(el.modal, 'click', function (ev) {
    var c = st.cur, t = ev.target;
    if (t === el.modal || t.closest('[data-close]')) { closeModal(); return; }
    var tb = t.closest('[data-tab]'); if (tb) { openGallery(tb.dataset.tab); return; }
    var go = t.closest('[data-go]'); if (go) { var gi = +go.dataset.go; ev.stopPropagation(); closeModal(); jumpTo(gi, { rerender: true }); return; }
    var th = t.closest('.pl-th'); if (th) { openLightbox(+th.dataset.i, +th.dataset.k); return; }
    var dl = t.closest('[data-dl]'); if (dl && c) { var p = dl.dataset.dl.split(':'); openExternal(c, c.messages[+p[0]].media[+p[1]]); return; }
    var ul = t.closest('[data-url]'); if (ul && /^https?:/i.test(ul.dataset.url)) window.open(ul.dataset.url, '_blank', 'noopener');
  });
  on(el.lb, 'click', function (ev) {
    var b = ev.target.closest('[data-lb]');
    if (!b) { if (ev.target.classList.contains('stage') || ev.target === el.lb) closeLightbox(); return; }
    var a = b.dataset.lb, n = lb.list.length;
    if (a === 'close') closeLightbox();
    else if (a === 'prev') { lb.pos = (lb.pos - 1 + n) % n; showLb(); }
    else if (a === 'next') { lb.pos = (lb.pos + 1) % n; showLb(); }
    else if (a === 'dl') download(st.cur, lb.list[lb.pos].md);
    else if (a === 'go') { var i = lb.list[lb.pos].i; closeLightbox(); closeModal(); jumpTo(i, { rerender: true }); }
  });
  on(root, 'click', function (e) { if (!el.pop.hidden && !e.target.closest('.pl-pop') && !e.target.closest('[data-a="menu"]')) closePop(); });
  /* Esc / frecce a livello di documento (fase di cattura): anche se il focus è finito altrove,
     Esc chiude prima l'anteprima / finestra / menu / ricerca di Parley e NON arriva a Obsidian (che chiuderebbe la tab). */
  var docKey = function (e) {
    if (destroyed || !root.isConnected || !root.getClientRects().length) return;
    var handled = false;
    var ae = document.activeElement, inMine = !ae || ae === document.body || root.contains(ae);
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && String(e.key).toLowerCase() === 'f' && st.cur && inMine) {
      if (!el.lb.hidden) closeLightbox();
      if (!el.modal.hidden) closeModal();
      closePop(); openSearch();
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === '[' && opts.onHome && el.lb.hidden && el.modal.hidden && inMine) {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); opts.onHome(); return;
    }
    if (!el.lb.hidden) {
      handled = true;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft' && e.target.nodeName !== 'VIDEO') { lb.pos = (lb.pos - 1 + lb.list.length) % lb.list.length; showLb(); }
      else if (e.key === 'ArrowRight' && e.target.nodeName !== 'VIDEO') { lb.pos = (lb.pos + 1) % lb.list.length; showLb(); }
      else handled = false;
    } else if (e.key === 'Escape') {
      if (!el.modal.hidden) { closeModal(); handled = true; }
      else if (!el.pop.hidden) { closePop(); handled = true; }
      else if (!el.sbar.hidden) { closeSearch(); handled = true; }
    }
    if (handled) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }
  };
  document.addEventListener('keydown', docKey, true);

  /* ---- avvio ---- */
  if (opts.onHome) q('[data-a="home"]').hidden = false;
  if (chats.length > 1) {
    el.sel.innerHTML = chats.map(function (c, i) { return '<option value="' + i + '">' + esc(c.name) + '</option>'; }).join('');
    el.sel.hidden = false;
  }
  var start = Math.min(Math.max(0, opts.initial || 0), chats.length - 1);
  if (chats.length > 1) el.sel.value = String(start);
  openChat(chats[start]);

  return {
    destroy: function () {
      destroyed = true; clearTimeout(dayChipT);
      document.removeEventListener('keydown', docKey, true);
      if (io) io.disconnect();
      chats.forEach(function (c) { c.src.entries.forEach(function (e) { if (e.url) { try { URL.revokeObjectURL(e.url); } catch (x) { /* ignore */ } e.url = null; } }); });
    },
    focus: function () { root.focus(); }
  };
}

module.exports = { Source: Source, detectChats: detectChats, createReader: createReader, ic: ic };
