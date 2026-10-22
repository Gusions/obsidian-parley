/* Parser per export WhatsApp (.txt iOS/Android) e Telegram (JSON / HTML).
   Funziona sia nel browser (window.ChatParsers) sia in Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChatParsers = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- utilità file/media ---------- */
  var EXT = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif'],
    video: ['mp4', 'mov', 'm4v', 'webm', '3gp', 'mkv', 'avi'],
    audio: ['opus', 'ogg', 'oga', 'mp3', 'm4a', 'aac', 'wav', 'amr', 'caf']
  };
  var MIME = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    bmp: 'image/bmp', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif',
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4', webm: 'video/webm', '3gp': 'video/3gpp',
    mkv: 'video/x-matroska', avi: 'video/x-msvideo',
    opus: 'audio/ogg; codecs=opus', ogg: 'audio/ogg', oga: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4',
    aac: 'audio/aac', wav: 'audio/wav', amr: 'audio/amr', caf: 'audio/x-caf', pdf: 'application/pdf'
  };
  function extOf(n) { var m = /\.([A-Za-z0-9]{1,5})$/.exec(n || ''); return m ? m[1].toLowerCase() : ''; }
  function kindOf(name) {
    var e = extOf(name);
    for (var k in EXT) if (EXT[k].indexOf(e) >= 0) return k;
    return 'file';
  }
  function mimeOf(name) { return MIME[extOf(name)] || ''; }
  function baseName(p) { return String(p || '').split(/[\\/]/).pop(); }
  function fmtDur(sec) {
    sec = Math.round(+sec || 0);
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ---------- WhatsApp ---------- */
  var DATE_RE = '(\\d{1,4}[\\/.\\-]\\d{1,2}[\\/.\\-]\\d{1,4})';
  var TIME_RE = '(\\d{1,2}[:.]\\d{2}(?:[:.]\\d{2})?(?:\\s?[APap]\\.?\\s?[Mm]\\.?)?)';
  // iOS:     [12/03/23, 14:32:10] Nome: testo
  var RE_IOS = new RegExp('^\\[' + DATE_RE + ',?\\s+' + TIME_RE + '\\]\\s?(.*)$');
  // Android: 12/03/23, 14:32 - Nome: testo
  var RE_AND = new RegExp('^' + DATE_RE + ',?\\s+' + TIME_RE + '\\s+[-\\u2013\\u2014]\\s(.*)$');

  function cleanLine(line) {
    return line.replace(/[  ]/g, ' ').replace(/^[‎‏﻿]+/, '');
  }

  function detectDateOrder(dates) {
    var dmy = 0, mdy = 0;
    for (var i = 0; i < dates.length; i++) {
      var p = dates[i].split(/[\/.\-]/).map(Number);
      if (p[0] > 31) return 'ymd';
      if (p[0] > 12) dmy++;
      else if (p[1] > 12) mdy++;
    }
    return (mdy > 0 && dmy === 0) ? 'mdy' : 'dmy';
  }

  function waTs(d, t, order) {
    var p = d.split(/[\/.\-]/).map(Number), y, mo, da;
    if (order === 'ymd') { y = p[0]; mo = p[1]; da = p[2]; }
    else if (order === 'mdy') { mo = p[0]; da = p[1]; y = p[2]; }
    else { da = p[0]; mo = p[1]; y = p[2]; }
    if (y < 100) y += 2000;
    var tm = /(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s?([APap])\.?\s?[Mm]\.?)?/.exec(t);
    if (!tm) return NaN;
    var hh = +tm[1], mm = +tm[2], ss = tm[3] ? +tm[3] : 0, ap = tm[4];
    if (ap) {
      var pm = /p/i.test(ap);
      if (pm && hh < 12) hh += 12;
      if (!pm && hh === 12) hh = 0;
    }
    return new Date(y, mo - 1, da, hh, mm, ss).getTime();
  }

  var ATTACH_IOS = /<[^<>:\n]{2,30}:\s*([^<>\n]+?\.[A-Za-z0-9]{2,5})\s*>/;
  var ATTACH_AND = /^(.+?\.[A-Za-z0-9]{2,5}) \((?:[^()]*(?:allegat|attach|angeh|adjunt|joint|anex|bijlage)[^()]*)\)\s*$/i;
  var OMITTED = /^<?\s*(media|immagine|immagini|image|images|video|audio|sticker|gif|documento|document|foto|photo|nota vocale|voice message|contatto|contact)\s+(?:omess[aoi]|omitted|weggelassen|omitido|omis[e]?)\s*>?$/i;
  var DELETED = /^(?:questo messaggio è stato eliminato|hai eliminato questo messaggio|this message was deleted|you deleted this message|you deleted this message\.)\.?$/i;

  function omittedKind(word) {
    word = word.toLowerCase();
    if (/immagin|image|foto|photo/.test(word)) return 'image';
    if (/video|gif/.test(word)) return 'video';
    if (/audio|vocale|voice/.test(word)) return 'audio';
    if (/sticker/.test(word)) return 'image';
    return 'file';
  }

  function parseWaContent(content) {
    var lines = content.split('\n').map(function (l) { return l.replace(/^[‎‏]+/, ''); });
    var media = [], text;
    var first = (lines[0] || '').trim();
    var m, whole = lines.join('\n');
    if ((m = ATTACH_IOS.exec(whole))) {
      // iOS: il tag <allegato: file> può stare ovunque, il resto è la didascalia
      var nameI = m[1].trim();
      media.push({ kind: kindOf(nameI), name: nameI, sticker: /sticker|STK-/i.test(nameI) || extOf(nameI) === 'webp' });
      text = whole.replace(m[0], '').replace(/[‎‏]/g, '').trim();
    } else if ((m = ATTACH_AND.exec(first))) {
      // Android: "nomefile.ext (file allegato)" sulla prima riga, didascalia nelle righe successive
      var name = m[1].trim();
      media.push({ kind: kindOf(name), name: name, sticker: /sticker|STK-/i.test(name) || extOf(name) === 'webp' });
      lines[0] = first.replace(m[0], '').trim();
      text = lines.join('\n').trim();
    } else if ((m = OMITTED.exec(first)) && lines.length === 1) {
      media.push({ kind: omittedKind(m[1]), omitted: true, title: first.replace(/[<>]/g, '').trim() });
      text = '';
    } else {
      text = lines.join('\n').trim();
    }
    return { text: text, media: media, deleted: DELETED.test(text) };
  }

  function matchWaLine(l) { return RE_IOS.exec(l) || RE_AND.exec(l); }

  function looksLikeWhatsApp(text) {
    var lines = text.slice(0, 20000).split(/\r?\n/), hits = 0, seen = 0;
    for (var i = 0; i < lines.length && seen < 60; i++) {
      var l = cleanLine(lines[i]);
      if (!l.trim()) continue;
      seen++;
      if (matchWaLine(l)) hits++;
    }
    return hits >= Math.min(3, Math.max(1, seen)) && hits >= seen * 0.3;
  }

  function parseWhatsApp(text) {
    text = String(text).replace(/^﻿/, '');
    var lines = text.split(/\r?\n/), raw = [], cur = null, i;
    for (i = 0; i < lines.length; i++) {
      var l = cleanLine(lines[i]);
      var m = matchWaLine(l);
      if (m) { cur = { d: m[1], t: m[2], body: m[3] }; raw.push(cur); }
      else if (cur) cur.body += '\n' + lines[i].replace(/[  ]/g, ' ');
    }
    var order = detectDateOrder(raw.map(function (r) { return r.d; }));
    var messages = [], counts = {}, lastTs = 0;
    for (i = 0; i < raw.length; i++) {
      var r = raw[i], body = r.body.replace(/\s+$/, '').replace(/^[‎‏]+/, '');
      var ts = waTs(r.d, r.t, order);
      if (isNaN(ts)) ts = lastTs;
      lastTs = ts;
      var from = null, content = body, k = body.indexOf(': ');
      if (k > 0 && k <= 60 && body.slice(0, k).indexOf('\n') < 0) {
        from = body.slice(0, k).replace(/[‎‏]/g, '').trim();
        content = body.slice(k + 2);
      }
      var msg = { id: i, ts: ts, from: from, system: !from, text: '', plain: '', media: [] };
      if (from) {
        var c = parseWaContent(content);
        msg.text = c.text; msg.plain = c.text; msg.media = c.media; msg.deleted = c.deleted;
        counts[from] = (counts[from] || 0) + 1;
      } else {
        msg.text = content.replace(/[‎‏]/g, '').trim();
        msg.plain = msg.text;
      }
      messages.push(msg);
    }
    var participants = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    return { messages: messages, participants: participants, dateOrder: order };
  }

  function deriveWaName(candidates) {
    var re = /^(?:chat whatsapp con|chat di whatsapp con|whatsapp chat with|whatsapp chat -|whatsapp-chat mit|chat de whatsapp con|conversation whatsapp avec|conversa do whatsapp com)\s*/i;
    for (var i = 0; i < candidates.length; i++) {
      var n = String(candidates[i] || '').replace(/\.(zip|txt)$/i, '').replace(re, '').trim();
      if (n && !/^_?chat$/i.test(n) && !/^whatsapp chat$/i.test(n)) return n;
    }
    return '';
  }

  /* ---------- Telegram JSON ---------- */
  var TG_ENT = { plain: 'plain', bold: 'bold', italic: 'italic', underline: 'underline', strikethrough: 'strike',
    code: 'code', pre: 'pre', spoiler: 'spoiler', blockquote: 'quote', text_link: 'link', link: 'link' };

  function tgEntities(m) {
    var src = m.text_entities && m.text_entities.length ? m.text_entities : m.text;
    if (typeof src === 'string') return src ? [{ t: 'plain', s: src }] : [];
    if (!Array.isArray(src)) return [];
    return src.map(function (e) {
      if (typeof e === 'string') return { t: 'plain', s: e };
      var t = TG_ENT[e.type] || 'plain';
      var o = { t: t, s: e.text || '' };
      if (t === 'link') o.href = e.href || e.text;
      return o;
    });
  }
  /* toglie spazi/a capo di testa e coda (e li comprime nell'HTML): altrimenti pre-wrap li mostra come righe vuote */
  function cleanEntities(ents, collapse) {
    var out = ents.filter(function (e) { return e.s !== ''; }).map(function (e) {
      var s = e.s.replace(/\r\n?/g, '\n');
      if (collapse && e.t !== 'pre' && e.t !== 'code') s = s.replace(/[ \t\n]+/g, function (w) { return w.indexOf('\n') >= 0 && e.br ? w : ' '; });
      return Object.assign({}, e, { s: s });
    });
    if (out.length) out[0].s = out[0].s.replace(/^\s+/, '');
    if (out.length) out[out.length - 1].s = out[out.length - 1].s.replace(/\s+$/, '');
    return out.filter(function (e) { return e.s !== ''; });
  }
  function entitiesPlain(ents) { return ents.map(function (e) { return e.s; }).join(''); }

  /* traduttore opzionale (le stringhe visibili nei messaggi di servizio): di default restituisce l'italiano */
  var _t = function (k) { var a = Array.prototype.slice.call(arguments, 1); return a.length ? k.replace(/\{(\d+)\}/g, function (_, n) { return a[+n] == null ? '' : a[+n]; }) : k; };
  function setTranslator(f) { _t = f || _t; }

  function tgService(m) {
    var who = m.actor || '', mem = (m.members || []).join(', '), a = m.action;
    switch (a) {
      case 'create_group': return _t('{0} ha creato il gruppo «{1}»', who, m.title || '');
      case 'create_channel': return _t('Canale «{0}» creato', m.title || '');
      case 'invite_members': return _t('{0} ha aggiunto {1}', who, mem);
      case 'remove_members': return _t('{0} ha rimosso {1}', who, mem);
      case 'join_group_by_link': return _t('{0} è entrato nel gruppo con il link', who);
      case 'join_group_by_request': return _t('{0} è stato accettato nel gruppo', who);
      case 'edit_group_title': return _t('{0} ha cambiato il nome del gruppo in «{1}»', who, m.title || '');
      case 'edit_group_photo': return _t('{0} ha cambiato la foto del gruppo', who);
      case 'delete_group_photo': return _t('{0} ha rimosso la foto del gruppo', who);
      case 'pin_message': return _t('{0} ha fissato un messaggio', who);
      case 'migrate_to_supergroup':
      case 'migrate_from_group': return _t('Il gruppo è stato convertito in supergruppo');
      case 'topic_created': return _t('{0} ha creato l\'argomento «{1}»', who, m.title || '');
      case 'phone_call':
        return (m.discard_reason === 'missed' ? _t('📞 Chiamata persa') : m.discard_reason === 'busy' ? _t('📞 Chiamata rifiutata') : _t('📞 Chiamata')) +
          (m.duration_seconds ? ' · ' + fmtDur(m.duration_seconds) : '');
      case 'group_call': return _t('📞 Chiamata di gruppo') + (m.duration ? ' · ' + fmtDur(m.duration) : '');
      case 'clear_history': return _t('Cronologia cancellata');
      default: return (who + ' · ' + (a || _t('evento'))).trim();
    }
  }

  function tgMessage(m, chatName) {
    var ts = m.date_unixtime ? (+m.date_unixtime) * 1000 : new Date(m.date).getTime();
    var out = { id: m.id, ts: ts, media: [] };
    if (m.type === 'service') {
      out.system = true; out.from = null; out.text = tgService(m); out.plain = out.text;
      return out;
    }
    out.from = m.from || m.actor || chatName || _t('Sconosciuto');
    out.fromId = m.from_id;
    var ents = tgEntities(m);
    var extra = [];
    if (m.location_information) {
      var lat = m.location_information.latitude, lon = m.location_information.longitude;
      ents.push({ t: 'plain', s: '📍 ' });
      ents.push({ t: 'link', s: lat + ', ' + lon, href: 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lon + '#map=16/' + lat + '/' + lon });
    }
    if (m.contact_information) {
      var c = m.contact_information;
      extra.push('👤 ' + [c.first_name, c.last_name].filter(Boolean).join(' ') + (c.phone_number ? ' · ' + c.phone_number : ''));
    }
    if (m.poll) {
      extra.push('📊 ' + m.poll.question + '\n' + (m.poll.answers || []).map(function (a) {
        return '• ' + a.text + (a.voters != null ? ' (' + a.voters + ')' : '');
      }).join('\n'));
    }
    if (extra.length) ents.push({ t: 'plain', s: (ents.length ? '\n' : '') + extra.join('\n') });
    out.entities = cleanEntities(ents, false);
    out.text = '';
    out.plain = entitiesPlain(ents);

    var notIncluded = function (p) { return typeof p === 'string' && /^\(File (?:not included|exceeds)/i.test(p); };
    if (m.photo) {
      out.media.push(notIncluded(m.photo) ? { kind: 'image', omitted: true, title: _t('Foto non inclusa nell\'export') }
        : { kind: 'image', path: m.photo, name: baseName(m.photo), w: m.width, h: m.height });
    }
    if (m.file) {
      var mt = m.media_type, name = m.file_name || baseName(m.file), kind = kindOf(name);
      var item = { kind: kind, path: m.file, name: name, dur: m.duration_seconds, size: m.file_size };
      if (mt === 'voice_message') { item.kind = 'audio'; item.voice = true; }
      else if (mt === 'video_message') { item.kind = 'video'; item.round = true; }
      else if (mt === 'sticker') { item.kind = 'image'; item.sticker = true; if (/\.tgs$/i.test(name)) item.kind = 'file'; if (/\.webm$/i.test(name)) item.kind = 'video'; }
      else if (mt === 'animation') { item.kind = 'video'; item.gif = true; }
      else if (mt === 'video_file') item.kind = 'video';
      else if (mt === 'audio_file') item.kind = 'audio';
      if (notIncluded(m.file)) { item = { kind: item.kind, omitted: true, title: _t('File non incluso nell\'export') }; }
      out.media.push(item);
    }
    if (m.reply_to_message_id != null) out.replyTo = m.reply_to_message_id;
    if (m.forwarded_from) out.fwd = m.forwarded_from;
    if (m.edited || m.edited_unixtime) out.edited = true;
    if (Array.isArray(m.reactions) && m.reactions.length) {
      out.reactions = m.reactions.map(function (r) { return { e: r.emoji || '❤', n: r.count || 1 }; });
    }
    return out;
  }

  /* Ritorna un array di chat: [{name, type, messages, participants, meName}] */
  function parseTelegramJson(obj) {
    var chats = [], meId = null;
    if (obj.personal_information && obj.personal_information.user_id != null) meId = 'user' + obj.personal_information.user_id;
    var list = [];
    if (obj.chats && Array.isArray(obj.chats.list)) list = obj.chats.list;
    else if (Array.isArray(obj.messages)) list = [obj];
    else return chats;
    list.forEach(function (c) {
      if (!Array.isArray(c.messages) || !c.messages.length) return;
      var counts = {}, meName = null, msgs = c.messages.map(function (m, i) {
        var o = tgMessage(m, c.name);
        if (o.id == null) o.id = 'i' + i;
        if (!o.system) {
          counts[o.from] = (counts[o.from] || 0) + 1;
          if (meId && o.fromId === meId) meName = o.from;
        }
        return o;
      });
      chats.push({
        name: c.name || (obj.personal_information ? 'Messaggi salvati' : 'Chat Telegram'),
        type: c.type || '',
        messages: msgs,
        participants: Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }),
        meName: meName
      });
    });
    return chats;
  }

  /* ---------- Telegram HTML ---------- */
  function htmlToEntities(node, out, style) {
    var kids = node.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var ch = kids[i];
      if (ch.nodeType === 3) { if (ch.nodeValue) out.push({ t: style || 'plain', s: ch.nodeValue }); }
      else if (ch.nodeType === 1) {
        var tag = ch.tagName.toLowerCase(), st = style;
        if (tag === 'br') { out.push({ t: 'plain', s: '\n', br: true }); continue; }
        if (tag === 'a') {
          var href = ch.getAttribute('href') || '';
          if (/^(https?:|mailto:|tel:)/i.test(href)) out.push({ t: 'link', s: ch.textContent, href: href });
          else out.push({ t: style || 'plain', s: ch.textContent });
          continue;
        }
        if (tag === 'strong' || tag === 'b') st = 'bold';
        else if (tag === 'em' || tag === 'i') st = 'italic';
        else if (tag === 'u') st = 'underline';
        else if (tag === 's' || tag === 'del') st = 'strike';
        else if (tag === 'code') st = 'code';
        else if (tag === 'pre') st = 'pre';
        else if (tag === 'blockquote') st = 'quote';
        else if (tag === 'span' && /spoiler/.test(ch.className || '')) st = 'spoiler';
        htmlToEntities(ch, out, st);
      }
    }
  }

  function htmlKindFromTitle(t) {
    t = (t || '').toLowerCase();
    if (/photo|foto/.test(t)) return 'image';
    if (/video|animation|gif/.test(t)) return 'video';
    if (/voice|audio|vocale/.test(t)) return 'audio';
    if (/sticker/.test(t)) return 'image';
    return 'file';
  }

  function parseTelegramHtml(htmlStrings, DOMParserCtor) {
    var Parser = DOMParserCtor || (typeof DOMParser !== 'undefined' ? DOMParser : null);
    if (!Parser) throw new Error('DOMParser non disponibile');
    var messages = [], name = '', lastFrom = '', lastTs = 0, counts = {};
    htmlStrings.forEach(function (html) {
      var doc = new Parser().parseFromString(html, 'text/html');
      if (!name) {
        var h = doc.querySelector('.page_header .text.bold, .page_header .content .text');
        if (h) name = h.textContent.trim();
      }
      var nodes = doc.querySelectorAll('.history > .message, .message');
      var seen = new Set();
      Array.prototype.forEach.call(nodes, function (el) {
        if (seen.has(el)) return; seen.add(el);
        var idm = /message-?(\d+)/.exec(el.id || '');
        var id = idm ? +idm[1] : 'h' + messages.length;
        var isService = /\bservice\b/.test(el.className);
        var body = el.querySelector('.body');
        if (!body) return;
        if (isService) {
          var st = body.textContent.replace(/\s+/g, ' ').trim();
          if (!st || /^\d{1,2} [A-Za-zÀ-ú]+ \d{4}$/.test(st)) return; // intestazione di giorno
          messages.push({ id: id, ts: lastTs, from: null, system: true, text: st, plain: st, media: [] });
          return;
        }
        var dateEl = el.querySelector('.date.details[title], .pull_right.date[title]');
        var ts = lastTs;
        if (dateEl) {
          var dm = /(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})/.exec(dateEl.getAttribute('title'));
          if (dm) ts = new Date(+dm[3], +dm[2] - 1, +dm[1], +dm[4], +dm[5], +dm[6]).getTime();
        }
        lastTs = ts;
        var fromEl = body.querySelector(':scope > .from_name');
        var from = fromEl ? fromEl.textContent.trim() : lastFrom;
        if (from) lastFrom = from;
        var msg = { id: id, ts: ts, from: from || name || _t('Sconosciuto'), system: false, media: [] };
        var ents = [];
        var textEl = body.querySelector(':scope > .text, :scope > .forwarded .text');
        if (textEl) htmlToEntities(textEl, ents, null);
        ents = cleanEntities(ents, true); msg.entities = ents; msg.text = ''; msg.plain = entitiesPlain(ents);
        var rep = body.querySelector('.reply_to a[href]');
        if (rep) { var rm = /go_to_message(\d+)/.exec(rep.getAttribute('href') + ' ' + (rep.getAttribute('onclick') || '')); if (rm) msg.replyTo = +rm[1]; }
        var fw = body.querySelector('.forwarded .from_name');
        if (fw) msg.fwd = fw.childNodes[0] ? fw.childNodes[0].textContent.trim() : fw.textContent.trim();
        var wrap = body.querySelector('.media_wrap');
        if (wrap) {
          var links = wrap.querySelectorAll('a[href]');
          var hadLink = false;
          Array.prototype.forEach.call(links, function (a) {
            var href = a.getAttribute('href') || '';
            if (!href || /^(#|javascript:|https?:)/i.test(href)) return;
            hadLink = true;
            var cls = a.className || '', title = a.querySelector('.title');
            var nm = (title && title.textContent.trim()) || baseName(href);
            var kind = kindOf(href), item = { kind: kind, path: decodeURIComponent(href), name: baseName(href) };
            if (/voice/.test(cls)) { item.kind = 'audio'; item.voice = true; }
            else if (/sticker/.test(cls)) { item.sticker = true; }
            else if (/video_file|media_video|animated/.test(cls) && kind === 'file') item.kind = 'video';
            if (item.kind === 'file') item.title = nm;
            var stat = a.querySelector('.status');
            if (stat) { var dd = /(\d+):(\d{2})/.exec(stat.textContent); if (dd && (item.kind === 'audio' || item.kind === 'video')) item.dur = +dd[1] * 60 + +dd[2]; }
            msg.media.push(item);
          });
          if (!hadLink) {
            var tt = wrap.querySelector('.title');
            msg.media.push({ kind: htmlKindFromTitle(tt ? tt.textContent : ''), omitted: true, title: _t('File non incluso nell\'export') });
          }
        }
        counts[msg.from] = (counts[msg.from] || 0) + 1;
        messages.push(msg);
      });
    });
    return {
      name: name || 'Chat Telegram', messages: messages,
      participants: Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })
    };
  }

  return {
    kindOf: kindOf, mimeOf: mimeOf, extOf: extOf, baseName: baseName, fmtDur: fmtDur,
    looksLikeWhatsApp: looksLikeWhatsApp, parseWhatsApp: parseWhatsApp, deriveWaName: deriveWaName,
    parseTelegramJson: parseTelegramJson, parseTelegramHtml: parseTelegramHtml, setTranslator: setTranslator
  };
});
