// Flugsimulator – die Gegend für den Überlandflug: das Alpenvorland zwischen Augsburg, München, Rosenheim und den Alpen.
// Ohne Grafik, damit auch die Prüfwerkzeuge das Gelände kennen.
//
// Die Gegend gibt es wirklich. Seen, Flüsse, Städte und Gipfel liegen ungefähr dort, wo sie auf der Landkarte liegen
// (eingetragen aus dem Gedächtnis, nicht aus einer Karte abgemessen). Das Gelände dazwischen ist NICHT vermessen:
// Es wird aus den Höhen der Orte, aus den Gipfeln und aus einer Formel für Hügel und Berge gerechnet.
// Seen sind Ovale, Flüsse und Autobahnen sind Linien mit wenigen Punkten.
//
// Welt-Richtungen wie überall im Spiel: +z = Norden, +x = Westen, y = Höhe. Der Anfang der Bahn 36 von Lerchenfeld ist (0, 0).
// Höhen im Spiel zählen ab Lerchenfeld: y = Höhe über dem Meer − NN.
import { GRAD } from './flugzeuge.js';

export const NN = 700;                                   // so viele Meter liegt Lerchenfeld über dem Meer
const LAT0 = 47.975, LON0 = 11.225;                      // hier liegt Lerchenfeld (ausgedacht: auf dem Höhenrücken zwischen Ammersee und Starnberger See)
const M_LAT = 111190, M_LON = 111320 * Math.cos(LAT0 * GRAD);
// Breite und Länge (wie im Atlas) → Ort in der Spielwelt [x, z]
export const ort = (lat, lon) => [-(lon - LON0) * M_LON, (lat - LAT0) * M_LAT];
export const NM = 1852;                                  // eine Seemeile (nautische Meile) in Metern

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sanft = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Grenzen der Gegend (dahinter geht das Gelände einfach flach weiter)
export const GRENZE = (() => { const a = ort(47.38, 12.65), b = ort(48.60, 10.55); return { x0: a[0], z0: a[1], x1: b[0], z1: b[1] }; })();

