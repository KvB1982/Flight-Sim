// Flugsimulator – die Fluginstrumente, gemalt auf eine 2D-Malfläche über dem 3D-Bild.
// Cockpit: Instrumentenbrett mit den klassischen sechs Rundinstrumenten und dem Drehzahlmesser.
// Außenansicht: ein schlankes HUD mit denselben Zahlen.
// Angezeigt wird in den Einheiten der Fliegerei: Knoten (kn), Fuß (ft), Fuß pro Minute (ft/min).
import { KN, FT } from './flugzeuge.js';

const TAU = Math.PI * 2, GRAD = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const BRETT_ANTEIL = 0.4;              // so viel der Bildhöhe nimmt das Instrumentenbrett ein

// ---------------------------------------------------------------- Bausteine
function rund(g, x, y, r, name) {
  g.save(); g.translate(x, y);
  g.fillStyle = '#15171a'; g.beginPath(); g.arc(0, 0, r * 1.07, 0, TAU); g.fill();
  g.fillStyle = '#0a0b0c'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.strokeStyle = '#3a3e44'; g.lineWidth = r * 0.04; g.stroke();
  if (name) { g.fillStyle = '#8f98a3'; g.font = `${r * 0.15}px sans-serif`; g.textAlign = 'center'; g.fillText(name, 0, r * 0.42); }
}
function striche(g, r, von, bis, n, lang, breit = 0.02, farbe = '#fff') {
  g.strokeStyle = farbe; g.lineWidth = r * breit;
  for (let i = 0; i <= n; i++) { const a = von + (bis - von) * i / n; g.beginPath(); g.moveTo(Math.cos(a) * r * (0.95 - lang), Math.sin(a) * r * (0.95 - lang)); g.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95); g.stroke(); }
}
function zahl(g, r, a, text, abstand = 0.68, gr = 0.17) { g.fillStyle = '#fff'; g.font = `bold ${r * gr}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, Math.cos(a) * r * abstand, Math.sin(a) * r * abstand); }
function bogen(g, r, von, bis, farbe, innen = 0.86) { g.strokeStyle = farbe; g.lineWidth = r * 0.07; g.beginPath(); g.arc(0, 0, r * innen, von, bis); g.stroke(); }
function zeiger(g, r, a, lang = 0.85, breit = 0.045, farbe = '#fff') {
  g.save(); g.rotate(a); g.fillStyle = farbe; g.beginPath(); g.moveTo(-r * 0.15, -r * breit); g.lineTo(r * lang, 0); g.lineTo(-r * 0.15, r * breit); g.closePath(); g.fill(); g.restore();
  g.fillStyle = '#2a2d31'; g.beginPath(); g.arc(0, 0, r * 0.08, 0, TAU); g.fill();
}

// ---------------------------------------------------------------- die sechs Instrumente
// Fahrtmesser: 0 oben, im Uhrzeigersinn. Bögen: weiß = Klappen erlaubt, grün = normal, gelb = nur in ruhiger Luft, rot = nie.
function fahrt(g, x, y, r, f) {
  rund(g, x, y, r, 'kn');
  const w = kn => -Math.PI / 2 + clamp(kn, 0, 190) / 190 * 330 * GRAD, v = f.T.v;
  bogen(g, r, w(v.abriss0), w(v.klappenMax), '#f2f2f2', 0.78); bogen(g, r, w(v.abriss), w(v.normalMax), '#2fbf4f'); bogen(g, r, w(v.normalMax), w(v.nie), '#f0c020');
  g.strokeStyle = '#e62e2e'; g.lineWidth = r * 0.05; g.beginPath(); g.moveTo(Math.cos(w(v.nie)) * r * 0.78, Math.sin(w(v.nie)) * r * 0.78); g.lineTo(Math.cos(w(v.nie)) * r * 0.95, Math.sin(w(v.nie)) * r * 0.95); g.stroke();
  striche(g, r, w(0), w(180), 18, 0.12); striche(g, r, w(0), w(180), 36, 0.06, 0.012);
  for (let k = 40; k <= 180; k += 20) zahl(g, r, w(k), String(k), 0.64, 0.15);
  zeiger(g, r, w(f.ias / KN)); g.restore();
}
// Künstlicher Horizont: blau = Himmel, braun = Erde. Das kleine orange Flugzeug in der Mitte bist du.
function horizont(g, x, y, r, f) {
  rund(g, x, y, r);
  g.save(); g.beginPath(); g.arc(0, 0, r * 0.94, 0, TAU); g.clip();
  g.rotate(-f.roll); const px = r / 28, ny = f.nick / GRAD * px;                 // 28 Grad bis zum Rand
  g.translate(0, ny);
  g.fillStyle = '#2f7fd6'; g.fillRect(-2 * r, -4 * r, 4 * r, 4 * r); g.fillStyle = '#7a4f2a'; g.fillRect(-2 * r, 0, 4 * r, 4 * r);
  g.strokeStyle = '#fff'; g.lineWidth = r * 0.02; g.beginPath(); g.moveTo(-2 * r, 0); g.lineTo(2 * r, 0); g.stroke();
  g.font = `${r * 0.11}px sans-serif`; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let d = -30; d <= 30; d += 5) { if (!d) continue; const b = d % 10 ? 0.12 : 0.25; g.beginPath(); g.moveTo(-r * b, -d * px); g.lineTo(r * b, -d * px); g.stroke(); if (d % 10 === 0) { g.fillText(String(Math.abs(d)), -r * 0.36, -d * px); g.fillText(String(Math.abs(d)), r * 0.36, -d * px); } }
  g.restore();
  // Schräglage-Skala oben (dreht mit dem Horizont), fester Zeiger
  g.save(); g.rotate(-f.roll); g.strokeStyle = '#fff'; g.lineWidth = r * 0.025;
  for (const d of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) { const a = (-90 + d) * GRAD, l = d % 30 === 0 ? 0.14 : 0.08; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.94, Math.sin(a) * r * 0.94); g.lineTo(Math.cos(a) * r * (0.94 - l), Math.sin(a) * r * (0.94 - l)); g.stroke(); }
  g.restore();
  g.fillStyle = '#ffb020'; g.beginPath(); g.moveTo(0, -r * 0.8); g.lineTo(-r * 0.06, -r * 0.68); g.lineTo(r * 0.06, -r * 0.68); g.closePath(); g.fill();
  g.strokeStyle = '#ffb020'; g.lineWidth = r * 0.045; g.beginPath(); g.moveTo(-r * 0.5, 0); g.lineTo(-r * 0.18, 0); g.lineTo(-r * 0.18, r * 0.07); g.moveTo(r * 0.5, 0); g.lineTo(r * 0.18, 0); g.lineTo(r * 0.18, r * 0.07); g.stroke();
  g.fillStyle = '#ffb020'; g.beginPath(); g.arc(0, 0, r * 0.03, 0, TAU); g.fill(); g.restore();
}
// Höhenmesser: langer Zeiger = Hunderter (eine Runde = 1000 ft), kurzer = Tausender. Dazu die Zahl im Fenster.
function hoehe(g, x, y, r, f) {
  rund(g, x, y, r, 'ft');
  const ft = f.p[1] / FT + 1.1 / FT * 0;
  striche(g, r, -Math.PI / 2, 1.5 * Math.PI, 10, 0.13); striche(g, r, -Math.PI / 2, 1.5 * Math.PI, 50, 0.06, 0.012);
  for (let i = 0; i < 10; i++) zahl(g, r, -Math.PI / 2 + i * TAU / 10, String(i), 0.66, 0.19);
  g.fillStyle = '#1d2024'; g.fillRect(-r * 0.34, -r * 0.4, r * 0.68, r * 0.24); g.fillStyle = '#e8f0ff'; g.font = `bold ${r * 0.19}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(Math.round(ft / 10) * 10), 0, -r * 0.275);
  zeiger(g, r, -Math.PI / 2 + ft / 10000 * TAU, 0.5, 0.07); zeiger(g, r, -Math.PI / 2 + (ft % 1000) / 1000 * TAU, 0.88, 0.035); g.restore();
}
// Wendezeiger: Das Flugzeug neigt sich, je schneller sich der Kurs dreht. Die Kugel unten soll in der Mitte bleiben
// („auf die Kugel treten“: Kugel rechts = rechtes Seitenruder).
function wende(g, x, y, r, f) {
  rund(g, x, y, r);
  g.strokeStyle = '#fff'; g.lineWidth = r * 0.04;
  // Marken: außen waagerecht = Flügel gerade, 20° darunter = Normalkurve (in 2 Minuten einmal im Kreis)
  for (const s of [-1, 1]) for (const a of [0, 20]) { const w = a * GRAD; g.beginPath(); g.moveTo(s * Math.cos(w) * r * 0.78, Math.sin(w) * r * 0.78); g.lineTo(s * Math.cos(w) * r * 0.93, Math.sin(w) * r * 0.93); g.stroke(); }
  g.fillStyle = '#8f98a3'; g.font = `${r * 0.12}px sans-serif`; g.textAlign = 'center'; g.fillText('L', -r * 0.62, r * 0.5); g.fillText('R', r * 0.62, r * 0.5); g.fillText('2 MIN', 0, -r * 0.5);
  g.save(); g.rotate(clamp(f.wende / (3 * GRAD) * 20, -40, 40) * GRAD);       // 3 Grad pro Sekunde = Normalkurve = bis zur Marke
  g.fillStyle = '#fff'; g.fillRect(-r * 0.72, -r * 0.03, r * 1.44, r * 0.06); g.beginPath(); g.arc(0, 0, r * 0.1, 0, TAU); g.fill(); g.fillRect(-r * 0.02, -r * 0.26, r * 0.04, r * 0.2); g.restore();
  // Kugel in ihrem Röhrchen
  g.fillStyle = '#d9d4c4'; g.beginPath(); g.roundRect(-r * 0.5, r * 0.56, r, r * 0.2, r * 0.1); g.fill();
  g.strokeStyle = '#111'; g.lineWidth = r * 0.02; g.beginPath(); g.moveTo(-r * 0.11, r * 0.56); g.lineTo(-r * 0.11, r * 0.76); g.moveTo(r * 0.11, r * 0.56); g.lineTo(r * 0.11, r * 0.76); g.stroke();
  g.fillStyle = '#111'; g.beginPath(); g.arc(clamp(f.kugel, -1, 1) * r * 0.4, r * 0.66, r * 0.09, 0, TAU); g.fill(); g.restore();
}
// Kurskreisel: Die Scheibe dreht sich, oben steht der Kurs. N = Norden (360), O = Osten (90), S = Süden, W = Westen.
function kurs(g, x, y, r, f) {
  rund(g, x, y, r);
  g.save(); g.rotate(-f.kurs);
  striche(g, r, 0, TAU, 36, 0.1, 0.02); striche(g, r, 0, TAU, 72, 0.05, 0.012);
  for (let d = 0; d < 360; d += 30) { g.save(); g.rotate(d * GRAD); g.fillStyle = d % 90 ? '#fff' : '#ffd24a'; g.font = `bold ${r * (d % 90 ? 0.16 : 0.2)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(d % 90 ? String(d / 10) : 'NOSW'[d / 90], 0, -r * 0.68); g.restore(); }
  g.restore();
  g.strokeStyle = '#ffb020'; g.lineWidth = r * 0.04; g.beginPath(); g.moveTo(0, -r * 0.35); g.lineTo(0, r * 0.3); g.moveTo(-r * 0.25, -r * 0.05); g.lineTo(r * 0.25, -r * 0.05); g.moveTo(-r * 0.1, r * 0.22); g.lineTo(r * 0.1, r * 0.22); g.stroke();
  g.fillStyle = '#ffb020'; g.beginPath(); g.moveTo(0, -r * 0.96); g.lineTo(-r * 0.06, -r * 1.07); g.lineTo(r * 0.06, -r * 1.07); g.closePath(); g.fill(); g.restore();
}
// Variometer: zeigt Steigen (Zeiger nach oben) und Sinken (nach unten) in 100 ft/min. Im Anflug sollen es etwa 3 bis 5 nach unten sein.
function vario(g, x, y, r, f) {
  rund(g, x, y, r, '100 ft/min');
  const w = v => Math.PI + clamp(v, -2000, 2000) / 2000 * 172 * GRAD;
  striche(g, r, w(-2000), w(2000), 8, 0.13); striche(g, r, w(-2000), w(2000), 40, 0.06, 0.012);
  for (const v of [-20, -15, -10, -5, 0, 5, 10, 15, 20]) zahl(g, r, w(v * 100), String(Math.abs(v)), 0.66, 0.16);
  g.fillStyle = '#8f98a3'; g.font = `${r * 0.11}px sans-serif`; g.fillText('STEIGEN', -r * 0.1, -r * 0.3); g.fillText('SINKEN', -r * 0.1, r * 0.2);
  zeiger(g, r, w(f.steig / FT * 60)); g.restore();
}
function drehzahl(g, x, y, r, f) {
  rund(g, x, y, r, 'U/min ×100');
  const w = u => 0.75 * Math.PI + clamp(u, 0, 3500) / 3500 * 1.5 * Math.PI;
  bogen(g, r, w(2100), w(2700), '#2fbf4f'); bogen(g, r, w(2700), w(2760), '#e62e2e');
  striche(g, r, w(0), w(3500), 7, 0.13); striche(g, r, w(0), w(3500), 35, 0.06, 0.012);
  for (let u = 0; u <= 3500; u += 500) zahl(g, r, w(u), String(u / 100), 0.64, 0.15);
  zeiger(g, r, w(f.drehzahl)); g.restore();
}
// kleine Balken: Klappen, Trimmung, Tank
function balken(g, x, y, w, h, f) {
  g.save(); g.translate(x, y); g.font = `${h * 0.105}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const feld = (i, name, male) => { const bx = (i - 1) * w * 0.34; g.fillStyle = '#0a0b0c'; g.beginPath(); g.roundRect(bx - w * 0.14, -h * 0.42, w * 0.28, h * 0.7, 6); g.fill(); g.strokeStyle = '#3a3e44'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#8f98a3'; g.fillText(name, bx, h * 0.4); g.save(); g.translate(bx, -h * 0.07); male(w * 0.2, h * 0.56); g.restore(); };
  feld(0, 'KLAPPEN', (bw, bh) => { for (let i = 0; i < 4; i++) { g.fillStyle = i === f.klappenStufe ? '#fff' : '#555'; g.fillText(String(f.T.klappen[i]) + '°', -bw * 0.25, -bh * 0.4 + i * bh * 0.27); } g.fillStyle = '#ffb020'; g.fillRect(bw * 0.2, -bh * 0.47 + f.klappen * bh * 0.8, bw * 0.35, bh * 0.1); });
  feld(1, 'TRIMMUNG', (bw, bh) => { g.fillStyle = '#555'; g.fillRect(-2, -bh * 0.45, 4, bh * 0.9); g.fillStyle = '#2fbf4f'; g.fillRect(-bw * 0.3, -3, bw * 0.6, 6); g.fillStyle = '#fff'; g.fillRect(-bw * 0.4, -f.trimm * bh * 0.42 - 4, bw * 0.8, 8); g.fillStyle = '#8f98a3'; g.font = `${bh * 0.16}px sans-serif`; g.fillText('hoch', bw * 0.0, -bh * 0.62 + bh * 1.0 * 0); });
  feld(2, 'TANK', (bw, bh) => { const voll = f.sprit / f.T.tank; g.fillStyle = '#333'; g.fillRect(-bw * 0.25, -bh * 0.45, bw * 0.5, bh * 0.9); g.fillStyle = voll < 0.15 ? '#e62e2e' : '#3aa0e0'; g.fillRect(-bw * 0.25, bh * 0.45 - voll * bh * 0.9, bw * 0.5, voll * bh * 0.9); });
  g.restore();
}

// ---------------------------------------------------------------- Instrumentenbrett (Cockpit)
export function maleBrett(g, W, H, f) {
  const hoch = H * BRETT_ANTEIL, oben = H - hoch;
  g.fillStyle = '#23262b'; g.beginPath(); g.moveTo(0, H); g.lineTo(0, oben + hoch * 0.1); g.quadraticCurveTo(W / 2, oben - hoch * 0.07, W, oben + hoch * 0.1); g.lineTo(W, H); g.closePath(); g.fill();
  g.strokeStyle = '#0d0e10'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, oben + hoch * 0.1); g.quadraticCurveTo(W / 2, oben - hoch * 0.07, W, oben + hoch * 0.1); g.stroke();
  const r = Math.min(hoch * 0.19, W * 0.085), dx = r * 2.32, dy = r * 2.1, cx = W * 0.5 - dx * 0.55, cy = oben + hoch * 0.1 + r;
  fahrt(g, cx - dx, cy, r, f); horizont(g, cx, cy, r, f); hoehe(g, cx + dx, cy, r, f);
  wende(g, cx - dx, cy + dy, r, f); kurs(g, cx, cy + dy, r, f); vario(g, cx + dx, cy + dy, r, f);
  drehzahl(g, cx + 2 * dx, cy, r * 0.9, f);
  balken(g, cx + 2 * dx + r * 0.45, cy + dy, r * 3.4, r * 1.9, f);
}

// ---------------------------------------------------------------- HUD (Außenansicht)
export function maleHud(g, W, H, f) {
  const s = Math.min(W, H) / 700, kasten = (x, y, w, h) => { g.fillStyle = 'rgba(10,14,18,0.55)'; g.beginPath(); g.roundRect(x, y, w, h, 8 * s); g.fill(); };
  g.textBaseline = 'middle';
  // links: Tempo mit Band
  const bx = 18 * s, by = H * 0.5, bh = 210 * s;
  kasten(bx, by - bh / 2, 86 * s, bh);
  g.save(); g.beginPath(); g.rect(bx, by - bh / 2, 86 * s, bh); g.clip();
  const kn = f.ias / KN, v = f.T.v, py = 3.2 * s;                               // Punkte pro Knoten
  const farbBand = (von, bis, farbe, x) => { g.fillStyle = farbe; g.fillRect(bx + x * s, by - (bis - kn) * py, 5 * s, (bis - von) * py); };
  farbBand(v.abriss, v.normalMax, '#2fbf4f', 78); farbBand(v.abriss0, v.klappenMax, '#f2f2f2', 72); farbBand(v.normalMax, v.nie, '#f0c020', 78); farbBand(0, v.abriss0, '#e62e2e', 78);
  g.fillStyle = '#cfd8e0'; g.font = `${14 * s}px sans-serif`; g.textAlign = 'right';
  for (let k = Math.max(0, Math.floor(kn / 10) * 10 - 40); k <= kn + 40; k += 10) { const y = by - (k - kn) * py; g.fillRect(bx + 60 * s, y - 1, 10 * s, 2); g.fillText(String(k), bx + 54 * s, y); }
  g.restore();
  g.fillStyle = '#0a0e12'; g.fillRect(bx - 2, by - 17 * s, 70 * s, 34 * s); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(bx - 2, by - 17 * s, 70 * s, 34 * s);
  g.fillStyle = f.abriss > 0.3 ? '#ff5a4a' : '#fff'; g.font = `bold ${24 * s}px sans-serif`; g.textAlign = 'right'; g.fillText(String(Math.round(kn)), bx + 62 * s, by + 1);
  g.fillStyle = '#9fb0bd'; g.font = `${12 * s}px sans-serif`; g.textAlign = 'left'; g.fillText('kn', bx + 4 * s, by - bh / 2 - 10 * s);
  // rechts: Höhe und Steigen/Sinken
  const rx = W - 110 * s, ft = f.p[1] / FT, fpm = f.steig / FT * 60;
  kasten(rx, by - bh / 2, 92 * s, bh);
  g.save(); g.beginPath(); g.rect(rx, by - bh / 2, 92 * s, bh); g.clip();
  g.fillStyle = '#cfd8e0'; g.font = `${14 * s}px sans-serif`; g.textAlign = 'left';
  for (let a = Math.floor(ft / 100) * 100 - 400; a <= ft + 400; a += 100) { const y = by - (a - ft) * 0.26 * s; g.fillRect(rx + 2 * s, y - 1, 10 * s, 2); g.fillText(String(a), rx + 18 * s, y); }
  g.restore();
  g.fillStyle = '#0a0e12'; g.fillRect(rx + 14 * s, by - 17 * s, 80 * s, 34 * s); g.strokeStyle = '#fff'; g.strokeRect(rx + 14 * s, by - 17 * s, 80 * s, 34 * s);
  g.fillStyle = '#fff'; g.font = `bold ${22 * s}px sans-serif`; g.textAlign = 'right'; g.fillText(String(Math.round(ft / 10) * 10), rx + 90 * s, by + 1);
  g.fillStyle = '#9fb0bd'; g.font = `${12 * s}px sans-serif`; g.textAlign = 'left'; g.fillText('ft', rx + 4 * s, by - bh / 2 - 10 * s);
  // Steigen/Sinken als Pfeil-Balken neben der Höhe
  const vy = clamp(fpm, -1500, 1500) / 1500 * bh / 2;
  g.fillStyle = 'rgba(10,14,18,0.55)'; g.fillRect(W - 14 * s, by - bh / 2, 8 * s, bh); g.fillStyle = fpm < -700 ? '#ff5a4a' : '#5fd07a'; g.fillRect(W - 14 * s, Math.min(by, by - vy), 8 * s, Math.abs(vy)); g.fillStyle = '#fff'; g.fillRect(W - 16 * s, by - 1, 12 * s, 2);
  g.fillStyle = '#fff'; g.font = `${15 * s}px sans-serif`; g.textAlign = 'right'; g.fillText((fpm > 0 ? '+' : '') + Math.round(fpm / 10) * 10 + ' ft/min', W - 20 * s, by + bh / 2 + 16 * s);
  // oben: Kurs
  const kx = W / 2, ky = 26 * s, grad = f.kurs / GRAD;
  kasten(kx - 150 * s, ky - 16 * s, 300 * s, 34 * s);
  g.save(); g.beginPath(); g.rect(kx - 150 * s, ky - 16 * s, 300 * s, 34 * s); g.clip(); g.textAlign = 'center'; g.font = `${13 * s}px sans-serif`;
  for (let d = Math.floor(grad / 10) * 10 - 40; d <= grad + 40; d += 10) { const x = kx + (d - grad) * 4 * s, n = ((d % 360) + 360) % 360; g.fillStyle = '#cfd8e0'; g.fillRect(x - 1, ky + 8 * s, 2, 8 * s); g.fillStyle = n % 90 ? '#cfd8e0' : '#ffd24a'; g.fillText(n % 90 ? String(n / 10).padStart(2, '0') : 'NOSW'[n / 90], x, ky - 2 * s); }
  g.restore();
  g.fillStyle = '#ffb020'; g.beginPath(); g.moveTo(kx, ky + 20 * s); g.lineTo(kx - 6 * s, ky + 30 * s); g.lineTo(kx + 6 * s, ky + 30 * s); g.closePath(); g.fill();
  g.fillStyle = '#fff'; g.font = `bold ${16 * s}px sans-serif`; g.textAlign = 'center'; g.fillText(String(Math.round(((grad % 360) + 360) % 360) || 360).padStart(3, '0') + '°', kx, ky + 44 * s);
  // unten Mitte: kleiner Horizont, Kugel, Gas, Klappen, Trimmung
  const r = 44 * s, hx = W / 2, hy = H - r - 16 * s;
  horizont(g, hx, hy, r, f);
  g.fillStyle = 'rgba(10,14,18,0.55)'; g.beginPath(); g.roundRect(hx - 40 * s, hy - r - 22 * s, 80 * s, 14 * s, 7 * s); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(hx + clamp(f.kugel, -1, 1) * 32 * s, hy - r - 15 * s, 6 * s, 0, TAU); g.fill(); g.fillStyle = '#9fb0bd'; g.fillRect(hx - 9 * s, hy - r - 22 * s, 1.5, 14 * s); g.fillRect(hx + 8 * s, hy - r - 22 * s, 1.5, 14 * s);
  kasten(hx + r + 14 * s, hy - 30 * s, 170 * s, 62 * s);
  g.fillStyle = '#fff'; g.font = `${14 * s}px sans-serif`; g.textAlign = 'left';
  g.fillText(`Gas ${Math.round(f.gas * 100)} %   ${Math.round(f.drehzahl / 10) * 10} U/min`, hx + r + 22 * s, hy - 16 * s);
  g.fillText(`Klappen ${f.T.klappen[f.klappenStufe]}°   Trimm ${f.trimm >= 0 ? '+' : ''}${Math.round(f.trimm * 100)}`, hx + r + 22 * s, hy + 2 * s);
  g.fillText(`Höhe über Grund ${Math.round(f.hoeheGrund / FT)} ft`, hx + r + 22 * s, hy + 20 * s);
}

// ---------------------------------------------------------------- Windanzeige (oben links, in jeder Ansicht)
// Der Pfeil zeigt, woher der Wind kommt – gesehen vom Flugzeug aus: oben = von vorn, rechts = von rechts.
// Darunter steht, wie viel davon von vorn (bremst) und wie viel von der Seite (schiebt weg) kommt.
export function maleWind(g, W, H, f, w) {
  const s = Math.min(W, H) / 700, x = 14 * s, y = 14 * s, r = 24 * s;
  const kn = Math.hypot(w[0], w[2]) / KN, aus = Math.atan2(w[0], -w[2]), rel = aus - f.kurs;
  g.save(); g.textBaseline = 'middle';
  g.fillStyle = 'rgba(10,14,18,0.55)'; g.beginPath(); g.roundRect(x, y, 208 * s, 62 * s, 8 * s); g.fill();
  const cx = x + 32 * s, cy = y + 31 * s;
  g.strokeStyle = '#8f98a3'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
  g.fillStyle = '#cfd8e0'; g.beginPath(); g.moveTo(cx, cy - 7 * s); g.lineTo(cx - 5 * s, cy + 6 * s); g.lineTo(cx + 5 * s, cy + 6 * s); g.closePath(); g.fill();      // das eigene Flugzeug, Nase nach oben
  g.font = `${14 * s}px sans-serif`; g.textAlign = 'left'; g.fillStyle = '#fff';
  if (kn < 1) { g.fillText('Windstill', x + 66 * s, cy); g.restore(); return; }
  g.save(); g.translate(cx, cy); g.rotate(rel);
  g.strokeStyle = '#46dcff'; g.fillStyle = '#46dcff'; g.lineWidth = 3 * s; g.beginPath(); g.moveTo(0, -r - 4 * s); g.lineTo(0, -r * 0.45); g.stroke();
  g.beginPath(); g.moveTo(0, -r * 0.3); g.lineTo(-6 * s, -r * 0.62); g.lineTo(6 * s, -r * 0.62); g.closePath(); g.fill(); g.restore();
  const grad = Math.round(((aus / GRAD) % 360 + 360) % 360 / 10) * 10 || 360, vorn = kn * Math.cos(rel), seite = kn * Math.sin(rel);
  g.fillText(`Wind aus ${String(grad).padStart(3, '0')}°  ${Math.round(kn)} kn`, x + 66 * s, cy - 15 * s);
  g.fillStyle = '#cfd8e0'; g.font = `${12.5 * s}px sans-serif`;
  g.fillText(`${vorn >= 0 ? 'von vorn' : 'von hinten'} ${Math.round(Math.abs(vorn))} kn`, x + 66 * s, cy + 3 * s);
  g.fillStyle = Math.abs(seite) >= 8 ? '#ffc43c' : '#cfd8e0';
  g.fillText(`${seite >= 0 ? 'von rechts' : 'von links'} ${Math.round(Math.abs(seite))} kn`, x + 66 * s, cy + 19 * s);
  g.restore();
}
