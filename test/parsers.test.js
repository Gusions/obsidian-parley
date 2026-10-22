const assert = require('assert');
const P = require('../src/parsers.js');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('✓', name); };

/* ---- WhatsApp iOS (italiano) ---- */
const ios = [
  '﻿[12/03/23, 14:32:10] Marco: Ciao!',
  '[12/03/23, 14:33:01] Anna: ‎<allegato: 00000001-PHOTO-2023-03-12-14-33-00.jpg>',
  '[12/03/23, 14:35:00] Anna: Guarda questa',
  'riga che continua sotto',
  '[13/03/23, 09:01:00] Marco: ‎<allegato: 00000002-AUDIO-2023-03-13-09-01-00.opus>',
  '[13/03/23, 09:02:00] ‎Marco ha creato il gruppo "Famiglia"',
  '[13/03/23, 09:03:00] Anna: ‎immagine omessa',
  '[13/03/23, 09:04:00] Anna: Questo messaggio è stato eliminato',
  '[31/12/23, 23:59:59] Marco: *Buon* anno https://example.com',
].join('\n');

ok('iOS: conteggio messaggi e partecipanti', () => {
  assert.ok(P.looksLikeWhatsApp(ios));
  const r = P.parseWhatsApp(ios);
  assert.strictEqual(r.messages.length, 8);
  assert.deepStrictEqual(r.participants.sort(), ['Anna', 'Marco']);
  assert.strictEqual(r.dateOrder, 'dmy');
});
ok('iOS: date in ordine giorno/mese', () => {
  const r = P.parseWhatsApp(ios);
  const d = new Date(r.messages[0].ts);
  assert.strictEqual(d.getDate(), 12); assert.strictEqual(d.getMonth(), 2); assert.strictEqual(d.getFullYear(), 2023);
  assert.strictEqual(d.getHours(), 14); assert.strictEqual(d.getSeconds(), 10);
});
ok('iOS: allegati, multilinea, sistema, omessi, eliminati', () => {
  const m = P.parseWhatsApp(ios).messages;
  assert.strictEqual(m[1].media[0].kind, 'image');
  assert.strictEqual(m[1].media[0].name, '00000001-PHOTO-2023-03-12-14-33-00.jpg');
  assert.strictEqual(m[2].text, 'Guarda questa\nriga che continua sotto');
  assert.strictEqual(m[3].media[0].kind, 'audio');
  assert.strictEqual(m[4].system, true);
  assert.strictEqual(m[5].media[0].omitted, true);
  assert.strictEqual(m[5].media[0].kind, 'image');
  assert.strictEqual(m[6].deleted, true);
});

ok('iOS: didascalia prima o dopo il tag allegato', () => {
  const r = P.parseWhatsApp('[12/03/23, 14:33:01] Anna: Guarda che bella ‎<allegato: 00000009-PHOTO-2023.jpg>\n[12/03/23, 14:34:01] Anna: ‎<allegato: 00000010-PHOTO-2023.jpg>\nsotto la didascalia');
  assert.strictEqual(r.messages[0].media[0].name, '00000009-PHOTO-2023.jpg');
  assert.strictEqual(r.messages[0].text, 'Guarda che bella');
  assert.strictEqual(r.messages[1].media[0].name, '00000010-PHOTO-2023.jpg');
  assert.strictEqual(r.messages[1].text, 'sotto la didascalia');
});

/* ---- WhatsApp Android (italiano) ---- */
const and = [
  '12/03/23, 14:32 - I messaggi e le chiamate sono crittografati end-to-end.',
  '12/03/23, 14:32 - Marco: Ciao!',
  '12/03/23, 14:33 - Anna: IMG-20230312-WA0001.jpg (file allegato)',
  'Che bella foto',
  '12/03/23, 14:34 - Anna: <Media omessi>',
  '12/03/23, 14:35 - Marco: PTT-20230312-WA0002.opus (file allegato)',
  '12/03/23, 14:36 - Marco: Contratto.pdf (file allegato)',
].join('\n');
ok('Android: parsing base e allegati con didascalia', () => {
  assert.ok(P.looksLikeWhatsApp(and));
  const m = P.parseWhatsApp(and).messages;
  assert.strictEqual(m.length, 6);
  assert.strictEqual(m[0].system, true);
  assert.strictEqual(m[2].media[0].name, 'IMG-20230312-WA0001.jpg');
  assert.strictEqual(m[2].text, 'Che bella foto');
  assert.strictEqual(m[3].media[0].omitted, true);
  assert.strictEqual(m[4].media[0].kind, 'audio');
  assert.strictEqual(m[5].media[0].kind, 'file');
});

