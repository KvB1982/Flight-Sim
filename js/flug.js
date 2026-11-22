// Flugsimulator – der Ablauf eines Flugs und die Bewertung der Landung. Ohne Grafik.
import { KN, FT, GRAD } from './flugzeuge.js';
import { PLATZ, anflug, bahnFuer } from './platz.js';

const fpm = v => Math.round(v / FT * 60);

// Note für ein Aufsetzen (e kommt aus der Physik): 1 bis 5 Sterne und Sätze, was gut war und was besser geht
export function landeNote(e) {
  const richtung = bahnFuer(e.kurs), a = anflug([e.x, 0, e.z], richtung);
  const sink = fpm(e.sink), quer = Math.abs(a.quer), schraeg = Math.abs(e.schraeg) / GRAD, roll = Math.abs(e.roll) / GRAD;
  const aufBahn = quer < PLATZ.breit / 2 && a.laengs > 0 && a.laengs < PLATZ.lang;
  const teile = [];
  let punkte = 100;
  const ab = (n, text) => { punkte -= n; if (text) teile.push(text); };
  if (!aufBahn) ab(60, 'Du bist neben der Bahn aufgekommen.');
  if (sink > 600) ab(45, `Sehr hart aufgesetzt (${sink} ft/min). Früher abfangen: kurz über der Bahn die Nase langsam hochnehmen.`);
  else if (sink > 350) ab(25, `Hart aufgesetzt (${sink} ft/min). Beim Abfangen etwas mehr ziehen.`);
  else if (sink > 200) ab(10, `Etwas fest aufgesetzt (${sink} ft/min).`);
  if (aufBahn && quer > 5) ab(15, `${quer.toFixed(0)} m neben der Mittellinie.`); else if (aufBahn && quer > 2) ab(5);
  if (aufBahn && a.laengs > 450) ab(20, `Spät aufgesetzt (${Math.round(a.laengs)} m hinter der Schwelle). Die Bahn wird knapp.`);
  else if (aufBahn && a.laengs < 30) ab(10, 'Sehr knapp hinter der Schwelle aufgesetzt.');
  if (schraeg > 8) ab(20, 'Schräg zur Bahn aufgesetzt: kurz vor dem Aufsetzen mit dem Seitenruder gerade stellen.'); else if (schraeg > 4) ab(8);
  if (roll > 8) ab(15, 'Mit hängender Fläche aufgesetzt.');
  if (e.nick < -1 * GRAD) ab(20, 'Mit dem Bugrad zuerst: Die Nase muss beim Aufsetzen leicht nach oben zeigen.');
  // Ausschweben: Wer kurz über der Bahn die Nase hochnimmt, wird langsamer und setzt sanft auf den Haupträdern auf.
  const tempo = Math.round(e.ias / KN);
  if (tempo > 66) ab(20, `Viel zu schnell aufgesetzt (${tempo} kn). Über der Bahn Gas raus und ausschweben lassen.`);
  else if (tempo > 58) ab(10, `Schnell aufgesetzt (${tempo} kn). Lass das Flugzeug über der Bahn ausschweben, bis es von allein sinkt.`);
  else if (!teile.length && tempo <= 52 && e.nick > 3 * GRAD) teile.push(sink < 120 ? 'Schön ausgeschwebt und butterweich aufgesetzt!' : 'Schön ausgeschwebt: langsam und mit der Nase oben aufgesetzt.');
  const sterne = Math.max(1, Math.min(5, Math.round(punkte / 20)));
  if (!teile.length) teile.push(sink < 120 ? 'Butterweich und mitten auf der Bahn!' : 'Saubere Landung.');
  return { sterne, punkte: Math.max(0, punkte), sink, quer, laengs: a.laengs, aufBahn, text: teile.join(' ') };
}

// Was bei welchem Bruch passiert ist
export const BRUCH_TEXT = {
  Fahrwerk: 'Viel zu hart aufgesetzt, das Fahrwerk ist gebrochen.',
  Heck: 'Das Heck ist hart auf die Bahn geschlagen.',
  'Überlast': 'Zu hart am Knüppel gerissen: Die Flügel haben das nicht ausgehalten. Bei viel Fahrt nur sanft ziehen.',
  Tempo: 'Viel zu schnell: Über der roten Marke am Fahrtmesser hält das Flugzeug nicht.'
};

export class Flug {
  constructor() { this.meldungen = []; this.note = null; this.gelandet = false; this.warnZeit = 0; this.landungen = 0; this.ansage = 999; }
  sag(text, art = 'info') { this.meldungen.push({ text, art }); }
  // nach jedem Bild: Ereignisse aus der Physik lesen, warnen, bewerten
  schritt(f, dt) {
    this.warnZeit -= dt;
    for (const e of f.ereignisse.splice(0)) {
      if (e.art === 'heck') { this.heck = (this.heck || 0) + 1; if (!f.bruch) this.sag('Das Heck hat die Bahn berührt! Nicht so steil ziehen.', 'warn'); continue; }
      if (e.art !== 'aufsetzen' || e.flugZeit < 3) continue;       // kleine Hüpfer zählen nicht als neue Landung
      this.note = landeNote(e); this.landungen++; this.gelandet = true;
      this.sag('★'.repeat(this.note.sterne) + '☆'.repeat(5 - this.note.sterne) + '  ' + this.note.text, this.note.sterne >= 4 ? 'gut' : 'warn');
    }
    if (f.bruch && !this.bruchGemeldet) { this.bruchGemeldet = true; this.sag(`Bruch! ${BRUCH_TEXT[f.bruch] || f.bruch + ' hat den Boden berührt.'} Taste N oder „Neu“ für einen neuen Versuch.`, 'schlimm'); }
    if (!f.amBoden && f.hoeheGrund > 30) this.gelandet = false;
    if (this.warnZeit <= 0 && !f.bruch) {
      const v = f.T.v;
      if (f.abriss > 0.3 && !f.amBoden) { this.sag('Strömungsabriss! Nase runter und Gas geben.', 'schlimm'); this.warnZeit = 5; }
      else if (f.klappen > 0.05 && f.ias > (v.klappenMax + 5) * KN) { this.sag(`Zu schnell für die Klappen (höchstens ${v.klappenMax} kn).`, 'warn'); this.warnZeit = 8; }
      else if (f.ias > v.nie * KN) { this.sag('Viel zu schnell! Gas raus und Nase sanft hoch.', 'schlimm'); this.warnZeit = 5; }
      else if (!f.amBoden && f.hoeheGrund < 150 && f.steig < -5.5) { this.sag('Sinkrate! Du sinkst zu schnell.', 'warn'); this.warnZeit = 4; }
    }
    // Höhen-Ansage im Endanflug: 100, 50, 20, 10 Fuß über dem Boden
    const hf = f.hoeheGrund / FT;
    if (!f.amBoden && f.steig < -0.3) { for (const h of [100, 50, 20, 10]) if (hf <= h && this.ansage > h) { this.ansage = h; this.ruf = String(h); } }
    if (hf > 150) this.ansage = 999;
  }
}
