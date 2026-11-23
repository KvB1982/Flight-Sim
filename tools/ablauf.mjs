// Prüft den ganzen Flug von Parkposition zu Parkposition (Stufe 3): node tools/ablauf.mjs   (mit `laut` mehr Ausgabe)
// Ein künstlicher Pilot macht den Außencheck zu Fuß, stellt die Schalter, lässt an, rollt, fliegt eine Platzrunde,
// rollt zurück, stellt ab und schreibt das Flugbuch – einmal ganz selbst, einmal „Mit Hilfe“. Danach wird geprüft,
// ob Vergessenes wirklich Folgen hat (Hülle, Klemme, Keile, leerer Tank, Vereisung, Batterie).
import { neuesFlugzeug, setze, schritt, TAKT, KN } from '../js/physik.js';
import { FT } from '../js/flugzeuge.js';
import { mitHilfe } from '../js/hilfen.js';
import { bodenHoehe, PLATZ } from '../js/platz.js';
import { Flug } from '../js/flug.js';
import { STARTS } from '../js/starts.js';
import { LEKTIONEN, Unterricht } from '../js/schule.js';
import { neueSysteme, schalte, anlassen, sysSchritt, sysRuder, liter } from '../js/systeme.js';
import { Ablauf, PHASEN, schreibeBuch, ladeBuch, ladeZustand } from '../js/checklisten.js';
import { STELLEN, Geher, weltOrt } from '../js/rundgang.js';
import { PILOTEN, Pilot, amBodenLenken, richtungZu } from './schule.mjs';
import { wickel, GRAD } from './pilot.mjs';

const laut = process.argv.includes('laut'), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const welt = { wind: () => [0, 0, 0], boden: bodenHoehe };
let schlecht = 0;
const pruefe = (name, ok, mehr = '') => { if (!ok) schlecht++; console.log(`${ok ? '  ok ' : 'FALSCH'}  ${name}${mehr ? '   ' + mehr : ''}`); };
// ein Speicher wie localStorage, nur im Kopf
const neuerSpeicher = () => { const d = {}; return { getItem: k => d[k] ?? null, setItem: (k, v) => { d[k] = String(v); } }; };

// Ein geparktes Flugzeug mit Systemen. zufall = 0.5: kein loser Deckel, genug Öl
function geparkt(zustand = {}, zufall = () => 0.5) {
  const f = neuesFlugzeug('lerche', { sprit: zustand.sprit ?? 20 });
  setze(f, { ...STARTS.vorfeld.lage, boden: 0 }); f.motorAn = false; f.sys = neueSysteme(zustand, zufall);
  return f;
}
// ein Physik-Schritt mit allem, was dazugehört
function tick(f, p, flug, ablauf, hilfe = 'leicht') {
  schritt(f, sysRuder(mitHilfe(p.e, f, hilfe, TAKT), f), TAKT, welt);
  sysSchritt(f, p.e, TAKT);
  if (flug) flug.schritt(f, TAKT);
  if (ablauf) ablauf.schritt(f, TAKT, flug, p.e);
  for (const m of f.sys.meldungen.splice(0)) if (laut) console.log('      [' + m.art + '] ' + m.text);
  if (ablauf) for (const m of ablauf.meldungen.splice(0)) if (laut) console.log('      [' + m.art + '] ' + m.text);
  if (flug) flug.meldungen.length = 0;
}
const warte = (f, p, flug, ablauf, sek, bis) => { for (let t = 0; t < sek; t += TAKT) { tick(f, p, flug, ablauf); if (bis && bis()) return true; } return !bis; };
// am Boden einen Weg aus Punkten abrollen und am letzten anhalten
function rolle(f, p, flug, ablauf, weg) {
  let i = 0;
  for (let t = 0; t < 400; t += TAKT) {
    const s = p.sicht(), [zx, zz] = weg[i], d = Math.hypot(zx - s.x, zz - s.z), letzter = i === weg.length - 1;
    if (d < (letzter ? 4 : 8)) { if (letzter) break; i++; continue; }
    const fehlt = Math.abs(wickel(richtungZu(s, zx, zz) - s.kurs)), vSoll = (fehlt > 0.3 || d < 25 ? 5 : 11) * KN;
    amBodenLenken(p, s, f, richtungZu(s, zx, zz));
    p.e.gas = clamp(0.12 + 0.12 * (vSoll - f.ias), 0, 0.3); p.e.bremse = f.ias > vSoll + 2.5 ? 0.8 : 0;
    tick(f, p, flug, ablauf);
  }
  p.e.gas = 0; p.e.bremse = 1; p.e.seite = 0;
  warte(f, p, flug, ablauf, 8, () => Math.hypot(f.v[0], f.v[2]) < 0.2); p.e.bremse = 0;
}

