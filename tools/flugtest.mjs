// Flugsimulator – Rechen-Test der Flugphysik:  node tools/flugtest.mjs
// Misst mit einem künstlichen Piloten die Zahlen, die man von einem kleinen Schulflugzeug kennt,
// und vergleicht sie mit dem Wunsch (SOLL). Ohne Grafik.
import { neuesFlugzeug, setze, schritt, abrissTempo, masse, KN, TAKT } from '../js/physik.js';
import { FT } from '../js/flugzeuge.js';
import { Pilot, ruhig, windWelt, GRAD, wickel } from './pilot.mjs';

const kn = v => v / KN, fpm = v => v / FT * 60;
const zeilen = [];
let fehler = 0;
function pruefe(name, wert, von, bis, einheit) {
  const ok = wert >= von && wert <= bis;
  if (!ok) fehler++;
  zeilen.push(`${ok ? '  ok ' : 'FALSCH'}  ${name.padEnd(46)} ${String(Math.round(wert * 10) / 10).padStart(8)} ${einheit.padEnd(7)} (Wunsch ${von} bis ${bis})`);
}
const neu = (o, welt = ruhig, opt) => { const f = neuesFlugzeug('lerche'); setze(f, o); return [f, new Pilot(f, welt, opt)]; };

// ---- 1. Abrissgeschwindigkeit: Motor im Leerlauf, Höhe halten, bis es nicht mehr geht
function abriss(klappen) {
  const [f, p] = neu({ hoehe: 1000, tempo: 35, klappen });
  let min = 99;
  p.flieg(90, (s, dt) => { p.e.gas = 0; p.hoeheMitNase(s, 1000, dt); p.flaeche(s, 0); min = Math.min(min, f.ias); return f.abriss < 0.5; });
  return kn(min);
}
pruefe('Abriss ohne Klappen (gerechnet)', kn(abrissTempo(neuesFlugzeug('lerche'), 0)), 45, 51, 'kn');
pruefe('Abriss ohne Klappen (geflogen)', abriss(0), 43, 52, 'kn');
pruefe('Abriss mit vollen Klappen (geflogen)', abriss(3), 36, 44, 'kn');

// ---- 2. Start: Vollgas, bei 55 kn ziehen. Wie lang ist die Rollstrecke?
{
  const [f, p] = neu({ kurs: 0 });
  let ab = null, hoch = null, quer = 0;
  p.flieg(60, s => {
    p.e.gas = 1; p.e.quer = 0;
    p.e.seite = Math.max(-1, Math.min(1, 0.25 * s.x - 3 * wickel(s.kurs)));    // Mittellinie halten (x = 0; +x ist links)
    if (f.ias > 55 * KN) p.nase(s, 9 * GRAD); else p.e.hoehe = 0;
    if (f.amBoden) quer = Math.max(quer, Math.abs(f.p[0]));
    if (!ab && !f.amBoden && f.hoeheGrund > 0.3) ab = f.p[2];
    if (!hoch && f.hoeheGrund > 15) { hoch = f.p[2]; return false; }
  });
  pruefe('Start: Rollstrecke bis zum Abheben', ab ?? 9999, 200, 345, 'm');
  pruefe('Start: Strecke bis 15 m Höhe', hoch ?? 9999, 380, 650, 'm');
  pruefe('Start: größte Abweichung von der Mittellinie', quer, 0, 3, 'm');
}

// ---- 3. Steigen mit 74 kn und Vollgas
{
  const [f, p] = neu({ hoehe: 300, tempo: 38, nick: 0.1 });
  let y0 = 0;
  p.flieg(80, (s, dt, t) => { p.e.gas = 1; p.tempoMitNase(s, 74 * KN, dt); p.kurs(s, 0); if (t < 40) y0 = f.p[1]; });
  pruefe('Steigen bei 74 kn', fpm((f.p[1] - y0) / 40), 620, 850, 'ft/min');
  pruefe('  dabei Tempo', kn(f.ias), 72, 76, 'kn');
}

