// Flugsimulator – Prüfwerkzeug für die Flugschule:  node tools/schule.mjs  [laut] [nur=runde]
// Ein künstlicher Pilot fliegt jede der acht Lektionen. Geprüft wird, dass jede Lektion zu schaffen ist
// (alle Schritte werden erkannt, kein Bruch) und wie viele Sterne und Ermahnungen es dabei gibt.
import { neuesFlugzeug, setze, schritt, TAKT, KN } from '../js/physik.js';
import { FT } from '../js/flugzeuge.js';
import { mitHilfe } from '../js/hilfen.js';
import { bodenHoehe, platzrunde } from '../js/platz.js';
import { Flug } from '../js/flug.js';
import { STARTS } from '../js/starts.js';
import { LEKTIONEN, Unterricht, aufAsphalt } from '../js/schule.js';
import { Pilot, GRAD, wickel } from './pilot.mjs';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Im Test-Browser kann man sich die Piloten auch holen (import('/tools/schule.mjs')) und über __flugsim.pilot fliegen lassen.
const imKnoten = typeof process !== 'undefined' && !!process.argv, argumente = imKnoten ? process.argv : [];
const laut = argumente.includes('laut'), nur = (argumente.find(a => a.startsWith('nur=')) || '').slice(4);
const welt = { wind: () => [0, 0, 0], boden: bodenHoehe };
const richtungZu = (s, x, z) => Math.atan2(-(x - s.x), z - s.z);          // Kurs von hier zu einem Punkt

// ---- Bausteine für den Piloten
function amBodenLenken(p, s, f, kursSoll) { p.e.seite = clamp(2.2 * wickel(kursSoll - s.kurs) - 0.6 * f.wende, -1, 1); p.e.quer = 0; }
function mittellinie(p, s, f) { p.e.seite = clamp(0.06 * s.x - 1.6 * wickel(s.kurs) - 0.5 * f.wende, -1, 1); p.flaeche(s, 0); }
function starten(p, s, f, dt) {
  p.e.gas = 1; p.e.bremse = 0;
  if (f.amBoden) { mittellinie(p, s, f); if (f.ias > 55 * KN) p.nase(s, 8 * GRAD); else p.e.hoehe = 0; }
  else { p.e.seite = 0; p.tempoMitNase(s, 75 * KN, dt); p.kurs(s, 0, 15); }
}
// Anflug und Landung auf die Bahn 36: Nase = Tempo, Gas = Höhe über dem Gleitweg; kurz über dem Boden abfangen
function landen(p, s, f, dt, m, vSoll = 66) {
  if (m.unten) { p.e.gas = 0; p.e.bremse = f.ias < 40 * KN ? 0.7 : 0; p.e.hoehe = 0; mittellinie(p, s, f); return; }
  const soll = Math.max(0, 150 - s.z) * Math.tan(3 * GRAD);
  if (s.hg > 4) {
    p.e.seite = 0;
    p.flaeche(s, clamp(1.4 * wickel(clamp(0.012 * s.x, -0.4, 0.4) - s.spur), -20 * GRAD, 20 * GRAD));
    p.tempoMitNase(s, vSoll * KN, dt);
    const fehl = (soll - s.hg) * 0.12 - f.grund * Math.tan(3 * GRAD) - s.steig;
    m.ig = clamp((m.ig ?? 0.5) + fehl * 0.012 * dt, 0, 1); p.e.gas = clamp(m.ig + 0.05 * fehl, 0, 1);
  } else {
    p.e.gas = 0; p.nase(s, (0.5 + (4 - s.hg) * 1.6) * GRAD);
    p.e.seite = clamp(-3 * wickel(s.kurs), -1, 1); p.flaeche(s, clamp(0.08 * f.v[0] + 0.02 * s.x, -0.2, 0.2));
  }
}
const klappen = (f, n) => { f.klappenStufe = n; };