// ---------------------------------------------------------------- der ganze Flug
function ganzerFlug(modus) {
  const speicher = neuerSpeicher(), f = geparkt(ladeZustand(speicher), () => 0.1);       // 0.1: ein Tankdeckel ist lose und es fehlt Öl
  const flug = new Flug(), ablauf = new Ablauf(modus), p = new Pilot(f, welt, { hilfe: 'leicht', verzug: 0.15 }), s = f.sys;
  const selbst = modus !== 'hilfe';
  // 1. Außencheck: zu Fuß zu jeder Stelle gehen und alles tun, was dort geht
  const g = new Geher(f); let gelaufen = 0;
  warte(f, p, flug, ablauf, 1);
  const geheZu = ort => {
    const [zx, zz] = weltOrt(f, ort);
    for (let t = 0; t < 40 && Math.hypot(zx - g.x, zz - g.z) > 0.5; t += 1 / 60) {
      const dreh = wickel(Math.atan2(-(zx - g.x), zz - g.z) - g.kurs);
      g.schritt(f, Math.abs(dreh) < 0.6 ? 1 : 0.2, clamp(dreh * 3, -1, 1), 1 / 60); gelaufen += 1 / 60;
      if (Math.round(t * 60) % 2 === 0) tick(f, p, flug, ablauf);
    }
  };
  for (const st of STELLEN) {
    if (st.id === 'heck') { geheZu([-3, -4]); geheZu([-1.5, -6.8]); }        // hinten um das Leitwerk herum, nicht durch den Rumpf
    geheZu(st.ort);
    if (g.nah(f) !== st) { pruefe(`${modus}: Stelle „${st.name}“ zu Fuß erreicht`, false); continue; }
    if (st.id === 'tuer' && !selbst) warte(f, p, flug, ablauf, 40, () => PHASEN[0].punkte.every(x => x.ok(f, s)));
    for (let n = 0; n < 6; n++) { const a = st.tun(f, s).find(x => !x.fertig && !/ganz voll/.test(x.text)); if (!a || (!selbst && st.id !== 'tuer')) break; a.tu(); if (st.id === 'tuer') break; }
  }
  tick(f, p, flug, ablauf);
  pruefe(`${modus}: Außencheck zu Fuß, eingestiegen`, s.drin && ablauf.phase.id === 'vorAnlassen', `${gelaufen.toFixed(0)} s gelaufen, ${liter(f)} Liter im Tank`);
  // 2. Schalter und Anlassen
  if (selbst) { for (const pk of PHASEN[1].punkte) pk.tu(f, s, p.e); tick(f, p, flug, ablauf); p.e.gas = 0.1; warte(f, p, flug, ablauf, 1); schalte(f, 'zuend', true); anlassen(f); }
  pruefe(`${modus}: Motor läuft, Checkliste „Vor dem Start“`, warte(f, p, flug, ablauf, 60, () => ablauf.phase.id === 'vorStart'), `nach ${ablauf.t.toFixed(0)} s`);
  // 3. Rollen zur Bahn, Ruder-Probe, Motor-Probe
  if (selbst) schalte(f, 'park', false); else warte(f, p, flug, ablauf, 5, () => !s.park);
  rolle(f, p, flug, ablauf, [[-52, 420], [-45, 395], [-45, 55], [-25, 28], [0, 45], [0, 70]]);
  pruefe(`${modus}: zur Bahn gerollt`, Math.abs(f.p[0]) < 6 && f.p[2] < 120 && Math.abs(wickel(f.kurs)) < 0.3, `x ${f.p[0].toFixed(1)} z ${f.p[2].toFixed(0)} Kurs ${(f.kurs / GRAD).toFixed(0)}`);
  if (selbst) {
    for (const [h, q] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) { p.e.hoehe = h; p.e.quer = q; warte(f, p, flug, ablauf, 0.6); }
    p.e.bremse = 1; p.e.gas = 0.55; warte(f, p, flug, ablauf, 5, () => s.motorProbe); p.e.gas = 0; warte(f, p, flug, ablauf, 1.5);
    f.trimm = -0.3; schalte(f, 'lande', true);
  } else warte(f, p, flug, ablauf, 30, () => ablauf.liste(f).every(x => x.ok));
  pruefe(`${modus}: „Vor dem Start“ vollständig`, ablauf.liste(f).every(x => x.ok), ablauf.liste(f).filter(x => !x.ok).map(x => x.text).join(', '));
  // 4. die Platzrunde: Der Pilot der Lektion 7 fliegt, der Unterricht läuft nur mit, damit er weiß, wo er ist
  const l = LEKTIONEN.find(x => x.id === 'runde'), u = new Unterricht(l), m = {};
  for (let t = 0; t < 600 && !u.fertig; t += TAKT) {
    PILOTEN.runde(p, p.sicht(), f, TAKT, u, m);
    if (selbst) { if (ablauf.phase.id === 'landung' && !s.vorwaerm) schalte(f, 'vorwaerm', true); }
    tick(f, p, flug, ablauf); u.schritt(f, TAKT, flug);
  }
  pruefe(`${modus}: Platzrunde geflogen und gelandet`, !!u.ergebnis && u.ergebnis.geschafft && !f.bruch, flug.note ? `Landung ${flug.note.sterne}★, ${f.bruch || ''}` : 'keine Landung ' + (f.bruch || ''));
  // 5. zurück zum Vorfeld
  if (selbst) { f.klappenStufe = 0; schalte(f, 'vorwaerm', false); schalte(f, 'lande', false); }
  rolle(f, p, flug, ablauf, [[0, 930], [-22, 968], [-45, 940], [-45, 445], [-70, 420], [-95, 420]]);
  warte(f, p, flug, ablauf, 30, () => ablauf.phase.id === 'abstellen');
  pruefe(`${modus}: am Vorfeld, Checkliste „Abstellen“`, ablauf.phase.id === 'abstellen' && Math.hypot(f.p[0] - PLATZ.vorfeld.x, f.p[2] - PLATZ.vorfeld.z) < 30, `x ${f.p[0].toFixed(0)} z ${f.p[2].toFixed(0)}`);
  // 6. Abstellen und Flugbuch
  if (selbst) for (const pk of PHASEN[7].punkte) { pk.tu(f, s, p.e); warte(f, p, flug, ablauf, 1); }
  else warte(f, p, flug, ablauf, 60, () => ablauf.liste(f).every(x => x.ok));
  pruefe(`${modus}: Flugbuch darf geschrieben werden`, ablauf.kannEnden(f));
  const e = ablauf.ende(f, flug); schreibeBuch(speicher, e, f);
  pruefe(`${modus}: Flugbuch – Regeln 5 Sterne, nichts vergessen`, e.regeln === 5 && !e.vergessen.length && e.amPlatz, `${e.gezaehlt ?? ablauf.gezaehlt} Punkte, Dauer ${Math.round(e.dauer / 60)} min, Flugzeit ${Math.round(e.flugZeit / 60)} min, vergessen: ${e.vergessen.map(x => x.text).join(' | ') || 'nichts'}`);
  pruefe(`${modus}: Eintrag gespeichert, Rest-Benzin gemerkt`, ladeBuch(speicher).length === 1 && Math.abs(ladeZustand(speicher).sprit - f.sprit) < 0.1 && !ladeZustand(speicher).batterieLeer, `${liter(f)} Liter übrig`);
}
console.log('Der ganze Flug, alles selbst:'); ganzerFlug('selbst');
console.log('Der ganze Flug, mit Hilfe (das Spiel stellt die Schalter):'); ganzerFlug('hilfe');