// ---- 4. Reiseflug: Hebel auf 2450 Umdrehungen (etwa 75 % Leistung), Höhe halten
let reiseNick = 0;
{
  const [f, p] = neu({ hoehe: 900, tempo: 55 });
  p.flieg(150, (s, dt) => { p.e.gas = 0.88; p.hoeheMitNase(s, 900, dt); p.kurs(s, 0); });
  reiseNick = f.nick;
  pruefe('Reiseflug bei 75 % Leistung', kn(f.ias), 105, 122, 'kn');
  pruefe('  Sprit pro Stunde', f.T.verbrauch * (0.08 + 0.92 * Math.pow((600 + 2100 * 0.88) / 2700, 3)) * 3600, 22, 32, 'kg');
}

// ---- 5. Gleiten ohne Motor mit 68 kn
{
  const [f, p] = neu({ hoehe: 1500, tempo: 35 });
  let y0 = 0, z0 = 0;
  f.motorAn = false;
  p.flieg(80, (s, dt, t) => { p.tempoMitNase(s, 68 * KN, dt); p.kurs(s, 0); if (t < 40) { y0 = f.p[1]; z0 = f.p[2]; } });
  pruefe('Gleiten ohne Motor: Gleitzahl', (f.p[2] - z0) / (y0 - f.p[1]), 8, 10.5, 'zu 1');
  pruefe('  Sinken', -fpm(f.steig), 600, 850, 'ft/min');
}

// ---- 6. Anflug: 65 kn, volle Klappen, 3 Grad Gleitweg. Wie viel Gas braucht es?
{
  const [f, p] = neu({ hoehe: 600, tempo: 33.4, klappen: 3, bahn: -3 * GRAD });
  let ig = 0.4;
  p.flieg(90, (s, dt) => {
    p.tempoMitNase(s, 65 * KN, dt); p.kurs(s, 0);
    ig = Math.max(0, Math.min(1, ig + (-65 * KN * Math.sin(3 * GRAD) - s.steig) * 0.02 * dt)); p.e.gas = ig;
  });
  pruefe('Anflug 3° mit 65 kn: Drehzahl', f.drehzahl, 1500, 2100, 'U/min');
  pruefe('  Sinken', -fpm(f.steig), 300, 400, 'ft/min');
  pruefe('  Nase (unter dem Horizont = minus)', f.nick / GRAD, -6, 2, 'Grad');
}

// ---- 7. Stabil? Im Reiseflug getrimmt loslassen, kurz am Knüppel reißen, dann eine Minute nichts tun
{
  const [f, p] = neu({ hoehe: 900, tempo: 57 }, ruhig, { hilfe: 'echt' });
  p.flieg(120, (s, dt) => { p.e.gas = 0.88; p.hoeheMitNase(s, 900, dt); p.kurs(s, 0); f.trimm += p.e.hoehe * 0.9 * dt; });
  const v0 = f.ias;
  let vMin = 99, vMax = 0, rollMax = 0;
  p.flieg(70, (s, dt, t) => {
    p.e.hoehe = t < 1 ? 0.25 : 0; p.e.quer = 0; p.e.seite = 0;
    if (t > 40) { vMin = Math.min(vMin, f.ias); vMax = Math.max(vMax, f.ias); }
    rollMax = Math.max(rollMax, Math.abs(f.roll));
  });
  pruefe('Losgelassen nach Störung: Tempo pendelt noch um', kn(vMax - vMin), 0, 22, 'kn');
  pruefe('  Tempo kehrt zurück (Abstand zum Trimm-Tempo)', Math.abs(kn((vMax + vMin) / 2 - v0)), 0, 5, 'kn');
  pruefe('  größte Schräglage dabei', rollMax / GRAD, 0, 12, 'Grad');
}

