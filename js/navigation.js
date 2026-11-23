// Flugsimulator – Flugplanung und Navigation für den Überlandflug. Ohne Grafik (das Prüfwerkzeug tools/ueberland.mjs rechnet mit).
//
// Ein Flugplan ist eine Kette von Punkten: Startplatz, Wegpunkte, Zielplatz. Zwischen zwei Punkten liegt ein „Bein“.
// Der Planer rechnet für jedes Bein: Kurs über Grund, Entfernung, den Steuerkurs gegen den Wind, Zeit und Sprit.
// Im Flug sagt das Navi, wohin es zum nächsten Punkt geht und wie weit man neben der Linie ist.
// Nord auf der Karte ist auch Nord auf dem Kompass (die kleine Abweichung der Kompassnadel lässt das Spiel weg).
import { KN, FT, GRAD } from './flugzeuge.js';
import { PLAETZE, ORTE, SEEN, GIPFEL, ort, NM, NN, hoechstesZwischen } from './region.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wickel = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
// Kurs (im Uhrzeigersinn ab Norden) von einem Ort zu einem anderen. Erinnerung: +x ist Westen.
export const kursVon = (ax, az, bx, bz) => Math.atan2(-(bx - ax), bz - az);
export const grad3 = k => String(Math.round(((k / GRAD) % 360 + 360) % 360) || 360).padStart(3, '0');

// ---------------------------------------------------------------- Funkfeuer
// Sender am Boden, zu denen eine Nadel im Cockpit zeigt. Namen, Kennungen und Orte sind von uns gesetzt (keine echten Funkfeuer).
const feuer = (id, name, lat, lon) => { const [x, z] = ort(lat, lon); return { id, name: 'Funkfeuer ' + name, kurz: name, x, z, art: 'feuer' }; };
export const FEUER = [
  feuer('LFD', 'Lerchenfeld', 47.990, 11.225), feuer('AGB', 'Augsburg', 48.400, 10.960), feuer('MUN', 'München Nord', 48.260, 11.520),
  feuer('ROS', 'Rosenheim', 47.920, 12.170), feuer('TLZ', 'Tölz', 47.800, 11.500), feuer('MRN', 'Murnau', 47.690, 11.230)
];
// Was zeigt das Funkfeuer-Instrument? peil = Richtung zum Sender, dme = Entfernung in NM,
// nadel = −1 … 1: wo die gewählte Kurslinie liegt (rechts = nach rechts fliegen), zu = fliegt man zum Sender hin?
export function feuerAnzeige(f, F, kursGewaehlt) {
  const peil = kursVon(f.p[0], f.p[2], F.x, F.z), dme = Math.hypot(F.x - f.p[0], F.z - f.p[2]) / NM;
  const zu = Math.cos(peil - kursGewaehlt) >= 0, diff = zu ? wickel(peil - kursGewaehlt) : -wickel(peil + Math.PI - kursGewaehlt);
  return { id: F.id, name: F.name, peil, dme, zu, nadel: clamp(diff / (10 * GRAD), -1, 1), kurs: kursGewaehlt };
}

// ---------------------------------------------------------------- Punkte, die man im Planer antippen kann
export const PUNKTE = [
  ...PLAETZE.map(P => ({ id: P.id, name: P.name, x: P.mx, z: P.mz, art: 'platz' })),
  ...FEUER.map(F => ({ id: F.id, name: F.name, x: F.x, z: F.z, art: 'feuer' })),
  ...ORTE.map(o => ({ id: 'o:' + o.name, name: o.name, x: o.x, z: o.z, art: 'ort' })),
  ...SEEN.map(s => ({ id: 's:' + s.name, name: s.name, x: s.x, z: s.z, art: 'see' })),
  ...GIPFEL.map(g => ({ id: 'g:' + g.name, name: g.name, x: g.x, z: g.z, art: 'gipfel' }))
];
export const punktVon = id => PUNKTE.find(p => p.id === id);
// Der nächste Punkt zu einem Ort auf der Karte (höchstens `weit` Meter weg); Flugplätze und Funkfeuer gewinnen knapp
export function punktNah(x, z, weit = 4000) {
  let best = null, d = weit;
  for (const p of PUNKTE) { const e = Math.hypot(p.x - x, p.z - z) * (p.art === 'platz' ? 0.6 : p.art === 'feuer' ? 0.8 : 1); if (e < d) { d = e; best = p; } }
  return best;
}