// ---------------------------------------------------------------- Vergessenes hat Folgen
console.log('Was passiert, wenn man etwas vergisst:');
// fertig zum Rollen: alles erledigt bis auf das, was `ausser` nennt
function startklar(ausser = {}, sprit = 60) {
  const f = geparkt({ sprit }), s = f.sys, p = new Pilot(f, welt, { hilfe: 'leicht' });
  Object.assign(s, { klemme: false, gurte: true, park: false, hahn: true, gemisch: true, haupt: true, zuend: true, keile: false, huelle: false, drin: true }, ausser);
  f.motorAn = true; setze(f, { ...STARTS.bahn.lage, boden: 0 }); f.motorAn = true;
  return { f, s, p };
}
{ const { f, s, p } = startklar({ huelle: true }); p.e.gas = 1; warte(f, p, null, null, 12);
  pruefe('Staurohr-Hülle vergessen: Fahrtmesser zeigt nichts', f.ias > 30 * KN && f.iasZeigt === 0 && s.huelleGemeldet, `echt ${(f.ias / KN).toFixed(0)} kn, Anzeige ${f.iasZeigt}`); }
{ const { f, p } = startklar({ klemme: true }); p.e.gas = 1; p.e.hoehe = 1; warte(f, p, null, null, 25);
  pruefe('Ruderklemme vergessen: Höhenruder bewegt sich nicht', Math.abs(f.ruder.hoehe) < 0.01, `Ruder ${f.ruder.hoehe.toFixed(2)}, ${(f.hoeheGrund / FT).toFixed(0)} ft`); }
{ const { f, p } = startklar({ keile: true }); p.e.gas = 1; warte(f, p, null, null, 8);
  pruefe('Bremskeile vergessen: Das Flugzeug rollt nicht los', Math.hypot(f.v[0], f.v[2]) < 1 && f.p[2] < 45, `${Math.hypot(f.v[0], f.v[2]).toFixed(2)} m/s`); }
{ const { f, s, p } = startklar({}, 0.5); const flug = new Flug(), l = LEKTIONEN.find(x => x.id === 'start'), u = new Unterricht(l); let hoch = 0;
  for (let t = 0; t < 120 && f.motorAn; t += TAKT) { PILOTEN.start(p, p.sicht(), f, TAKT, u, {}); tick(f, p, flug, null); hoch = Math.max(hoch, f.hoeheGrund); }
  pruefe('Mit fast leerem Tank gestartet: Der Motor geht in der Luft aus', !f.motorAn && f.sprit === 0 && hoch > 30, `nach ${f.t.toFixed(0)} s in ${(hoch / FT).toFixed(0)} ft`); }
{ const { f, s, p } = startklar(); setze(f, { ...STARTS.runde.lage, boden: 0 }); f.motorAn = true; p.e.gas = 0.3;
  for (let t = 0; t < 70; t += TAKT) { p.tempoMitNase(p.sicht(), 75 * KN, TAKT); p.kurs(p.sicht(), Math.PI); tick(f, p, null, null); }
  const kraft = f.motorKraft; schalte(f, 'vorwaerm', true); warte(f, p, null, null, 10);
  pruefe('Wenig Gas ohne Vorwärmung: Der Vergaser vereist, mit Vorwärmung taut er auf', kraft < 0.75 && s.eis < 0.05 && f.motorKraft > 0.9, `Kraft ${kraft.toFixed(2)} → ${f.motorKraft.toFixed(2)}`); }
{ const speicher = neuerSpeicher(), { f, s } = startklar(); f.motorAn = false; s.haupt = true;
  schreibeBuch(speicher, { datum: 'x' }, f);
  const g = geparkt(ladeZustand(speicher)); g.sys.haupt = true; const text = anlassen(g);
  STELLEN.find(x => x.id === 'nase').tun(g, g.sys).find(x => /Batterie/.test(x.text)).tu();
  pruefe('Hauptschalter angelassen: Beim nächsten Flug ist die Batterie leer, der Mechaniker lädt sie', !!text && /Batterie/.test(text) && g.sys.batterie === 1 && anlassen(g) === null, text); }
{ const f = geparkt({ sprit: 60 }), p = new Pilot(f, welt); Object.assign(f.sys, { haupt: true, zuend: true, hahn: true, gemisch: false }); anlassen(f); warte(f, p, null, null, 3);
  const ohne = f.motorAn; f.sys.gemisch = true; anlassen(f); warte(f, p, null, null, 3);
  pruefe('Gemisch abgestellt: Der Motor springt nicht an, mit Gemisch reich schon', !ohne && f.motorAn); }

console.log(schlecht ? `\n${schlecht} Prüfung(en) falsch.` : '\nDer ganze Flug klappt, und Vergessenes hat Folgen.');
process.exit(schlecht ? 1 : 0);
