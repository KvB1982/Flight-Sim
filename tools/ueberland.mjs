// Prüft den Überlandflug (Stufe 4):  node tools/ueberland.mjs   (mit `laut` mehr Ausgabe, mit `nur=dreieck` nur einen Flug)
// 1. Die Gegend: alle sechs Plätze liegen flach, An- und Abflug sind frei von Bergen.
// 2. Der Flugplaner: Kurs, Vorhaltewinkel, Zeit, Sprit, Mindesthöhe.
// 3. Ein künstlicher Pilot fliegt geplante Strecken von Platz zu Platz – mit Funk, Zeitraffer und Landung am Ziel.
// 4. Fehler haben Folgen: nicht gefunkt, falsche Bahn, zu wenig Sprit geplant.
import { neuesFlugzeug, setze, schritt, TAKT, KN } from '../js/physik.js';
import { FT } from '../js/flugzeuge.js';
import { mitHilfe } from '../js/hilfen.js';
import { neueLuft, WETTER } from '../js/atmosphaere.js';
import { Flug } from '../js/flug.js';
import { PLAETZE, platzVon, platzWelt, platzLokal, bahnLage, bahnKurs, bodenHoehe, bodenArt, NN, NM, GIPFEL, ORTE } from '../js/region.js';
import { rechne, punktVon, AUSFLUEGE, kursVon, feuerAnzeige, FEUER, REISE } from '../js/navigation.js';
import { Reise, LITER, RAFFER } from '../js/ueberland.js';
import { Funk } from '../js/funk.js';
import { neueSysteme, sysSchritt, sysRuder, liter } from '../js/systeme.js';
import { Ablauf, schreibeBuch, ladeZustand } from '../js/checklisten.js';
import { Pilot, GRAD, wickel } from './pilot.mjs';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const imKnoten = typeof process !== 'undefined' && !!process.argv && /ueberland\.mjs$/.test(process.argv[1] || ''), argumente = imKnoten ? process.argv : [];
const laut = argumente.includes('laut'), nur = (argumente.find(a => a.startsWith('nur=')) || '').slice(4);
let schlecht = 0;
const pruefe = (name, ok, mehr = '') => { if (!ok) schlecht++; console.log(`${ok ? '  ok ' : 'FALSCH'}  ${name}${mehr ? '   ' + mehr : ''}`); };

// Wind wie im Spiel: Die Höhe für den Wind zählt ab dem Boden darunter
export const weltMit = luft => ({ wind: (p, t) => luft.wind([p[0], p[1] - bodenHoehe(p[0], p[2]), p[2]], t), boden: bodenHoehe });
// Ein Würfel, der immer dieselben Zahlen wirft (damit das Werkzeug jedes Mal dasselbe prüft)
export const wuerfel = saat => () => { saat = (saat * 1664525 + 1013904223) % 4294967296; return saat / 4294967296; };
export const planAus = (ids, hoehe, sprit = 90) => ({ punkte: ids.map(punktVon), hoehe, sprit });

