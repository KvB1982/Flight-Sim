// Flugsimulator – die Nachbesprechung: Nach einer Lektion sieht man seinen Flug noch einmal als Zeichnung.
// Links der Weg von oben (Norden ist oben), rechts die Höhe. Gelb = so bist du geflogen, hellblau gestrichelt = der Soll-Weg.
// Ohne three.js: gemalt wird auf eine normale Malfläche (canvas).
import { PLATZ } from './platz.js';
import { FT, KN } from './flugzeuge.js';

const GELB = '#ffc43c', BLAU = 'rgba(120,225,255,0.85)', GRAU = '#8fa3b3', ROT = '#ef5a4c';

// spur   : Punkte des Flugs { t, x, y, z, h (Höhe über Grund in Metern), v (Tempo in m/s), boden }
// soll   : Punkte des Soll-Wegs { x, y, z } oder null
// marken : Stellen, an denen die Lehrerin etwas angemerkt hat { x, z }
// mitAnflug : true = rechts den Endanflug von der Seite zeigen (sonst die Höhe über die Zeit)
export function maleNachflug(c, spur, soll, marken, mitAnflug) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = 720, H = 300;
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  g.font = '13px sans-serif'; g.textBaseline = 'middle';
  if (spur.length < 2) return;
  vonOben(g, 0, 0, W * 0.5 - 6, H, spur, soll, marken);
  // Das Aufsetzen: der erste Punkt am Boden nach mindestens 10 Sekunden in der Luft (kleine Hüpfer beim Start zählen nicht)
  const auf = mitAnflug ? spur.findIndex((p, i) => i >= 20 && p.boden && spur.slice(i - 20, i).every(q => !q.boden)) : -1;
  if (auf > 4) vonDerSeite(g, W * 0.5 + 6, 0, W * 0.5 - 6, H, spur, auf); 
  // Wer nur gerollt ist, sieht statt der Höhe sein Tempo
  else if (Math.max(...spur.map(p => p.h)) < 3) verlauf(g, W * 0.5 + 6, 0, W * 0.5 - 6, H, spur, p => (p.v || 0) / KN, 'Dein Tempo am Boden', 'kn', 12);
  else verlauf(g, W * 0.5 + 6, 0, W * 0.5 - 6, H, spur, p => p.h / FT, 'Deine Höhe über dem Boden', 'ft', 120);
}

function kasten(g, x, y, w, h, titel) {
  g.fillStyle = '#0f161d'; g.fillRect(x, y, w, h);
  g.fillStyle = GRAU; g.textAlign = 'left'; g.fillText(titel, x + 10, y + 14);
}
function linie(g, punkte, farbe, breit, strich) {
  g.strokeStyle = farbe; g.lineWidth = breit; g.setLineDash(strich || []); g.lineJoin = 'round'; g.beginPath();
  punkte.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.setLineDash([]);
}

