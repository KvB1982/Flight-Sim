// Prüft den Autopiloten (js/autopilot.js):  node tools/autopilot.mjs   (mit `laut` zeigt es den Verlauf)
// Das Flugzeug fliegt wie im Spiel (Hilfe, 120 Rechenschritte je Sekunde), nur ohne Bild. Geprüft wird je Hilfe-Stufe:
//   halten (Höhe, Kurs, Tempo), neue Ziele anfliegen, Sinken, Böen, zu wenig Gas (kein Abriss), ausschalten ohne Ruck,
//   und die Regeln: Knüppel oder Gashebel bewegen = aus, nicht am Boden, nicht zu tief, nicht ohne Strom.
import { neuesFlugzeug, setze, schritt, TAKT, KN } from '../js/physik.js';
import { FT, GRAD } from '../js/flugzeuge.js';
import { mitHilfe } from '../js/hilfen.js';
import { neueLuft, WETTER } from '../js/atmosphaere.js';
import { Autopilot } from '../js/autopilot.js';
import { STARTS } from '../js/starts.js';

const laut = process.argv.includes('laut');
const wickel = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
let schlecht = 0;
const pruefe = (name, ok, mehr = '') => { if (!ok) schlecht++; console.log(`${ok ? '  ok ' : 'FALSCH'}  ${name}${mehr ? '   ' + mehr : ''}`); };
const ft = m => Math.round(m / FT), kn = v => (v / KN).toFixed(1), gr = w => (w / GRAD).toFixed(1);

// Ein Flug wie im Spiel: je Bild (1/60 s) einmal pruefe, zwei Rechenschritte, dann fertig. pilot = was der Mensch am Knüppel macht.
function flieger(hilfe, wetter = 'ruhig', lage = STARTS.runde.lage) {
  const f = neuesFlugzeug('lerche'), luft = neueLuft(WETTER[wetter]), welt = { wind: (p, t) => luft.wind(p, t), boden: () => 0 };
  setze(f, { ...lage, boden: 0 });
  const ap = new Autopilot(), pilot = { hoehe: 0, quer: 0, seite: 0, gas: lage.gas || 0, bremse: 0 };
  const F = { f, ap, pilot, hilfe, mess: null,
    flieg(sek, tu) {
      for (let t = 0; t < sek && !f.bruch; t += 1 / 60) {
        if (tu) tu(t);
        ap.pruefe(f, pilot, 1 / 60);
        for (let i = 0; i < 2; i++) schritt(f, mitHilfe(ap.steuer(f, pilot, TAKT, hilfe), f, hilfe, TAKT, true), TAKT, welt);
        ap.fertig(pilot);
        const m = F.mess; if (m) { m.rollMax = Math.max(m.rollMax, Math.abs(f.roll)); m.abriss = Math.max(m.abriss, f.abriss); m.vMin = Math.min(m.vMin, f.ias); m.yMax = Math.max(m.yMax, f.p[1]); m.yMin = Math.min(m.yMin, f.p[1]); m.schiebe = Math.max(m.schiebe, Math.abs(f.schiebe)); m.last = Math.max(m.last, f.last); }
        if (laut && Math.round(t * 60) % 300 === 0) console.log(`      ${t.toFixed(0).padStart(4)} s  ${ft(f.p[1])} ft  ${gr(f.kurs)}°  ${kn(f.ias)} kn  roll ${gr(f.roll)}°  gas ${f.gas.toFixed(2)}  trimm ${f.trimm.toFixed(2)}`);
      }
    },
    messe() { F.mess = { rollMax: 0, abriss: 0, vMin: 99, yMax: -1e9, yMin: 1e9, schiebe: 0, last: 0 }; return F.mess; }
  };
  return F;
}

