// Flugsimulator – prüft den Flugplan „wie bei den Profis“ und die Flugplatzkarten (js/flugplan.js), ohne Bildschirm.
//   node tools/flugplan.mjs          alle Prüfungen
//   node tools/flugplan.mjs laut     zeigt dazu einen Plan Zeile für Zeile und alle Flugplatzkarten als Text
import { flugplan, planBei, platzBlatt, alleBlaetter, rundeVon, bahnOrt, uhr, FREQUENZ } from '../js/flugplan.js';
import { rechne, punktVon, AUSFLUEGE, grad3 } from '../js/navigation.js';
import { PLAETZE, bahnLage, bahnKurs, bodenHoehe, NM } from '../js/region.js';
import { WETTER } from '../js/atmosphaere.js';
import { GRAD, FT } from '../js/flugzeuge.js';

const laut = process.argv.includes('laut');
let gut = 0, schlecht = 0;
const pruefe = (name, ok, mehr = '') => { if (ok) gut++; else schlecht++; if (!ok || laut) console.log(`${ok ? '  ok ' : 'FEHLER'}  ${name}${mehr ? ' – ' + mehr : ''}`); };
const nah = (a, b, wie = 1e-6) => Math.abs(a - b) <= wie;
const winkel = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };

// ---------------------------------------------------------------- 1. Der Flugplan passt zur Rechnung des Planers
console.log('Flugplan: jeder fertige Ausflug bei jedem Wetter');
for (const A of AUSFLUEGE) for (const [wn, W] of Object.entries(WETTER)) {
  const plan = { punkte: A.punkte.map(punktVon), hoehe: A.hoehe, sprit: 90 }, R = rechne(plan, W), F = flugplan(plan, W), n = `${A.name} (${wn})`;
  pruefe(`${n}: Zeit wie im Planer`, nah(F.zeit, R.zeit, 0.02), `${F.zeit.toFixed(2)} / ${R.zeit.toFixed(2)} min`);
  pruefe(`${n}: Sprit wie im Planer`, nah(F.liter, R.liter, 0.05), `${F.liter.toFixed(2)} / ${R.liter.toFixed(2)} l`);
  // Die Stücke hängen lückenlos aneinander: Zeit, Strecke, Höhe, Sprit, Ort
  let ok = F.stuecke.length > 2 && nah(F.stuecke[0].t0, 0);
  for (let i = 1; i < F.stuecke.length; i++) { const a = F.stuecke[i - 1], b = F.stuecke[i];
    ok = ok && nah(a.t1, b.t0, 1e-6) && nah(a.h1, b.h0, 0.5) && nah(a.liter1, b.liter0, 1e-6) && b.t1 >= b.t0 && (b.art === 'runde' || Math.hypot(a.x1 - b.x0, a.z1 - b.z0) < 1); }
  pruefe(`${n}: Stücke lückenlos`, ok);
  pruefe(`${n}: höchste Höhe = Reisehöhe (oder gekürzt)`, F.gekuerzt ? F.hoch < A.hoehe : nah(F.hoch, A.hoehe, 1), `${Math.round(F.hoch)} ft`);
  pruefe(`${n}: Platzrunde 1000 ft über dem Ziel`, F.hRunde - F.hZiel >= 1000 && F.hRunde - F.hZiel < 1100, `${Math.round(F.hRunde)} ft, Platz ${Math.round(F.hZiel)} ft`);
  // Die Zeilen: Zeit steigt, jeder Wegpunkt kommt vor, am Ende die Landung
  const namen = F.zeilen.map(z => z.name);
  pruefe(`${n}: Zeilen in der Reihenfolge der Zeit`, F.zeilen.every((z, i) => !i || z.zeit >= F.zeilen[i - 1].zeit - 1e-6) && F.zeilen[0].art === 'start' && F.zeilen[F.zeilen.length - 1].art === 'landung');
  pruefe(`${n}: alle Wegpunkte stehen im Plan`, plan.punkte.every(p => namen.some(x => x.includes(p.name))));
  // Für jeden Zeitpunkt: Höhe, Ort und Sprit ändern sich nicht sprunghaft, der Sprit wird nie mehr
  let spr = true, alt = planBei(F, 0);
  for (let t = 0.05; t <= F.zeit; t += 0.05) { const J = planBei(F, t);
    if (Math.abs(J.hoehe - alt.hoehe) > 40 || J.verbraucht < alt.verbraucht - 1e-6 || (J.art !== 'runde' && alt.art !== 'runde' && Math.hypot(J.x - alt.x, J.z - alt.z) > 400) || !isFinite(J.kurs) || !J.punkt) spr = false;
    alt = J; }
  pruefe(`${n}: jede Minute lückenlos (Höhe, Ort, Sprit)`, spr);
  const E = planBei(F, F.zeit); pruefe(`${n}: am Ende gelandet`, nah(E.hoehe, F.hZiel, 30) && nah(E.verbraucht, F.liter, 0.05) && E.restMin < 0.01);
  // Im Reiseflug steht derselbe Steuerkurs wie im Planer
  const reise = F.stuecke.filter(s => s.art === 'reise');
  pruefe(`${n}: Steuerkurs wie im Planer`, reise.every(s => R.beine.some(b => winkel(b.steuer, s.steuer) < 1e-6)));
  pruefe(`${n}: fünf Funk-Zeiten`, F.funk.length === 5 && F.funk.every((x, i) => !i || x.zeit >= F.funk[i - 1].zeit));
}