// ---------------------------------------------------------------- der Weg von oben
function vonOben(g, x0, y0, w, h, spur, soll, marken) {
  kasten(g, x0, y0, w, h, 'Dein Weg von oben (Norden ist oben)');
  // Wie groß muss die Karte sein? Alles soll hineinpassen: Flug, Soll-Weg und die Bahn.
  const alle = [...spur, ...(soll || []), { x: 0, z: 0 }, { x: 0, z: PLATZ.lang }];
  let xa = Infinity, xb = -Infinity, za = Infinity, zb = -Infinity;
  for (const p of alle) { xa = Math.min(xa, p.x); xb = Math.max(xb, p.x); za = Math.min(za, p.z); zb = Math.max(zb, p.z); }
  const rand = 22, oben = 30, m = Math.min((w - 2 * rand) / Math.max(xb - xa, 200), (h - oben - rand) / Math.max(zb - za, 200));
  const mx = (xa + xb) / 2, mz = (za + zb) / 2, cx = x0 + w / 2, cy = y0 + oben + (h - oben - rand) / 2;
  // Westen ist +x, auf der Karte also links
  const P = p => [cx - (p.x - mx) * m, cy - (p.z - mz) * m];
  g.save(); g.beginPath(); g.rect(x0, y0 + 24, w, h - 24); g.clip();
  // Flugplatz: Bahn, Rollweg, Vorfeld
  const V = PLATZ.vorfeld, eck = (xl, xr, zu, zo, farbe) => { const [a, b] = P({ x: xl, z: zo }), [c2, d] = P({ x: xr, z: zu }); g.fillStyle = farbe; g.fillRect(Math.min(a, c2), Math.min(b, d), Math.max(1.5, Math.abs(c2 - a)), Math.max(1.5, Math.abs(d - b))); };
  eck(V.x - 48, V.x + 28, V.z - 58, V.z + 58, '#3a4652'); eck(-49, -41, 21, PLATZ.lang - 21, '#3a4652'); eck(-PLATZ.breit / 2, PLATZ.breit / 2, 0, PLATZ.lang, '#6c7b88');
  if (soll) linie(g, soll.map(P), BLAU, 1.5, [6, 5]);
  linie(g, spur.map(P), GELB, 2.2);
  // Anfang (Kreis) und Ende (Punkt), dazu die Stellen mit einer Anmerkung
  const [ax, ay] = P(spur[0]), [ex, ey] = P(spur[spur.length - 1]);
  g.strokeStyle = GELB; g.lineWidth = 2; g.beginPath(); g.arc(ax, ay, 5, 0, 7); g.stroke();
  g.fillStyle = GELB; g.beginPath(); g.arc(ex, ey, 4, 0, 7); g.fill();
  (marken || []).forEach((p, i) => { const [a, b] = P(p); g.fillStyle = ROT; g.beginPath(); g.arc(a, b, 7, 0, 7); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 10px sans-serif'; g.fillText(String(i + 1), a, b + 0.5); g.font = '13px sans-serif'; });
  g.restore();
  // Maßstab unten links
  const stueck = [100, 200, 500, 1000, 2000].find(s => s * m > 40) || 5000;
  g.strokeStyle = GRAU; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 + 12, y0 + h - 10); g.lineTo(x0 + 12 + stueck * m, y0 + h - 10); g.stroke();
  g.fillStyle = GRAU; g.textAlign = 'left'; g.fillText(stueck >= 1000 ? stueck / 1000 + ' km' : stueck + ' m', x0 + 18 + stueck * m, y0 + h - 10);
}

// Achsen für die rechten Bilder: malt Hilfslinien für die Höhe in Fuß und gibt die Umrechnung zurück
function hoehenAchse(g, x0, y0, w, h, fussMin, fussMax, einheit = 'ft') {
  const li = x0 + 46, re = x0 + w - 12, ob = y0 + 34, un = y0 + h - 26;
  const Y = fuss => un - (fuss - fussMin) / (fussMax - fussMin) * (un - ob);
  const schritt = [2, 5, 10, 20, 50, 100, 200, 500, 1000].find(s => (fussMax - fussMin) / s <= 6) || 2000;
  g.textAlign = 'right';
  for (let f = Math.ceil(fussMin / schritt) * schritt; f <= fussMax; f += schritt) { g.strokeStyle = 'rgba(143,163,179,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(li, Y(f)); g.lineTo(re, Y(f)); g.stroke(); g.fillStyle = GRAU; g.fillText(f + ' ' + einheit, li - 5, Y(f)); }
  return { li, re, ob, un, Y };
}

// ---------------------------------------------------------------- der Endanflug von der Seite
function vonDerSeite(g, x0, y0, w, h, spur, auf) {
  kasten(g, x0, y0, w, h, 'Dein Endanflug von der Seite');
  // rückwärts vom Aufsetzen: alles, was auf der Verlängerung der Bahn lag
  let ab = auf; while (ab > 0 && Math.abs(spur[ab - 1].x) < 350 && spur[ab - 1].z < spur[ab].z + 5 && spur[ab - 1].z > -4700) ab--;
  const stueck = spur.slice(ab, Math.min(spur.length, auf + 8)), zMin = Math.min(-600, stueck[0].z), zMax = Math.max(300, spur[auf].z + 80);
  const soll = z => Math.max(0, (PLATZ.zielpunkt - z) * Math.tan(PLATZ.gleitweg));
  const hMax = Math.max(200, ...stueck.map(p => p.h / FT), soll(zMin) / FT) * 1.1;
  const A = hoehenAchse(g, x0, y0, w, h, 0, hMax), X = z => A.li + (z - zMin) / (zMax - zMin) * (A.re - A.li);
  // die Bahn als dicker Strich am Boden
  g.strokeStyle = '#6c7b88'; g.lineWidth = 5; g.beginPath(); g.moveTo(X(0), A.un + 2); g.lineTo(Math.min(A.re, X(PLATZ.lang)), A.un + 2); g.stroke();
  linie(g, [[X(zMin), A.Y(soll(zMin) / FT)], [X(PLATZ.zielpunkt), A.Y(0)]], BLAU, 1.5, [6, 5]);
  linie(g, stueck.map(p => [X(p.z), A.Y(Math.max(0, p.h / FT))]), GELB, 2.2);
  g.fillStyle = GELB; g.beginPath(); g.arc(X(spur[auf].z), A.un, 4, 0, 7); g.fill();
  g.fillStyle = GRAU; g.textAlign = 'left'; g.fillText(`${(-zMin / 1000).toFixed(1)} km vor der Bahn`, A.li, y0 + h - 9);
  g.textAlign = 'right'; g.fillText('Bahn', Math.min(A.re, X(260)), y0 + h - 9);
}

// ---------------------------------------------------------------- ein Wert über die Zeit (Höhe oder Tempo)
function verlauf(g, x0, y0, w, h, spur, wert, titel, einheit, mindestWeit) {
  kasten(g, x0, y0, w, h, titel);
  const hs = spur.map(wert), mitte = (Math.min(...hs) + Math.max(...hs)) / 2, weit = Math.max(mindestWeit, (Math.max(...hs) - Math.min(...hs)) * 0.6);
  const fMin = Math.max(0, mitte - weit), A = hoehenAchse(g, x0, y0, w, h, fMin, fMin + 2 * weit, einheit), t0 = spur[0].t, t1 = spur[spur.length - 1].t;
  const X = t => A.li + (t - t0) / Math.max(1, t1 - t0) * (A.re - A.li);
  linie(g, spur.map(p => [X(p.t), A.Y(wert(p))]), GELB, 2.2);
  g.fillStyle = GRAU; g.textAlign = 'left'; g.fillText('Start', A.li, y0 + h - 9);
  g.textAlign = 'right'; g.fillText(`nach ${Math.round(t1 - t0)} Sekunden`, A.re, y0 + h - 9);
}
