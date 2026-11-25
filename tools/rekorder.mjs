// Flugrekorder auswerten: Was ist bei einem echten Flug passiert?
//   node tools/rekorder.mjs flug_2026-11-25_1130_echt.json.gz     Bericht über einen aufgezeichneten Flug
//   node tools/rekorder.mjs <datei> hilfe=mittel                  dazu: dieselben Eingaben mit einer anderen Hilfe nachfliegen
//   node tools/rekorder.mjs <datei> marke=2                       nur die Stelle um die zweite Marke, Zeile für Zeile
//   node tools/rekorder.mjs <datei> t=120                         … oder um Sekunde 120
//   node tools/rekorder.mjs selbst                                Selbsttest: Ein künstlicher Pilot fliegt, der Rekorder schreibt mit, alles wird nachgeprüft
// Die Aufzeichnung macht js/rekorder.js im Spiel (Menü → Flugrekorder → Teilen).
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { neuesFlugzeug, setze, schritt, TAKT, KN } from '../js/physik.js';
import { mitHilfe } from '../js/hilfen.js';
import { neueLuft, WETTER } from '../js/atmosphaere.js';
import { bodenHoehe } from '../js/platz.js';
import { STARTS } from '../js/starts.js';
import { Rekorder, entpacke, standSetzen, hilfeName, womitName, RATE, STAND_ALLE } from '../js/rekorder.js';
import { Pilot, GRAD } from './pilot.mjs';

const arg = process.argv.slice(2), wahl = Object.fromEntries(arg.filter(a => a.includes('=')).map(a => a.split('=')));
const datei = arg.find(a => !a.includes('='));
const z1 = (v, n = 1) => (Number.isFinite(v) ? v.toFixed(n) : '–'), pz = v => z1(100 * v, 0) + ' %';
const zeit = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

// ---------------------------------------------------------------- kleine Rechen-Helfer
// I = Liste von Zeilen-Nummern, v = Spalte
const mittel = (v, I) => { let s = 0; for (const i of I) s += v[i]; return I.length ? s / I.length : NaN; };
const rms = (v, I, m = 0) => { let s = 0; for (const i of I) s += (v[i] - m) ** 2; return I.length ? Math.sqrt(s / I.length) : NaN; };
const streu = (v, I) => rms(v, I, mittel(v, I));
const maxAbs = (v, I) => { let m = 0; for (const i of I) m = Math.max(m, Math.abs(v[i])); return m; };
const anteil = (I, wenn) => { let n = 0; for (const i of I) if (wenn(i)) n++; return I.length ? n / I.length : NaN; };
const quantil = (werte, q) => { const s = [...werte].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN; };
// Wie oft wechselt ein Wert die Richtung? Kleine Zitterer unter `schwelle` zählen nicht. Ergebnis: Umkehrungen je Minute.
function umkehrungen(v, I, schwelle) {
  if (I.length < 3) return NaN;
  let n = 0, richtung = 0, anker = v[I[0]];
  for (const i of I) {
    const d = v[i] - anker;
    if (richtung >= 0 && d < -schwelle) { if (richtung > 0) n++; richtung = -1; anker = v[i]; }
    else if (richtung <= 0 && d > schwelle) { if (richtung < 0) n++; richtung = 1; anker = v[i]; }
    else if ((richtung > 0 && d > 0) || (richtung < 0 && d < 0)) anker = v[i];
  }
  return n / (I.length / RATE) * 60;
}
// Wie oft geht ein Wert durch null? (mit etwas Spiel um die Null) – je Minute
function nulldurch(v, I, spiel) {
  let n = 0, seite = 0;
  for (const i of I) { const s = v[i] > spiel ? 1 : v[i] < -spiel ? -1 : 0; if (s && seite && s !== seite) n++; if (s) seite = s; }
  return I.length ? n / (I.length / RATE) * 60 : NaN;
}
// Schwingt etwas regelmäßig? Sucht die Dauer einer Schwingung (0,6 bis 8 s), bei der der Verlauf sich selbst am ähnlichsten ist.
// stark = wie ähnlich (1 = perfekte Schwingung, unter 0,3 = eher Zufall)
function schwingung(v, I) {
  if (I.length < RATE * 6) return { dauer: NaN, stark: 0 };
  const m = mittel(v, I), x = I.map(i => v[i] - m); let e = 0; for (const a of x) e += a * a;
  if (e < 1e-9) return { dauer: NaN, stark: 0 };
  let best = { dauer: NaN, stark: 0 }, vor = 1, tal = false;
  for (let k = 1; k < Math.min(RATE * 8, x.length >> 1); k++) {
    let s = 0; for (let i = k; i < x.length; i++) s += x[i] * x[i - k];
    const r = s / e;
    if (r > vor + 1e-9 && vor < 0.5) tal = true;           // erst nach dem ersten Tal (die Ähnlichkeit steigt wieder) zählt ein Gipfel
    if (tal && k >= RATE * 0.6 && r > best.stark) best = { dauer: k / RATE, stark: r };
    vor = r;
  }
  return best;
}
// gleitender Mittelwert über `breit` Zeilen – was übrig bleibt, wenn man ihn abzieht, ist das Zittern
function zittern(v, I, breit) {
  if (I.length < breit * 2) return NaN;
  let s = 0, n = 0;
  for (let k = breit; k < I.length - breit; k++) { let m = 0; for (let j = -breit; j <= breit; j++) m += v[I[k + j]]; s += (v[I[k]] - m / (2 * breit + 1)) ** 2; n++; }
  return Math.sqrt(s / n);
}

