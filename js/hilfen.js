// Flugsimulator – Hilfen für den Piloten. Ohne Grafik.
// Die Physik bleibt immer dieselbe. Die Hilfen bewegen nur Ruder, die der Pilot sonst selbst bewegen müsste.
//   'leicht' : Seitenruder von allein, Trimmung von allein, Schräglage höchstens 35°, Nase fällt und steigt nicht zu weit
//   'mittel' : nur das Seitenruder von allein (Kugel in der Mitte, Pendeln der Nase wird gedämpft)
//   'echt'   : nichts – außer auf Wunsch den „Füßen“ (FUSS_MIT): Das Seitenruder geht beim Querruder mit, wie bei einem Piloten
import { fluegel, fussKraft, G } from './physik.js';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const STUFEN = ['leicht', 'mittel', 'echt'];
export const STUFEN_TEXT = { leicht: 'Leicht: Seitenruder, Trimmung und Schräglage mit Hilfe', mittel: 'Mittel: nur das Seitenruder mit Hilfe', echt: 'Echt: alles selbst – nur die Füße gehen beim Querruder von allein mit' };

const GIER_DAEMPF = 1.5;      // so stark tritt die Hilfe gegen das Pendeln der Nase (0 = gar nicht, so war es bis 25.11.2026)
const PEDAL_VOLL = 0.3;       // ab so viel eigenem Pedal hält die Hilfe die Kugel gar nicht mehr in der Mitte

// Die „Füße“ in Echt: Geht ein Querruder hoch, bremst der andere Flügel stärker, und die Nase schwenkt erst einmal in die
// falsche Richtung. Ein Pilot tritt deshalb bei jeder Querruder-Bewegung ganz von allein mit ins Seitenruder. Wer ein Handy
// neigt, hat keine Füße frei – also tun wir das für ihn. 1 = genau so viel, dass die Nase nicht mehr falsch herum schwenkt, 0 = gar nicht.
// (Kristians Flug vom 25.11.2026: ohne Füße pendelte die Nase bei jeder Bewegung, bis 12° Schieben bei halbem Querruder.)
const FUSS_MIT = 1;

// Was sich die Hilfe von Bild zu Bild merkt, liegt hier und nicht im Flugzeug: Die Physik soll davon nichts wissen.
const MERK = new WeakMap();
const merke = f => { let h = MERK.get(f); if (!h) MERK.set(f, h = {}); return h; };

// e = Eingabe des Piloten (wird nicht verändert), f = Flugzeug. Gibt die Eingabe zurück, die wirklich ans Flugzeug geht.
// fuesse = true: In „Echt“ geht das Seitenruder beim Querruder mit (siehe FUSS_MIT). Das Spiel schaltet es ein, die Prüfwerkzeuge nicht.
export function mitHilfe(e, f, stufe, dt, fuesse) {
  const a = { hoehe: e.hoehe, quer: e.quer, seite: e.seite, gas: e.gas, bremse: e.bremse };
  if (stufe === 'echt') {
    if (fuesse && !f.amBoden) {
      // So viel Seitenruder hebt das falsche Schwenken genau auf (aus den Zahlen des Flugzeugs gerechnet, bei der Lerche 0,86 je Querruder).
      // Tritt der Pilot selbst ins Pedal, halten sich die Füße zurück – er will dann schieben (Seitenwind-Landung, Slip).
      const T = f.T, passt = -T.cnQuer * T.ruderMax.quer / (T.cnSeite * T.ruderMax.seite), frei = 1 - clamp(Math.abs(e.seite) / PEDAL_VOLL, 0, 1);
      a.seite = clamp(e.seite + FUSS_MIT * frei * passt * e.quer / fussKraft(T, f.ias), -1, 1);
    }
    return a;
  }
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
  } else {
    h.kurs = undefined;
    // In der Luft: so viel Seitenruder, dass das Flugzeug nicht schiebt (die Kugel bleibt in der Mitte).
    // Was dauerhaft fehlt (der Propeller zieht die Nase nach links), merkt sich die Hilfe und hält es von allein.
    // Tritt der Pilot selbst ins Pedal, will er schieben (Seitenwind-Landung): Dann lässt die Hilfe Kugel und Nase in Ruhe (frei → 0).
    // Sie verschwindet aber nicht mehr ganz und springt beim Loslassen nicht zurück – was der Pilot tritt, kommt einfach dazu.
    const frei = 1 - clamp(Math.abs(e.seite) / PEDAL_VOLL, 0, 1), fuss = fussKraft(f.T, f.ias);
    h.seite = clamp((h.seite || 0) + frei * f.schiebe * 1.5 * dt, -0.5, 0.5);
    // Gier-Dämpfung: Pendelt die Nase hin und her, tritt die Hilfe gegen die Drehung – so wie ein Pilot mit den Füßen das Pendeln
    // beruhigt. Die Drehung, die zu einer sauberen Kurve gehört (kurve), zählt dabei nicht mit, sonst würde die Hilfe jede Kurve bremsen.
    const kurve = G * Math.sin(f.roll) / Math.max(20, f.tas || 20), pendeln = -f.w[1] - kurve;
    // Bei viel Fahrt schafft der Fuß nur einen Teil des Ausschlags (fussKraft): Die Hilfe tritt entsprechend weiter, damit dasselbe herauskommt.
    a.seite = clamp(e.seite + frei * (2.2 * f.schiebe + 0.35 * a.quer - GIER_DAEMPF * pendeln + h.seite) / fuss, -1, 1);
    // Das Seitenruder sitzt hoch am Heck und rollt das Flugzeug deshalb ein wenig mit. Weil die Hilfe das Seitenruder
    // dauernd hält (gegen den Propeller), gleicht sie dieses Rollen mit etwas Querruder aus – sonst kippt das Flugzeug langsam weg.
    const T = f.T;
    // Und noch etwas gleicht sie aus: Dreht das Flugzeug in einer Kurve, ist der äußere Flügel schneller und hebt sich weiter.
    // Ohne Hilfe bremst das Schieben dieses Aufschaukeln – das Schieben nimmt die Hilfe aber gerade weg.
    const gierRoll = T.clGier * (-f.w[1]) * T.spann / (2 * Math.max(15, f.tas || 15));
    a.quer = clamp(a.quer + (T.clSeite * (a.seite - e.seite) * T.ruderMax.seite * fuss - frei * clamp(gierRoll, -0.03, 0.03)) / (T.clQuer * T.ruderMax.quer), -1, 1);
    if (Math.abs(e.quer) < 0.05) a.quer = clamp(a.quer - frei * 0.08 * f.roll, -1, 1);       // losgelassen: ganz sanft zurück, so wie es das Schieben sonst täte
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