// Fertige Vorschläge für den Anfang
export const AUSFLUEGE = [
  { name: 'Kleines Dreieck zu den Bergen', text: 'Über den Starnberger See nach Königsdorf, an Kochelsee und Murnau vorbei nach Ohlstadt und zurück. Etwa 25 Minuten.', punkte: ['lerchenfeld', 'koenigsdorf', 'ohlstadt', 'lerchenfeld'], hoehe: 4500 },
  { name: 'Großes Dreieck im Norden', text: 'Nach Augsburg am Lech, weiter nach Oberschleißheim bei München und zurück. Etwa 45 Minuten.', punkte: ['lerchenfeld', 'augsburg', 'schleissheim', 'lerchenfeld'], hoehe: 4000 },
  { name: 'Zum Inn nach Vogtareuth', text: 'Über Wolfratshausen und Holzkirchen nach Osten bis zum Inn. Etwa 25 Minuten, gelandet wird in Vogtareuth.', punkte: ['lerchenfeld', 'o:Wolfratshausen', 'o:Holzkirchen', 'vogtareuth'], hoehe: 4500 },
  { name: 'Kurzer Hüpfer nach Königsdorf', text: 'Der einfachste Überlandflug: über den Starnberger See auf den Grasplatz bei Bad Tölz. Etwa 9 Minuten.', punkte: ['lerchenfeld', 's:Starnberger See', 'koenigsdorf'], hoehe: 4000 }
];

// ---------------------------------------------------------------- Der Flugplaner
export const REISE = { tempo: 100, verbrauch: 38, rollen: 4, reserve: 30 };   // Reise mit 100 kn, 38 Liter je Stunde, 4 Liter für Rollen und Start, 30 Minuten Reserve
// plan = { punkte: [Punkt …], hoehe: Fuß über dem Meer, sprit: Liter im Tank }; wind = { aus: Grad, kn }
export function rechne(plan, wind = { aus: 0, kn: 0 }) {
  const P = plan.punkte, beine = [], wAus = wind.aus * GRAD, hinweise = [];
  let weit = 0, zeit = 0, mindest = 0;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], kurs = kursVon(a.x, a.z, b.x, b.z), strecke = Math.hypot(b.x - a.x, b.z - a.z) / NM;
    // Der Wind schiebt das Flugzeug zur Seite. Damit es trotzdem auf der Linie bleibt, hält man die Nase etwas in den Wind (Vorhaltewinkel).
    const vor = Math.asin(clamp(wind.kn / REISE.tempo * Math.sin(wAus - kurs), -0.9, 0.9));
    const grund = Math.max(20, REISE.tempo * Math.cos(vor) - wind.kn * Math.cos(wAus - kurs));       // Tempo über Grund in kn
    const min = strecke / grund * 60, hoch = (hoechstesZwischen(a.x, a.z, b.x, b.z) + NN) / FT;
    beine.push({ von: a, nach: b, kurs, steuer: kurs + vor, vor, strecke, grund, min, liter: min / 60 * REISE.verbrauch, hoch });
    weit += strecke; zeit += min; mindest = Math.max(mindest, hoch);
  }
  const liter = zeit / 60 * REISE.verbrauch + REISE.rollen, noetig = liter + REISE.reserve / 60 * REISE.verbrauch;
  mindest = Math.ceil((mindest + 1000) / 500) * 500;                         // 1000 Fuß über dem Höchsten, auf 500 aufgerundet
  if (P.length < 2) hinweise.push({ art: 'schlimm', text: 'Der Plan braucht einen Start und ein Ziel.' });
  if (P.length >= 2 && (P[0].art !== 'platz' || P[P.length - 1].art !== 'platz')) hinweise.push({ art: 'schlimm', text: 'Start und Ziel müssen Flugplätze sein.' });
  if (plan.sprit < liter) hinweise.push({ art: 'schlimm', text: `Zu wenig Sprit: Der Flug braucht etwa ${Math.ceil(liter)} Liter, getankt sind ${Math.round(plan.sprit)}.` });
  else if (plan.sprit < noetig) hinweise.push({ art: 'warn', text: `Knapp: Mit Reserve für ${REISE.reserve} Minuten wären ${Math.ceil(noetig)} Liter richtig.` });
  if (plan.hoehe < mindest) hinweise.push({ art: 'warn', text: `Zu tief geplant: Auf dem Weg liegt Gelände bis ${Math.round((mindest - 1000) / 100) * 100} ft. Flieg mindestens ${mindest} ft.` });
  if (beine.some(b => b.strecke < 2)) hinweise.push({ art: 'warn', text: 'Zwei Punkte liegen sehr dicht beieinander.' });
  return { beine, weit, zeit, liter, noetig, mindest, hinweise, ok: !hinweise.some(h => h.art === 'schlimm') };
}

