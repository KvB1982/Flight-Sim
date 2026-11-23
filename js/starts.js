// Flugsimulator – wo ein Flug beginnen kann. Ohne Grafik, damit auch die Prüfwerkzeuge die Starts kennen.
import { KN, GRAD } from './flugzeuge.js';
import { PLATZ } from './platz.js';

// Wo ein Flug beginnen kann. Trimmung und Gas sind mit tools/trimm.mjs ausgemessen, damit es ruhig losgeht.
export const STARTS = {
  bahn: { name: 'Auf der Startbahn', text: 'Du stehst auf der Bahn 36. Vollgas, bei 55 kn sanft ziehen.', lage: { z: 40, kurs: 0, trimm: -0.35 } },
  anflug: { name: 'Im Landeanflug', text: '4 km vor der Bahn, Klappen 20°. Halte 65 bis 70 kn und zwei weiße, zwei rote Lichter.', lage: { z: -4000, kurs: 0, hoehe: (4000 + PLATZ.zielpunkt) * Math.tan(3 * GRAD) + 1.1, tempo: 70 * KN, bahn: -3 * GRAD, klappen: 2, trimm: -0.38, gas: 0.58 } },
  runde: { name: 'In der Platzrunde', text: 'Du fliegst im Gegenanflug nach Süden, die Bahn liegt links. Hinter der Bahn zweimal links herum und landen.', lage: { x: 1500, z: 900, kurs: Math.PI, hoehe: 305, tempo: 85 * KN, trimm: -0.45, gas: 0.73 } },
  vorfeld: { name: 'Am Vorfeld', text: 'Du parkst vor der Halle. Rolle über den gelben Strich zur Bahn (wenig Gas, mit dem Seitenruder lenken).', lage: { x: PLATZ.vorfeld.x, z: PLATZ.vorfeld.z, kurs: 270 * GRAD, trimm: -0.35 } }
};
