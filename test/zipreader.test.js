const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const JSZip = require('jszip');
const ZipReader = require('../src/zipreader.js');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zr-'));
  const big = Buffer.alloc(300000, 'abcdefghij');
  const files = {
    '_chat.txt': Buffer.from('[12/03/23, 14:32:10] Marco: Ciao àèì 😀\n'),
    'IMG-0001.jpg': Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
    'sub/dir/grande.bin': big,
    'Contratto è finale.pdf': Buffer.from('%PDF-1.4 test'),
  };

  // 1) zip creato da JSZip (deflate + stored)
  const z = new JSZip();
  Object.entries(files).forEach(([n, b]) => z.file(n, b, { compression: n.endsWith('.jpg') ? 'STORE' : 'DEFLATE' }));
  const p1 = path.join(dir, 'jszip.zip');
  fs.writeFileSync(p1, await z.generateAsync({ type: 'nodebuffer' }));

  // 2) zip creato da Python, con zip64 forzato
  const p2 = path.join(dir, 'py64.zip');
  const py = `
import zipfile, sys
files = {
  '_chat.txt': '[12/03/23, 14:32:10] Marco: Ciao àèì 😀\\n'.encode('utf-8'),
  'IMG-0001.jpg': bytes([0xff,0xd8,0xff,0xe0,1,2,3]),
  'sub/dir/grande.bin': b'abcdefghij'*30000,
  'Contratto è finale.pdf': b'%PDF-1.4 test',
}
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
    for n, b in files.items():
        with zf.open(n, 'w', force_zip64=True) as f:
            f.write(b)
`;
  execFileSync('python3', ['-c', py, p2]);

  for (const [label, p] of [['JSZip', p1], ['Python zip64', p2]]) {
    const zr = await ZipReader.open(p);
    zr.entries = zr.entries.filter((e) => !e.name.endsWith('/')); // le voci di cartella vengono ignorate
    const names = zr.entries.map((e) => e.name).sort();
    assert.deepStrictEqual(names, Object.keys(files).sort(), label + ': nomi (UTF-8 inclusi)');
    for (const e of zr.entries) {
      const data = await zr.read(e);
      assert.ok(Buffer.compare(data, files[e.name]) === 0, label + ': contenuto di ' + e.name);
      assert.strictEqual(e.usize, files[e.name].length, label + ': dimensione ' + e.name);
    }
    await zr.close();
    console.log('✓', label, '— ' + zr.entries.length + ' file letti e verificati');
  }

  // 3) file che non è uno zip
  const bad = path.join(dir, 'no.zip'); fs.writeFileSync(bad, 'questo non è uno zip');
  await assert.rejects(() => ZipReader.open(bad), /zip valido/);
  console.log('✓ file non-zip rifiutato con messaggio chiaro');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('\nZipReader OK');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
