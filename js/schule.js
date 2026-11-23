// Flugsimulator – die Flugschule: acht Lektionen vom Rollen bis zum Alleinflug. Ohne Grafik, damit auch das
// Prüfwerkzeug (tools/schule.mjs) jede Lektion fliegen kann.
// Eine Lektion ist eine Liste von Schritten. Jeder Schritt hat:
//   sag     : was die Fluglehrerin sagt (wird vorgelesen und angezeigt)
//   aufgabe : kurzer Satz, der oben stehen bleibt, bis der Schritt geschafft ist
//   fertig  : (f, z) => true, wenn geschafft.  halte: so viele Sekunden am Stück muss `fertig` stimmen
//   fehler  : (f, z) => Text, wenn gerade etwas schiefgeht (zählt höchstens alle 8 Sekunden einmal)
//   tipp    : [mit Tastatur, mit Fingern] – womit man das macht, steht klein unter der Aufgabe
// f = Flugzeug aus physik.js, z = Merkzettel der Lektion (z.h0 = Höhe am Anfang des Schritts, z.flug = Flug aus flug.js …)
import { KN, FT, GRAD } from './flugzeuge.js';
import { PLATZ, RUNDE, anflug } from './platz.js';

export const LEHRERIN = 'Jule';
const kn = f => f.ias / KN, fuss = f => (f.p[1] + f.T.raeder[1].ort[1]) / FT,   /* Höhe über dem Flugplatz, wie der Höhenmesser – nicht über den Hügeln */ fpm = f => f.steig / FT * 60;
// Unterschied zweier Kurse in Grad (immer 0 bis 180)
const kursFehlt = (f, grad) => { let d = (f.kurs / GRAD - grad) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return Math.abs(d); };
const roll = f => Math.abs(f.roll) / GRAD;
// Wo ist am Boden Asphalt? Vorfeld, Verbindung zum Rollweg, Rollweg, Bahn (mit etwas Rand)
export function aufAsphalt(x, z) {
  const V = PLATZ.vorfeld;
  if (Math.abs(x) < PLATZ.breit / 2 + 3 && z > -10 && z < PLATZ.lang + 10) return true;                  // Bahn
  if (Math.abs(x + 45) < 9 && z > 21 && z < PLATZ.lang - 21) return true;                                // Rollweg
  if (x > -77 && x < -39 && Math.abs(z - V.z) < 9) return true;                                          // vom Vorfeld zum Rollweg
  if (x > V.x - 48 && x < V.x + 28 && Math.abs(z - V.z) < 58) return true;                               // Vorfeld
  for (const zz of [30, PLATZ.lang / 2, PLATZ.lang - 30]) if (x > -51 && x < 0 && Math.abs(z - zz) < 9) return true;   // Abzweige zur Bahn
  return false;
}
const schnellRollen = f => f.amBoden && kn(f) > 20 ? 'Zu schnell! Beim Rollen höchstens 15 Knoten – Gas raus.' : null;
const imGras = f => f.amBoden && !aufAsphalt(f.p[0], f.p[2]) ? 'Du bist im Gras. Zurück auf den Asphalt.' : null;
const hoeheWeg = (soll, weit = 300) => f => Math.abs(fuss(f) - soll) > weit ? (fuss(f) > soll ? `Du bist zu hoch. Wir wollen ${soll} Fuß.` : `Du bist zu tief. Wir wollen ${soll} Fuß.`) : null;
const zuLangsam = (grenze = 55) => f => !f.amBoden && fuss(f) > 30 && kn(f) < grenze ? 'Zu langsam! Nase etwas runter.' : null;
const erste = (...pruefer) => (f, z) => { for (const p of pruefer) { const t = p(f, z); if (t) return t; } return null; };