// ---- je Lektion: was der Pilot in jedem Augenblick tut. u = Unterricht (u.nr = Schritt), m = sein Merkzettel
export const PILOTEN = {
  rollen(p, s, f, dt, u, m) {
    const weg = [[-52, 420], [-45, 395], [-45, 60]];
    m.i ??= 0; if (m.i < weg.length - 1 && Math.hypot(weg[m.i][0] - s.x, weg[m.i][1] - s.z) < 7) m.i++;
    const [zx, zz] = weg[m.i], fehlt = Math.abs(wickel(richtungZu(s, zx, zz) - s.kurs)), halt = u.nr >= 4;
    const vSoll = halt ? 0 : (fehlt > 0.3 || m.i === 1 ? 5 : 11) * KN;
    amBodenLenken(p, s, f, richtungZu(s, zx, zz));
    p.e.gas = clamp(0.12 + 0.12 * (vSoll - f.ias), 0, u.nr === 0 ? 0.35 : 0.3); p.e.bremse = halt || f.ias > vSoll + 2.5 ? 0.8 : 0; if (halt) p.e.gas = 0;
  },
  geradeaus(p, s, f, dt, u) {
    p.e.gas = 0.85; p.hoeheMitNase(s, 2000 * FT, dt);
    p.kurs(s, u.nr === 1 ? -90 * GRAD : 0, 25);
  },
  steigen(p, s, f, dt, u) {
    p.kurs(s, 0, 15);
    if (u.nr === 0) { p.e.gas = 1; if (s.y < 2940 * FT) p.tempoMitNase(s, 75 * KN, dt); else p.hoeheMitNase(s, 3000 * FT, dt); }
    else if (u.nr === 1) { p.e.gas = 0.85; p.hoeheMitNase(s, 3000 * FT, dt); }
    else if (u.nr === 2 && s.y > 2130 * FT) { p.e.gas = 0.4; p.tempoMitNase(s, 95 * KN, dt); }
    else { p.e.gas = 0.85; p.hoeheMitNase(s, 2000 * FT, dt); }
  },
  abriss(p, s, f, dt, u, m) {
    p.flaeche(s, 0);
    if (u.nr === 0) { p.e.gas = 0.45; klappen(f, 2); p.hoeheMitNase(s, 3000 * FT, dt); }
    else if (u.nr === 1) { p.e.gas = 0; p.e.hoehe = Math.min(1, (p.e.hoehe > 0 ? p.e.hoehe : 0) + 0.25 * dt); }
    else if (u.nr === 2) { p.e.gas = 1; if (f.ias < 58 * KN) p.nase(s, -6 * GRAD); else p.nase(s, 5 * GRAD); }
    else { klappen(f, 0); p.e.gas = 1; p.tempoMitNase(s, 75 * KN, dt); }
  },
  start(p, s, f, dt) { starten(p, s, f, dt); },
  landung(p, s, f, dt, u, m) { if (u.z && u.z.flug.landungen > u.z.landungen0) m.unten = true; landen(p, s, f, dt, m, 67); },
  runde(p, s, f, dt, u, m) {
    m.weg ??= platzrunde(); m.i ??= 0;
    if (u.z && u.z.flug.landungen > u.z.landungen0) m.unten = true;
    if (!m.los) { starten(p, s, f, dt); if (!f.amBoden && s.hg > 60) m.los = true; return; }
    const W = m.weg;
    while (m.i < W.length - 1 && Math.hypot(W[m.i + 1].x - s.x, W[m.i + 1].z - s.z) < Math.hypot(W[m.i].x - s.x, W[m.i].z - s.z)) m.i++;
    const hier = W[m.i], vorn = W[Math.min(W.length - 1, m.i + 14)];
    if (hier.teil === 'Endanflug' && s.z > -1500 || m.unten) { klappen(f, 3); return landen(p, s, f, dt, m, 65); }
    p.e.seite = 0; p.kurs(s, richtungZu(s, vorn.x, vorn.z), 28);
    const steigt = hier.teil === 'Abflug' || hier.teil === 'Querabflug' || (hier.teil === 'Gegenanflug' && s.y < 290 && s.z > 600);
    if (steigt) { p.e.gas = 1; p.tempoMitNase(s, 76 * KN, dt); m.ig = 0.73; return; }
    const sinkt = hier.teil !== 'Gegenanflug' || s.z < 0;
    klappen(f, hier.teil === 'Queranflug' || hier.teil === 'Endanflug' ? 2 : sinkt ? 1 : 0);
    p.tempoMitNase(s, (hier.teil === 'Endanflug' ? 67 : hier.teil === 'Queranflug' ? 70 : sinkt ? 76 : 86) * KN, dt);
    const fehl = (hier.y - s.y) * 0.1 - s.steig + (vorn.y - hier.y) / 350 * f.grund;
    m.ig = clamp(m.ig + fehl * 0.012 * dt, 0, 1); p.e.gas = clamp(m.ig + 0.05 * fehl, 0, 1);
  }
};
PILOTEN.allein = PILOTEN.runde;