// ---------------------------------------------------------------- Nachfliegen
// Stellt ein Flugzeug auf einen gespeicherten Stand und fliegt von dort mit den aufgezeichneten Eingaben weiter.
//   hilfe = null: Es bekommt genau das, was im echten Flug nach der Hilfe ans Flugzeug ging (zum Prüfen, ob das Nachfliegen stimmt).
//   hilfe = 'leicht' | 'mittel' | 'echt': Es bekommt die Eingaben des Piloten, und diese Hilfe rechnet neu dazu („was wäre gewesen, wenn“).
// Gibt je Zeile den nachgeflogenen Zustand zurück.
function nachfliegen(A, Z, stand, dauer, hilfe) {
  const f = standSetzen(neuesFlugzeug('lerche'), stand), luft = neueLuft(WETTER[A.kopf.wetter] || WETTER.ruhig);
  const umwelt = { wind: (p, t) => luft.wind([p[0], p[1] - bodenHoehe(p[0], p[2]), p[2]], t), boden: bodenHoehe };
  let i = 0; while (i < Z.n && Z.t[i] < stand.t - 1e-3) i++;
  const aus = [], bis = stand.t + dauer;
  while (f.t < bis - 1e-6 && !f.bruch) {
    while (i < Z.n - 1 && Z.t[i] < f.t + TAKT - 1e-6) { aus.push({ i, roll: f.roll / GRAD, nick: f.nick / GRAD, kurs: f.kurs / GRAD, ias: f.ias / KN, y: f.p[1], schiebe: f.schiebe / GRAD, wr: f.w[2] / GRAD, wg: -f.w[1] / GRAD }); i++; }
    if (i >= Z.n - 1) break;
    f.trimm = Z.trimm[i]; f.klappenStufe = Z.kl[i];
    const pilot = { hoehe: Z.eh[i], quer: Z.eq[i], seite: Z.es[i], gas: Z.eg[i], bremse: Z.eb[i] };
    schritt(f, hilfe ? mitHilfe(pilot, f, hilfe, TAKT) : { hoehe: Z.ah[i], quer: Z.aq[i], seite: Z.as[i], gas: Z.eg[i], bremse: Z.eb[i] }, TAKT, umwelt);
  }
  return aus;
}
const winkelWeg = (a, b) => { let d = a - b; while (d > 180) d -= 360; while (d < -180) d += 360; return Math.abs(d); };
// Wie genau trifft das Nachfliegen den echten Flug? Von jedem Stand in der Luft aus `sek` Sekunden nachfliegen und am Ende vergleichen.
function treue(A, Z, sek) {
  const weg = { roll: [], nick: [], kurs: [], ias: [], y: [] };
  for (const s of A.staende) {
    if (s.boden || s.t + sek > Z.t[Z.n - 1]) continue;
    const spur = nachfliegen(A, Z, s, sek, null), e = spur[spur.length - 1];
    if (!e || Z.boden[e.i]) continue;
    weg.roll.push(Math.abs(e.roll - Z.roll[e.i])); weg.nick.push(Math.abs(e.nick - Z.nick[e.i])); weg.kurs.push(winkelWeg(e.kurs, Z.kurs[e.i]));
    weg.ias.push(Math.abs(e.ias - Z.ias[e.i])); weg.y.push(Math.abs(e.y - Z.y[e.i]));
  }
  return weg;
}
// „Was wäre gewesen, wenn“: Stück für Stück (je 6 s ab jedem dritten Stand) mit einer anderen Hilfe nachfliegen und Schieben und Rollen vergleichen
function wasWaere(A, Z, hilfe) {
  const sek = 6, summe = { n: 0, schiebe: 0, wr: 0, wg: 0 };
  for (let k = 0; k < A.staende.length; k += 3) {
    const s = A.staende[k];
    if (s.boden || s.t + sek > Z.t[Z.n - 1]) continue;
    for (const p of nachfliegen(A, Z, s, sek, hilfe)) { summe.n++; summe.schiebe += p.schiebe ** 2; summe.wr += p.wr ** 2; summe.wg += p.wg ** 2; }
  }
  const w = v => Math.sqrt(v / Math.max(1, summe.n));
  return { n: summe.n, schiebe: w(summe.schiebe), wr: w(summe.wr), wg: w(summe.wg) };
}

