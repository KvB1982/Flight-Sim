// ============================================================
//  Aufnahmen für alles, was im Spiel gesprochen wird
//
//  node tools/sprache.mjs             zeigt, welche Sätze noch keine Aufnahme haben, prüft die vorhandenen
//                                     und schreibt sprache/liste.js neu
//  node tools/sprache.mjs json        gibt die fehlenden Sätze als Liste aus (mit Stimme und Sprech-Text)
//  node tools/sprache.mjs neu         alle vorhandenen Dateien gelten als frisch aufgenommen
//  node tools/sprache.mjs aufraeumen  löscht Dateien, die zu keinem Satz mehr gehören
//  node tools/sprache.mjs streng      Fehler (für die Prüfung auf GitHub), wenn eine Aufnahme fehlt oder übrig ist
//
//  Die Aufnahmen kommen aus der Sprachausgabe von 3D AI Studio (Sprache Deutsch, eingebaute Stimmen).
//  Jeder Satz ist eine Datei sprache/<wer>/<name>.mp3 (Mono, 32 kHz). Wie man neue macht: sprache/LIESMICH.md
//  Ändert man einen Satz im Spiel, muss seine Aufnahme neu gemacht werden.
// ============================================================
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEKTIONEN, LEHRERIN } from '../js/schule.js';
import { funkStuecke, pilotStuecke, pilotText, windText, SPRUECHE, RUF } from '../js/funk.js';
import { PUNKTE } from '../js/navigation.js';
import { PLAETZE } from '../js/region.js';
import { WETTER } from '../js/atmosphaere.js';
import { teileVon } from '../js/sprache.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Wer spricht mit welcher Stimme? fest = wie gleichmäßig (0 = lebendig, 1 = ruhig)
export const STIMMEN = { jule: { stimme: 'Matilda', fest: 0.5 }, info: { stimme: 'George', fest: 0.7 }, ansage: { stimme: 'River', fest: 0.8 }, pilot: { stimme: 'Will', fest: 0.7 } };

const saetze = [];                       // { wer, name, text, laut }
const kurz = t => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
// So spricht Jule: Die Bahn heißt „drei sechs“, nicht „sechsunddreißig“
const juleLaut = t => t.replace(/Bahn 36/g, 'Bahn drei sechs').replace(/ft\/min/g, 'Fuß pro Minute').replace(/ – /g, ', ');
function jule(name, text) {
  if (!text || saetze.some(s => s.wer === 'jule' && s.text === text)) return;
  let n = name, i = 2; while (saetze.some(s => s.wer === 'jule' && s.name === n)) n = name + '_' + i++;
  saetze.push({ wer: 'jule', name: n, text, laut: juleLaut(text) });
}
// 1. Was Jule in den Lektionen der Reihe nach sagt
for (const l of LEKTIONEN) l.schritte.forEach((s, nr) => jule(l.id + '_' + nr, s.sag));
// 2. Ermahnungen und Schluss-Sätze: alle Sätze, die in js/schule.js in Anführungszeichen stehen und mit . oder ! enden
const quelle = readFileSync(join(root, 'js/schule.js'), 'utf8').split('\n').filter(z => !z.trim().startsWith('//')).join('\n');
for (const m of quelle.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
  const roh = (m[1] ?? m[2]).trim();
  if (!/[.!]$/.test(roh) || !roh.includes(' ') || /^(Taste|Tasten|Knopf|Knöpfe|Schubhebel|Pfeiltasten|Knüppel) /.test(roh)) continue;
  const mal = roh.includes('${soll}') ? [1000, 2000, 3000] : [null];
  for (const soll of mal) {
    const text = roh.replace('${soll}', soll).replace('${LEHRERIN}', LEHRERIN);
    if (text.includes('${')) throw new Error('Unbekannter Platzhalter in: ' + text);
    jule(kurz(text.split(/\s+/).slice(0, 4).join(' ')) + (soll ? '_' + soll : ''), text);
  }
}
// 3. Der Flugleiter: Stücke, aus denen jeder Funkspruch zusammengesetzt wird
const winde = Object.values(WETTER).map(w => windText(w.aus, w.kn));
for (const s of funkStuecke(PLAETZE, winde)) saetze.push({ wer: 'info', ...s });
// 3b. Der Pilot: seine eigenen Funksprüche, auch aus Stücken
for (const s of pilotStuecke(PLAETZE, PUNKTE.map(p => p.name))) saetze.push({ wer: 'pilot', ...s });
// 4. Höhen-Ansage vor dem Aufsetzen (js/flug.js)
for (const [zahl, wort] of [['100', 'Einhundert.'], ['50', 'Fünfzig.'], ['20', 'Zwanzig.'], ['10', 'Zehn.']]) saetze.push({ wer: 'ansage', name: zahl, text: zahl, laut: wort });