export { Pilot };
// ---- alle Lektionen fliegen
let schlecht = 0;
for (const l of imKnoten ? LEKTIONEN : []) {
  if (nur && l.id !== nur) continue;
  const hilfe = l.hilfeMin || 'leicht', f = neuesFlugzeug('lerche'), flug = new Flug(), u = new Unterricht(l), m = {};
  const lage = l.lage || STARTS[l.start].lage;
  setze(f, { ...lage, boden: 0 });
  const p = new Pilot(f, welt, { hilfe, verzug: 0.15 }); p.e.gas = lage.gas || 0;
  let t = 0, gras = 0;
  for (; t < 900 && !u.fertig; t += TAKT) {
    const s = p.sicht();
    PILOTEN[l.id](p, s, f, TAKT, u, m);
    schritt(f, mitHilfe(p.e, f, hilfe, TAKT), TAKT, welt);
    flug.schritt(f, TAKT); u.schritt(f, TAKT, flug);
    if (f.amBoden && !aufAsphalt(f.p[0], f.p[2])) gras += TAKT;
    for (const x of u.sagen.splice(0)) if (laut) console.log(`   ${t.toFixed(0).padStart(4)} s  [${x.art}] ${x.text}`);
    flug.meldungen.length = 0;
    if (laut && Math.round(t / TAKT) % 1200 === 0) console.log(`   ${t.toFixed(0).padStart(4)} s  Schritt ${u.nr}  x ${f.p[0].toFixed(0)} z ${f.p[2].toFixed(0)}  ${(f.ias / KN).toFixed(0)} kn  ${(f.hoeheGrund / FT).toFixed(0)} ft  Kurs ${(f.kurs / GRAD).toFixed(0)}  Gas ${f.gas.toFixed(2)}`);
  }
  const e = u.ergebnis || { geschafft: false, sterne: 0, fehler: ['Zeit abgelaufen in Schritt ' + u.nr + ': ' + u.aufgabe], zeit: t };
  const ok = e.geschafft && e.sterne >= 2;
  if (!ok) schlecht++;
  console.log(`${ok ? '  ok ' : 'FALSCH'}  ${l.name.padEnd(30)} ${'★'.repeat(e.sterne).padEnd(3)}  ${Math.round(e.zeit).toString().padStart(4)} s  ${e.note ? 'Landung ' + e.note.sterne + '★ (' + e.note.sink + ' ft/min)  ' : ''}${f.bruch ? 'BRUCH ' + f.bruch + '  ' : ''}${gras > 1 ? 'im Gras ' + gras.toFixed(0) + ' s  ' : ''}${e.fehler.length ? 'Ermahnungen: ' + e.fehler.join(' | ') : ''}`);
}
if (imKnoten) console.log(schlecht ? `\n${schlecht} Lektion(en) schafft der künstliche Pilot nicht mit zwei Sternen.` : '\nAlle Lektionen sind zu schaffen.');
if (imKnoten) process.exit(schlecht ? 1 : 0);