// ---------------------------------------------------------------- Auswerten
// Zahlen zu einem Stück Flug (I = Zeilen in der Luft mit derselben Hilfe)
export function zahlen(Z, I) {
  const o = { sek: I.length / RATE, pilot: {}, flug: {}, hilfe: {}, handy: null, funk: null };
  for (const [name, sp, schwelle] of [['hoehe', 'eh', 0.04], ['quer', 'eq', 0.04], ['seite', 'es', 0.04]]) {
    const v = Z[sp];
    o.pilot[name] = { mittel: mittel(v.map(Math.abs), I), voll: anteil(I, i => Math.abs(v[i]) > 0.95), null: anteil(I, i => v[i] === 0), umkehr: umkehrungen(v, I, schwelle) };
  }
  o.flug = { rollStreu: streu(Z.roll, I), rollMax: maxAbs(Z.roll, I), wr: rms(Z.wr, I), wn: rms(Z.wn, I), wg: streu(Z.wg, I), schiebe: rms(Z.schiebe, I), schiebeMax: maxAbs(Z.schiebe, I),
    kugel: rms(Z.kugel, I), schiebeNull: nulldurch(Z.schiebe, I, 0.5), rollSchwingt: schwingung(Z.wr, I), gierSchwingt: schwingung(Z.schiebe, I), nickSchwingt: schwingung(Z.wn, I),
    iasStreu: streu(Z.ias, I), steigStreu: streu(Z.steig, I), lastMax: maxAbs(Z.last, I) };
  // Schwingt die Hand im selben Takt wie das Flugzeug? Dann schaukeln sich Pilot und Flugzeug gegenseitig auf.
  o.takt = { quer: schwingung(Z.eq, I), hoehe: schwingung(Z.eh, I), seite: schwingung(Z.es, I) };
  const d = (a, b) => { let s = 0; for (const i of I) s += (Z[a][i] - Z[b][i]) ** 2; return Math.sqrt(s / Math.max(1, I.length)); };
  o.hilfe = { hoehe: d('ah', 'eh'), quer: d('aq', 'eq'), seite: d('as', 'es'),
    gegen: anteil(I, i => Math.abs(Z.es[i]) > 0.05 && Math.abs(Z.as[i] - Z.es[i]) > 0.05 && Math.sign(Z.as[i] - Z.es[i]) !== Math.sign(Z.es[i])) };
  const mitHandy = I.filter(i => Z.womit[i] === 1 || Z.womit[i] === 2);
  if (mitHandy.length > RATE * 5) {
    o.handy = { rollZittern: zittern(Z.rg, mitHandy, 4), nickZittern: zittern(Z.ng, mitHandy, 4), rollStreu: streu(Z.rg, mitHandy), nickStreu: streu(Z.ng, mitHandy),
      rollTot: anteil(mitHandy, i => Math.abs(Z.rg[i]) < 2), nickTot: anteil(mitHandy, i => Math.abs(Z.ng[i]) < 2), rollMax: maxAbs(Z.rg, mitHandy), nickMax: maxAbs(Z.ng, mitHandy) };
    const funk = I.filter(i => Z.womit[i] === 1);
    if (funk.length > RATE * 5) {
      const pausen = funk.map(i => Z.fl[i]).filter(v => v > 0), runden = funk.map(i => Z.fp[i]).filter(v => v > 0);
      o.funk = { mitte: quantil(pausen, 0.5), p95: quantil(pausen, 0.95), max: Math.max(0, ...pausen), lang: anteil(funk, i => Z.fl[i] > 100),
        verloren: Z.fv[funk[funk.length - 1]] - Z.fv[funk[0]], runde: quantil(runden, 0.5), rundeMax: runden.length ? Math.max(...runden) : NaN };
    }
  }
  return o;
}

