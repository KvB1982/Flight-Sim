// Flugsimulator – die Landkarte: das Alpenvorland von oben, gemalt auf eine Malfläche. Ohne three.js.
//
// Die Karte wird im Flugplaner benutzt (Punkte antippen) und im Flug (Taste M): Dort zeigt sie, wo man ist.
// Norden ist oben, Westen links. Erinnerung: In der Welt ist +x Westen und +z Norden.
import { GRENZE, PLAETZE, SEEN, FLUESSE, STRASSEN, ORTE, GIPFEL, bodenHoehe, bodenArt, NN, NM } from './region.js';
import { FEUER, grad3 } from './navigation.js';
import { FT } from './flugzeuge.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FARBEN = { see: [86, 140, 196], fluss: [86, 140, 196], ort: [214, 196, 176], wald: [168, 200, 146], feld: [214, 222, 168], alm: [196, 206, 150], fels: [176, 166, 150], schnee: [240, 243, 247] };
const BILD_ZELLE = 500;        // ein Bildpunkt des Karten-Hintergrunds ist so viele Meter breit

// Der Hintergrund (Farben nach der Landschaft, Berge mit Schatten) wird nur einmal gemalt und dann immer wieder benutzt
let grund = null;
function grundBild() {
  if (grund) return grund;
  const nx = Math.ceil((GRENZE.x1 - GRENZE.x0) / BILD_ZELLE), nz = Math.ceil((GRENZE.z1 - GRENZE.z0) / BILD_ZELLE);
  const c = document.createElement('canvas'); c.width = nx; c.height = nz;
  const g = c.getContext('2d'), bild = g.createImageData(nx, nz), d = bild.data;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    // Bildpunkt (0,0) ist oben links = Nordwesten = größtes x und größtes z
    const x = GRENZE.x1 - (i + 0.5) * BILD_ZELLE, z = GRENZE.z1 - (j + 0.5) * BILD_ZELLE, h = bodenHoehe(x, z);
    // Vier Stellen im Kästchen ansehen und die Farben mischen – sonst flimmern Wald und Feld wie ein Schachbrett
    let fr = 0, fg = 0, fb = 0, see = 0;
    for (const [u, v] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) { const art = bodenArt(x + u * BILD_ZELLE, z + v * BILD_ZELLE), c = FARBEN[art] || FARBEN.feld; fr += c[0] / 4; fg += c[1] / 4; fb += c[2] / 4; if (art === 'see') see++; }
    const f = [fr, fg, fb];
    // Schatten: Das Licht kommt von Nordwesten, Hänge nach Südosten sind dunkler (so sieht man die Berge)
    const hell = clamp(1 + ((bodenHoehe(x + BILD_ZELLE, z + BILD_ZELLE) - h) / BILD_ZELLE) * 1.6, 0.6, 1.25) * (see > 2 ? 1 : clamp(1.04 - Math.max(0, h + NN - 600) / 9000, 0.86, 1.04));
    const k = (j * nx + i) * 4; d[k] = clamp(f[0] * hell, 0, 255); d[k + 1] = clamp(f[1] * hell, 0, 255); d[k + 2] = clamp(f[2] * hell, 0, 255); d[k + 3] = 255;
  }
  g.putImageData(bild, 0, 0);
  return (grund = c);
}

