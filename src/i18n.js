'use strict';
/* Traduzioni. La lingua sorgente è l'italiano: la chiave di ogni stringa è il testo italiano, e se manca
   una traduzione si vede l'italiano. Per aggiungere una lingua basta un nuovo oggetto in LANGS.
   Segnaposto: {0}, {1}… Plurali: vedi tn(). */
var EN = {
  /* generale */
  'Chiudi': 'Close', 'Vai': 'Go', 'Scarica': 'Download', 'Riproduci': 'Play', 'Precedente': 'Previous', 'Successivo': 'Next',
  'Chat': 'Chat', 'Oggi': 'Today', 'Ieri': 'Yesterday', 'Cerca': 'Search',
  /* testata del lettore */
  'Torna alle chat (Cmd+[)': 'Back to chats (Cmd+[)',
  'Cerca nella chat (Ctrl/Cmd+F)': 'Search in chat (Ctrl/Cmd+F)',
  'Vai a una data': 'Jump to a date',
  'Media, documenti e link': 'Media, documents and links',
  'Altre azioni': 'More',
  'Cerca in questa chat': 'Search this chat',
  'Risultato precedente': 'Previous result', 'Risultato successivo': 'Next result', 'Chiudi ricerca': 'Close search',
  'Vai all\'ultimo messaggio': 'Jump to the latest message',
  'Nessun risultato': 'No results',
  '{0} di {1}': '{0} of {1}',
  /* messaggi */
  'Inoltrato da {0}': 'Forwarded from {0}',
  'Risposta': 'Reply', 'messaggio non disponibile': 'message not available',
  'modificato': 'edited',
  'Questo messaggio non è nell\'export': 'This message isn\'t in the export',
  'Media non incluso nell\'export': 'Media not included in the export',
  'File non trovato: {0}': 'File not found: {0}',
  'Nota vocale': 'Voice message',
  'immagine': 'image',
  'Anteprima non disponibile. Clic per scaricare': 'Preview not available. Click to download',
  'Formato non riproducibile. Clic per scaricare': 'Can\'t play this format. Click to download',
  '📷 Foto': '📷 Photo', '🎬 Video': '🎬 Video', '🎤 Audio': '🎤 Audio', '📎 Documento': '📎 Document',
  /* chi sei */
  'Chi sei in questa chat?': 'Who are you in this chat?',
  'Chi sei?': 'Who are you?',
  'Nessuno (tutti a sinistra)': 'Nobody (all on the left)',
  '(tu)': '(you)',
  /* info e galleria */
  'Informazioni sulla chat': 'Chat info',
  '{0} partecipanti': ['{0} participant', '{0} participants'],
  '{0} messaggi': ['{0} message', '{0} messages'],
  '{0} file multimediali': ['{0} media file', '{0} media files'],
  'dal {0} al {1}': 'from {0} to {1}',
  'Foto e video ({0})': 'Photos and videos ({0})',
  'GIF e sticker ({0})': 'GIFs and stickers ({0})',
  'Documenti ({0})': 'Documents ({0})',
  'Link ({0})': 'Links ({0})',
  'Nessuna foto o video in questa chat.': 'No photos or videos in this chat.',
  'Nessuna GIF o sticker in questa chat.': 'No GIFs or stickers in this chat.',
  'Nessun documento o audio.': 'No documents or audio.',
  'Nessun link.': 'No links.',
  'Vai al messaggio': 'Go to message',
  'Non riesco a mostrare questo file. Puoi scaricarlo.': 'This file can\'t be displayed. You can download it instead.',
  'Analizzo il file…': 'Checking the file…',
  'file non trovato': 'file not found', 'sconosciuto': 'unknown',
  'formato rilevato: {0}': 'detected format: {0}', 'primi byte: {0}': 'first bytes: {0}',
  'HEIC non supportato da questo visualizzatore': 'HEIC isn\'t supported by this viewer',
  /* avanzamento e errori di apertura */
  'Leggo {0}…': 'Reading {0}…', 'Leggo la cronologia HTML…': 'Reading the HTML history…',
  'Chat con {0}': 'Chat with {0}',
  'Apro {0}…': 'Opening {0}…',
  'Nessuna chat aperta. Sceglila dalla home di Parley.': 'No chat open. Pick one from the Parley home.',
  'Non ho trovato chat WhatsApp o Telegram in:': 'No WhatsApp or Telegram chats found in:',
  'Contenuto trovato ({0} file):': 'What was found ({0} files):',
  '… e altri {0}': '… and {0} more', '(vuoto)': '(empty)',
  'Non riesco ad aprire questa chat': 'Can\'t open this chat',
  'Il file o la cartella non esiste più in questo percorso.': 'The file or folder is no longer at this location.',
  /* home */
  'Aggiungi una chat': 'Add a chat',
  'Apri file zip…': 'Open a zip file…', 'Apri cartella…': 'Open a folder…',
  'Aggiungi cartella di export…': 'Add an exports folder…',
  'Aperte di recente': 'Recently opened',
  'Aggiorna': 'Refresh', 'Rimuovi': 'Remove',
  'Smette di mostrare questa cartella (i file non vengono toccati)': 'Stops showing this folder (your files are not touched)',
  'Rimuovi dai recenti': 'Remove from recents',
  'Leggo la cartella…': 'Reading the folder…',
  'Cartella non trovata': 'Folder not found', 'Errore': 'Error',
  'Nessuna chat in questa cartella: cerco zip, cartelle e file .txt/.json.': 'No chats in this folder: looking for zips, folders and .txt/.json files.',
  'Nessuna chat ancora': 'No chats yet',
  'Scegli la cartella con i tuoi export di WhatsApp e Telegram. Le chat compariranno qui; i file restano dove sono e non viene copiato nulla.': 'Pick the folder with your WhatsApp and Telegram exports. Your chats will show up here; files stay where they are and nothing is copied.',
  'Nessun risultato per «{0}».': 'No results for “{0}”.',
  'Zip': 'Zip', 'Cartella': 'Folder', 'File': 'File', 'da aprire': 'not opened yet',
  '+{0} copie': ['+{0} copy', '+{0} copies'],
  'Anche in:': 'Also in:',
  'Apri Parley': 'Open Parley',
  'Cartella aggiunta: {0}': 'Folder added: {0}',
  'Percorso non trovato: {0}': 'Path not found: {0}',
  'Lingua': 'Language', 'Automatica (segue Obsidian)': 'Automatic (follows Obsidian)',
  'Lingua dell\'interfaccia di Parley.': 'Language of the Parley interface.',
  /* messaggi di servizio Telegram */
  '{0} ha creato il gruppo «{1}»': '{0} created the group “{1}”',
  'Canale «{0}» creato': 'Channel “{0}” created',
  '{0} ha aggiunto {1}': '{0} added {1}', '{0} ha rimosso {1}': '{0} removed {1}',
  '{0} è entrato nel gruppo con il link': '{0} joined the group via link',
  '{0} è stato accettato nel gruppo': '{0} was accepted into the group',
  '{0} ha cambiato il nome del gruppo in «{1}»': '{0} changed the group name to “{1}”',
  '{0} ha cambiato la foto del gruppo': '{0} changed the group photo',
  '{0} ha rimosso la foto del gruppo': '{0} removed the group photo',
  '{0} ha fissato un messaggio': '{0} pinned a message',
  'Il gruppo è stato convertito in supergruppo': 'The group was converted to a supergroup',
  '{0} ha creato l\'argomento «{1}»': '{0} created the topic “{1}”',
  '📞 Chiamata': '📞 Call', '📞 Chiamata persa': '📞 Missed call', '📞 Chiamata rifiutata': '📞 Declined call',
  '📞 Chiamata di gruppo': '📞 Group call',
  'Cronologia cancellata': 'History cleared',
  'evento': 'event', 'Sconosciuto': 'Unknown',
  'Foto non inclusa nell\'export': 'Photo not included in the export',
  'File non incluso nell\'export': 'File not included in the export'
};
var LANGS = { en: EN };
var cur = 'it', fmtCache = {};