function zeigeZahlen(o) {
  const P = o.pilot, F = o.flug, zeile = (n, p) => `    ${n.padEnd(7)} im Mittel ${pz(p.mittel).padStart(5)} · am Anschlag ${pz(p.voll).padStart(5)} · genau in der Mitte ${pz(p.null).padStart(5)} · ${z1(p.umkehr, 0).padStart(3)} Richtungswechsel je Minute`;
  console.log('  Was der Pilot steuert'); console.log(zeile('Höhe', P.hoehe)); console.log(zeile('Quer', P.quer)); console.log(zeile('Seite', P.seite));
  console.log('  Was das Flugzeug macht');
  console.log(`    Schräglage schwankt um ${z1(F.rollStreu)}° (größte ${z1(F.rollMax, 0)}°), rollt im Mittel mit ${z1(F.wr)}°/s, Nase nickt mit ${z1(F.wn)}°/s, giert mit ${z1(F.wg)}°/s`);
  console.log(`    Schieben im Mittel ${z1(F.schiebe)}° (größtes ${z1(F.schiebeMax)}°), wechselt ${z1(F.schiebeNull, 0)}-mal je Minute die Seite; Tempo schwankt um ${z1(F.iasStreu)} kn, Steigen um ${z1(F.steigStreu)} m/s, höchste Last ${z1(F.lastMax)} g`);
  const sw = (name, s) => s.stark > 0.3 ? `${name} schwingt alle ${z1(s.dauer)} s (Stärke ${z1(s.stark, 2)})` : `${name}: keine regelmäßige Schwingung`;
  console.log(`    ${sw('Rollen', F.rollSchwingt)} · ${sw('Schieben', F.gierSchwingt)} · ${sw('Nicken', F.nickSchwingt)}`);
  const nah = (a, b) => a.stark > 0.3 && b.stark > 0.3 && Math.abs(a.dauer - b.dauer) < 0.25 * b.dauer;
  console.log(`  Takt der Hand: ${sw('Quer', o.takt.quer)} · ${sw('Höhe', o.takt.hoehe)} · ${sw('Seite', o.takt.seite)}`);
  if (nah(o.takt.quer, F.rollSchwingt)) console.log('    ⚠ Die Hand am Querruder schwingt im selben Takt wie das Rollen: Pilot und Flugzeug schaukeln sich auf.');
  if (nah(o.takt.hoehe, F.nickSchwingt)) console.log('    ⚠ Die Hand am Höhenruder schwingt im selben Takt wie das Nicken: Pilot und Flugzeug schaukeln sich auf.');
  if (nah(o.takt.seite, F.gierSchwingt)) console.log('    ⚠ Das Pedal schwingt im selben Takt wie das Schieben: Pilot und Flugzeug schaukeln sich auf.');
  console.log(`  Was die Hilfe dazugibt (im Mittel): Höhe ${pz(o.hilfe.hoehe)}, Quer ${pz(o.hilfe.quer)}, Seite ${pz(o.hilfe.seite)} · Hilfe und Pilot ziehen am Seitenruder gegeneinander: ${pz(o.hilfe.gegen)} der Zeit`);
  if (o.handy) {
    const h = o.handy;
    console.log(`  Handy in der Hand: gedreht ±${z1(h.rollStreu)}° (größte ${z1(h.rollMax, 0)}°), gekippt ±${z1(h.nickStreu)}° (größte ${z1(h.nickMax, 0)}°) · Zittern ${z1(h.rollZittern, 2)}° / ${z1(h.nickZittern, 2)}° · in der toten Mitte (unter 2°): ${pz(h.rollTot)} / ${pz(h.nickTot)}`);
  }
  if (o.funk) {
    const k = o.funk;
    console.log(`  Funk: Pause zwischen zwei Nachrichten meist ${z1(k.mitte, 0)} ms, 95 % unter ${z1(k.p95, 0)} ms, längste ${z1(k.max, 0)} ms · länger als 100 ms: ${pz(k.lang)} der Zeit · verloren ${k.verloren} · hin und zurück ${z1(k.runde, 0)} ms (längstens ${z1(k.rundeMax, 0)})`);
  }
}