// ---------------------------------------------------------------- Flugplätze
// kurs = Richtung der ersten Bahn (im Uhrzeigersinn ab Norden). x, z = Anfang (Schwelle) dieser Bahn, von dort läuft sie `lang` Meter.
// Lerchenfeld ist ausgedacht. Die anderen fünf Plätze gibt es wirklich; Lage, Bahnrichtung und Höhe sind ungefähr,
// die Bahnen sind im Spiel teils länger als in echt, und die Gebäude sind erfunden.
function platz(id, name, lat, lon, meer, grad, lang, breit, belag, text) {
  const k = grad * GRAD, [mx, mz] = ort(lat, lon), nr = Math.round(grad / 10), gegen = nr > 18 ? nr - 18 : nr + 18;
  return { id, name, x: mx + Math.sin(k) * lang / 2, z: mz - Math.cos(k) * lang / 2, mx, mz, kurs: k, lang, breit, belag, hoehe: meer - NN, meer,
    bahnen: [String(nr).padStart(2, '0'), String(gegen).padStart(2, '0')], flach: 1800, rand: 3600, text };
}
export const PLAETZE = [
  { id: 'lerchenfeld', name: 'Lerchenfeld', x: 0, z: 0, mx: 0, mz: 500, kurs: 0, lang: 1000, breit: 23, belag: 'asphalt', hoehe: 0, meer: NN, bahnen: ['36', '18'], flach: 3000, rand: 4600, text: 'Dein Heimatplatz zwischen Ammersee und Starnberger See.' },
  platz('augsburg', 'Augsburg', 48.425, 10.932, 462, 70, 1200, 30, 'asphalt', 'Großer Platz im Nordwesten am Lech, lange Asphaltbahn.'),
  platz('schleissheim', 'Oberschleißheim', 48.239, 11.561, 486, 80, 800, 20, 'asphalt', 'Alter Flugplatz im Norden von München.'),
  platz('vogtareuth', 'Vogtareuth', 47.946, 12.205, 470, 60, 650, 20, 'asphalt', 'Kleiner Platz am Inn bei Rosenheim, kurze Bahn.'),
  platz('koenigsdorf', 'Königsdorf', 47.829, 11.466, 600, 90, 700, 30, 'gras', 'Grasplatz bei Bad Tölz, die Berge sind schon nah.'),
  platz('ohlstadt', 'Ohlstadt', 47.652, 11.233, 650, 40, 650, 30, 'gras', 'Grasplatz bei Murnau direkt am Fuß der Alpen.')
];
// Vorfeld (Parkplatz) und Wartepunkt vor der Bahn liegen bei jedem Platz an derselben Stelle neben der Bahn
for (const P of PLAETZE) { P.vorfeld = { x: -95, z: Math.round(P.lang * 0.42) }; P.rollhalt = { x: -45, z: 30 }; P.zielpunkt = P.lang >= 900 ? 150 : 110; }
export const platzVon = id => PLAETZE.find(p => p.id === id);
// Ort auf dem Platz (lx = Meter links von der Mittellinie, lz = Meter hinter dem Bahnanfang) → Ort in der Welt, und zurück
export const platzWelt = (P, lx, lz) => [P.x + lx * Math.cos(P.kurs) - lz * Math.sin(P.kurs), P.z + lx * Math.sin(P.kurs) + lz * Math.cos(P.kurs)];
export const platzLokal = (P, x, z) => { const dx = x - P.x, dz = z - P.z; return [dx * Math.cos(P.kurs) + dz * Math.sin(P.kurs), -dx * Math.sin(P.kurs) + dz * Math.cos(P.kurs)]; };
// Welcher Platz ist am nächsten? (gemessen zur Bahnmitte)
export function naechsterPlatz(x, z) { let best = PLAETZE[0], d = Infinity; for (const P of PLAETZE) { const e = Math.hypot(x - P.mx, z - P.mz); if (e < d) { d = e; best = P; } } return { platz: best, weit: d }; }
// Auf welcher Bahn landet man bei diesem Wind am besten? ende 0 = erste Bahn (Richtung kurs), 1 = die Gegenrichtung.
// windAus = Richtung, aus der der Wind kommt (Bogenmaß). Man landet GEGEN den Wind.
export const bahnBeiWind = (P, windAus, kn) => kn < 2 ? 0 : (Math.cos(windAus - P.kurs) >= 0 ? 0 : 1);
export const bahnKurs = (P, ende) => ende ? P.kurs + Math.PI : P.kurs;
// Wo liegt ein Ort von der Landebahn aus gesehen? laengs = Meter hinter dem Anfang der Bahn, auf der man landet, quer = Meter rechts der Mitte.
export function bahnLage(P, ende, x, z) { const [lx, lz] = platzLokal(P, x, z); return ende ? { laengs: P.lang - lz, quer: lx } : { laengs: lz, quer: -lx }; }