// ---------------------------------------------------------------- Der künstliche Überland-Pilot
// m = sein Merkzettel. opt: funk (false = er funkt nie), falscheBahn (landet mit dem Wind), raffer (benutzt den Zeitraffer)
export function reisePilot(p, s, f, dt, R, m, opt = {}) {
  m.phase ??= 'start';
  const Z = R.ziel, ende = opt.falscheBahn ? 1 - R.endeZiel : R.endeZiel, yReise = R.plan.hoehe * FT - NN;
  const zu = (x, z, grenze = 25) => p.kurs(s, kursVon(s.x, s.z, x, z) + clamp(wickel(s.kurs - f.spur), -0.35, 0.35), grenze);
  // Funk: nach zwei Sekunden die richtige Antwort wählen
  if (R.funk.frage && opt.funk !== false) { m.funkT = (m.funkT || 0) + dt; if (m.funkT > 2) { m.funkT = 0; R.funk.waehle(R.funk.frage.antworten.findIndex(a => a.richtig)); } }
  p.e.bremse = 0; p.e.seite = 0;
  if (m.phase === 'start') {
    const S = R.start, bk = bahnKurs(S, R.endeStart), L = bahnLage(S, R.endeStart, s.x, s.z);
    // erst funken, dann starten
    if (f.amBoden && opt.funk !== false && R.funk.nr === 0) { p.e.gas = 0; p.e.bremse = 1; return; }
    p.e.gas = 1;
    if (f.amBoden) { p.e.seite = clamp(0.06 * -L.quer - 1.6 * wickel(s.kurs - bk) - 0.5 * f.wende, -1, 1); p.flaeche(s, 0); if (f.ias > 55 * KN) p.nase(s, 8 * GRAD); else p.e.hoehe = 0; }
    else { p.tempoMitNase(s, 75 * KN, dt); p.kurs(s, bk, 15); if (s.y - S.hoehe > 150) m.phase = 'reise'; }
    return;
  }
  if (m.phase === 'reise') {
    // auf der Linie zum nächsten Wegpunkt bleiben: auf einen Punkt 2,5 km voraus auf der Linie zielen
    // (opt.daneben: Er fliegt mit Absicht so viele Meter rechts neben der Linie – für die Prüfung des Navigations-Sterns)
    const L = R.navi.lage(f), vor = clamp(L.entlang + 2500, 0, L.lang), ab = R.navi.letztes && L.weit > 11000 ? opt.daneben || 0 : 0;
    zu(L.von.x - Math.sin(L.kurs) * vor - Math.cos(L.kurs) * ab, L.von.z + Math.cos(L.kurs) * vor - Math.sin(L.kurs) * ab);
    if (s.y < yReise - 40) { p.e.gas = 1; p.tempoMitNase(s, 80 * KN, dt); }
    else { p.hoeheMitNase(s, yReise, dt); m.ig = clamp((m.ig ?? 0.7) + (REISE.tempo * KN - s.ias) * 0.004 * dt, 0.4, 1); p.e.gas = clamp(m.ig + 0.03 * (REISE.tempo * KN - s.ias), 0.3, 1); }
    if (R.raffer) { p.e.hoehe = 0; p.e.quer = 0; }                // im Zeitraffer fliegt das Spiel: Hände weg vom Knüppel
    // Zeitraffer in der Mitte eines Beins
    if (opt.raffer && !R.raffer && L.entlang > 6000 && L.weit > 9000 && Math.abs(L.ablage) < 500 && Math.abs(s.y - yReise) < 40 && Math.abs(s.roll) < 0.1 && !m.rafferAus) { p.e.hoehe = 0; p.e.quer = 0; if (R.rafferAn(f)) m.raffer = (m.raffer || 0) + 1; }
    if (R.navi.letztes && L.weit < 13000) {
      // Anflug vorbereiten: ein Punkt 4 km vor der Bahn; kommt man von der falschen Seite, erst seitlich daneben
      const A = platzWelt(Z, 0, ende ? Z.lang + 4000 : -4000), bk = bahnKurs(Z, ende), LL = bahnLage(Z, ende, s.x, s.z);
      m.weg = [A]; if (LL.laengs > -2500) { const seite = LL.quer >= 0 ? -1 : 1, [bx, bz] = platzWelt(Z, seite * 2600 * (ende ? -1 : 1), ende ? Z.lang + 4000 : -4000);
        m.weg.unshift([bx, bz]); if (LL.laengs > 0) { const [cx, cz] = platzWelt(Z, seite * 2600 * (ende ? -1 : 1), ende ? Z.lang - 1500 : 1500); m.weg.unshift([cx, cz]); } }
      m.phase = 'anflug'; m.bk = bk;
    }
    return;
  }
  if (m.phase === 'anflug') {
    const [zx, zz] = m.weg[0];
    zu(zx, zz, 28); p.hoeheMitNase(s, Z.hoehe + 300, dt); p.e.gas = clamp(0.5 + 0.03 * (85 * KN - s.ias), 0.15, 1);
    const LL = bahnLage(Z, ende, s.x, s.z);
    if (Math.hypot(zx - s.x, zz - s.z) < (m.weg.length > 1 ? 700 : 900)) m.weg.shift();
    if (!m.weg.length || (m.weg.length === 1 && LL.laengs < -2200 && LL.laengs > -4600 && Math.abs(LL.quer) < 250 && Math.abs(wickel(s.kurs - m.bk)) < 0.5)) { m.phase = 'final'; f.klappenStufe = 2; }
    return;
  }
  // Endanflug und Landung
  const bk = m.bk, L = bahnLage(Z, ende, s.x, s.z), links = -L.quer, vLinks = f.v[0] * Math.cos(bk) + f.v[2] * Math.sin(bk);
  if (f.amBoden && L.laengs > 0) m.unten = true;
  if (m.unten) { p.e.gas = 0; p.e.bremse = f.ias < 40 * KN ? 0.7 : 0; p.e.hoehe = 0; p.e.seite = clamp(0.06 * links - 1.6 * wickel(s.kurs - bk) - 0.5 * f.wende, -1, 1); p.flaeche(s, 0); return; }
  const hg = s.y - Z.hoehe - 1.1, soll = Math.max(0, Z.zielpunkt - L.laengs) * Math.tan(3 * GRAD);
  if (hg > 4) {
    p.flaeche(s, clamp(1.4 * wickel(bk + clamp(0.012 * links, -0.4, 0.4) - f.spur), -20 * GRAD, 20 * GRAD));
    p.tempoMitNase(s, 66 * KN, dt);
    const fehl = (soll - hg) * 0.12 - f.grund * Math.tan(3 * GRAD) - s.steig;
    m.ig2 = clamp((m.ig2 ?? 0.5) + fehl * 0.012 * dt, 0, 1); p.e.gas = clamp(m.ig2 + 0.05 * fehl, 0, 1);
  } else {
    p.e.gas = 0; p.nase(s, (0.5 + (4 - hg) * 1.6) * GRAD);
    p.e.seite = clamp(-3 * wickel(s.kurs - bk), -1, 1); p.flaeche(s, clamp(0.08 * vLinks + 0.02 * links, -0.2, 0.2));
  }
}

