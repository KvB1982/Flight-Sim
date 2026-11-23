// Flugsimulator – sucht für ein paar Flugzustände die passende Trimmung und das passende Gas:  node tools/trimm.mjs
// Die Zahlen stehen als Startwerte in js/main.js (STARTS), damit ein Flug „in der Luft“ ruhig beginnt.
import { neuesFlugzeug, setze, KN } from '../js/physik.js';
import { Pilot, ruhig, GRAD } from './pilot.mjs';
function suche(name, kn, klappen, bahnGrad, gasFest) {
  const f = neuesFlugzeug('lerche'); setze(f, { hoehe: 600, tempo: kn * KN, klappen, bahn: bahnGrad * GRAD, gas: gasFest ?? 0.5 });
  const p = new Pilot(f, ruhig, { hilfe: 'echt' }); let ig = gasFest ?? 0.5;
  p.flieg(150, (s, dt) => {
    p.tempoMitNase(s, kn * KN, dt); p.flaeche(s, 0); p.e.seite = Math.max(-1, Math.min(1, 2.2 * f.schiebe));
    if (gasFest === undefined) { ig = Math.max(0, Math.min(1, ig + (kn * KN * Math.sin(bahnGrad * GRAD) - s.steig) * 0.02 * dt)); } p.e.gas = ig;
    f.trimm = Math.max(-1, Math.min(1, f.trimm + p.e.hoehe * 1.2 * dt));
  });
  console.log(`${name.padEnd(34)} trimm ${f.trimm.toFixed(2)}  gas ${ig.toFixed(2)}  nick ${(f.nick / GRAD).toFixed(1)}°  steig ${(f.steig / 0.3048 * 60).toFixed(0)} ft/min  ${(f.ias / KN).toFixed(0)} kn`);
}
suche('Steigflug 74 kn Vollgas', 74, 0, 4, 1);
suche('Reiseflug 105 kn', 105, 0, 0);
suche('Gegenanflug 85 kn', 85, 0, 0);
suche('Anflug 70 kn Klappen 20, 3°', 70, 2, -3);
suche('Anflug 65 kn Klappen 30, 3°', 65, 3, -3);