// ---------------------------------------------------------------- Seen, Flüsse, Straßen, Orte, Gipfel
// See: Mitte, halbe Länge und halbe Breite in km, Drehung (0 = lang von Nord nach Süd, 90 = von West nach Ost), Höhe über dem Meer
const see = (name, lat, lon, a, b, dreh, meer) => { const [x, z] = ort(lat, lon); return { name, x, z, a: a * 1000, b: b * 1000, dreh: dreh * GRAD, meer, y: meer - NN }; };
export const SEEN = [
  see('Ammersee', 48.000, 11.120, 7.8, 2.4, 0, 533), see('Starnberger See', 47.905, 11.310, 9.8, 1.9, -8, 584),
  see('Chiemsee', 47.870, 12.450, 4.2, 6.5, 0, 518), see('Staffelsee', 47.695, 11.160, 1.5, 2.2, 0, 649),
  see('Kochelsee', 47.640, 11.345, 1.4, 1.9, 0, 599), see('Walchensee', 47.592, 11.345, 2.2, 3.3, 0, 800),
  see('Tegernsee', 47.712, 11.745, 3.1, 0.9, 10, 725), see('Schliersee', 47.722, 11.862, 1.2, 0.5, 0, 777),
  see('Simssee', 47.870, 12.235, 2.7, 0.7, 40, 470), see('Wörthsee', 48.062, 11.180, 1.6, 0.8, 30, 560),
  see('Forggensee', 47.615, 10.735, 4.0, 1.2, 0, 781), see('Riegsee', 47.697, 11.228, 0.9, 0.5, 0, 659)
];
const linie = (name, breit, ...pp) => { const p = pp.map(([lat, lon]) => ort(lat, lon)), xs = p.map(q => q[0]), zs = p.map(q => q[1]); return { name, breit, p, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }; };
export const FLUESSE = [
  linie('Isar', 150, [47.44, 11.26], [47.52, 11.28], [47.565, 11.48], [47.60, 11.58], [47.68, 11.57], [47.76, 11.56], [47.83, 11.50], [47.91, 11.43], [48.03, 11.52], [48.14, 11.59], [48.25, 11.67], [48.40, 11.76], [48.48, 11.95], [48.54, 12.15], [48.62, 12.40]),
  linie('Lech', 150, [47.50, 10.62], [47.57, 10.70], [47.66, 10.76], [47.81, 10.90], [47.93, 10.90], [48.05, 10.88], [48.20, 10.86], [48.37, 10.91], [48.50, 10.88], [48.62, 10.86]),
  linie('Inn', 180, [47.38, 11.95], [47.48, 12.06], [47.58, 12.17], [47.72, 12.13], [47.86, 12.13], [47.96, 12.17], [48.06, 12.23], [48.15, 12.33], [48.25, 12.52], [48.27, 12.66]),
  linie('Loisach', 90, [47.42, 10.93], [47.49, 11.10], [47.58, 11.16], [47.66, 11.24], [47.655, 11.33], [47.70, 11.39], [47.80, 11.42], [47.91, 11.43]),
  linie('Amper', 80, [48.08, 11.13], [48.13, 11.20], [48.18, 11.25], [48.26, 11.44], [48.33, 11.60], [48.42, 11.74], [48.48, 11.95]),
  linie('Ammer', 70, [47.60, 11.07], [47.70, 11.00], [47.80, 11.07], [47.87, 11.13], [47.935, 11.125]),
  linie('Mangfall', 70, [47.745, 11.745], [47.86, 11.80], [47.87, 11.95], [47.86, 12.13])
];
// Autobahnen als Landmarken (nur grob)
export const STRASSEN = [
  linie('Autobahn nach Garmisch', 40, [48.10, 11.50], [48.00, 11.42], [47.90, 11.39], [47.78, 11.33], [47.68, 11.25], [47.62, 11.20]),
  linie('Autobahn nach Lindau', 40, [48.13, 11.48], [48.10, 11.30], [48.08, 11.08], [48.06, 10.87], [48.02, 10.60]),
  linie('Autobahn nach Salzburg', 40, [48.08, 11.62], [47.95, 11.72], [47.87, 11.80], [47.85, 12.05], [47.83, 12.30], [47.82, 12.62]),
  linie('Autobahn nach Stuttgart', 40, [48.18, 11.46], [48.27, 11.20], [48.37, 10.95], [48.42, 10.60]),
  linie('Autobahn nach Nürnberg', 40, [48.19, 11.60], [48.33, 11.62], [48.48, 11.60], [48.62, 11.57])
];
// Orte: gross 3 = Großstadt, 2 = Stadt, 1 = kleine Stadt. meer = Höhe über dem Meer (daraus wird das Gelände gerechnet).
const stadt = (name, lat, lon, meer, gross = 1) => { const [x, z] = ort(lat, lon); return { name, x, z, meer, gross, r: [0, 1100, 2200, 8500][gross] }; };
export const ORTE = [
  stadt('München', 48.137, 11.575, 520, 3), stadt('Augsburg', 48.370, 10.900, 490, 2), stadt('Rosenheim', 47.856, 12.125, 447, 2),
  stadt('Landsberg', 48.050, 10.875, 590), stadt('Weilheim', 47.840, 11.140, 563), stadt('Starnberg', 48.000, 11.340, 590),
  stadt('Bad Tölz', 47.760, 11.560, 660), stadt('Garmisch-Partenkirchen', 47.492, 11.095, 708, 2), stadt('Murnau', 47.680, 11.200, 690),
  stadt('Fürstenfeldbruck', 48.180, 11.250, 520), stadt('Dachau', 48.260, 11.435, 480), stadt('Freising', 48.400, 11.750, 448),
  stadt('Erding', 48.305, 11.905, 463), stadt('Wolfratshausen', 47.912, 11.420, 577), stadt('Holzkirchen', 47.880, 11.700, 690),
  stadt('Miesbach', 47.790, 11.830, 700), stadt('Schongau', 47.812, 10.895, 710), stadt('Kaufbeuren', 47.880, 10.620, 680),
  stadt('Füssen', 47.570, 10.700, 808), stadt('Wasserburg', 48.060, 12.230, 430), stadt('Kufstein', 47.583, 12.170, 499),
  stadt('Penzberg', 47.750, 11.375, 600), stadt('Ebersberg', 48.078, 11.970, 560), stadt('Herrsching', 48.000, 11.170, 545),
  stadt('Bad Aibling', 47.865, 12.010, 480), stadt('Peißenberg', 47.800, 11.065, 590), stadt('Mittenwald', 47.440, 11.262, 912),
  stadt('Lenggries', 47.680, 11.575, 680), stadt('Oberammergau', 47.597, 11.065, 837), stadt('Landshut', 48.540, 12.150, 393, 2),
  stadt('Aichach', 48.458, 11.130, 440), stadt('Mühldorf', 48.250, 12.520, 383), stadt('Traunstein', 47.870, 12.645, 590),
  stadt('Tegernsee', 47.708, 11.757, 735), stadt('Dießen', 47.950, 11.105, 540), stadt('Tutzing', 47.908, 11.280, 600)
];
// zusätzliche Höhen-Stützpunkte ohne Stadt (damit das Flachland stimmt)
const STUETZEN = [[47.975, 11.225, 700], [48.02, 10.49, 600], [47.72, 10.33, 680], [48.55, 10.60, 430], [48.55, 12.60, 400], [47.72, 12.00, 800], [47.76, 12.32, 620], [48.20, 12.00, 500], [47.95, 11.00, 620], [48.10, 11.75, 530], [47.62, 11.50, 720], [47.50, 11.75, 900], [47.45, 12.10, 520], [47.42, 12.45, 760]].map(([lat, lon, meer]) => { const [x, z] = ort(lat, lon); return { x, z, meer }; });
const gipfel = (name, lat, lon, meer) => { const [x, z] = ort(lat, lon); return { name, x, z, meer }; };
export const GIPFEL = [
  gipfel('Zugspitze', 47.421, 10.985, 2962), gipfel('Alpspitze', 47.430, 11.050, 2628), gipfel('Wendelstein', 47.703, 12.012, 1838),
  gipfel('Benediktenwand', 47.653, 11.465, 1800), gipfel('Herzogstand', 47.612, 11.310, 1731), gipfel('Kampenwand', 47.755, 12.366, 1669),
  gipfel('Säuling', 47.532, 10.752, 2047), gipfel('Karwendelspitze', 47.430, 11.300, 2385), gipfel('Hoher Peißenberg', 47.800, 11.010, 988),
  gipfel('Ettaler Manndl', 47.582, 11.120, 1633), gipfel('Wallberg', 47.668, 11.795, 1722), gipfel('Rotwand', 47.650, 11.930, 1884),
  gipfel('Hochries', 47.748, 12.250, 1569), gipfel('Brauneck', 47.662, 11.520, 1555), gipfel('Wank', 47.510, 11.142, 1780),
  gipfel('Krottenkopf', 47.555, 11.190, 2086), gipfel('Soiernspitze', 47.490, 11.350, 2257), gipfel('Guffert', 47.530, 11.800, 2195),
  gipfel('Hochplatte', 47.550, 10.850, 2082), gipfel('Wilder Kaiser', 47.560, 12.300, 2344), gipfel('Hörnle', 47.640, 11.060, 1548)
];