// ---- 8. Kurve: 30 Grad Schräglage, mit Seitenruder-Hilfe. Bleibt die Kugel in der Mitte?
{
  const [f, p] = neu({ hoehe: 900, tempo: 50 });
  let kugel = 0, k0 = 0;
  p.flieg(40, (s, dt, t) => { p.e.gas = 0.8; p.hoeheMitNase(s, 900, dt); p.flaeche(s, 30 * GRAD); if (t > 15) kugel = Math.max(kugel, Math.abs(f.kugel)); if (t < 20) k0 = f.kurs; });
  pruefe('Kurve 30°: Kugel bleibt in der Mitte', kugel, 0, 0.15, '');
  pruefe('  Drehen des Kurses', wickel(f.kurs - k0) / GRAD / 20, 4.5, 8, 'Grad/s');
}

// ---- 9. Abriss mit Absicht: Leerlauf, voll ziehen. Fällt die Nase? Fängt es sich wieder?
{
  const [f, p] = neu({ hoehe: 1200, tempo: 35 }, ruhig, { hilfe: 'echt' });
  let nickMin = 9, verlust = 0, y0 = 1200;
  p.flieg(12, s => { p.e.gas = 0; p.e.hoehe = 1; p.flaeche(s, 0); nickMin = Math.min(nickMin, f.nick); });
  const war = f.abriss;
  y0 = f.p[1];
  p.flieg(15, (s, dt) => { p.e.gas = 1; if (f.ias < 60 * KN) p.e.hoehe = -0.2; else p.hoeheMitNase(s, f.p[1] + 5, dt); p.flaeche(s, 0); verlust = Math.max(verlust, y0 - f.p[1]); });
  pruefe('Voll gezogen im Leerlauf: Strömung reißt ab', Math.max(war, nickMin < 0 ? 1 : 0), 0.5, 1, '');
  pruefe('  Abfangen: Höhenverlust', verlust / FT, 0, 400, 'ft');
  pruefe('  danach wieder im Flug (Tempo)', kn(f.ias), 55, 110, 'kn');
}