// ---------------------------------------------------------------- 2. Besondere Pläne
console.log('Flugplan: besondere Fälle');
{
  const W = WETTER.ruhig, kurz = flugplan({ punkte: ['lerchenfeld', 'koenigsdorf'].map(punktVon), hoehe: 9500, sprit: 60 }, W);
  pruefe('kurzer Flug in großer Höhe: Reisehöhe wird nicht erreicht, es gibt einen Hinweis', kurz.gekuerzt && kurz.hoch < 9500 && kurz.hinweise.some(h => /zu kurz/.test(h.text)), `höchstens ${Math.round(kurz.hoch)} ft`);
  const park = flugplan({ punkte: ['lerchenfeld', 'augsburg'].map(punktVon), hoehe: 4500, sprit: Infinity }, W);
  pruefe('Start am geparkten Flugzeug: Tank bleibt offen', park.tank === null && park.zeilen.every(z => z.tank === null));
  const wenig = flugplan({ punkte: ['lerchenfeld', 'augsburg', 'schleissheim', 'lerchenfeld'].map(punktVon), hoehe: 4500, sprit: 30 }, W);
  pruefe('zu wenig Sprit: der Tank geht im Plan unter die Reserve', wenig.zeilen.some(z => z.tank < wenig.reserve));
  pruefe('ein Punkt allein ist kein Plan', !flugplan({ punkte: ['lerchenfeld'].map(punktVon), hoehe: 4500, sprit: 60 }, W).stuecke.length);
  const wind = flugplan({ punkte: ['lerchenfeld', 'augsburg'].map(punktVon), hoehe: 4500, sprit: 60 }, WETTER.boeig);
  pruefe('Wind aus 050°: in Augsburg ist die Piste 07 in Betrieb', wind.bahnZiel === '07', 'Piste ' + wind.bahnZiel);
}

