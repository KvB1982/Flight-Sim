// Flugsimulator – der Flugplatz und das Gelände als Zahlen (ohne Grafik), damit auch die Prüfwerkzeuge sie kennen.
// Die Bahn läuft von Süd nach Nord: Schwelle „36“ bei z = 0, Schwelle „18“ bei z = LANG. Mittellinie x = 0.
// Erinnerung: +z ist Norden, +x ist Westen.
import { GRAD } from './flugzeuge.js';

export const PLATZ = {
  name: 'Flugplatz Lerchenfeld',
  lang: 1000, breit: 23,
  gleitweg: 3 * GRAD,
  zielpunkt: 150,              // so weit hinter der Schwelle sollen die Räder aufsetzen (dort stehen die PAPI-Lichter)
  vorfeld: { x: -95, z: 420 }, // Parkplatz östlich der Bahn
  rollhalt: { x: -45, z: 30 }  // hier wartet man vor der Bahn
};

// Höhe des Bodens: rund um den Platz flach, ab 3 km Entfernung wachsen Hügel
const sanft = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function bodenHoehe(x, z) {
  const d = Math.hypot(x, z - PLATZ.lang / 2);
  if (d < 3000) return 0;
  const k = sanft(d, 3000, 7000);
  const h = 130 + 90 * Math.sin(x * 0.00071 + 1.3) * Math.cos(z * 0.00063 - 0.4) + 60 * Math.sin(x * 0.0019 - z * 0.0013) + 30 * Math.sin(z * 0.0041 + x * 0.0027);
  // im Norden und Süden bleibt eine Schneise für An- und Abflug niedriger
  const schneise = 0.35 + 0.65 * sanft(Math.abs(x), 600, 2500);
  return Math.max(0, h * k * schneise);
}

// Anflug auf eine Bahn: gibt für einen Ort die Abweichung vom Leitstrahl zurück.
// richtung 36 = Landung nach Norden (Schwelle z = 0), 18 = Landung nach Süden.
export function anflug(p, richtung = 36) {
  const nord = richtung === 36;
  const laengs = nord ? p[2] : PLATZ.lang - p[2];            // Meter hinter der Schwelle (vor der Schwelle negativ)
  const quer = nord ? -p[0] : p[0];                          // Meter rechts von der Mittellinie
  const vorZiel = PLATZ.zielpunkt - laengs;                  // Meter bis zum Zielpunkt
  const winkel = Math.atan2(p[1], Math.max(1, vorZiel));     // unter diesem Winkel sieht man vom Zielpunkt zum Flugzeug hoch
  return { laengs, quer, vorZiel, winkel, hoch: winkel - PLATZ.gleitweg, seitlich: Math.atan2(quer, Math.max(1, vorZiel + PLATZ.lang)) };
}
// Welche Bahn fliegt man gerade an? (die, auf die man zufliegt)
export const bahnFuer = (kurs) => Math.cos(kurs) >= 0 ? 36 : 18;

// PAPI: vier Lampen. Jede ist weiß, wenn man höher ist als ihr Winkel, sonst rot. Zwei weiß, zwei rot = genau richtig.
export const PAPI_WINKEL = [2.5, 2.83, 3.17, 3.5].map(g => g * GRAD);
export const papi = (p, richtung) => { const w = anflug(p, richtung).winkel; return PAPI_WINKEL.map(g => w > g); };