// ---- 10. Landung: 3 km vor der Bahn in 160 m Höhe, volle Klappen. Der Pilot fliegt den Gleitweg und fängt ab.
// Die Bahnschwelle liegt bei z = 0, die Bahn läuft nach Norden. Mit Verzug sieht der Pilot alles zu spät.
export function landung(windAus, windKn, verzug = 0, laut = false) {
  const welt = windWelt(windAus, windKn);
  const [f, p] = neu({ hoehe: 3000 * Math.tan(3 * GRAD) + 1.1, z: -3000, tempo: 34, klappen: 3, bahn: -3 * GRAD, gas: 0.45 }, welt, { verzug });
  let ig = 0.45, ende = null, ziel = 150;
  p.flieg(200, (s, dt, t) => {
    if (f.ereignisse.length && !ende) ende = f.ereignisse[0];
    if (ende) {                                              // ausrollen: Gas raus, bremsen, Mittellinie halten
      p.e.gas = 0; p.e.bremse = f.ias < 40 * KN ? 0.6 : 0; p.e.hoehe = 0; p.flaeche(s, 0);
      p.e.seite = Math.max(-1, Math.min(1, 0.06 * s.x - 1.6 * wickel(s.kurs) - 0.5 * f.wende));
      return f.grund > 1;
    }
    const weit = ziel - s.z, soll = Math.max(0, weit) * Math.tan(3 * GRAD);       // so hoch müssten die Räder jetzt sein
    // seitlich: zur Mittellinie fliegen (+x ist links), gegen den Wind vorhalten ergibt sich daraus von selbst
    // Er schaut dabei, wohin das Flugzeug wirklich fliegt (Spur über Grund) – der Vorhaltewinkel gegen den Wind ergibt sich von selbst
    const spurSoll = Math.max(-0.4, Math.min(0.4, 0.012 * s.x));
    if (s.hg > 4) {
      p.flaeche(s, Math.max(-20 * GRAD, Math.min(20 * GRAD, 1.4 * wickel(spurSoll - s.spur))));
      p.tempoMitNase(s, 65 * KN, dt);
      const fehl = (soll - s.hg) * 0.12 - f.grund * Math.tan(3 * GRAD) - s.steig;
      ig = Math.max(0, Math.min(1, ig + fehl * 0.012 * dt)); p.e.gas = Math.max(0, Math.min(1, ig + 0.05 * fehl));
    } else {
      // Abfangen: Gas raus, Nase langsam hoch, Flugzeug mit dem Seitenruder gerade zur Bahn drehen, Fläche gegen den Wind hängen lassen
      p.e.gas = 0;
      p.nase(s, (0.5 + (4 - s.hg) * 1.6) * GRAD);
      p.e.seite = Math.max(-1, Math.min(1, -3 * wickel(s.kurs)));
      p.flaeche(s, Math.max(-0.2, Math.min(0.2, 0.08 * f.v[0] + 0.02 * s.x)));
    }
    if (laut && Math.round(t * 120) % 240 === 0) console.log(`  t=${t.toFixed(0)} z=${s.z.toFixed(0)} hg=${s.hg.toFixed(1)} soll=${soll.toFixed(1)} ias=${kn(f.ias).toFixed(0)} steig=${fpm(f.steig).toFixed(0)} x=${s.x.toFixed(1)} gas=${ig.toFixed(2)}`);
  });
  return { f, ende, bruch: f.bruch, stand: f.p[2], x: f.p[0] };
}
for (const [aus, k, vz, name] of [[0, 0, 0, 'ohne Wind'], [0, 12, 0, '12 kn Gegenwind'], [90, 10, 0, '10 kn Seitenwind von rechts'], [270, 10, 0.25, '10 kn von links, Pilot mit 0,25 s Schrecksekunde']]) {
  const r = landung(aus, k, vz, process.argv.includes('laut'));
  const e = r.ende || { sink: 99, x: 99, z: 9999, ias: 0, schraeg: 9 };
  pruefe(`Landung ${name}: Sinken beim Aufsetzen`, fpm(e.sink), 0, 350, 'ft/min');
  pruefe('  Abstand zur Mittellinie', Math.abs(e.x), 0, 5, 'm');
  pruefe('  aufgesetzt hinter der Schwelle', e.z, 0, 450, 'm');
  pruefe('  Tempo beim Aufsetzen', kn(e.ias), 38, 62, 'kn');
  pruefe('  schräg zur Bahn gerutscht', Math.abs(e.schraeg) / GRAD, 0, 6, 'Grad');
  pruefe('  steht nach (ab Schwelle), ohne Bruch' + (r.bruch ? ' – BRUCH: ' + r.bruch : ''), r.bruch ? 9999 : r.stand, 100, 800, 'm');
}

// ---- 9. Trimmbereich: Flügel gerade halten, Höhenruder loslassen. Wie schnell fliegt das Flugzeug dann von allein?
function losgelassen(trimm, start) {
  const [f, p] = neu({ hoehe: 1500, tempo: start * KN, gas: 0.75, trimm }, ruhig, { hilfe: 'echt' });
  let summe = 0, n = 0;
  p.flieg(200, (s, dt, t) => { p.e.gas = 0.75; p.e.hoehe = 0; p.flaeche(s, 0); p.e.seite = Math.max(-1, Math.min(1, 3 * f.schiebe)); if (t > 100) { summe += f.ias; n++; } });
  return f.bruch ? 0 : kn(summe / n);
}
pruefe('Trimmung ganz kopflastig: fliegt losgelassen', losgelassen(-1, 130), 118, 145, 'kn');
pruefe('Trimmung ganz schwanzlastig: fliegt losgelassen', losgelassen(1, 60), 48, 60, 'kn');