// Womit macht man das? [Tastatur, Finger auf dem iPad]. Mit dem Handy als Knüppel gelten die Knöpfe auf dem Handy.
const T = {
  gas: ['Taste W = mehr Gas, S = weniger Gas', 'Schubhebel links: nach oben schieben = mehr Gas'],
  lenken: ['Tasten Q und E = links und rechts lenken, B = bremsen', 'Knöpfe „Seitenruder“ unten = links und rechts lenken'],
  bremse: ['Taste S = Gas raus, B oder Leertaste = bremsen', 'Schubhebel ganz nach unten, dann „Bremse“ halten'],
  knueppel: ['Pfeiltasten: ← → Schräglage, ↓ ziehen (Nase hoch), ↑ drücken', 'Knüppel rechts: nach unten ziehen = Nase hoch'],
  klappen: ['Taste F = Klappen eine Stufe ausfahren, V = einfahren', 'Knopf „Klappen ▼“ = eine Stufe ausfahren, „Klappen ▲“ = einfahren']
};

// Die Stücke einer Platzrunde – Lektion 7 mit Ansagen, Lektion 8 (Alleinflug) ohne
const rundeSchritte = (mitHilfe) => [
  { sag: mitHilfe ? 'Jetzt alles zusammen: eine ganze Platzrunde. Die Straße in der Luft zeigt dir den Weg. Vollgas, Mittellinie halten, bei 55 Knoten sanft ziehen.' : 'Heute fliegst du allein. Ich steige aus und schaue vom Turm aus zu. Eine Platzrunde, so wie wir sie geübt haben. Viel Spaß!',
    aufgabe: 'Starten: Vollgas, bei 55 kn sanft ziehen', fertig: f => !f.amBoden && fuss(f) > 100, fehler: imGras },
  { sag: mitHilfe ? 'Schön. Steig mit 75 Knoten geradeaus bis 500 Fuß, dann Linkskurve nach Westen.' : null,
    aufgabe: 'Geradeaus steigen bis 500 ft, dann links auf Kurs West (270)', fertig: f => kursFehlt(f, 270) < 25 && f.p[0] > 200, fehler: zuLangsam() },
  { sag: mitHilfe ? 'Weiter steigen auf 1000 Fuß. Dann noch einmal links in den Gegenanflug, Kurs Süd. Die Bahn liegt dann links von dir.' : null,
    aufgabe: 'Auf 1000 ft steigen, links auf Kurs Süd (180)', fertig: f => kursFehlt(f, 180) < 20 && f.p[0] > RUNDE.abstand - 500, fehler: zuLangsam() },
  { sag: mitHilfe ? 'Gegenanflug. Höhe 1000 Fuß halten, Gas zurück auf etwa 70 Prozent, 85 Knoten. Schau nach links zur Bahn.' : null,
    aufgabe: 'Gegenanflug: 1000 ft und 85 kn halten, bis du am Bahnanfang vorbei bist', fertig: f => f.p[2] < 0, fehler: erste(zuLangsam(), hoeheWeg(1000, 350)) },
  { sag: mitHilfe ? 'Du bist querab vom Bahnanfang. Gas auf die Hälfte, Klappen 10 Grad, und langsam sinken. 75 Knoten.' : null,
    aufgabe: 'Gas auf 50 %, Klappen 10°, sinken. Hinter dem Tor links auf Kurs Ost (090)', fertig: f => kursFehlt(f, 90) < 25 && f.p[2] < -1200, fehler: zuLangsam(), tipp: T.klappen },
  { sag: mitHilfe ? 'Queranflug. Klappen 20 Grad, 70 Knoten. Gleich kommt die letzte Linkskurve auf die Bahn.' : null,
    aufgabe: 'Klappen 20°, 70 kn. Links auf die Verlängerung der Bahn (Kurs Nord)', fertig: f => kursFehlt(f, 360) < 20 && Math.abs(f.p[0]) < 220 && f.p[2] < -200, fehler: zuLangsam(52) },
  { sag: mitHilfe ? 'Endanflug. 65 bis 70 Knoten, zwei weiße und zwei rote Lichter. Die Nase regelt das Tempo, das Gas die Höhe.' : null,
    aufgabe: 'Endanflug: 65–70 kn, zwei weiße und zwei rote Lichter', fertig: (f, z) => z.flug.landungen > z.landungen0, fehler: zuLangsam(50) },
  { sag: mitHilfe ? 'Unten! Auf der Mittellinie bleiben und bremsen.' : null,
    aufgabe: 'Bremsen bis zum Stillstand', fertig: f => f.amBoden && kn(f) < 3, tipp: T.bremse }
];