// Was gibt es schon? Der Text der alten Liste zeigt, ob eine Aufnahme noch zum Satz passt.
let alt = {};
const listeDatei = join(root, 'sprache/liste.js');
if (existsSync(listeDatei)) alt = (await import(listeDatei + '?alt')).SPRACHE || {};
const arg = w => process.argv.includes(w);
const liste = {}, fehlt = [];
for (const s of saetze) {
  const name = s.wer + '/' + s.name, da = existsSync(join(root, 'sprache', name + '.mp3'));
  if (da && (arg('neu') || alt[name] === s.text)) liste[name] = s.text;
  else fehlt.push({ ...s, ...STIMMEN[s.wer], veraltet: da });
}
const uebrig = [];
for (const wer of Object.keys(STIMMEN)) {
  const ordner = join(root, 'sprache', wer);
  if (!existsSync(ordner)) continue;
  for (const f of readdirSync(ordner)) if (f.endsWith('.mp3') && !saetze.some(s => s.wer === wer && s.name + '.mp3' === f)) uebrig.push(join(ordner, f));
}
if (arg('aufraeumen')) uebrig.splice(0).forEach(f => unlinkSync(f));
writeFileSync(listeDatei, '// Aufnahmen für alles Gesprochene. Nicht von Hand ändern: node tools/sprache.mjs schreibt diese Liste.\n// "wer/name": der Text, der in sprache/wer/name.mp3 gesprochen wird\nexport const SPRACHE = ' + JSON.stringify(liste, null, 1) + ';\n');

// Probe: Lässt sich jeder Funkspruch, den der Flugleiter sagen kann, ganz aus Stücken zusammensetzen?
const alleInfo = Object.fromEntries(saetze.filter(s => s.wer === 'info').map(s => ['info/' + s.name, s.text]));
let kaputt = 0;
for (const S of PLAETZE) for (const Z of PLAETZE) for (const wind of winde) for (const e of [0, 1]) {
  const l = { start: S, ziel: Z, bahnStart: S.bahnen[e], bahnZiel: Z.bahnen[e], bahnJetzt: Z.bahnen[e], wind };
  for (const text of [...SPRUECHE.map(x => x.info(l)), `${RUF}, bitte wiederholen Sie.`, `${RUF}, negativ, ich wiederhole.`]) if (!teileVon('info', text, alleInfo)) { kaputt++; console.log('  ✗ Funkspruch lässt sich nicht zusammensetzen: ' + text); }
}

// Dasselbe für den Piloten: jede Antwort, die man antippen kann (auch die falschen)
const allePilot = Object.fromEntries(saetze.filter(s => s.wer === 'pilot').map(s => ['pilot/' + s.name, s.text]));
const richtungen = ['nördlich', 'nordöstlich', 'östlich', 'südöstlich', 'südlich', 'südwestlich', 'westlich', 'nordwestlich'];
const probe = l => { for (const S of SPRUECHE) for (const text of [...S.frage(l), ...(S.zurueck ? S.zurueck(l) : [])]) if (!teileVon('pilot', pilotText(text), allePilot)) { kaputt++; console.log('  ✗ Funkspruch des Piloten lässt sich nicht zusammensetzen: ' + text); } };
for (const S of PLAETZE) for (const Z of PLAETZE) for (const e of [0, 1]) for (let i = 0; i < 130; i++) {
  const ort = PUNKTE[i % PUNKTE.length].name;
  probe({ start: S, ziel: Z, bahnStart: S.bahnen[e], bahnStartFalsch: S.bahnen[1 - e], bahnZiel: Z.bahnen[e], andereZiel: Z.bahnen[1 - e], bahnJetzt: Z.bahnen[e], naechster: ort,
    vorhaben: i % 2 ? `Rundflug über ${ort}` : `Sichtflug nach ${Z.name}`, meilen: 1 + i % 9, richtung: richtungen[i % 8], fuss: 1000 + i * 100 });
}

if (arg('json')) console.log(JSON.stringify(fehlt));
else {
  console.log(saetze.length + ' Sätze, ' + Object.keys(liste).length + ' mit Aufnahme, ' + fehlt.length + ' fehlen' + (uebrig.length ? ', ' + uebrig.length + ' Dateien übrig (weg mit „aufraeumen“)' : '') + '.');
  for (const f of fehlt) console.log('  ' + (f.veraltet ? '↻' : '○') + ' ' + f.wer + '/' + f.name + ' (' + f.stimme + '): ' + f.laut);
}
if (kaputt || (arg('streng') && (fehlt.length || uebrig.length))) process.exit(1);