// ---- 10. Zu fest gezogen, zu schnell geflogen: Das Flugzeug hält nicht alles aus
{
  const zieh = v => { const [f] = neu({ hoehe: 1500, tempo: v * KN, gas: 0.7 }); let max = 0; for (let t = 0; t < 4 && !f.bruch; t += TAKT) { schritt(f, { hoehe: 1, quer: 0, seite: 0, gas: 0.7, bremse: 0 }, TAKT, ruhig); max = Math.max(max, f.lastRuhig); } return max; };
  pruefe('voll gezogen bei 100 kn: Last', zieh(100), 3.2, 4.6, 'g');
  pruefe('voll gezogen bei 120 kn: Last (Bruch ab 5,7)', zieh(120), 3.2, 5.6, 'g');
  const [f, p] = neu({ hoehe: 3000, tempo: 100 * KN, gas: 1, nick: -40 * GRAD, bahn: -40 * GRAD }, ruhig, { hilfe: 'echt' });
  let vBruch = 0;
  p.flieg(60, s => { p.e.gas = 1; p.nase(s, -40 * GRAD); p.flaeche(s, 0); vBruch = f.ias; });
  pruefe('Sturzflug mit Vollgas: bricht bei' + (f.bruch ? ` (${f.bruch})` : ' – KEIN BRUCH'), f.bruch ? kn(vBruch) : 999, 160, 195, 'kn');
}

// ---- 11. Geparkt im Seitenwind: Die Reifen halten, das Flugzeug dreht sich nicht weg und kippt nicht
for (const wind of [15, 25]) {
  const [f] = neu({ kurs: 0 }, windWelt(90, wind));
  for (let t = 0; t < 30 && !f.bruch; t += TAKT) schritt(f, { hoehe: 0, quer: 0, seite: 0, gas: 0, bremse: 1 }, TAKT, windWelt(90, wind));
  pruefe(`geparkt, Bremse, ${wind} kn von der Seite, 30 s: gedreht` + (f.bruch ? ' – BRUCH' : ''), f.bruch ? 99 : Math.abs(wickel(f.kurs)) / GRAD, 0, 2, 'Grad');
}
// Startlauf ohne Seitenruder: Der Propeller zieht nach links, aber nicht gleich von der Bahn
{
  const [f] = neu({ kurs: 0 });
  let bei10 = 0;
  for (let t = 0; t < 4 && !f.bruch; t += TAKT) { schritt(f, { hoehe: 0, quer: 0, seite: 0, gas: 1, bremse: 0 }, TAKT, ruhig); if (!bei10 && f.ias > 10 * KN) bei10 = wickel(f.kurs) / GRAD; }
  pruefe('Startlauf ohne Seitenruder: Kurs bei 10 kn', bei10, -4, 0, 'Grad');
}

// ---- 12. Trudeln: im Abriss Knüppel ganz gezogen und Seitenruder voll links. Dann wie gelernt heraus:
//          Gas raus, Seitenruder gegen die Drehung, Knüppel nach vorn
{
  const [f] = neu({ hoehe: 2000, tempo: 46 * KN, gas: 0, nick: 12 * GRAD });
  const e = { hoehe: 1, quer: 0, seite: -1, gas: 0, bremse: 0 };
  let gier = 0, n = 0, h0 = f.p[1];
  for (let t = 0; t < 10 && !f.bruch; t += TAKT) { schritt(f, e, TAKT, ruhig); if (t > 6) { gier += -f.w[1]; n++; } }
  pruefe('Trudeln: dreht sich nach 6 s von allein', Math.abs(gier / n) / GRAD, 50, 120, 'Grad/s');
  pruefe('  Höhenverlust in 10 s', (h0 - f.p[1]) / FT, 600, 2000, 'ft');
  let raus = 99;
  for (let t = 0; t < 10 && !f.bruch; t += TAKT) { schritt(f, { hoehe: -0.3, quer: 0, seite: 1, gas: 0, bremse: 0 }, TAKT, ruhig); if (raus === 99 && Math.abs(f.w[1]) < 10 * GRAD && !f.trudelt) raus = t; }
  pruefe('  heraus nach (Seitenruder gegen, Knüppel vor)', raus, 0, 4, 's');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`Lerche 172, Gewicht ${Math.round(masse(neuesFlugzeug('lerche')))} kg\n`);
  console.log(zeilen.join('\n'));
  console.log(fehler ? `\n${fehler} Zahlen passen nicht.` : '\nAlle Zahlen passen.');
  process.exit(fehler ? 1 : 0);
}