// die Stelle um eine Zeit herum, Zeile für Zeile (alle 0,2 s)
function zeigeStelle(Z, t, vor = 8, nach = 3) {
  console.log('   Zeit  | Pilot: Höhe Quer Seite Gas | nach Hilfe: Quer Seite | Tempo  Höhe  Steig | Nase  Schräg Schieb | rollt giert | Handy: gedreht gekippt | Funk');
  const s = v => z1(v, 2).padStart(5), w = (v, n = 6) => z1(v, 1).padStart(n);
  for (let i = 0; i < Z.n; i++) {
    if (Z.t[i] < t - vor || Z.t[i] > t + nach || i % 6) continue;
    console.log(`  ${zeit(Z.t[i]).padStart(5)}${(Z.t[i] % 1).toFixed(1).slice(1)} |       ${s(Z.eh[i])} ${s(Z.eq[i])} ${s(Z.es[i])} ${s(Z.eg[i])} |            ${s(Z.aq[i])} ${s(Z.as[i])} | ${w(Z.ias[i])} ${w(Z.hg[i] / 0.3048, 5)} ${w(Z.steig[i])} |` +
      ` ${w(Z.nick[i])} ${w(Z.roll[i])} ${w(Z.schiebe[i])} | ${w(Z.wr[i])} ${w(Z.wg[i])} |` +
      `        ${w(Z.rg[i])} ${w(Z.ng[i])} | ${z1(Z.fl[i], 0).padStart(4)}${Math.abs(Z.t[i] - t) < 0.1 ? '   ◀ hier' : ''}`);
  }
}