/* ---- Android inglese con AM/PM e formato USA ---- */
const us = [
  '3/14/23, 2:05 PM - Bob: Hello',
  '3/14/23, 12:10 AM - Alice: Midnight snack',
  '12/25/23, 9:00 AM - Bob: Merry Xmas',
].join('\n');
ok('Android US: mm/dd e AM/PM', () => {
  const r = P.parseWhatsApp(us);
  assert.strictEqual(r.dateOrder, 'mdy');
  const a = new Date(r.messages[0].ts), b = new Date(r.messages[1].ts);
  assert.strictEqual(a.getMonth(), 2); assert.strictEqual(a.getDate(), 14); assert.strictEqual(a.getHours(), 14);
  assert.strictEqual(b.getHours(), 0);
});
ok('Android: spazio stretto (U+202F) prima di PM', () => {
  const r = P.parseWhatsApp('[3/14/23, 2:05:11 PM] Bob: Hi');
  assert.strictEqual(r.messages.length, 1);
  assert.strictEqual(new Date(r.messages[0].ts).getHours(), 14);
});
ok('Non confonde un testo qualsiasi con WhatsApp', () => {
  assert.ok(!P.looksLikeWhatsApp('Lista della spesa\nlatte\nuova\npane'));
});
ok('Nome chat dal nome file', () => {
  assert.strictEqual(P.deriveWaName(['_chat.txt', 'Chat WhatsApp con Mario Rossi.zip']), 'Mario Rossi');
  assert.strictEqual(P.deriveWaName(['WhatsApp Chat - Gruppo Calcetto.zip']), 'Gruppo Calcetto');
});

/* ---- Telegram JSON ---- */
const tg = {
  personal_information: { user_id: 111, first_name: 'Marco' },
  chats: { list: [{
    name: 'Anna', type: 'personal_chat', id: 5,
    messages: [
      { id: 1, type: 'service', date: '2023-03-12T14:00:00', date_unixtime: '1678629600', actor: 'Anna', action: 'phone_call', duration_seconds: 65 },
      { id: 2, type: 'message', date: '2023-03-12T14:32:10', date_unixtime: '1678631530', from: 'Marco', from_id: 'user111', text: 'Ciao', text_entities: [{ type: 'plain', text: 'Ciao' }] },
      { id: 3, type: 'message', date: '2023-03-12T14:33:00', from: 'Anna', from_id: 'user222', photo: 'chats/chat_01/photos/photo_1.jpg', width: 800, height: 600, text: '', text_entities: [] },
      { id: 4, type: 'message', date: '2023-03-12T14:34:00', from: 'Anna', from_id: 'user222', file: 'voice_messages/audio_1.ogg', media_type: 'voice_message', duration_seconds: 7, mime_type: 'audio/ogg', text: '' },
      { id: 5, type: 'message', date: '2023-03-12T14:35:00', from: 'Anna', from_id: 'user222', reply_to_message_id: 2,
        text: ['guarda ', { type: 'bold', text: 'qui' }, ' ', { type: 'link', text: 'https://x.it' }],
        text_entities: [{ type: 'plain', text: 'guarda ' }, { type: 'bold', text: 'qui' }, { type: 'plain', text: ' ' }, { type: 'link', text: 'https://x.it' }],
        reactions: [{ type: 'emoji', count: 1, emoji: '👍' }] },
      { id: 6, type: 'message', date: '2023-03-12T14:36:00', from: 'Anna', from_id: 'user222', photo: '(File not included. Change data exporting settings to download.)', text: '' },
      { id: 7, type: 'message', date: '2023-03-12T14:37:00', from: 'Anna', from_id: 'user222', file: 'stickers/s.webp', media_type: 'sticker', sticker_emoji: '😀', text: '' },
    ]
  }, { name: 'Vuota', type: 'personal_chat', id: 6, messages: [] }] }
};
ok('Telegram JSON: export completo', () => {
  const chats = P.parseTelegramJson(tg);
  assert.strictEqual(chats.length, 1);
  const c = chats[0];
  assert.strictEqual(c.meName, 'Marco');
  assert.strictEqual(c.messages.length, 7);
  assert.ok(/Chiamata/.test(c.messages[0].text) && /1:05/.test(c.messages[0].text));
  assert.strictEqual(c.messages[2].media[0].path, 'chats/chat_01/photos/photo_1.jpg');
  assert.strictEqual(c.messages[3].media[0].voice, true);
  assert.strictEqual(c.messages[3].media[0].kind, 'audio');
  assert.strictEqual(c.messages[4].replyTo, 2);
  assert.strictEqual(c.messages[4].reactions[0].e, '👍');
  assert.strictEqual(c.messages[4].plain, 'guarda qui https://x.it');
  assert.strictEqual(c.messages[5].media[0].omitted, true);
  assert.strictEqual(c.messages[6].media[0].sticker, true);
});
ok('Telegram JSON: export di una sola chat', () => {
  const chats = P.parseTelegramJson({ name: 'Gruppo', type: 'private_group', id: 1, messages: tg.chats.list[0].messages });
  assert.strictEqual(chats.length, 1);
  assert.strictEqual(chats[0].name, 'Gruppo');
});