// ---------------------------------------------------------------- Abstand zu Linien und Seen
function abstandLinie(L, x, z, mehrAls = 0) {
  // mehrAls: Ist die Linie sicher weiter weg als das, wird nicht genau gerechnet (spart viel Zeit)
  if (mehrAls && (x < L.x0 - mehrAls || x > L.x1 + mehrAls || z < L.z0 - mehrAls || z > L.z1 + mehrAls)) return mehrAls;
  let best = Infinity; const p = L.p;
  for (let i = 1; i < p.length; i++) {
    const ax = p[i - 1][0], az = p[i - 1][1], bx = p[i][0] - ax, bz = p[i][1] - az, t = clamp(((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz), 0, 1);
    const d = Math.hypot(x - ax - bx * t, z - az - bz * t); if (d < best) best = d;
  }
  return best;
}
// Wie weit drin im See? 0 = Mitte, 1 = Ufer, mehr = draußen
const seeMass = (S, x, z) => { const dx = x - S.x, dz = z - S.z, c = Math.cos(S.dreh), s = Math.sin(S.dreh), u = dx * s + dz * c, v = dx * c - dz * s; return Math.hypot(u / S.a, v / S.b); };
export function seeBei(x, z) { for (const S of SEEN) if (Math.abs(x - S.x) < S.a + S.b && Math.abs(z - S.z) < S.a + S.b && seeMass(S, x, z) < 1) return S; return null; }

// ---------------------------------------------------------------- Die Höhen-Formel
// Wo fangen die Alpen an? Je nach Länge auf einer anderen Breite (im Westen weiter südlich).
const RAND = [[10.5, 47.60], [10.75, 47.585], [11.0, 47.625], [11.3, 47.635], [11.6, 47.705], [12.0, 47.735], [12.4, 47.775], [12.7, 47.78]].map(([lon, lat]) => ort(lat, lon));
function alpenRand(x) { for (let i = 1; i < RAND.length; i++) if (x >= RAND[i][0] || i === RAND.length - 1) { const a = RAND[i - 1], b = RAND[i], t = clamp((x - a[0]) / (b[0] - a[0]), 0, 1); return a[1] + (b[1] - a[1]) * t; } return RAND[0][1]; }
// Wellen-Muster für Bergkämme (0 = Tal, 1 = Kamm) und für kleine Buckel (−1 … 1). Immer gleich, kein Zufall.
const kamm = (x, z) => {
  const a = 1 - Math.abs(Math.sin(x * 0.00042 + 1.1 + 0.6 * Math.sin(z * 0.00031)) * Math.cos(z * 0.00055 - 0.7 + 0.5 * Math.sin(x * 0.00027)));
  const b = 1 - Math.abs(Math.sin(x * 0.00097 - z * 0.00061 + 2.3) * Math.cos(z * 0.0011 + x * 0.00043));
  return 0.68 * a * a + 0.32 * b;
};
const buckel = (x, z) => 0.5 * Math.sin(x * 0.0031 + 1.3 + 1.2 * Math.sin(z * 0.0017)) * Math.cos(z * 0.0027 - 0.4) + 0.3 * Math.sin(x * 0.0079 - z * 0.0053) + 0.2 * Math.sin(z * 0.0131 + x * 0.0097);
const ALLE_STUETZEN = [...ORTE, ...STUETZEN];
const TAL = FLUESSE.filter(f => ['Isar', 'Inn', 'Loisach', 'Lech', 'Ammer'].includes(f.name));
// Höhe über dem Meer ohne Seen und ohne Flugplätze, dazu „berg“ (0 = Flachland oder Talboden, 1 = Berghang mitten in den Alpen). Nur für die Tabelle unten.
function grundHoehe(x, z, ohneGipfel) {
  // 1. Das „Stockwerk“: aus den Höhen der Orte ringsum, nahe Orte zählen viel mehr
  let sum = 0, gew = 0;
  for (const o of ALLE_STUETZEN) { const d2 = (x - o.x) * (x - o.x) + (z - o.z) * (z - o.z) + 4e6, g = 1 / (d2 * d2); sum += g * o.meer; gew += g; }
  let h = sum / gew;
  // 2. Berge: südlich vom Alpenrand, in den Flusstälern bleibt der Talboden
  const sued = (alpenRand(x) - z) / 1000, berg = sanft(sued, -1.5, 8); let rau = 0;
  if (berg > 0) {
    let tal = Infinity; for (const f of TAL) tal = Math.min(tal, abstandLinie(f, x, z, 4000));
    let amSee = 1; for (const S of SEEN) amSee = Math.min(amSee, sanft(seeMass(S, x, z), 1.0, 2.2));
    const frei = sanft(tal, 500, 3800) * amSee;                            // 0 = Talboden oder Seeufer, 1 = freier Berghang
    h += berg * (300 + 800 * sanft(sued, 2, 26)) * kamm(x, z) * frei + berg * 120 * sanft(tal, 300, 2500) * amSee;
    rau = berg * frei;
  }
  // 3. Gipfel: Jeder echte Gipfel bekommt einen Buckel, der genau bis zu seiner Höhe reicht
  if (!ohneGipfel) for (const g of GIPFEL) { const d2 = (x - g.x) * (x - g.x) + (z - g.z) * (z - g.z); if (d2 < 1.2e8 && g.plus > 0) h += g.plus * Math.exp(-d2 / 6.5e6); }
  return [h, rau];
}

// ---------------------------------------------------------------- Die Tabelle (einmal ausrechnen, dann nur noch nachschlagen)
// Die Formel oben ist langsam. Deshalb wird sie einmal für ein Gitter alle 250 m ausgerechnet (dauert etwa eine Sekunde).
const ZELLE = 250;
let TAB = null;
function tabelle() {
  if (TAB) return TAB;
  for (const g of GIPFEL) g.plus = 0;
  for (const g of GIPFEL) g.plus = g.meer - grundHoehe(g.x, g.z, true)[0];
  const nx = Math.ceil((GRENZE.x1 - GRENZE.x0) / ZELLE) + 1, nz = Math.ceil((GRENZE.z1 - GRENZE.z0) / ZELLE) + 1;
  const H = new Float32Array(nx * nz), B = new Float32Array(nx * nz), F = new Float32Array(nx * nz), O = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = GRENZE.x0 + i * ZELLE, z = GRENZE.z0 + j * ZELLE, k = j * nx + i, [h, b] = grundHoehe(x, z);
    H[k] = h; B[k] = b;
    let fl = 3000; for (const f of FLUESSE) { if (fl < 1) break; const d = abstandLinie(f, x, z, 3200) - f.breit; if (d < fl) fl = d; } F[k] = fl;
    for (const o of ORTE) { const dx = x - o.x, dz = z - o.z; if (Math.abs(dx) > o.r || Math.abs(dz) > o.r) continue; if (Math.hypot(dx, dz) < o.r * (0.75 + 0.25 * Math.sin(Math.atan2(dz, dx) * 5 + o.x))) { O[k] = o.gross; break; } }
  }
  return TAB = { nx, nz, H, B, F, O };
}
function lies(feld, x, z) {
  const T = TAB, u = clamp((x - GRENZE.x0) / ZELLE, 0, T.nx - 1.001), v = clamp((z - GRENZE.z0) / ZELLE, 0, T.nz - 1.001), i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, k = j * T.nx + i;
  return (feld[k] * (1 - a) + feld[k + 1] * a) * (1 - b) + (feld[k + T.nx] * (1 - a) + feld[k + T.nx + 1] * a) * b;
}