export function bericht(A, opt = {}) {
  const Z = entpacke(A), k = A.kopf, alle = Array.from({ length: Z.n }, (_, i) => i);
  console.log(`\nFlugrekorder: ${k.was} · ${k.beginn} · ${zeit(k.dauer)} min · Hilfen ${k.hilfe} · Wetter ${k.wetter} · Steuerung ${k.womit}${k.nah ? ' (iPhone ohne Internet)' : ''} · ${k.geraet}${k.app ? ' (App)' : ''} · ${Z.n} Zeilen`);
  if (k.funk && k.funk.nachrichten) console.log(`  Handy-Nachrichten: ${k.funk.nachrichten} angekommen, ${k.funk.verloren} verloren, ${k.funk.alt} zu spät gekommen und weggeworfen`);
  if (opt.t !== undefined || opt.marke !== undefined) {
    const t = opt.marke !== undefined ? (A.marken[opt.marke - 1] || {}).t : +opt.t;
    if (!Number.isFinite(t)) { console.log('  Diese Marke gibt es nicht.'); return Z; }
    console.log(`\nDie Stelle um ${zeit(t)}:`); zeigeStelle(Z, t); return Z;
  }
  console.log('\nEreignisse');
  for (const e of A.ereignisse) {
    const { t, art, ...rest } = e, mehr = Object.entries(rest).map(([a, b]) => `${a}: ${b}`).join(', ');
    console.log(`  ${zeit(t).padStart(5)}  ${art}${mehr ? ' (' + mehr + ')' : ''}`);
  }
  // Auswertung getrennt nach Hilfe-Stufe, nur in der Luft und ohne Zeitraffer
  const luft = alle.filter(i => !Z.boden[i] && !Z.raffer[i]);
  console.log(`\nIn der Luft: ${zeit(luft.length / RATE)} min von ${zeit(k.dauer)}`);
  const ergebnis = {};
  for (let h = 0; h < 3; h++) {
    const I = luft.filter(i => Z.hilfe[i] === h);
    if (I.length < RATE * 10) continue;
    console.log(`\nHilfen „${hilfeName(h)}“ – ${zeit(I.length / RATE)} min, gesteuert mit ${[...new Set(I.map(i => womitName(Z.womit[i])))].join(', ')}`);
    zeigeZahlen(ergebnis[hilfeName(h)] = zahlen(Z, I));
  }
  if (A.marken.length) {
    console.log('\nMarken („Hier war es komisch“) – jeweils die 8 Sekunden davor');
    A.marken.forEach((m, nr) => {
      const I = alle.filter(i => Z.t[i] >= m.t - 8 && Z.t[i] <= m.t);
      if (I.length < RATE) { console.log(`  Marke ${nr + 1} bei ${zeit(m.t)}: zu wenig Zeilen davor`); return; }
      const sp = n => `${z1(Math.min(...I.map(i => Z[n][i])), 0)} bis ${z1(Math.max(...I.map(i => Z[n][i])), 0)}`, sch = schwingung(Z.wr, I.length >= RATE * 6 ? I : []);
      console.log(`  Marke ${nr + 1} bei ${zeit(m.t)}: Hilfen ${hilfeName(Z.hilfe[I[0]])}, ${Z.boden[I[I.length - 1]] ? 'am Boden' : Math.round(Z.hg[I[I.length - 1]] / 0.3048) + ' ft über Grund'}, Tempo ${sp('ias')} kn, Schräglage ${sp('roll')}°, Nase ${sp('nick')}°, ` +
        `Schieben bis ${z1(maxAbs(Z.schiebe, I))}°, Quer ${z1(umkehrungen(Z.eq, I, 0.04), 0)} und Seite ${z1(umkehrungen(Z.es, I, 0.04), 0)} Richtungswechsel je Minute${sch.stark > 0.3 ? `, Rollen schwingt alle ${z1(sch.dauer)} s` : ''}`);
    });
    console.log('  Zeile für Zeile: node tools/rekorder.mjs <datei> marke=1');
  }
  // Nachfliegen: Stimmt die Rechnung mit dem echten Flug überein?
  if (!k.systeme && A.staende.some(s => !s.boden)) {
    console.log('\nNachfliegen (dieselben Ruder-Ausschläge noch einmal durch die Flugphysik) – Abstand zum echten Flug');
    for (const sek of [2, 5]) {
      const w = treue(A, Z, sek), m = v => z1(quantil(v, 0.5), 2);
      if (w.roll.length) console.log(`  nach ${sek} s (${w.roll.length} Versuche): Schräglage ${m(w.roll)}°, Nase ${m(w.nick)}°, Kurs ${m(w.kurs)}°, Tempo ${m(w.ias)} kn, Höhe ${m(w.y)} m`);
    }
    if (opt.hilfe) {
      const ist = wasWaere(A, Z, null), neu = wasWaere(A, Z, opt.hilfe);
      console.log(`\nWas wäre gewesen, wenn – dieselben Eingaben des Piloten, Hilfen „${opt.hilfe}“ (in Stücken von 6 s nachgeflogen, ${neu.n} Zeilen)`);
      console.log(`  wie aufgezeichnet: Schieben ${z1(ist.schiebe)}°, rollt ${z1(ist.wr)}°/s, giert ${z1(ist.wg)}°/s`);
      console.log(`  mit „${opt.hilfe}“:     Schieben ${z1(neu.schiebe)}°, rollt ${z1(neu.wr)}°/s, giert ${z1(neu.wg)}°/s`);
      console.log('  Vorsicht: Der Pilot hätte auf ein anderes Flugzeug auch anders gesteuert. Das zeigt nur die Richtung.');
    }
  } else if (k.systeme) console.log('\nNachfliegen: bei Flügen mit Systemen (der ganze Flug) nicht möglich – Motor und Schalter sind nicht mit aufgezeichnet.');
  return { Z, ergebnis };
}

