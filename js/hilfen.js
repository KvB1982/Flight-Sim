// Flugsimulator – Hilfen für den Piloten. Ohne Grafik.
// Die Physik bleibt immer dieselbe. Die Hilfen bewegen nur Ruder, die der Pilot sonst selbst bewegen müsste.
//   'leicht' : Seitenruder von allein, Trimmung von allein, Schräglage höchstens 35°, Nase fällt und steigt nicht zu weit
//   'mittel' : nur das Seitenruder von allein
//   'echt'   : nichts
import { fluegel } from './physik.js';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const STUFEN = ['leicht', 'mittel', 'echt'];
export const STUFEN_TEXT = { leicht: 'Leicht: Seitenruder, Trimmung und Schräglage mit Hilfe', mittel: 'Mittel: nur das Seitenruder mit Hilfe', echt: 'Echt: alles selbst' };

// Was sich die Hilfe von Bild zu Bild merkt, liegt hier und nicht im Flugzeug: Die Physik soll davon nichts wissen.
const MERK = new WeakMap();
const merke = f => { let h = MERK.get(f); if (!h) MERK.set(f, h = {}); return h; };

// e = Eingabe des Piloten (wird nicht verändert), f = Flugzeug. Gibt die Eingabe zurück, die wirklich ans Flugzeug geht.
export function mitHilfe(e, f, stufe, dt) {
  const a = { hoehe: e.hoehe, quer: e.quer, seite: e.seite, gas: e.gas, bremse: e.bremse };
  if (stufe === 'echt') return a;
  const h = merke(f);
  if (f.amBoden) {
    // Am Boden lenkt der Knüppel mit: Drehen oder Neigen nach rechts = Bugrad und Seitenruder nach rechts.
    // Lässt man los, merkt sich die Hilfe die Richtung und hält sie – auch gegen den Propeller, der die Nase nach links zieht.
    if (Math.abs(a.seite) < 0.05) {
      const rechtsherum = -f.w[1];                                   // so schnell dreht die Nase gerade nach rechts
      if (Math.abs(a.quer) > 0.05 || h.kurs === undefined) { h.kurs = f.kurs + rechtsherum * 0.4; h.merk = 0; a.seite = a.quer; }
      else {
        let fehlt = h.kurs - f.kurs; while (fehlt > Math.PI) fehlt -= 2 * Math.PI; while (fehlt < -Math.PI) fehlt += 2 * Math.PI;
        h.merk = clamp((h.merk || 0) + fehlt * 2.5 * dt, -0.6, 0.6);
        a.seite = clamp(4 * fehlt - 1.2 * rechtsherum + h.merk, -1, 1);
      }
    }
    // Beim Rollen und Starten bleiben die Flügel gerade; im Seitenwind hält die Hilfe die Fläche unten
    a.quer = clamp(-f.roll * 3 - f.w[2] * 0.6, -1, 1);
  } else if (Math.abs(a.seite) < 0.05) {
    h.kurs = undefined;
    // In der Luft: so viel Seitenruder, dass das Flugzeug nicht schiebt (die Kugel bleibt in der Mitte).
    // Was dauerhaft fehlt (der Propeller zieht die Nase nach links), merkt sich die Hilfe und hält es von allein.
    h.seite = clamp((h.seite || 0) + f.schiebe * 1.5 * dt, -0.5, 0.5);
    a.seite = clamp(2.2 * f.schiebe + h.seite + 0.35 * a.quer, -1, 1);
    // Das Seitenruder sitzt hoch am Heck und rollt das Flugzeug deshalb ein wenig mit. Weil die Hilfe das Seitenruder
    // dauernd hält (gegen den Propeller), gleicht sie dieses Rollen mit etwas Querruder aus – sonst kippt das Flugzeug langsam weg.
    const T = f.T;
    // Und noch etwas gleicht sie aus: Dreht das Flugzeug in einer Kurve, ist der äußere Flügel schneller und hebt sich weiter.
    // Ohne Hilfe bremst das Schieben dieses Aufschaukeln – das Schieben nimmt die Hilfe aber gerade weg.
    const gierRoll = T.clGier * (-f.w[1]) * T.spann / (2 * Math.max(15, f.tas || 15));
    a.quer = clamp(a.quer + (T.clSeite * a.seite * T.ruderMax.seite - clamp(gierRoll, -0.03, 0.03)) / (T.clQuer * T.ruderMax.quer), -1, 1);
    if (Math.abs(e.quer) < 0.05) a.quer = clamp(a.quer - 0.08 * f.roll, -1, 1);       // losgelassen: ganz sanft zurück, so wie es das Schieben sonst täte
  }
  if (stufe === 'leicht' && !f.amBoden) {
    // Trimmung wandert langsam dem Knüppel nach: Wer die Nase lange irgendwo hinhält, muss bald nicht mehr drücken oder ziehen.
    // Sie geht aber nur so weit, dass das Flugzeug losgelassen nie langsamer als etwa 60 Knoten wird.
    f.trimm = clamp(f.trimm + a.hoehe * 0.1 * dt, -1, Math.max(f.trimm, 0.3));
    // Nicht zu steil: Über 15° Nase hoch und unter 12° Nase runter hält die Hilfe dagegen
    const hochRate = -f.w[0];
    a.hoehe = clamp(a.hoehe, clamp((-0.21 - f.nick) * 6 - hochRate * 1.2, -1, 1), clamp((0.26 - f.nick) * 6 - hochRate * 1.2, -0.4, 1));
    // Nicht zu langsam: Kurz bevor die Strömung abreißt, lässt die Hilfe nicht weiter ziehen
    const frei = fluegel(f.T, f.alpha, f.klappen)[3] - f.alpha;                 // so viele Grad (im Bogenmaß) sind noch Luft bis zum Abriss
    if (frei < 0.07) a.hoehe = Math.min(a.hoehe, clamp((frei - 0.035) * 20, -0.5, 1));
    // Schräglage begrenzen und beim Loslassen sanft aufrichten
    const grenze = 35 * Math.PI / 180, rollRate = f.w[2] * Math.sign(f.roll);    // rollRate + = wird noch schräger
    if (Math.sign(a.quer) === Math.sign(f.roll) && a.quer !== 0) a.quer = Math.sign(a.quer) * Math.min(Math.abs(a.quer), clamp((grenze - Math.abs(f.roll)) * 4 - rollRate * 0.6, -1, 1));
    if (Math.abs(e.quer) < 0.06) {
      h.quer = clamp((h.quer || 0) - f.roll * 0.8 * dt, -0.3, 0.3);        // was dauerhaft schief zieht, wird ausgeglichen
      a.quer = clamp(-f.roll * 1.2 - f.w[2] * 0.5 + h.quer, -0.5, 0.5);
    }

    // In der Kurve etwas mitziehen, sonst fällt die Nase
    a.hoehe = clamp(a.hoehe + 0.25 * (1 / Math.max(0.7, Math.cos(f.roll)) - 1), -1, 1);
  }
  // Am Boden und kurz darüber nicht zu steil ziehen, sonst schlägt das Heck auf die Bahn
  if (stufe === 'leicht' && f.hoeheGrund < 4 && f.nick > 0.08) a.hoehe = Math.min(a.hoehe, clamp((0.17 - f.nick) * 8 + f.w[0] * 1.5, -0.3, 1));
  return a;
}
