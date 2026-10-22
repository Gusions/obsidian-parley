'use strict';
/* Lettore di zip "pigro" per Node/Electron: legge solo l'indice (central directory)
   e decomprime un file alla volta quando serve. Regge zip da molti GB e zip64.
   Supporta metodi "stored" e "deflate" (quelli usati da WhatsApp/Telegram/macOS/Windows). */
var fs = require('fs');
var zlib = require('zlib');
var util = require('util');
var inflateRaw = util.promisify(zlib.inflateRaw);

async function readAt(fh, pos, len) {
  var buf = Buffer.alloc(len), off = 0;
  while (off < len) {
    var r = await fh.read(buf, off, len - off, pos + off);
    if (!r.bytesRead) break;
    off += r.bytesRead;
  }
  return off < len ? buf.subarray(0, off) : buf;
}

function decodeName(buf) {
  var s = buf.toString('utf8');
  return s.indexOf('�') >= 0 ? buf.toString('latin1') : s;
}

function ZipReader(fh, entries) { this.fh = fh; this.entries = entries; }

ZipReader.open = async function (path) {
  var fh = await fs.promises.open(path, 'r');
  try {
    var size = (await fh.stat()).size;
    var tailLen = Math.min(size, 65557);
    var tail = await readAt(fh, size - tailLen, tailLen);
    var i = tail.length - 22;
    while (i >= 0 && tail.readUInt32LE(i) !== 0x06054b50) i--;
    if (i < 0) throw new Error('Non sembra un archivio zip valido');
    var count = tail.readUInt16LE(i + 10), cdSize = tail.readUInt32LE(i + 12), cdOff = tail.readUInt32LE(i + 16);
    if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
      var li = i - 20;
      if (li >= 0 && tail.readUInt32LE(li) === 0x07064b50) {
        var off64 = Number(tail.readBigUInt64LE(li + 8));
        var h = await readAt(fh, off64, 56);
        if (h.readUInt32LE(0) !== 0x06064b50) throw new Error('Indice zip64 non valido');
        count = Number(h.readBigUInt64LE(32)); cdSize = Number(h.readBigUInt64LE(40)); cdOff = Number(h.readBigUInt64LE(48));
      }
    }
    var cd = await readAt(fh, cdOff, cdSize);
    var entries = [], p = 0;
    while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
      var flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10);
      var csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24);
      var nl = cd.readUInt16LE(p + 28), el = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
      var off = cd.readUInt32LE(p + 42);
      var nameBuf = cd.subarray(p + 46, p + 46 + nl), extra = cd.subarray(p + 46 + nl, p + 46 + nl + el);
      var uname = null;
      for (var q = 0; q + 4 <= extra.length;) {
        var id = extra.readUInt16LE(q), sz = extra.readUInt16LE(q + 2), d = q + 4;
        if (id === 0x0001) {
          var r = d;
          if (usize === 0xffffffff) { usize = Number(extra.readBigUInt64LE(r)); r += 8; }
          if (csize === 0xffffffff) { csize = Number(extra.readBigUInt64LE(r)); r += 8; }
          if (off === 0xffffffff) { off = Number(extra.readBigUInt64LE(r)); r += 8; }
        } else if (id === 0x7075 && sz >= 5) {
          uname = extra.subarray(d + 5, d + sz).toString('utf8');
        }
        q = d + sz;
      }
      var name = uname || (flags & 0x800 ? nameBuf.toString('utf8') : decodeName(nameBuf));
      entries.push({ name: name, method: method, csize: csize, usize: usize, off: off, flags: flags });
      p += 46 + nl + el + cl;
    }
    return new ZipReader(fh, entries);
  } catch (e) { await fh.close(); throw e; }
};

ZipReader.prototype.read = async function (e) {
  if (e.flags & 1) throw new Error('File cifrato nello zip: ' + e.name);
  var lh = await readAt(this.fh, e.off, 30);
  if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('Intestazione locale non valida: ' + e.name);
  var start = e.off + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  var data = await readAt(this.fh, start, e.csize);
  if (e.method === 0) return data;
  if (e.method === 8) return inflateRaw(data);
  throw new Error('Compressione zip non supportata (metodo ' + e.method + '): ' + e.name);
};

ZipReader.prototype.close = function () { return this.fh.close().catch(function () {}); };

module.exports = ZipReader;