export class Karte {
  constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); this.mx = 0; this.mz = 0; this.mpp = 120; this.W = 1; this.H = 1; }
  // Welt → Bild und zurück (Bildpunkte der Malfläche, so wie CSS sie zählt)
  bild(x, z) { return [this.W / 2 - (x - this.mx) / this.mpp, this.H / 2 - (z - this.mz) / this.mpp]; }
  welt(px, py) { return [this.mx - (px - this.W / 2) * this.mpp, this.mz - (py - this.H / 2) * this.mpp]; }
  // So einstellen, dass alle Punkte zu sehen sind
  passe(punkte, rand = 9000) {
    this.masse();
    const xs = punkte.map(p => p.x), zs = punkte.map(p => p.z), x0 = Math.min(...xs) - rand, x1 = Math.max(...xs) + rand, z0 = Math.min(...zs) - rand, z1 = Math.max(...zs) + rand;
    this.mx = (x0 + x1) / 2; this.mz = (z0 + z1) / 2; this.mpp = clamp(Math.max((x1 - x0) / this.W, (z1 - z0) / this.H), 12, 400);
  }
  schiebe(dx, dy) { this.mx = clamp(this.mx + dx * this.mpp, GRENZE.x0, GRENZE.x1); this.mz = clamp(this.mz + dy * this.mpp, GRENZE.z0, GRENZE.z1); }
  // näher heran oder weiter weg, die Stelle unter dem Finger bleibt stehen
  zoome(mal, px = this.W / 2, py = this.H / 2) { const [x, z] = this.welt(px, py); this.mpp = clamp(this.mpp * mal, 12, 400); const [x2, z2] = this.welt(px, py); this.mx += x - x2; this.mz += z - z2; }
  masse() {
    const r = this.c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    if (this.c.width !== Math.round(this.W * dpr) || this.c.height !== Math.round(this.H * dpr)) { this.c.width = Math.round(this.W * dpr); this.c.height = Math.round(this.H * dpr); }
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // Alles malen. was = { plan: Punkte des Plans, nr: nächster Punkt, f: Flugzeug, spur: [[x, z] …], feuer: gewähltes Funkfeuer }
  male(was = {}) {
    this.masse();
    const g = this.g, W = this.W, H = this.H, B = grundBild(), nah = this.mpp < 90, sehrNah = this.mpp < 40;
    g.fillStyle = '#25313c'; g.fillRect(0, 0, W, H);
    const [l, o] = this.bild(GRENZE.x1, GRENZE.z1), [r, u] = this.bild(GRENZE.x0, GRENZE.z0);
    g.imageSmoothingEnabled = true; g.drawImage(B, l, o, r - l, u - o);
    const zug = (L, farbe, breit) => { g.strokeStyle = farbe; g.lineWidth = breit; g.lineJoin = 'round'; g.beginPath(); L.p.forEach(([x, z], i) => { const [a, b] = this.bild(x, z); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.stroke(); };
    for (const F of FLUESSE) zug(F, '#4f86c2', clamp(F.breit / this.mpp, 1.6, 6));
    for (const S of STRASSEN) { zug(S, '#8a5a2a', 3.2); zug(S, '#f2c14a', 1.6); }
    // Seen noch einmal als glatte Ovale mit Rand
    for (const S of SEEN) { const [a, b] = this.bild(S.x, S.z); g.save(); g.translate(a, b); g.rotate(-S.dreh); g.fillStyle = '#5a92cc'; g.strokeStyle = '#3d6ea6'; g.lineWidth = 1; g.beginPath(); g.ellipse(0, 0, S.b / this.mpp, S.a / this.mpp, 0, 0, 7); g.fill(); g.stroke(); g.restore(); }
    const text = (t, x, y, farbe = '#1b232b', groesse = 12, fett = false, rand = 'rgba(255,255,255,0.8)') => { g.font = `${fett ? '600 ' : ''}${groesse}px sans-serif`; g.lineWidth = 3; g.strokeStyle = rand; g.strokeText(t, x, y); g.fillStyle = farbe; g.fillText(t, x, y); };
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const S of SEEN) if (nah || S.a > 4000) { const [a, b] = this.bild(S.x, S.z); text(S.name, a, b, '#17406e', 11); }
    // Orte: ein Punkt und der Name (kleine Orte erst, wenn man nah genug ist)
    for (const O of ORTE) {
      if (!nah && O.gross < 2) continue;
      const [a, b] = this.bild(O.x, O.z); g.fillStyle = '#7a5a48'; g.beginPath(); g.arc(a, b, 2 + O.gross, 0, 7); g.fill();
      text(O.name, a, b - 10 - O.gross, '#3a2a20', 10 + O.gross * 1.5, O.gross > 1);
    }
    for (const G of GIPFEL) { if (!nah && G.meer < 2500) continue; const [a, b] = this.bild(G.x, G.z); g.fillStyle = '#5b4a3a'; g.beginPath(); g.moveTo(a, b - 5);
      g.lineTo(a - 5, b + 4); g.lineTo(a + 5, b + 4); g.closePath(); g.fill(); text(`${G.name} ${Math.round(G.meer / FT / 100) * 100} ft`, a, b + 13, '#4a3a2c', 10); }
    // Funkfeuer: Sechseck mit Kennung
    for (const F of FEUER) {
      const [a, b] = this.bild(F.x, F.z), an = was.feuer && was.feuer.id === F.id;
      g.strokeStyle = an ? '#d0189a' : '#2a56b8'; g.lineWidth = an ? 3 : 2; g.beginPath(); for (let i = 0; i < 6; i++) { const w = i * Math.PI / 3;
        g[i ? 'lineTo' : 'moveTo'](a + 7 * Math.cos(w), b + 7 * Math.sin(w)); } g.closePath(); g.stroke(); g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(a, b, 1.6, 0, 7); g.fill();
      g.textAlign = 'left'; text(nah ? `${F.id} ${F.kurz}` : F.id, a + 11, b, an ? '#a01078' : '#1f418f', 10, true); g.textAlign = 'center';
    }
    // Flugplätze: Kreis mit der Bahn als Strich, darunter Name und Höhe
    for (const P of PLAETZE) {
      const [a, b] = this.bild(P.mx, P.mz), lang = sehrNah ? P.lang / 2 / this.mpp : 7;
      g.strokeStyle = '#b01fa0'; g.lineWidth = 2; g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.arc(a, b, 9, 0, 7); g.fill(); g.stroke();
      g.strokeStyle = P.belag === 'gras' ? '#2f7a2f' : '#20242a'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(a + Math.sin(P.kurs) * lang, b - Math.cos(P.kurs) * lang); g.lineTo(a - Math.sin(P.kurs) * lang, b + Math.cos(P.kurs) * lang); g.stroke();
      text(P.name, a, b - 17, '#7a1070', 12, true); if (nah) text(`${Math.round(P.meer / FT / 10) * 10} ft · ${P.bahnen.join('/')} · ${P.lang} m ${P.belag === 'gras' ? 'Gras' : 'Asphalt'}`, a, b + 18, '#7a1070', 10);
    }
    // Der Plan: Linie von Punkt zu Punkt, Nummern an den Punkten, an jedem Bein Kurs und Strecke
    const pl = was.plan || [];
    if (pl.length) {
      g.strokeStyle = '#e0208a'; g.lineWidth = 3; g.setLineDash([]); g.beginPath(); pl.forEach((p, i) => { const [a, b] = this.bild(p.x, p.z); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.stroke();
      for (let i = 1; i < pl.length; i++) {
        const A = pl[i - 1], Z = pl[i], [a, b] = this.bild((A.x + Z.x) / 2, (A.z + Z.z) / 2), weit = Math.hypot(Z.x - A.x, Z.z - A.z);
        if (weit / this.mpp > 70) text(`${grad3(Math.atan2(-(Z.x - A.x), Z.z - A.z))}° · ${(weit / NM).toFixed(0)} NM`, a, b - 9, '#a01060', 11, true);
      }
      pl.forEach((p, i) => { const [a, b] = this.bild(p.x, p.z), dran = was.nr === i; g.fillStyle = dran ? '#ffd23c' : '#e0208a'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(a, b, dran ? 9 : 7, 0, 7); g.fill(); g.stroke();
        g.fillStyle = dran ? '#1b232b' : '#fff'; g.font = '700 10px sans-serif'; g.fillText(i === 0 ? 'S' : i === pl.length - 1 && pl.length > 1 && p.art === 'platz' ? 'Z' : String(i), a, b + 0.5); });
    }
    // Die geflogene Spur und das Flugzeug
    if (was.spur && was.spur.length > 1) { g.strokeStyle = '#ffb020'; g.lineWidth = 2.2; g.beginPath(); was.spur.forEach(([x, z], i) => { const [a, b] = this.bild(x, z); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.stroke(); }
    if (was.f) {
      const f = was.f, [a, b] = this.bild(f.p[0], f.p[2]);
      g.save(); g.translate(a, b); g.rotate(f.kurs); g.fillStyle = '#ffdc3c'; g.strokeStyle = '#1b232b'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, -13); g.lineTo(3, -3); g.lineTo(13, 2); g.lineTo(13, 5); g.lineTo(3, 3); g.lineTo(2, 10); g.lineTo(6, 13); g.lineTo(-6, 13); g.lineTo(-2, 10); g.lineTo(-3, 3); g.lineTo(-13, 5); g.lineTo(-13, 2); g.lineTo(-3, -3); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
    // Maßstab unten links und der Nordpfeil
    const nm = [1, 2, 5, 10, 20, 50].find(n => n * NM / this.mpp > 60) || 50, breit = nm * NM / this.mpp;
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(10, H - 30, breit + 16, 22); g.strokeStyle = '#1b232b'; g.lineWidth = 2; g.beginPath(); g.moveTo(18, H - 16); g.lineTo(18, H - 12); g.lineTo(18 + breit, H - 12); g.lineTo(18 + breit, H - 16); g.stroke();
    g.fillStyle = '#1b232b'; g.font = '11px sans-serif'; g.fillText(`${nm} NM`, 18 + breit / 2, H - 21);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(W - 24, 26, 16, 0, 7); g.fill(); g.fillStyle = '#c0202a'; g.beginPath(); g.moveTo(W - 24, 12);
    g.lineTo(W - 29, 28); g.lineTo(W - 19, 28); g.closePath(); g.fill(); g.fillStyle = '#1b232b'; g.font = '700 10px sans-serif'; g.fillText('N', W - 24, 35);
  }
}