export const LEKTIONEN = [
  {
    id: 'rollen', name: '1 · Rollen', kurz: 'Vom Vorfeld zur Bahn rollen und anhalten', start: 'vorfeld', weg: null,
    schritte: [
      { sag: `Hallo, ich bin ${LEHRERIN}, deine Fluglehrerin. Heute lernen wir das Rollen. Am Boden lenkst du mit dem Seitenruder. Gib ein bisschen Gas, etwa 30 Prozent, bis wir losrollen.`,
        aufgabe: 'Wenig Gas geben (etwa 30 %), bis das Flugzeug rollt', fertig: f => kn(f) > 4, tipp: T.gas },
      { sag: 'Gut! Jetzt Gas wieder etwas zurück. Roll geradeaus über den gelben Strich bis zum Rollweg. Nicht schneller als 15 Knoten.',
        aufgabe: 'Geradeaus über den gelben Strich bis zum Rollweg', fertig: f => f.p[0] > -56, fehler: erste(schnellRollen, imGras), tipp: T.lenken },
      { sag: 'Jetzt nach links abbiegen, Richtung Süden. Vor der Kurve langsamer werden.',
        aufgabe: 'Links abbiegen auf den Rollweg (Kurs Süd, 180)', fertig: f => kursFehlt(f, 180) < 15 && Math.abs(f.p[0] + 45) < 6, fehler: erste(schnellRollen, imGras), tipp: T.lenken },
      { sag: 'Prima. Roll den Rollweg entlang bis zum Ende. Kleine Ausschläge reichen.',
        aufgabe: 'Den Rollweg entlang bis ans Südende', fertig: f => f.p[2] < 75, fehler: erste(schnellRollen, imGras) },
      { sag: 'Und anhalten: Gas ganz raus und bremsen.',
        aufgabe: 'Gas raus und bremsen bis zum Stillstand', fertig: f => kn(f) < 1, halte: 1, fehler: imGras, tipp: T.bremse }
    ]
  },
  {
    id: 'geradeaus', name: '2 · Geradeaus und Kurven', kurz: 'Höhe und Kurs halten, Kurven nach links und rechts', start: 'luft', weg: null,
    lage: { x: 0, z: 2500, kurs: 0, hoehe: 2000 * FT, tempo: 105 * KN, trimm: -0.8, gas: 0.85 },
    schritte: [
      { sag: 'Wir sind in 2000 Fuß. Schau auf den Horizont: Liegt die Nase knapp darunter, fliegen wir geradeaus. Halte 20 Sekunden lang die Höhe und den Kurs Nord.',
        aufgabe: '20 Sekunden: Höhe 2000 ft und Kurs Nord (360) halten', fertig: f => Math.abs(fuss(f) - 2000) < 150 && kursFehlt(f, 360) < 10, halte: 20, fehler: hoeheWeg(2000), tipp: T.knueppel },
      { sag: 'Sehr gut. Jetzt eine Linkskurve auf Kurs West, das ist 270. Leg das Flugzeug etwa 25 Grad schräg und zieh ein kleines bisschen, damit die Nase nicht fällt.',
        aufgabe: 'Linkskurve auf Kurs West (270), dann gerade ausrichten', fertig: f => kursFehlt(f, 270) < 8 && roll(f) < 8, halte: 3, fehler: erste(hoeheWeg(2000), f => roll(f) > 50 ? 'Zu steil! Höchstens 30 Grad Schräglage.' : null) },
      { sag: 'Und jetzt rechts herum zurück auf Nord.',
        aufgabe: 'Rechtskurve zurück auf Kurs Nord (360)', fertig: f => kursFehlt(f, 360) < 8 && roll(f) < 8, halte: 3, fehler: erste(hoeheWeg(2000), f => roll(f) > 50 ? 'Zu steil! Höchstens 30 Grad Schräglage.' : null) },
      { sag: 'Noch zehn Sekunden schön geradeaus, dann hast du es.',
        aufgabe: '10 Sekunden: Höhe 2000 ft und Kurs Nord halten', fertig: f => Math.abs(fuss(f) - 2000) < 150 && kursFehlt(f, 360) < 10, halte: 10, fehler: hoeheWeg(2000) }
    ]
  },
  {
    id: 'steigen', name: '3 · Steigen und Sinken', kurz: 'Auf eine Höhe steigen, sie halten und wieder sinken', start: 'luft', weg: null,
    lage: { x: 0, z: 2500, kurs: 0, hoehe: 2000 * FT, tempo: 100 * KN, trimm: -0.74, gas: 0.8 },
    schritte: [
      { sag: 'Heute geht es rauf und runter. Merke dir: Das Gas bestimmt, ob wir steigen oder sinken. Die Nase bestimmt das Tempo. Gib Vollgas und nimm die Nase hoch, bis der Fahrtmesser 75 Knoten zeigt. Wir steigen auf 3000 Fuß.',
        aufgabe: 'Vollgas, Nase hoch auf 75 kn: steigen auf 3000 ft', fertig: f => fuss(f) > 2920, fehler: zuLangsam(58), tipp: T.gas },
      { sag: 'Gleich da. Nase runter auf den Horizont und Gas zurück auf etwa 85 Prozent. Halte 3000 Fuß.',
        aufgabe: '12 Sekunden: Höhe 3000 ft halten', fertig: f => Math.abs(fuss(f) - 3000) < 150, halte: 12, fehler: hoeheWeg(3000, 350) },
      { sag: 'Jetzt sinken. Gas auf 40 Prozent, die Nase nur ein wenig runter. Nicht schneller als 800 Fuß pro Minute sinken. Ziel ist wieder 2000 Fuß.',
        aufgabe: 'Gas auf 40 %: sinken auf 2000 ft (höchstens 800 ft/min)', fertig: f => fuss(f) < 2090, fehler: f => fpm(f) < -1300 ? 'Du sinkst zu schnell. Nase etwas höher.' : kn(f) > 135 ? 'Zu schnell! Gas raus.' : null },
      { sag: 'Abfangen: Gas wieder auf 85 Prozent und 2000 Fuß halten.',
        aufgabe: '10 Sekunden: Höhe 2000 ft halten', fertig: f => Math.abs(fuss(f) - 2000) < 150, halte: 10, fehler: hoeheWeg(2000, 350) }
    ]
  },
  {
    id: 'abriss', name: '4 · Langsamflug und Abriss', kurz: 'Langsam fliegen, den Strömungsabriss erleben und beenden', start: 'luft', weg: null, hilfeMin: 'mittel',
    lage: { x: 0, z: 2500, kurs: 0, hoehe: 3000 * FT, tempo: 90 * KN, trimm: -0.56, gas: 0.7 },
    schritte: [
      { sag: 'Heute zeige ich dir, was passiert, wenn ein Flugzeug zu langsam wird. Dafür schalte ich den Schutz der Hilfe ab. Zuerst langsam fliegen: Gas auf 45 Prozent, Klappen auf 20 Grad, und die Nase so weit hoch, dass wir die Höhe halten.',
        aufgabe: 'Gas 45 %, Klappen 20°: langsamer werden bis unter 58 kn, Höhe halten', fertig: f => kn(f) < 58 && f.klappenStufe >= 2 && Math.abs(fuss(f) - 3000) < 250, halte: 6, fehler: hoeheWeg(3000, 400), tipp: T.klappen },
      { sag: 'Das ist Langsamflug. Die Ruder fühlen sich weich an. Jetzt der Abriss: Gas ganz raus und immer weiter ziehen, bis die Warnung kommt und die Nase von allein fällt.',
        aufgabe: 'Gas ganz raus und ziehen, bis die Strömung abreißt', fertig: f => f.abriss > 0.3 },
      { sag: 'Abriss! Nase runter, Vollgas, Flügel gerade!',
        aufgabe: 'Nase runter, Vollgas – dann sanft abfangen', fertig: f => f.abriss < 0.05 && kn(f) > 60 && fpm(f) > -200, halte: 2,
        fehler: (f, z) => z.h0 - f.p[1] > 500 * FT ? 'Das hat viel Höhe gekostet. Nach dem Abriss zügig Vollgas und nicht zu lange drücken.' : null },
      { sag: 'Genau so. Wer die Nase runternimmt und Gas gibt, fliegt sofort wieder. Klappen einfahren und noch kurz geradeaus.',
        aufgabe: 'Klappen einfahren und 8 Sekunden normal weiterfliegen', fertig: f => f.klappenStufe === 0 && kn(f) > 65 && f.abriss < 0.05, halte: 8, fehler: zuLangsam(50) }
    ]
  },
  {
    id: 'start', name: '5 · Der Start', kurz: 'Auf der Mittellinie beschleunigen, abheben, steigen', start: 'bahn', weg: 'runde',
    schritte: [
      { sag: 'Wir stehen auf der Bahn 36. Beim Start zieht der Propeller die Nase nach links, mit der Hilfe gleicht das Flugzeug das selbst aus. Gib gleichmäßig Vollgas.',
        aufgabe: 'Vollgas geben', fertig: f => f.gas > 0.92, tipp: T.gas },
      { sag: 'Mittellinie halten. Schau auf den Fahrtmesser: Bei 55 Knoten ziehst du sanft, bis die Nase knapp über dem Horizont liegt.',
        aufgabe: 'Mittellinie halten, bei 55 kn sanft ziehen', fertig: f => !f.amBoden && fuss(f) > 15, fehler: f => f.amBoden && Math.abs(f.p[0]) > 9 ? 'Zurück zur Mittellinie!' : null },
      { sag: 'Wir fliegen! Nicht weiter ziehen. Halte 75 Knoten und steig geradeaus auf 500 Fuß.',
        aufgabe: 'Mit 70–80 kn geradeaus steigen bis 500 ft', fertig: f => fuss(f) > 500, fehler: erste(zuLangsam(60), f => kursFehlt(f, 360) > 20 ? 'Geradeaus bleiben, Kurs Nord.' : null) }
    ]
  },
  {
    id: 'landung', name: '6 · Anflug und Landung', kurz: 'Den Gleitweg halten, abfangen, aufsetzen', start: 'anflug', weg: 'anflug', landung: true,
    schritte: [
      { sag: 'Die Landung. Wir sind 4 Kilometer vor der Bahn, die Klappen sind auf 20 Grad. Flieg durch die Tore. Halte 65 bis 70 Knoten: Ist der Fahrtmesser zu hoch, Nase etwas höher. Sind die Lichter neben der Bahn alle rot, sind wir zu tief, dann mehr Gas.',
        aufgabe: 'Durch die Tore: 65–70 kn, zwei weiße und zwei rote Lichter', fertig: f => fuss(f) < 200,
        fehler: (f, z) => { const w = anflug(f.p, 36).winkel / GRAD;
          return kn(f) < 56 ? 'Zu langsam! Nase runter und etwas Gas.' : kn(f) > 82 ? 'Zu schnell. Gas zurück, Nase etwas höher.' : w < 2.2 ? 'Zu tief – alle Lichter rot. Mehr Gas!' : w > 4.2 ? 'Zu hoch – alle Lichter weiß. Gas zurück.' : null; } },
      { sag: 'Sieht gut aus. Über dem Bahnanfang nimmst du das Gas ganz raus. Kurz über dem Boden die Nase langsam hochnehmen und das Flugzeug ausschweben lassen.',
        aufgabe: 'Über der Schwelle Gas raus, kurz über dem Boden sanft abfangen', fertig: (f, z) => z.flug.landungen > z.landungen0 },
      { sag: 'Wir sind unten. Mittellinie halten und bremsen.',
        aufgabe: 'Bremsen bis zum Stillstand', fertig: f => f.amBoden && kn(f) < 3, tipp: T.bremse }
    ]
  },
  { id: 'runde', name: '7 · Die Platzrunde', kurz: 'Start, Runde um den Platz und Landung mit Ansagen', start: 'bahn', weg: 'runde', landung: true, schritte: rundeSchritte(true) },
  { id: 'allein', name: '8 · Alleinflug', kurz: 'Eine Platzrunde ganz allein – ohne Ansagen und ohne Straße', start: 'bahn', weg: null, landung: true, allein: true, schritte: rundeSchritte(false) }
];

