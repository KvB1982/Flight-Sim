// Flugsimulator – die Luft: Wind, Böen und Unruhe. Ohne Grafik.
// Wind kommt „aus“ einer Richtung (wie auf dem Kompass: 270 = aus Westen) mit einer Stärke in Knoten.
import { KN, GRAD } from './flugzeuge.js';

export const WETTER = {
  ruhig: { name: 'Windstill', aus: 0, kn: 0, boe: 0, unruhe: 0 },
  leicht: { name: 'Leichter Wind von vorn (8 kn)', aus: 350, kn: 8, boe: 2, unruhe: 0.3 },
  seite: { name: 'Seitenwind von links (10 kn)', aus: 290, kn: 10, boe: 3, unruhe: 0.5 },
  boeig: { name: 'Böig von rechts (15 kn, Böen 24)', aus: 50, kn: 15, boe: 9, unruhe: 1 }
};

export function neueLuft(w) {
  const a = w.aus * GRAD;
  // Wind aus Norden (0) weht nach Süden (−z); aus Osten (90) weht nach Westen (+x)
  const rx = Math.sin(a), rz = -Math.cos(a);
  // Böen: mehrere langsame Wellen übereinander, das sieht zufällig aus und ist doch jedes Mal gleich
  const welle = (t, k) => Math.sin(t * 0.31 * k + k * 1.7) * 0.5 + Math.sin(t * 0.83 * k + k * 4.1) * 0.3 + Math.sin(t * 1.9 * k + k * 0.6) * 0.2;
  return {
    wetter: w,
    wind(p, t) {
      const h = Math.max(0, p[1]);
      const hoch = 0.65 + 0.35 * Math.min(1, h / 120);              // am Boden bremst die Erde den Wind
      const v = (w.kn + w.boe * Math.max(0, welle(t, 1))) * KN * hoch;
      const u = w.unruhe * Math.min(1, 0.4 + h / 150);
      return [rx * v + u * 0.9 * welle(t, 2.3), u * 0.7 * welle(t, 3.1), rz * v + u * 0.9 * welle(t, 1.7)];
    },
    // für die Anzeige: mittlerer Wind
    text: w.kn ? `Wind aus ${String(Math.round(w.aus / 10) * 10).padStart(3, '0')}° mit ${w.kn} kn` + (w.boe > 4 ? `, Böen ${w.kn + w.boe}` : '') : 'Windstill'
  };
}