function pick(l) {
  l = String(l || '').toLowerCase().slice(0, 2);
  return l === 'it' ? 'it' : (LANGS[l] ? l : 'en');
}
function detect() {
  var l = '';
  try { l = window.localStorage.getItem('language') || ''; } catch (e) { /* ignore */ }
  if (!l) { try { l = (window.moment && window.moment.locale && window.moment.locale()) || ''; } catch (e) { /* ignore */ } }
  if (!l) { try { l = navigator.language || ''; } catch (e) { /* ignore */ } }
  return pick(l || 'en');
}
function setLocale(l) { cur = l === 'it' || LANGS[l] ? l : detect(); fmtCache = {}; return cur; }
function locale() { return cur; }
function intl() { return cur === 'it' ? 'it-IT' : 'en-GB'; }
function fill(s, args) { return args && args.length ? s.replace(/\{(\d+)\}/g, function (_, n) { return args[+n] == null ? '' : args[+n]; }) : s; }
function t(key) {
  var args = Array.prototype.slice.call(arguments, 1), d = LANGS[cur], v = d && d[key];
  if (Array.isArray(v)) v = v[1];
  return fill(typeof v === 'string' ? v : key, args);
}
/* plurale: tn(n, 'un messaggio', 'messaggi'): {0} diventa n formattato; argomenti extra da {1} */
function tn(n, one, other) {
  var extra = Array.prototype.slice.call(arguments, 3), d = LANGS[cur], v = d && d[other], s;
  if (cur === 'it' || !Array.isArray(v)) s = n === 1 ? one : other; else s = n === 1 ? v[0] : v[1];
  return fill(s, [num(n)].concat(extra));
}
function num(n) { return Number(n).toLocaleString(intl()); }
var DT = {
  t: { hour: '2-digit', minute: '2-digit' },
  long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  med: { day: 'numeric', month: 'short', year: 'numeric' },
  month: { month: 'long', year: 'numeric' },
  dm: { day: 'numeric', month: 'short' },
  my: { month: 'short', year: 'numeric' }
};
function dt(kind) { return fmtCache[kind] || (fmtCache[kind] = new Intl.DateTimeFormat(intl(), DT[kind])); }

module.exports = { t: t, tn: tn, num: num, dt: dt, setLocale: setLocale, locale: locale, detect: detect, LANGS: LANGS };
