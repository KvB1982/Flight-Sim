// Kopiert das Spiel nach www/. Capacitor packt den Ordner www/ danach in die App.
//
// three.js liegt schon im Ordner lib/. PeerJS (Handy über das Internet) und der QR-Code kommen auf der Webseite
// aus dem Internet (jsDelivr). Die App soll aber auch ohne Internet starten. Deshalb legt dieses Skript eine Kopie
// davon nach www/lib/ (aus node_modules, nach "npm install") und sagt dem Spiel mit FLUGSIM_LIB, wo sie liegen.
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
// Neue Ordner mit Spieldateien müssen hier in die Liste.
const FILES = ['index.html', 'steuer.html', 'css', 'js', 'lib', 'icons'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of FILES) {
  if (!existsSync(join(root, f))) throw new Error('Datei fehlt: ' + f);
  cpSync(join(root, f), join(out, f), { recursive: true });
}

// PeerJS und der QR-Code
const nm = join(root, 'node_modules');
if (!existsSync(join(nm, 'peerjs'))) throw new Error('PeerJS fehlt: bitte zuerst "npm install" ausführen');
cpSync(join(nm, 'peerjs', 'dist', 'peerjs.min.js'), join(out, 'lib', 'peerjs.min.js'));
cpSync(join(nm, 'qrcode-generator', 'qrcode.js'), join(out, 'lib', 'qrcode.js'));

// Beiden Seiten sagen, dass die Bibliotheken auf dem Gerät liegen (js/native.js liest FLUGSIM_LIB)
for (const name of ['index.html', 'steuer.html']) {
  const seite = join(out, name);
  const vorher = readFileSync(seite, 'utf8');
  const html = vorher.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<script>window.FLUGSIM_LIB = "lib/";</script>');
  if (html === vorher) throw new Error('Stelle für FLUGSIM_LIB in ' + name + ' nicht gefunden');
  writeFileSync(seite, html);
}

console.log('Spiel nach www/ kopiert: ' + FILES.length + ' Einträge, dazu PeerJS und QR-Code.');