// ---------------------------------------------------------------- eine Lektion ablaufen lassen
export class Unterricht {
  constructor(lektion) {
    this.l = lektion; this.nr = -1; this.t = 0; this.haltZeit = 0; this.fehler = []; this.fehlerZeit = 0;
    this.sagen = [];                      // was jetzt vorgelesen und gezeigt werden soll: { text, art }
    this.aufgabe = ''; this.anteil = 0;   // Aufgabe des Schritts und wie viel von der Halte-Zeit schon geschafft ist (0…1)
    this.fertig = false; this.ergebnis = null; this.z = null;
  }
  weiter(f) {
    this.nr++; this.haltZeit = 0; this.anteil = 0;
    const s = this.l.schritte[this.nr];
    if (!s) return;
    this.z.h0 = f.p[1]; this.aufgabe = s.aufgabe; this.tipp = s.tipp || null;
    if (s.sag) this.sagen.push({ text: s.sag, art: 'lehrer' });
  }
  // nach jedem Bild aufrufen. flug = Flug aus flug.js (zählt die Landungen und kennt die Note)
  schritt(f, dt, flug) {
    if (this.fertig) return;
    if (!this.z) { this.z = { flug, landungen0: flug.landungen }; this.weiter(f); }
    this.t += dt; this.fehlerZeit -= dt;
    if (f.bruch) return this.ende(f, flug, false, 'Das Flugzeug ist kaputt. Das passiert jedem einmal – gleich noch einmal versuchen.');
    const s = this.l.schritte[this.nr];
    const f0 = s.fehler && s.fehler(f, this.z);
    if (f0 && this.fehlerZeit <= 0) { this.fehlerZeit = 8; this.fehler.push(f0); this.sagen.push({ text: f0, art: 'warn' }); }
    if (s.fertig(f, this.z)) { this.haltZeit += dt; } else this.haltZeit = 0;
    this.anteil = s.halte ? Math.min(1, this.haltZeit / s.halte) : 0;
    if (this.haltZeit > 0 && this.haltZeit >= (s.halte || 0)) {
      if (this.nr + 1 >= this.l.schritte.length) return this.ende(f, flug, true);
      this.weiter(f);
    }
  }
  ende(f, flug, geschafft, text) {
    this.fertig = true; this.aufgabe = '';
    const n = this.fehler.length, note = flug.note;
    let sterne = geschafft ? (n <= 1 ? 3 : n <= 3 ? 2 : 1) : 0;
    // Lektionen mit Landung: Die Landung zählt mit (Sterne der Landung: 5 oder 4 = sehr gut, 3 = gut)
    if (geschafft && this.l.landung) { const ls = note ? note.sterne : 1; sterne = Math.min(sterne, ls >= 4 ? 3 : ls >= 3 ? 2 : 1); }
    const lob = ['', 'Geschafft – mit etwas Mühe.', 'Gut gemacht!', 'Perfekt geflogen!'][sterne];
    this.ergebnis = {
      geschafft, sterne, fehler: [...new Set(this.fehler)], zeit: this.t, note: this.l.landung ? note : null,
      text: text || (this.l.allein && geschafft ? 'Dein erster Alleinflug! Herzlichen Glückwunsch, das vergisst kein Pilot. ' : '') + lob
    };
    this.sagen.push({ text: geschafft ? this.ergebnis.text : text, art: geschafft ? 'gut' : 'schlimm' });
  }
}

// ---------------------------------------------------------------- Lernstand (welche Lektion mit wie vielen Sternen)
const SPEICHER = 'flugsim.schule.v1';
export function ladeStand(speicher) { try { return JSON.parse(speicher.getItem(SPEICHER)) || {}; } catch (e) { return {}; } }
export function merkeStand(speicher, id, sterne) {
  const s = ladeStand(speicher); if ((s[id] || 0) < sterne) s[id] = sterne;
  try { speicher.setItem(SPEICHER, JSON.stringify(s)); } catch (e) { /* egal */ } return s;
}
// Eine Lektion ist offen, wenn die davor geschafft ist (die erste immer)
export const offen = (stand, nr) => nr === 0 || (stand[LEKTIONEN[nr - 1].id] || 0) > 0;