/* ---- Telegram HTML (via jsdom) ---- */
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) { console.log('(jsdom non installato: salto il test HTML)'); }
if (JSDOM) {
  const html = `<html><body><div class="page_header"><div class="content"><div class="text bold">Anna</div></div></div>
  <div class="page_body chat_page"><div class="history">
   <div class="message service" id="message-1"><div class="body details">12 March 2023</div></div>
   <div class="message default clearfix" id="message10"><div class="body">
     <div class="pull_right date details" title="12.03.2023 14:32:10 UTC+01:00">14:32</div>
     <div class="from_name">Marco</div><div class="text">Ciao <strong>tu</strong><br>riga 2 <a href="https://a.it">link</a></div></div></div>
   <div class="message default clearfix joined" id="message11"><div class="body">
     <div class="pull_right date details" title="12.03.2023 14:33:00 UTC+01:00">14:33</div>
     <div class="reply_to details">In reply to <a href="#go_to_message10" onclick="return GoToMessage(10)">this message</a></div>
     <div class="media_wrap clearfix"><a class="photo_wrap clearfix pull_left" href="photos/photo_1@12-03-2023.jpg"><img class="photo" src="photos/photo_1@12-03-2023_thumb.jpg"></a></div>
     <div class="text">bella</div></div></div>
   <div class="message default clearfix" id="message12"><div class="body">
     <div class="pull_right date details" title="12.03.2023 14:34:00 UTC+01:00">14:34</div>
     <div class="from_name">Anna</div>
     <div class="media_wrap clearfix"><a class="media clearfix pull_left block_link media_voice_message" href="voice_messages/audio_1.ogg"><div class="body"><div class="title bold">Voice message</div><div class="status details">00:07</div></div></a></div></div></div>
   <div class="message default clearfix" id="message13"><div class="body">
     <div class="pull_right date details" title="12.03.2023 14:35:00 UTC+01:00">14:35</div>
     <div class="from_name">Anna</div>
     <div class="media_wrap clearfix"><div class="media clearfix pull_left media_photo"><div class="body"><div class="title bold">Photo</div><div class="status details">Not included, change data exporting settings to download.</div></div></div></div></div></div>
  </div></div></body></html>`;
  ok('Telegram HTML: messaggi, joined, reply, media', () => {
    const r = P.parseTelegramHtml([html], new JSDOM('').window.DOMParser);
    assert.strictEqual(r.name, 'Anna');
    assert.strictEqual(r.messages.length, 4);
    const [a, b, c, d] = r.messages;
    assert.strictEqual(a.from, 'Marco');
    assert.strictEqual(a.plain, 'Ciao tu\nriga 2 link');
    assert.strictEqual(b.from, 'Marco');       // joined eredita il mittente
    assert.strictEqual(b.replyTo, 10);
    assert.strictEqual(b.media[0].path, 'photos/photo_1@12-03-2023.jpg');
    assert.strictEqual(c.media[0].voice, true);
    assert.strictEqual(c.media[0].dur, 7);
    assert.strictEqual(d.media[0].omitted, true);
    assert.strictEqual(new Date(a.ts).getHours(), 14);
  });
}

console.log(`\n${n} test passati`);