for (const hilfe of ['leicht', 'mittel', 'echt']) {
  console.log(`\nHilfen: ${hilfe}`);
  // ---- 1. einschalten und halten
  let F = flieger(hilfe), { f, ap } = F;
  F.flieg(3);
  const an = ['hoehe', 'kurs', 'tempo'].map(k => ap.schalte(k, f));
  pruefe('alle drei Teile lassen sich in der Luft einschalten', an.every(Boolean));
  const y0 = ap.soll.hoehe, k0 = ap.soll.kurs, v0 = ap.soll.tempo; let m = F.messe();
  F.flieg(90);
  pruefe('hält die Höhe', Math.abs(f.p[1] - y0) < 20 * FT && m.yMax - y0 < 60 * FT && y0 - m.yMin < 60 * FT, `Ziel ${ft(y0)} ft, am Ende ${ft(f.p[1])} ft, unterwegs ${ft(m.yMin)} bis ${ft(m.yMax)} ft`);
  pruefe('hält den Kurs', Math.abs(wickel(f.kurs - k0)) < 2 * GRAD, `Ziel ${gr(k0)}°, am Ende ${gr(f.kurs)}°`);
  pruefe('hält das Tempo', Math.abs(f.ias - v0) < 2 * KN, `Ziel ${kn(v0)} kn, am Ende ${kn(f.ias)} kn`);
  // ---- 2. neue Ziele: 90° nach rechts, 500 ft höher, 10 kn schneller
  for (let i = 0; i < 90; i++) ap.stelle('kurs', 1); for (let i = 0; i < 5; i++) ap.stelle('hoehe', 1); ap.stelle('tempo', 1); ap.stelle('tempo', 1);
  m = F.messe(); let da = null;
  F.flieg(150, t => { if (da === null && Math.abs(f.p[1] - ap.soll.hoehe) < 30 * FT && Math.abs(wickel(f.kurs - ap.soll.kurs)) < 3 * GRAD) da = t; });
  pruefe('fliegt neue Ziele an (90° rechts, 500 ft höher, 10 kn schneller)', da !== null && Math.abs(f.p[1] - ap.soll.hoehe) < 25 * FT && Math.abs(wickel(f.kurs - ap.soll.kurs)) < 2 * GRAD && Math.abs(f.ias - ap.soll.tempo) < 3 * KN,
    `da nach ${da === null ? '–' : da.toFixed(0)} s; am Ende ${ft(f.p[1])} ft, ${gr(f.kurs)}°, ${kn(f.ias)} kn`);
  pruefe('dabei ruhig: Schräglage höchstens 25°, kein Abriss, nicht über das Ziel hinaus', m.rollMax < 25 * GRAD && m.abriss < 0.1 && m.yMax - ap.soll.hoehe < 60 * FT, `Schräglage bis ${gr(m.rollMax)}°, höchste Höhe ${ft(m.yMax)} ft, Schieben bis ${gr(m.schiebe)}°, Last bis ${m.last.toFixed(2)} g`);
  // ---- 3. sinken: 800 ft tiefer, 15 kn langsamer, 120° nach links
  for (let i = 0; i < 8; i++) ap.stelle('hoehe', -1); for (let i = 0; i < 3; i++) ap.stelle('tempo', -1); for (let i = 0; i < 120; i++) ap.stelle('kurs', -1);
  m = F.messe(); F.flieg(170);
  pruefe('sinkt zu einer tieferen Höhe und dreht links herum', Math.abs(f.p[1] - ap.soll.hoehe) < 25 * FT && Math.abs(wickel(f.kurs - ap.soll.kurs)) < 2 * GRAD && Math.abs(f.ias - ap.soll.tempo) < 3 * KN && ap.soll.hoehe - m.yMin < 60 * FT,
    `am Ende ${ft(f.p[1])} ft (Ziel ${ft(ap.soll.hoehe)}), ${gr(f.kurs)}°, ${kn(f.ias)} kn, tiefste Höhe ${ft(m.yMin)} ft`);
  // ---- 4. ausschalten: Das Flugzeug ist getrimmt und macht losgelassen keinen Satz
  ap.alleAus(); const yAus = f.p[1]; m = F.messe(); F.flieg(8);
  pruefe('nach dem Ausschalten ruckt nichts (8 s losgelassen)', Math.abs(f.p[1] - yAus) < 80 * FT && m.last < 1.25, `Höhe ändert sich um ${ft(f.p[1] - yAus)} ft, Last bis ${m.last.toFixed(2)} g`);

  // ---- 5. Böen und Seitenwind
  F = flieger(hilfe, 'boeig'); ({ f, ap } = F); F.flieg(3);
  for (const k of ['hoehe', 'kurs', 'tempo']) ap.schalte(k, f);
  m = F.messe(); F.flieg(120);
  pruefe('hält auch bei böigem Wind', ap.aktiv && m.yMax - ap.soll.hoehe < 80 * FT && ap.soll.hoehe - m.yMin < 80 * FT && Math.abs(wickel(f.kurs - ap.soll.kurs)) < 5 * GRAD && m.abriss < 0.1,
    `Höhe ${ft(m.yMin)} bis ${ft(m.yMax)} ft (Ziel ${ft(ap.soll.hoehe)}), Kurs am Ende ${gr(wickel(f.kurs - ap.soll.kurs))}° daneben, Tempo ${kn(m.vMin)} kn und mehr`);

  // ---- 6. nur Höhe halten, aber Gas im Leerlauf: Er darf nicht in den Abriss ziehen
  F = flieger(hilfe); ({ f, ap } = F); F.flieg(3); ap.schalte('hoehe', f); F.pilot.gas = 0;
  m = F.messe(); F.flieg(90);
  pruefe('ohne Gas zieht er nicht in den Abriss, sondern gibt Höhe auf und warnt', m.abriss < 0.1 && m.vMin > 50 * KN && f.p[1] < ap.soll.hoehe - 100 * FT && ap.meldungen.some(x => /zu langsam/.test(x.text)), `langsamstes Tempo ${kn(m.vMin)} kn, Höhe am Ende ${ft(f.p[1])} ft (Ziel ${ft(ap.soll.hoehe)})`);

  // ---- 7. selbst übernehmen
  F = flieger(hilfe); ({ f, ap } = F); F.flieg(3); for (const k of ['hoehe', 'kurs', 'tempo']) ap.schalte(k, f);
  F.flieg(5, () => { F.pilot.hoehe = 0.3; F.pilot.quer = -0.3; });
  pruefe('eine unruhige Hand (Knüppel 0,3) schaltet nichts ab', ap.an.hoehe && ap.an.kurs && ap.an.tempo);
  F.flieg(0.7, () => { F.pilot.hoehe = 0; F.pilot.quer = 0.8; });
  pruefe('Knüppel kräftig zur Seite = Kurs aus, der Rest bleibt', !ap.an.kurs && ap.an.hoehe && ap.an.tempo);
  F.flieg(0.7, () => { F.pilot.quer = 0; F.pilot.hoehe = -0.8; });
  pruefe('Knüppel kräftig drücken = Höhe aus', !ap.an.hoehe && ap.an.tempo);
  F.pilot.hoehe = 0; F.pilot.gas = Math.max(0, F.pilot.gas - 0.1); F.flieg(0.1);
  pruefe('Gashebel bewegen = Tempo aus', !ap.aktiv);
}