// ---------------------------------------------------------------- 3. Die Flugplatzkarten
console.log('Flugplatzkarten: alle sechs Plätze');
pruefe('sechs Karten', alleBlaetter(WETTER.ruhig).length === 6 && PLAETZE.length === 6);
pruefe('jede Frequenz gibt es nur einmal', new Set(Object.values(FREQUENZ)).size === PLAETZE.length && PLAETZE.every(P => FREQUENZ[P.id]));
for (const P of PLAETZE) {
  const B = platzBlatt(P, WETTER.seite), n = P.name;
  pruefe(`${n}: zwei Pisten, Nummern passen zum Kurs`, B.bahnen.length === 2 && B.bahnen.every(b => { const g = Math.round((b.kurs / GRAD % 360 + 360) % 360 / 10) % 36 || 36; return +b.nr === g && winkel(b.kurs, bahnKurs(P, b.ende)) < 1e-9; }), B.bahnen.map(b => `${b.nr} (${b.grad}°)`).join(', '));
  pruefe(`${n}: die Pisten zeigen in entgegengesetzte Richtungen`, nah(winkel(B.bahnen[0].kurs, B.bahnen[1].kurs), Math.PI, 1e-9) && Math.abs(+B.bahnen[0].nr - +B.bahnen[1].nr) === 18);
  pruefe(`${n}: Platzhöhe und Höhe der Platzrunde`, nah(B.meer, P.meer / FT, 1) && B.rundeHoehe - B.meer >= 1000 && B.rundeHoehe - B.meer < 1100, `${Math.round(B.meer)} ft, Runde ${B.rundeHoehe} ft`);
  pruefe(`${n}: in Betrieb ist die Piste gegen den Wind`, B.inBetrieb.gegen >= 0 && B.bahnen.filter(b => b.inBetrieb).length === 1, `Piste ${B.inBetrieb.nr}, ${B.inBetrieb.gegen.toFixed(0)} kn von vorn`);
  for (const b of B.bahnen) {
    // bahnOrt ist die Umkehrung von bahnLage (damit stimmen Karte und Spiel überein)
    const [x, z] = bahnOrt(P, b.ende, 123, -45), L = bahnLage(P, b.ende, x, z);
    pruefe(`${n} ${b.nr}: Orte auf der Karte passen zum Spiel`, nah(L.laengs, 123, 1e-6) && nah(L.quer, -45, 1e-6));
    // Die Platzrunde: links herum, rechte Winkel, endet auf der Bahn
    const R = rundeVon(P, b.ende), k = R.teile.map(t => t.kurs);
    let links = true; for (let i = 1; i < 5; i++) { let d = (k[i - 1] - k[i]) % (2 * Math.PI); if (d < 0) d += 2 * Math.PI; if (!nah(d, Math.PI / 2, 1e-6)) links = false; }
    const ende = bahnLage(P, b.ende, ...R.ecken[5]), gegen = bahnLage(P, b.ende, ...R.ecken[2]);
    pruefe(`${n} ${b.nr}: Platzrunde links herum, Endanflug in Bahnrichtung`, links && winkel(k[4], b.kurs) < 1e-6 && winkel(k[0], b.kurs) < 1e-6 && Math.abs(ende.quer) < 1 && gegen.quer < -1000, R.teile.map(t => grad3(t.kurs)).join(' → '));
  }
  pruefe(`${n}: vier Himmelsrichtungen mit sicherer Höhe über dem Gelände`, B.sektoren.length === 4 && B.sektoren.every(s => s.sicher >= s.hoch + 900) && B.sicher >= Math.max(...B.sektoren.map(s => s.hoch)));
  pruefe(`${n}: Funkfeuer und Landmarken`, B.feuer.length === 2 && B.feuer[0].nm <= B.feuer[1].nm && B.marken.length >= 2);
  pruefe(`${n}: Vorfeld liegt auf dem Platz (eben)`, Math.abs(bodenHoehe(...B.vorfeld) - P.hoehe) < 2);
}
{
  const O = platzBlatt(PLAETZE.find(p => p.id === 'ohlstadt'), WETTER.ruhig), L = platzBlatt(PLAETZE[0], WETTER.ruhig);
  pruefe('Ohlstadt am Alpenrand hat Warnungen, Lerchenfeld im Flachen nicht', O.hinweise.length > 0 && O.sicher > L.sicher + 2000 && !L.hinweise.some(h => /Gelände|Berg/.test(h)), `sicher ${O.sicher} ft gegen ${L.sicher} ft`);
  pruefe('Lerchenfeld: Anflug-Lichter nur dort', L.bahnen.some(b => b.papi) && !O.bahnen.some(b => b.papi));
}

if (laut) {
  const A = AUSFLUEGE[0], F = flugplan({ punkte: A.punkte.map(punktVon), hoehe: A.hoehe, sprit: 90 }, WETTER.seite);
  console.log(`\n${A.name} bei Seitenwind: ${F.weit.toFixed(0)} NM, ${uhr(F.zeit)} min, ${F.liter.toFixed(1)} Liter`);
  for (const Z of F.zeilen) { const d = Z.danach; console.log(`  ${uhr(Z.zeit).padStart(5)}  ${(Z.was + ' ' + (Z.name !== Z.was ? Z.name : '')).padEnd(34)} ${String(Math.round(Z.hoehe)).padStart(5)} ft  `
    + (d ? `${d.name.padEnd(28)} ${d.art === 'runde' ? '    ' : grad3(d.steuer) + '°'} ${d.lang.toFixed(1).padStart(5)} NM ${uhr(d.min).padStart(5)}` : '') + `  ${Z.verbraucht.toFixed(1).padStart(5)} l`); }
  for (const x of F.funk) console.log(`  Funk ${uhr(x.zeit).padStart(5)}  ${x.text}`);
  for (const B of alleBlaetter(WETTER.seite)) { console.log(`\n${B.name}: ${Math.round(B.meer)} ft, Platzrunde ${B.rundeHoehe} ft, ${B.ruf} ${B.frequenz}, sicher ab ${B.sicher} ft`);
    for (const b of B.bahnen) console.log(`  Piste ${b.nr} ${b.grad}° ${b.lang} × ${b.breit} m ${b.belag}${b.inBetrieb ? '  (in Betrieb)' : ''}  Runde: ${b.runde.teile.map(t => grad3(t.kurs)).join(' → ')}`);
    for (const h of B.hinweise) console.log('  Achtung: ' + h); }
}
console.log(`\n${gut} Prüfungen bestanden, ${schlecht} nicht.`);
process.exit(schlecht ? 1 : 0);