export function lies(pfad) {
  const roh = readFileSync(pfad), text = roh[0] === 0x1f && roh[1] === 0x8b ? gunzipSync(roh).toString('utf8') : roh.toString('utf8');
  return JSON.parse(text);
}

// ---------------------------------------------------------------- Selbsttest
// Ein künstlicher Pilot fliegt 90 Sekunden: geradeaus, eine Kurve, ein Tritt ins Pedal. Der Rekorder schreibt mit wie im Spiel.
function probeflug(hilfe, verzug) {
  const f = neuesFlugzeug('lerche'), luft = neueLuft(WETTER.leicht), welt = { wind: (p, t) => luft.wind([p[0], p[1] - bodenHoehe(p[0], p[2]), p[2]], t), boden: bodenHoehe };
  setze(f, { ...STARTS.runde.lage });
  const pilot = new Pilot(f, welt, { hilfe, verzug }), rek = new Rekorder(), y0 = f.p[1], kurs0 = f.kurs;
  pilot.e.gas = STARTS.runde.lage.gas;
  rek.beginn({ beginn: '2026-11-25T10:00:00.000Z', was: 'Selbsttest', hilfe, wetter: 'leicht', womit: 'Handy', geraet: 'node', app: false, nah: false, systeme: false }, f);
  const funk = { luecke: 33, verloren: 0, runde: 40 };
  for (let n = 0; n < 90 / TAKT && !f.bruch; n++) {
    const t = n * TAKT, s = pilot.sicht();
    pilot.hoeheMitNase(s, y0, TAKT); pilot.kurs(s, t > 20 && t < 60 ? kurs0 - 90 * GRAD : kurs0);
    pilot.e.seite = t > 70 && t < 71 ? 1 : 0;
    const a = mitHilfe(pilot.e, f, hilfe, TAKT);
    schritt(f, a, TAKT, welt);
    if (Math.abs(t - 40) < TAKT / 2) rek.marke(f, 'Probe-Marke');
    if (n % 2 === 1) { funk.luecke = 33 + (n % 240 === 1 ? 120 : 0); rek.schritt(f, { e: pilot.e, a, funk, roh: [pilot.e.quer * -30, pilot.e.hoehe * 22], hilfe, womit: 'Handy', raffer: false }); }
  }
  return rek.ende(f, 'test', { funk: { nachrichten: 2700, verloren: 0, alt: 0 } });
}
function selbst() {
  let fehler = 0;
  const pruefe = (text, gut, wert) => { console.log(`  ${gut ? '✓' : '✗'} ${text}${wert !== undefined ? ': ' + wert : ''}`); if (!gut) fehler++; };
  for (const hilfe of ['mittel', 'echt']) {
    const A = probeflug(hilfe, 0.2), text = JSON.stringify(A), gz = gzipSync(text), B = JSON.parse(gunzipSync(gz).toString('utf8'));
    console.log(`\n=== Selbsttest, Hilfen „${hilfe}“ ===`);
    if (wahl.speichern) writeFileSync(`${wahl.speichern}_${hilfe}.json.gz`, gz);      // selbst speichern=/tmp/probe legt die Probe-Aufzeichnungen als Dateien ab
    const { Z, ergebnis } = bericht(B, { hilfe: hilfe === 'echt' ? 'mittel' : 'echt' }), o = ergebnis[hilfe];
    console.log('\nPrüfungen');
    pruefe('Zeilen (90 s mal 30)', Math.abs(Z.n - 90 * RATE) <= 2, Z.n);
    pruefe('Stände zum Nachfliegen', Math.abs(A.staende.length - 90 / STAND_ALLE) <= 1, A.staende.length);
    pruefe('Größe: roh und zusammengedrückt (kB)', gz.length < 400e3, `${Math.round(text.length / 1000)} → ${Math.round(gz.length / 1000)}`);
    pruefe('Hochgerechnet auf 10 Minuten unter 1 MB', gz.length / 90 * 600 < 1e6, Math.round(gz.length / 90 * 600 / 1000) + ' kB');
    pruefe('Zeit läuft gleichmäßig', Math.abs((Z.t[Z.n - 1] - Z.t[0]) - (Z.n - 1) / RATE) < 0.05);
    pruefe('Marke ist da', B.marken.length === 1 && Math.abs(B.marken[0].t - 40) < 0.1);
    pruefe('Ereignisse Start und Ende', B.ereignisse[0].art === 'start' && B.ereignisse[B.ereignisse.length - 1].art === 'ende');
    pruefe('Zahlen sind Zahlen', Number.isFinite(o.flug.schiebe) && Number.isFinite(o.pilot.quer.umkehr) && Number.isFinite(o.hilfe.seite));
    pruefe('Pedal-Tritt ist zu sehen (Schieben über 3°)', o.flug.schiebeMax > 3, z1(o.flug.schiebeMax) + '°');
    if (hilfe === 'echt') {
      // Nach dem Tritt ins Pedal (Sekunde 70 bis 71) schaukeln sich der künstliche Pilot (er steuert nur Querruder, 0,2 s zu spät) und das Flugzeug auf:
      // Schieben und Rollen schwingen langsam hin und her. Das muss der Bericht als Schwingung finden.
      const nachTritt = []; for (let i = 0; i < Z.n; i++) if (Z.t[i] > 71 && Z.t[i] < 89) nachTritt.push(i);
      const p = schwingung(Z.schiebe, nachTritt);
      pruefe('Aufschaukeln nach dem Pedal-Tritt wird als Schwingung erkannt (alle 3 bis 8 s)', p.stark > 0.3 && p.dauer > 3 && p.dauer < 8, `${z1(p.dauer)} s, Stärke ${z1(p.stark, 2)}`);
    }
    pruefe('Funk-Pausen kommen an', o.funk && o.funk.mitte === 33 && o.funk.max === 153, o.funk && `${o.funk.mitte} / ${o.funk.max} ms`);
    pruefe(hilfe === 'echt' ? 'Hilfe „echt“ gibt nichts dazu' : 'Hilfe „mittel“ gibt Seitenruder dazu', hilfe === 'echt' ? o.hilfe.seite < 1e-6 : o.hilfe.seite > 0.005, pz(o.hilfe.seite));
    const w2 = treue(B, Z, 2), w5 = treue(B, Z, 5), m = v => quantil(v, 0.5);
    pruefe('Nachfliegen trifft nach 2 s (Schräglage unter 1°, Tempo unter 0,5 kn)', m(w2.roll) < 1 && m(w2.ias) < 0.5, `${z1(m(w2.roll), 2)}°, ${z1(m(w2.ias), 2)} kn`);
    pruefe('Nachfliegen trifft nach 5 s (Schräglage unter 3°, Höhe unter 2 m)', m(w5.roll) < 3 && m(w5.y) < 2, `${z1(m(w5.roll), 2)}°, ${z1(m(w5.y), 2)} m`);
    if (hilfe === 'echt') { const ist = wasWaere(B, Z, null), neu = wasWaere(B, Z, 'mittel'); pruefe('Was wäre wenn: „mittel“ schiebt weniger als „echt“', neu.schiebe < ist.schiebe, `${z1(neu.schiebe, 2)}° statt ${z1(ist.schiebe, 2)}°`); }
  }
  console.log(fehler ? `\n${fehler} Prüfung(en) nicht bestanden.` : '\nDer Flugrekorder schreibt richtig mit, und das Auswerten klappt.');
  process.exit(fehler ? 1 : 0);
}

if (datei === 'selbst') selbst();
else if (datei) bericht(lies(datei), { hilfe: wahl.hilfe, t: wahl.t, marke: wahl.marke !== undefined ? +wahl.marke : undefined });
else console.log('Aufruf: node tools/rekorder.mjs <datei.json oder .json.gz> [hilfe=leicht|mittel|echt] [marke=1] [t=120]   oder   node tools/rekorder.mjs selbst');