// ---------------------------------------------------------------- Regeln (nur einmal, die Hilfe spielt keine Rolle)
console.log('\nRegeln');
{
  let F = flieger('mittel', 'ruhig', STARTS.bahn.lage), { f, ap } = F; F.flieg(1);
  pruefe('am Boden lässt er sich nicht einschalten', !ap.schalte('hoehe', f) && !ap.aktiv);
  F = flieger('mittel', 'ruhig', { ...STARTS.runde.lage, hoehe: 100 }); ({ f, ap } = F); F.flieg(1);
  pruefe('unter 500 ft über dem Boden lässt er sich nicht einschalten', !ap.schalte('kurs', f));
  F = flieger('mittel'); ({ f, ap } = F); F.flieg(1); f.sys = { haupt: false };
  pruefe('ohne Strom (Hauptschalter aus) geht er nicht', !ap.schalte('kurs', f)); f.sys.haupt = true;
  pruefe('mit Strom geht er', ap.schalte('kurs', f) && ap.schalte('tempo', f)); f.sys.haupt = false; F.flieg(0.1);
  pruefe('fällt der Strom aus, ist er aus', !ap.aktiv);
  // im Anflug: unter 200 ft schaltet er sich ab
  F = flieger('mittel', 'ruhig', STARTS.anflug.lage); ({ f, ap } = F); F.flieg(1); ap.schalte('kurs', f); ap.schalte('tempo', f);
  let aus = null; F.flieg(120, () => { if (aus === null && !ap.aktiv) aus = f.hoeheGrund; F.pilot.hoehe = Math.max(-0.3, Math.min(0.3, 3.5 * (-3.5 * GRAD - f.nick) + 0.9 * f.w[0])); if (f.hoeheGrund < 30) { F.pilot.hoehe = 0.2; F.pilot.gas = 0; } });
  pruefe('im Anflug schaltet er sich unter 200 ft von allein ab', aus !== null && aus < 62 && aus > 40, aus === null ? 'blieb an' : `aus in ${ft(aus)} ft über dem Boden`);
  // falscher Kurskreisel: Er fliegt nach dem Instrument
  F = flieger('mittel'); ({ f, ap } = F); f.kursFehler = 20 * GRAD; F.flieg(2); ap.schalte('kurs', f); const echt0 = f.kurs; F.flieg(30);
  pruefe('mit verstelltem Kurskreisel hält er den angezeigten Kurs', Math.abs(wickel(f.kurs + f.kursFehler - ap.soll.kurs)) < 2 * GRAD && Math.abs(wickel(f.kurs - echt0)) < 3 * GRAD);
  // Trudeln: sofort aus
  F = flieger('mittel'); ({ f, ap } = F); F.flieg(2); ap.schalte('hoehe', f); f.trudelt = 0.6; F.flieg(0.05);
  pruefe('wird es wild (Trudeln), gibt er das Flugzeug sofort zurück', !ap.aktiv);
}
console.log(schlecht ? `\n${schlecht} Prüfung(en) FALSCH` : '\nAlles in Ordnung.');
process.exit(schlecht ? 1 : 0);