// Einen ganzen Flug rechnen. Gibt Reise, Flugzeug und Ergebnis zurück.
export function fliege(plan, wetterName = 'ruhig', opt = {}) {
  const wetter = WETTER[wetterName], luft = neueLuft(wetter), welt = weltMit(luft), R = new Reise(plan, wetter, { zufall: wuerfel(7), navi: opt.navi }), flug = new Flug();
  const f = neuesFlugzeug('lerche', { sprit: plan.sprit * LITER }); setze(f, R.startLage()); f.nn = NN;             // wie im Spiel: Die Luft ist so dünn wie in echter Höhe über dem Meer
  const p = new Pilot(f, welt, { hilfe: 'mittel', verzug: 0.15 }), m = {}, log = [];
  let rafferZeit = 0, rafferKurs = 0, rafferHoehe = 0, tLog = 0;
  for (let t = 0; t < 3 * 3600 && !R.fertig; t += TAKT) {
    const s = p.sicht();
    reisePilot(p, s, f, TAKT, R, m, opt);
    const war = R.raffer, soll = R.soll && { ...R.soll };
    schritt(f, mitHilfe(R.steuer(f, p.e, TAKT), f, 'mittel', TAKT), TAKT, welt);
    flug.schritt(f, TAKT); R.schritt(f, TAKT, flug);
    if (war && soll) { rafferZeit += TAKT; rafferKurs = Math.max(rafferKurs, Math.abs(wickel(f.kurs - soll.kurs)) / GRAD); rafferHoehe = Math.max(rafferHoehe, Math.abs(f.p[1] - soll.y) / FT); }
    for (const x of R.meldungen.splice(0)) log.push(`${Math.round(t)} s  ${x.text}`);
    for (const x of R.funk.sagen.splice(0)) log.push(`${Math.round(t)} s  ${x.wer}: ${x.text}`);
    for (const x of flug.meldungen.splice(0)) log.push(`${Math.round(t)} s  ${x.text}`);
    if (laut && (tLog -= TAKT) <= 0) { tLog = 60;
      log.push(`${Math.round(t)} s  ${m.phase}  ${Math.round(f.ias / KN)} kn  ${Math.round((f.p[1] + NN) / FT)} ft  Kurs ${Math.round(f.kurs / GRAD)}  → ${R.navi.ziel.name} ${(R.navi.lage(f).weit / NM).toFixed(1)} NM  ab ${Math.round(R.navi.lage(f).ablage)} m`); }
  }
  return { R, f, m, log, e: R.ergebnis(f), rafferZeit, rafferKurs, rafferHoehe };
}

