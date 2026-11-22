// Flugsimulator – der Außencheck zu Fuß: Man geht um das geparkte Flugzeug und schaut an sieben Stellen nach dem Rechten.
// Ohne Grafik. Orte am Flugzeug stehen in seinen eigenen Achsen: [nach links, nach vorn] in Metern.
import { schalte, tanke, liter } from './systeme.js';

// Was man an einer Stelle tun kann: text = Knopf, fertig = schon erledigt?, tu = erledigen (gibt einen Satz zurück, der angezeigt wird)
export const STELLEN = [
  {
    id: 'tankL', name: 'Linker Flügel: Tank', ort: [2.6, 1.7],
    tun: (f, s) => [
      { text: 'In den Tank schauen', fertig: s.geprueft.tank, tu: () => { s.geprueft.tank = true; return `Im Tank sind ${liter(f)} Liter. ${liter(f) < 30 ? 'Das ist zu wenig – tanken!' : 'Das reicht für eine Platzrunde mit Reserve.'}${s.deckel ? '' : ' Und der Tankdeckel ist lose!'}`; } },
      ...(s.deckel ? [] : [{ text: 'Tankdeckel festdrehen', fertig: false, tu: () => { s.deckel = true; return 'Der Deckel sitzt wieder fest.'; } }]),
      { text: 'Tanken: halb voll (100 Liter)', fertig: liter(f) >= 100, tu: () => `Der Tankautomat füllt ${tanke(f, 100)} Liter nach.` },
      { text: 'Tanken: ganz voll (208 Liter)', fertig: f.sprit >= f.T.tank - 1, tu: () => `Der Tankautomat füllt ${tanke(f, 999)} Liter nach. Voll ist das Flugzeug schwerer und steigt langsamer.` }
    ],
    erledigt: (f, s) => s.geprueft.tank && s.deckel
  },
  {
    id: 'staurohr', name: 'Staurohr unter dem Flügel', ort: [4.9, 1.2],
    tun: (f, s) => [{ text: 'Rote Hülle abnehmen', fertig: !s.huelle, tu: () => { schalte(f, 'huelle', false); return 'Die Hülle ist ab. Durch das Röhrchen misst der Fahrtmesser den Fahrtwind.'; } }],
    erledigt: (f, s) => !s.huelle
  },
  {
    id: 'nase', name: 'Motor und Propeller', ort: [0.9, 2.9],
    tun: (f, s) => [
      { text: 'Ölstand prüfen', fertig: s.geprueft.oel, tu: () => { s.geprueft.oel = true; return s.oelWenig ? 'Der Ölstand ist zu niedrig! Öl nachfüllen.' : 'Ölstand gut. Der Propeller hat keine Kerben.'; } },
      ...(s.geprueft.oel && s.oelWenig ? [{ text: 'Öl nachfüllen', fertig: false, tu: () => { s.oelWenig = false; return 'Ein Liter Öl dazu – jetzt passt es.'; } }] : []),
      ...(s.batterie < 0.1 ? [{ text: 'Mechaniker rufen: Batterie laden', fertig: false, tu: () => { s.batterie = 1; return 'Der Mechaniker schließt das Ladegerät an. Jemand hat nach dem letzten Flug den Hauptschalter angelassen.'; } }] : [])
    ],
    erledigt: (f, s) => s.geprueft.oel && !s.oelWenig
  },
  {
    id: 'tankR', name: 'Rechter Flügel: Tankdeckel', ort: [-2.6, 1.7],
    tun: (f, s) => [{ text: 'Tankdeckel prüfen', fertig: s.geprueft.deckelR, tu: () => { s.geprueft.deckelR = true; return 'Der rechte Deckel sitzt fest.'; } }],
    erledigt: (f, s) => s.geprueft.deckelR
  },
  {
    id: 'heck', name: 'Leitwerk', ort: [1.5, -5.2],
    tun: (f, s) => [{ text: 'Ruder mit der Hand bewegen', fertig: s.geprueft.ruder, tu: () => { s.geprueft.ruder = true; return 'Höhenruder und Seitenruder bewegen sich leicht und haken nicht.'; } }],
    erledigt: (f, s) => s.geprueft.ruder
  },
  {
    id: 'rad', name: 'Linkes Rad', ort: [2.4, -1.5],
    tun: (f, s) => [{ text: 'Bremskeile wegnehmen', fertig: !s.keile, tu: () => { schalte(f, 'keile', false); return 'Die Keile sind weg. Der Reifen hat genug Luft.'; } }],
    erledigt: (f, s) => !s.keile
  },
  {
    id: 'tuer', name: 'Tür', ort: [1.7, 0.0],
    tun: (f, s) => [{ text: 'Einsteigen', fertig: false, tu: () => { s.drin = true; return null; } }],
    erledigt: () => false
  }
];

// Wo liegt eine Stelle in der Welt? Das Flugzeug steht am Boden, also zählt nur sein Kurs.
// (Norden = +z, Westen = +x: vorn ist (−sin, cos), links ist (cos, sin).)
export function weltOrt(f, [links, vorn]) {
  const c = Math.cos(f.kurs), s = Math.sin(f.kurs);
  return [f.p[0] + links * c - vorn * s, f.p[2] + links * s + vorn * c];
}

// Der Mensch zu Fuß: Ort, Blickrichtung (wie ein Kurs), gehen und drehen
export class Geher {
  constructor(f) { const [x, z] = weltOrt(f, [7.5, -5.5]), [mx, mz] = weltOrt(f, [0, 0]); this.x = x; this.z = z; this.kurs = Math.atan2(-(mx - x), mz - z); }   // schräg hinter dem linken Flügel, Blick zum Flugzeug
  // vor: −1 … 1 (vorwärts), dreh: −1 … 1 (nach rechts)
  schritt(f, vor, dreh, dt) {
    this.kurs += dreh * 1.9 * dt;
    const tempo = (vor > 0 ? 3.2 : 1.6) * vor;
    this.x += -Math.sin(this.kurs) * tempo * dt; this.z += Math.cos(this.kurs) * tempo * dt;
    // nicht durch den Rumpf laufen: Abstand zur Linie von der Nase bis zum Heck mindestens 0,9 m (unter den Flügeln geht man durch)
    const c = Math.cos(f.kurs), s = Math.sin(f.kurs), dx = this.x - f.p[0], dz = this.z - f.p[2];
    const vorn = Math.max(-5.2, Math.min(2.5, -dx * s + dz * c)), mx = f.p[0] - vorn * s, mz = f.p[2] + vorn * c;
    const ax = this.x - mx, az = this.z - mz, a = Math.hypot(ax, az);
    if (a < 0.9) { const k = a > 0.01 ? 0.9 / a : 1; this.x = mx + (a > 0.01 ? ax * k : c * 0.9); this.z = mz + (a > 0.01 ? az * k : s * 0.9); }
  }
  // die nächste Stelle in Reichweite (1,7 m) oder null
  nah(f) {
    let beste = null, weit = 1.7;
    for (const st of STELLEN) { const [x, z] = weltOrt(f, st.ort), d = Math.hypot(x - this.x, z - this.z); if (d < weit) { weit = d; beste = st; } }
    return beste;
  }
}