// ---------------------------------------------------------------- Das Navi im Flug
// Es kennt das Bein, das gerade geflogen wird, und schaltet am Wegpunkt weiter.
export const TREFFER = 1500;              // so nah muss man an einem Wegpunkt vorbei, damit er als getroffen zählt (Meter)
export class Navi {
  constructor(plan) { this.plan = plan; this.nr = 1; this.punkte = plan.punkte.map(p => ({ id: p.id, name: p.name, nah: Infinity, getroffen: false })); this.maxAb = 0; this.neu = null; }
  get ziel() { return this.plan.punkte[this.nr]; }
  get letztes() { return this.nr >= this.plan.punkte.length - 1; }
  // Wo bin ich auf dem Bein? ablage = Meter rechts (+) oder links (−) von der Linie, rest = Meter bis zum Punkt entlang der Linie
  lage(f) {
    const a = this.plan.punkte[this.nr - 1], b = this.ziel, kurs = kursVon(a.x, a.z, b.x, b.z), lang = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = f.p[0] - a.x, dz = f.p[2] - a.z, entlang = -dx * Math.sin(kurs) + dz * Math.cos(kurs), ablage = -(dx * Math.cos(kurs) + dz * Math.sin(kurs));
    const weit = Math.hypot(b.x - f.p[0], b.z - f.p[2]), tempo = Math.hypot(f.v[0], f.v[2]);
    return { von: a, nach: b, kurs, lang, entlang, ablage, weit, peil: kursVon(f.p[0], f.p[2], b.x, b.z), min: tempo > 15 ? weit / tempo / 60 : null };
  }
  // jedes Bild: Wegpunkt erreicht? Dann weiter zum nächsten Bein. Gibt den Punkt zurück, der gerade abgehakt wurde.
  schritt(f) {
    const L = this.lage(f), p = this.punkte[this.nr];
    p.nah = Math.min(p.nah, L.weit);
    if (!f.amBoden && this.nr > 0) this.maxAb = Math.max(this.maxAb, Math.min(Math.abs(L.ablage), L.weit));
    if (this.letztes) return null;
    if (L.weit < TREFFER * 0.6 || (L.entlang > L.lang && p.nah < 8000) || (p.nah < TREFFER && L.weit > p.nah + 400)) {
      p.getroffen = p.nah < TREFFER; this.nr++; this.neu = p; return p;
    }
    return null;
  }
}
