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

// ---------------------------------------------------------------- Die Platzrunde als Flugweg
// Eine Platzrunde ist ein Rechteck um den Flugplatz: starten, links herum, parallel zur Bahn zurück (Gegenanflug),
// noch zweimal links herum und landen. Hier steht der „perfekte“ Weg als Liste von Punkten alle 25 m: { x, y, z, s, teil }.
// Start und Landung nach Norden (Bahn 36), Kurven nach links (Westen = +x), Gegenanflug in 1000 Fuß.
export const RUNDE = { abstand: 1500, hoch: 305, radius: 400, nord: 2000, sued: -2000, abheben: 380, steigen: 0.095 };
export function platzrunde() {
  const R = RUNDE, ecken = [[0, R.abheben], [0, R.nord], [R.abstand, R.nord], [R.abstand, R.sued], [0, R.sued], [0, PLATZ.zielpunkt]];
  const namen = ['Abflug', 'Querabflug', 'Gegenanflug', 'Queranflug', 'Endanflug'];
  // 1. Der Weg am Boden entlang: gerade Stücke, die Ecken als Viertelkreise
  const roh = [], schritt = 25;
  const gerade = (a, b, teil) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(l / schritt)); for (let i = 0; i < n; i++) roh.push({ x: a[0] + (b[0] - a[0]) * i / n, z: a[1] + (b[1] - a[1]) * i / n, teil }); };
  let von = ecken[0];
  for (let i = 1; i < ecken.length; i++) {
    const e = ecken[i], letzte = i === ecken.length - 1;
    const dx = e[0] - ecken[i - 1][0], dz = e[1] - ecken[i - 1][1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
    const bis = letzte ? e : [e[0] - ux * R.radius, e[1] - uz * R.radius];
    gerade(von, bis, namen[i - 1]);
    if (letzte) { roh.push({ x: e[0], z: e[1], teil: namen[i - 1] }); break; }
    // Viertelkreis nach links: von der alten Richtung (ux, uz) in die neue
    const n = ecken[i + 1], l2 = Math.hypot(n[0] - e[0], n[1] - e[1]), vx = (n[0] - e[0]) / l2, vz = (n[1] - e[1]) / l2;
    const mx = bis[0] + vx * R.radius, mz = bis[1] + vz * R.radius, st = 12;
    for (let k = 0; k < st; k++) { const w = k / st * Math.PI / 2; roh.push({ x: mx - vx * R.radius * Math.cos(w) + ux * R.radius * Math.sin(w), z: mz - vz * R.radius * Math.cos(w) + uz * R.radius * Math.sin(w), teil: namen[i - 1] }); }
    von = [e[0] + vx * R.radius, e[1] + vz * R.radius];
  }
  let s = 0; roh.forEach((p, i) => { if (i) s += Math.hypot(p.x - roh[i - 1].x, p.z - roh[i - 1].z); p.s = s; });
  // 2. Die Höhe: steigen bis 1000 Fuß, halten bis querab vom Bahnanfang, dann gleichmäßig sinken;
  //    das letzte Stück ist der Gleitweg mit 3° auf den Zielpunkt
  const ende = s, endanflug = roh.find(p => p.teil === 'Endanflug').s, querab = roh.find(p => p.teil === 'Gegenanflug' && p.z <= 0).s;
  const hEnd = (ende - endanflug) * Math.tan(PLATZ.gleitweg);
  for (const p of roh) {
    if (p.s <= querab) p.y = Math.min(R.hoch, 2 + p.s * R.steigen);
    else if (p.s <= endanflug) p.y = R.hoch + (hEnd - R.hoch) * (p.s - querab) / (endanflug - querab);
    else p.y = (ende - p.s) * Math.tan(PLATZ.gleitweg);
  }
  return roh;
}