// Der künstliche Pilot für den ganzen Überlandflug (die Checklisten macht das Spiel im Modus „Mit Hilfe“):
// m.teil = aussen (wartet, bis der Außencheck fertig ist, steigt ein) → cockpit → rollen → probe → flug → zurueck → abstellen → ende
export function ganzPilot(p, s, f, dt, R, ablauf, m) {
  m.teil ??= 'aussen'; m.liter0 ??= liter(f);
  const S = R.start, Z = R.ziel, fertigListe = () => ablauf.liste(f).every(x => x.ok), tempo = Math.hypot(f.v[0], f.v[2]);
  // am Boden einen Weg aus Punkten abrollen; gibt true zurück, wenn der letzte Punkt erreicht ist
  const rolle = () => {
    const [zx, zz] = m.rollweg[0], d = Math.hypot(zx - s.x, zz - s.z), letzter = m.rollweg.length === 1;
    if (d < (letzter ? 4 : 8)) { m.rollweg.shift(); return !m.rollweg.length; }
    const hin = kursVon(s.x, s.z, zx, zz), fehlt = Math.abs(wickel(hin - s.kurs)), vSoll = (fehlt > 0.3 || d < 25 ? 5 : 11) * KN;
    p.e.seite = clamp(2.2 * wickel(hin - s.kurs) - 0.6 * f.wende, -1, 1); p.e.quer = 0; p.e.hoehe = 0;
    p.e.gas = clamp(0.12 + 0.12 * (vSoll - f.ias), 0, 0.3); p.e.bremse = f.ias > vSoll + 2.5 ? 0.8 : 0;
    return false;
  };
  const halt = teil => { p.e.gas = 0; p.e.bremse = 1; p.e.seite = 0; m.teil = teil; };
  if (m.teil === 'aussen') { if (fertigListe()) { m.getankt = liter(f) - m.liter0; f.sys.drin = true; m.teil = 'cockpit'; } }
  else if (m.teil === 'cockpit') {
    if (ablauf.phase.id === 'vorStart' && !f.sys.park) {
      const e = R.endeStart, L = S.lang, V = S.vorfeld, lz = z => e ? L - z : z;
      m.rollweg = [[-52, V.z], [-45, V.z + (e ? 25 : -25)], [-45, lz(55)], [-25, lz(28)], [0, lz(45)], [0, lz(70)]].map(([x, z]) => platzWelt(S, x, z)); m.teil = 'rollen';
    }
  } else if (m.teil === 'rollen') { if (rolle()) halt('probe'); }
  else if (m.teil === 'probe') { if (fertigListe() && tempo < 0.3) m.teil = 'flug'; }
  else if (m.teil === 'flug') {
    reisePilot(p, s, f, dt, R, m, {});
    if (m.unten && tempo < 6) {
      const e = R.landeBahn ?? R.endeZiel, [, z0] = platzLokal(Z, f.p[0], f.p[2]), d = e ? -1 : 1, V = Z.vorfeld;
      m.rollweg = [[-25, z0 + d * 30], [-45, z0 + d * 60], [-45, V.z + (z0 + d * 60 > V.z ? 25 : -25)], [-70, V.z], [-95, V.z]].map(([x, z]) => platzWelt(Z, x, z)); m.teil = 'zurueck';
    }
  } else if (m.teil === 'zurueck') { if (rolle()) halt('abstellen'); }
  else if (m.teil === 'abstellen') { if (ablauf.phase.id === 'abstellen' && fertigListe() && ablauf.kannEnden(f)) m.teil = 'ende'; }
}
// Der ganze Überlandflug: geparkt am Startplatz, Außencheck, tanken, Checklisten (das Spiel hilft: Modus „Mit Hilfe“),
// zur Bahn rollen, fliegen, am Ziel zum Vorfeld rollen, abstellen, Flugbuch. Der Tank ist am Anfang fast leer (14 kg, knapp 20 Liter).
export function fliegeGanz(plan, wetterName = 'ruhig') {
  const wetter = WETTER[wetterName], welt = weltMit(neueLuft(wetter)), R = new Reise(plan, wetter, { zufall: wuerfel(7), ganz: true }), flug = new Flug();
  const daten = {}, speicher = { getItem: k => daten[k] ?? null, setItem: (k, v) => { daten[k] = v; } };
  const f = neuesFlugzeug('lerche', { sprit: 14 }); setze(f, R.startLage()); f.nn = NN; f.trimm = -0.35; f.motorAn = false;
  f.sys = neueSysteme({}, wuerfel(5)); f.sys.spritSoll = Math.ceil(R.rechnung.noetig);
  const ablauf = new Ablauf('hilfe'), p = new Pilot(f, welt, { hilfe: 'mittel', verzug: 0.15 }), m = {}, log = [], S = R.start, Z = R.ziel, start = { ...f.sys, liter: liter(f) };
  ablauf.ueberland = true;
  let t = 0; m.liter0 = start.liter;
  for (; t < 3 * 3600 && m.teil !== 'ende' && !f.bruch; t += TAKT) {
    ganzPilot(p, p.sicht(), f, TAKT, R, ablauf, m);
    schritt(f, sysRuder(mitHilfe(R.steuer(f, p.e, TAKT), f, 'mittel', TAKT), f), TAKT, welt); sysSchritt(f, p.e, TAKT);
    flug.schritt(f, TAKT); ablauf.schritt(f, TAKT, flug, p.e); R.schritt(f, TAKT, flug);
    ablauf.zielNah = R.navi.letztes && Math.hypot(f.p[0] - Z.mx, f.p[2] - Z.mz) < 14000;
    for (const x of [...f.sys.meldungen.splice(0), ...ablauf.meldungen.splice(0), ...R.meldungen.splice(0), ...flug.meldungen.splice(0)]) log.push(`${Math.round(t)} s  [${m.teil}] ${x.text}`);
    for (const x of R.funk.sagen.splice(0)) log.push(`${Math.round(t)} s  ${x.wer}: ${x.text}`);
  }
  const e = R.ergebnis(f), b = m.teil === 'ende' ? ablauf.ende(f, flug) : null;
  if (b) schreibeBuch(speicher, { ...b, ueberland: e.sterne }, f);
  return { R, f, e, b, log, teil: m.teil, start, getankt: m.getankt, zustand: ladeZustand(speicher), t };
}