// ---------------------------------------------------------------- Das Gelände, wie das Spiel es benutzt
// Höhe des Bodens im Spiel (Meter über Lerchenfeld). Rund um jeden Flugplatz ist es flach.
export function bodenHoehe(x, z) {
  if (x * x + (z - 500) * (z - 500) < 9e6) return 0;                       // um Lerchenfeld: sofort fertig (das Meiste spielt hier)
  tabelle();
  const berg = lies(TAB.B, x, z);
  let h = lies(TAB.H, x, z) + (9 + 120 * berg) * buckel(x, z) - NN;
  for (const P of PLAETZE) { const d = Math.hypot(x - P.mx, z - P.mz); if (d < P.rand) h = P.hoehe + (h - P.hoehe) * sanft(d, P.flach, P.rand); }
  for (const S of SEEN) {
    if (Math.abs(x - S.x) > 1.5 * (S.a + S.b) || Math.abs(z - S.z) > 1.5 * (S.a + S.b)) continue;
    const r = seeMass(S, x, z);
    if (r < 1) return S.y - 2 - 12 * (1 - r);                              // Seegrund
    if (r < 1.4) h = S.y + 0.6 + (h - S.y - 0.6) * sanft(r, 1, 1.4);        // Ufer
  }
  return h;
}
// Was liegt hier? 'see', 'fluss', 'ort', 'wald', 'feld', 'alm', 'fels', 'schnee' – für die Farben in 3D und auf der Karte
export function bodenArt(x, z, h = bodenHoehe(x, z)) {
  if (seeBei(x, z)) return 'see';
  tabelle();
  const meer = h + NN, berg = lies(TAB.B, x, z);
  if (lies(TAB.F, x, z) < 0) return 'fluss';
  const u = clamp(Math.round((x - GRENZE.x0) / ZELLE), 0, TAB.nx - 1), v = clamp(Math.round((z - GRENZE.z0) / ZELLE), 0, TAB.nz - 1);
  if (TAB.O[v * TAB.nx + u]) return 'ort';
  if (meer > 2450) return 'schnee';
  if (meer > 1900) return 'fels';
  if (meer > 1550) return 'alm';
  if (berg > 0.35) return meer > 1000 || buckel(x * 0.7, z * 0.7) > -0.25 ? 'wald' : 'feld';
  const fleck = Math.sin(x * 0.0011 + 1) * Math.cos(z * 0.0009 - 2) + 0.7 * Math.sin(x * 0.0037 + z * 0.0023) + 0.4 * Math.sin(z * 0.0071 - x * 0.0043);
  return fleck > 0.42 ? 'wald' : 'feld';
}
// Wie nah ist der nächste Fluss? (Meter, höchstens 3000; kleiner als 0 = im Fluss)
export const flussNah = (x, z) => (tabelle(), lies(TAB.F, x, z));
// Die höchste Stelle zwischen zwei Orten (für den Flugplaner: Wie hoch muss ich mindestens fliegen?)
export function hoechstesZwischen(ax, az, bx, bz, breit = 1500) {
  const l = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(l / 400)), qx = -(bz - az) / (l || 1), qz = (bx - ax) / (l || 1);
  let hoch = -Infinity;
  for (let i = 0; i <= n; i++) for (const s of [-1, 0, 1]) { const x = ax + (bx - ax) * i / n + qx * s * breit, z = az + (bz - az) * i / n + qz * s * breit; hoch = Math.max(hoch, bodenHoehe(x, z)); }
  return hoch;
}
// Für die Prüfwerkzeuge und die Karte
export const tabelleBauen = () => tabelle();