if (imKnoten) {
  // ---------------------------------------------------------------- 1. Die Gegend
  if (!nur) {
    console.log('Die Gegend');
    for (const P of PLAETZE) {
      let uneben = 0; for (let lz = -100; lz <= P.lang + 100; lz += 50) for (const lx of [-120, 0, 120]) { const [x, z] = platzWelt(P, lx, lz); uneben = Math.max(uneben, Math.abs(bodenHoehe(x, z) - P.hoehe)); }
      // An- und Abflug: Unter einem Weg, der mit 3° von der Bahn wegsteigt, muss bis 8 km Luft sein (beide Richtungen)
      let luftMin = Infinity;
      for (const e of [0, 1]) for (let d = 300; d <= 8000; d += 100) { const [x, z] = platzWelt(P, 0, e ? P.lang + d : -d); luftMin = Math.min(luftMin, P.hoehe + d * Math.tan(3 * GRAD) - bodenHoehe(x, z)); }
      pruefe(`${P.name.padEnd(16)} Bahn ${P.bahnen.join('/')}  ${P.lang} m ${P.belag.padEnd(7)} ${Math.round(P.meer / FT)} ft`, uneben < 0.01 && luftMin > 8, `eben auf ${uneben.toFixed(2)} m, Luft unter dem 3°-Weg mindestens ${Math.round(luftMin)} m`);
    }
    const g = GIPFEL[0]; pruefe('Zugspitze so hoch wie in echt', Math.abs(bodenHoehe(g.x, g.z) + NN - g.meer) < 60, `${Math.round(bodenHoehe(g.x, g.z) + NN)} m (echt ${g.meer})`);
    const mu = ORTE[0]; pruefe('München liegt richtig hoch und ist als Stadt erkannt', Math.abs(bodenHoehe(mu.x, mu.z) + NN - mu.meer) < 15 && bodenArt(mu.x + 500, mu.z + 500) === 'ort', `${Math.round(bodenHoehe(mu.x, mu.z) + NN)} m`);

    // -------------------------------------------------------------- 2. Der Flugplaner
    console.log('\nDer Flugplaner');
    const a = AUSFLUEGE[0], plan = planAus(a.punkte, a.hoehe), r0 = rechne(plan), rW = rechne(plan, { aus: 270, kn: 20 });
    pruefe('Kleines Dreieck: Strecke und Zeit', r0.weit > 35 && r0.weit < 60 && Math.abs(r0.zeitBeine - r0.weit / r0.tas * 60) < 0.01 && r0.tas > 105 && r0.tas < 110 && r0.zeit > r0.zeitBeine + REISE.anflug,
      `${r0.weit.toFixed(1)} NM, ${r0.zeit.toFixed(1)} min, ${r0.liter.toFixed(1)} Liter, Mindesthöhe ${r0.mindest} ft`);
    const ost = rW.beine[0];   // erstes Bein geht nach Südosten: Westwind schiebt
    pruefe('Mit 20 kn Westwind: schneller nach Osten, Nase in den Wind gedreht', ost.grund > rW.tas + 5 && wickel(ost.steuer - ost.kurs) > 0.02, `über Grund ${ost.grund.toFixed(0)} kn, Vorhaltewinkel ${(ost.vor / GRAD).toFixed(1)}°`);
    pruefe('Rundflug bei Wind dauert länger als ohne', rW.zeit > r0.zeit, `${rW.zeit.toFixed(1)} statt ${r0.zeit.toFixed(1)} min`);
    pruefe('Zu wenig Sprit wird gemeldet', !rechne({ ...plan, sprit: 10 }).ok);
    pruefe('Zu tief geplant wird gemeldet', rechne({ ...plan, hoehe: 2500 }).hinweise.some(h => /tief/.test(h.text)), `Gelände bis ${Math.round(Math.max(...r0.beine.map(b => b.hoch)))} ft`);
    // Funkfeuer-Anzeige
    const F = FEUER[0], ff = { p: [F.x, 300, F.z + 10000], kurs: Math.PI }, an = feuerAnzeige(ff, F, Math.PI), an2 = feuerAnzeige({ p: [F.x + 1000, 300, F.z + 10000] }, F, Math.PI);
    pruefe('Funkfeuer: 10 km nördlich, Kurs 180 gewählt → Nadel in der Mitte, „zu“', an.zu && Math.abs(an.nadel) < 0.01 && Math.abs(an.dme - 5.4) < 0.05, `${an.dme.toFixed(1)} NM`);
    pruefe('Funkfeuer: 1 km westlich der Linie (beim Flug nach Süden rechts davon) → Nadel links', an2.nadel < -0.3, `Nadel ${an2.nadel.toFixed(2)}`);
  }

  // ---------------------------------------------------------------- 3. Flüge
  console.log('\nFlüge mit dem künstlichen Piloten');
  const zeige = (name, x) => { if (laut) console.log(x.log.map(l => '        ' + l).join('\n'));
    return `${'★'.repeat(x.e.sterne)}${'☆'.repeat(5 - x.e.sterne)}  ${Math.round(x.e.min)} min (Plan ${Math.round(x.R.rechnung.zeit)})  ${Math.round(x.e.liter)} l (Plan ${Math.round(x.R.rechnung.liter)})  Abweichung ${(x.R.navi.maxAb / NM).toFixed(1)} NM  Landung ${x.e.landung}★`; };
  if (!nur || nur === 'dreieck') {
    const a = AUSFLUEGE[0], x = fliege(planAus(a.punkte, a.hoehe), 'ruhig', { raffer: true });
    pruefe('Kleines Dreieck (windstill, mit Zeitraffer)', x.e.sterne === 5 && !x.f.bruch, zeige('dreieck', x));
    pruefe('  Plan stimmt: Zeit höchstens 15 % daneben, Sprit höchstens 10 % mehr und 20 % weniger als geplant',
      Math.abs(x.e.min / x.R.rechnung.zeit - 1) < 0.15 && x.e.liter / (x.R.rechnung.liter - REISE.rollen) > 0.8 && x.e.liter / (x.R.rechnung.liter - REISE.rollen) < 1.1,
        `Zeit ${(x.e.min / x.R.rechnung.zeit * 100 - 100).toFixed(0)} %, Sprit ohne Rollen ${(x.e.liter / (x.R.rechnung.liter - REISE.rollen) * 100 - 100).toFixed(0)} %`);
    pruefe('  Zeitraffer hält Kurs und Höhe', x.m.raffer >= 2 && x.rafferZeit > 120 && x.rafferKurs < 4 && x.rafferHoehe < 120, `${x.m.raffer}-mal an, ${Math.round(x.rafferZeit)} s, höchstens ${x.rafferKurs.toFixed(1)}° und ${Math.round(x.rafferHoehe)} ft daneben`);
    if (!x.e.zeilen.every(z => z.ok)) console.log(x.e.zeilen.map(z => `        ${z.ok ? 'ok' : '--'} ${z.name}: ${z.text}`).join('\n'));
  }
  if (!nur || nur === 'wind') {
    const a = AUSFLUEGE[3], x = fliege(planAus(a.punkte, a.hoehe), 'seite');
    pruefe('Hüpfer nach Königsdorf bei Seitenwind aus 290°', x.e.sterne >= 4 && x.e.amZiel && !x.f.bruch, zeige('wind', x));
    pruefe('  gelandet auf der Bahn gegen den Wind', x.R.landeBahn === x.R.endeZiel, `Piste ${x.R.ziel.bahnen[x.R.endeZiel]}`);
  }
  if (!nur || nur === 'gross') {
    const a = AUSFLUEGE[1], x = fliege(planAus(a.punkte, a.hoehe, 120), 'leicht', { raffer: true });
    pruefe('Großes Dreieck über Augsburg und Oberschleißheim (leichter Wind)', x.e.sterne >= 4 && x.e.amZiel && !x.f.bruch, zeige('gross', x));
  }
  if (!nur || nur === 'inn') {
    const a = AUSFLUEGE[2], x = fliege(planAus(a.punkte, a.hoehe), 'ruhig');
    pruefe('Zum Inn nach Vogtareuth (kurze Bahn)', x.e.sterne >= 4 && x.e.amZiel && !x.f.bruch, zeige('inn', x));
  }
  if (!nur || nur === 'ohlstadt') {
    const x = fliege(planAus(['lerchenfeld', 'o:Weilheim', 'ohlstadt'], 4000), 'ruhig');
    pruefe('Über Weilheim nach Ohlstadt am Alpenrand (Gras)', x.e.sterne >= 4 && x.e.amZiel && !x.f.bruch, zeige('ohlstadt', x));
  }

  if (!nur || nur === 'ganz') {
    const a = AUSFLUEGE[3], x = fliegeGanz(planAus(a.punkte, a.hoehe, Infinity), 'ruhig');
    if (laut) console.log(x.log.map(l => '        ' + l).join('\n'));
    pruefe('Ganzer Flug nach Königsdorf: geparkt, Außencheck, Checklisten, rollen, fliegen, am Ziel abstellen', x.teil === 'ende' && !x.f.bruch && x.e.amZiel && x.e.sterne >= 4,
      `${'★'.repeat(x.e.sterne)}${'☆'.repeat(5 - x.e.sterne)}  ${Math.round(x.t / 60)} min mit allem, ${Math.round(x.e.min)} min in der Luft` + (x.teil === 'ende' ? '' : `, hängt in „${x.teil}“`));
    pruefe('  getankt wird beim Außencheck: Der Tank war fast leer, der Flug braucht mehr', x.start.liter < x.start.spritSoll && x.getankt > 50, `${x.start.liter} Liter im Tank, nötig ${x.start.spritSoll}, getankt ${x.getankt}`);
    pruefe('  Checklisten: nichts vergessen, am Ziel auf dem Vorfeld geparkt', !!x.b && x.b.vergessen.length === 0 && x.b.amPlatz && x.b.regeln === 5, x.b ? `Regeln ${x.b.regeln}★ ${x.b.vergessen.map(v => v.text).join(', ')}` : '');
    pruefe('  das Flugzeug merkt sich den Tank für den nächsten Flug', !!x.b && Math.abs(x.zustand.sprit - x.f.sprit) < 0.1 && liter(x.f) < x.start.liter + x.getankt, `${liter(x.f)} Liter übrig`);
    if (!x.e.zeilen.every(z => z.ok)) console.log(x.e.zeilen.map(z => `        ${z.ok ? 'ok' : '--'} ${z.name}: ${z.text}`).join('\n'));
  }

  // ---------------------------------------------------------------- 4. Fehler haben Folgen
  if (!nur) {
    console.log('\nFehler haben Folgen');
    const a = AUSFLUEGE[3];
    const stumm = fliege(planAus(a.punkte, a.hoehe), 'ruhig', { funk: false });
    pruefe('Wer nie funkt, bekommt den Funk-Stern nicht', !stumm.e.zeilen[3].ok && stumm.R.funk.verpasst.length >= 3, stumm.e.zeilen[3].text);
    const falsch = fliege(planAus(a.punkte, a.hoehe), 'seite', { falscheBahn: true });
    pruefe('Landung mit Rückenwind auf der falschen Bahn kostet den Lande-Stern', !falsch.e.zeilen[4].ok && falsch.R.landeBahn !== falsch.R.endeZiel, falsch.e.zeilen[4].text.slice(-70));
    const schief = fliege(planAus(a.punkte, a.hoehe), 'ruhig', { daneben: 3600 });
    pruefe('Wer weit neben der Linie fliegt, bekommt den Navigations-Stern nicht (Stufe „Selbst“ erlaubt es)', !schief.e.zeilen[0].ok && schief.e.amZiel && fliege(planAus(a.punkte, a.hoehe), 'ruhig', { daneben: 3600, navi: 'selbst' }).e.zeilen[0].ok, schief.e.zeilen[0].text);
    const knapp = fliege(planAus(a.punkte, a.hoehe, 22), 'ruhig');
    pruefe('Mit weniger als 30 Minuten Reserve gelandet: kein Sprit-Stern', !knapp.e.zeilen[2].ok && knapp.e.rest > 5, knapp.e.zeilen[2].text);
    const lahm = fliege(planAus(a.punkte, a.hoehe), 'ruhig', { daneben: -2600 }), zl = lahm.e.zeilen[1];
    pruefe('Zeit-Stern: höchstens Plan mal 1,15 plus 2 Minuten', zl.ok === (lahm.e.min <= lahm.R.rechnung.zeit * 1.15 + 2), zl.text);
    // Funk: Die richtige Antwort steht nicht immer am selben Platz
    const plaetze = [0, 0, 0], wf = wuerfel(3); for (let i = 0; i < 300; i++) { const F = new Funk(wf); F.stelle(['a', 'b', 'c'], '', {}); plaetze[F.frage.antworten.findIndex(x => x.richtig)]++; }
    pruefe('Funk: Die richtige Antwort steht mal an Platz 1, mal 2, mal 3', plaetze.every(n => n > 70), plaetze.join(' / ') + ' von 300');
    const R = new Reise(planAus(a.punkte, a.hoehe), WETTER.ruhig), ff = neuesFlugzeug('lerche'); setze(ff, R.startLage());
    pruefe('Zeitraffer geht nicht am Boden', !R.rafferAn(ff));
    R.funk.schritt(ff, R.lage(ff), 0.1); const fr = R.funk.frage; R.funk.waehle(fr.antworten.findIndex(x => !x.richtig));
    pruefe('Falscher Funkspruch: Der Flugleiter fragt nach, die Frage bleibt', R.funk.falsch === 1 && !!R.funk.frage && R.funk.sagen.some(x => x.tipp));
  }
  console.log(schlecht ? `\n${schlecht} Prüfungen sind fehlgeschlagen.` : '\nDer Überlandflug klappt.');
  process.exit(schlecht ? 1 : 0);
}
