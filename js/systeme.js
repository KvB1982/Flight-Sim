// Flugsimulator – die Schalter im Cockpit und was sie bewirken. Ohne Grafik, damit das Prüfwerkzeug (tools/ablauf.mjs) mitrechnen kann.
// Nur beim „ganzen Flug“ hat ein Flugzeug Systeme (f.sys). In der Flugschule und im freien Flug ist f.sys leer und nichts hiervon gilt.
// Jeder Schalter hat einen Grund: Wer ihn vergisst, merkt es (siehe `grund`).
import { KN } from './flugzeuge.js';
import { masse } from './physik.js';

export const LITER = 0.72;                    // ein Liter Flugbenzin wiegt etwa 0,72 kg
export const liter = f => Math.round(f.sprit / LITER);

// Die Schalter auf dem Schalterbrett. an / aus = wie die beiden Stellungen heißen.
export const SCHALTER = [
  { id: 'klemme', name: 'Ruderklemme', an: 'eingesetzt', aus: 'abgenommen', grund: 'Mit der Klemme bewegen sich die Ruder nicht. Am Boden schützt sie vor Wind, im Flug wäre sie tödlich.' },
  { id: 'gurte', name: 'Gurte', an: 'angelegt', aus: 'offen', grund: 'Ohne Gurt fliegt man bei einer Böe gegen die Decke.' },
  { id: 'park', name: 'Parkbremse', an: 'fest', aus: 'gelöst', grund: 'Sonst rollt das Flugzeug beim Anlassen los.' },
  { id: 'hahn', name: 'Tankhahn', an: 'auf', aus: 'zu', grund: 'Bei geschlossenem Hahn läuft der Motor nur ein paar Sekunden.' },
  { id: 'gemisch', name: 'Gemisch', an: 'reich', aus: 'abgestellt', grund: 'Ohne Benzin im Gemisch springt der Motor nicht an. Zum Abstellen zieht man es heraus.' },
  { id: 'haupt', name: 'Hauptschalter', an: 'an', aus: 'aus', grund: 'Er gibt Strom aus der Batterie. Bleibt er nach dem Flug an, ist die Batterie beim nächsten Mal leer.' },
  { id: 'zuend', name: 'Zündung', an: 'an', aus: 'aus', grund: 'Ohne Zündfunken läuft kein Motor.' },
  { id: 'warn', name: 'Warnlicht', an: 'an', aus: 'aus', grund: 'Das rote Blinklicht zeigt allen: Hier läuft gleich ein Propeller.' },
  { id: 'lande', name: 'Landelicht', an: 'an', aus: 'aus', grund: 'Damit sehen dich die anderen bei Start und Landung.' },
  { id: 'vorwaerm', name: 'Vergaservorwärmung', an: 'an', aus: 'aus', grund: 'Mit wenig Gas kann der Vergaser vereisen, dann verliert der Motor Kraft. Warme Luft taut ihn auf, kostet aber etwas Leistung.' },
  { id: 'hmesser', name: 'Höhenmesser', an: 'eingestellt', aus: 'verstellt', grund: 'Der Luftdruck ist jeden Tag anders. Erst mit dem Druck vom Platz (QNH) zeigt der Höhenmesser die richtige Höhe.' },
  { id: 'kreisel', name: 'Kurskreisel', an: 'abgeglichen', aus: 'verstellt', grund: 'Der Kurskreisel weiß nicht von allein, wo Norden ist. Man stellt ihn vor dem Start nach dem Kompass – sonst fliegt man in die falsche Richtung.' },
  { id: 'keile', name: 'Bremskeile', an: 'liegen vor', aus: 'weg', draussen: true, grund: 'Mit Keilen vor den Rädern rollt das Flugzeug nicht.' },
  { id: 'huelle', name: 'Staurohr-Hülle', an: 'drauf', aus: 'ab', draussen: true, grund: 'Mit Hülle zeigt der Fahrtmesser nichts an.' }
];
export const schalterVon = id => SCHALTER.find(s => s.id === id);

// So steht ein Flugzeug, das über Nacht geparkt war: alles aus, gesichert. zustand = was vom letzten Flug übrig ist.
export function neueSysteme(zustand = {}, zufall = Math.random) {
  return {
    klemme: true, gurte: false, park: true, hahn: false, gemisch: false, haupt: false, zuend: false, warn: false, lande: false, vorwaerm: false,
    keile: true, huelle: true, hmesser: false, kreisel: false,
    deckel: zufall() > 0.3,                         // false = ein Tankdeckel ist lose (fällt nur beim Außencheck auf)
    oelWenig: zufall() < 0.2,                       // true = Ölstand zu niedrig, muss nachgefüllt werden
    batterie: zustand.batterieLeer ? 0 : 1,         // 0 … 1
    eis: 0,                                         // Vereisung im Vergaser 0 … 1
    laufZeit: 0, anlassZeit: 0, hahnZeit: 0, probeZeit: 0,
    geprueft: { tank: false, oel: false, ruder: false, deckelR: false, wasser: false },     // was beim Rundgang angesehen wurde
    ruderSah: [false, false, false, false], ruderFrei: false, motorProbe: false,
    drin: false,                                    // sitzt der Pilot im Flugzeug?
    meldungen: [],                                  // { text, art } – zeigt das Spiel an
    // (neue Würfe immer hier hinten anhängen: Die Prüfwerkzeuge würfeln mit festem Zufall und sollen dasselbe Flugzeug bekommen)
    wasser: zufall() < 0.2,                         // true = über Nacht hat sich Wasser im Tank gesammelt (zeigt nur die Wasserprobe)
    hmFehler: (zufall() < 0.5 ? -1 : 1) * (45 + 25 * zufall()),          // so viele Meter zeigt der Höhenmesser falsch, solange er nicht eingestellt ist
    krFehler: (zufall() < 0.5 ? -1 : 1) * (0.3 + 0.25 * zufall()),       // so weit (Bogenmaß, 17° bis 32°) steht der Kurskreisel falsch, solange er nicht abgeglichen ist
    vollZeit: 0, stotter: 0, spritSoll: 30          // spritSoll = so viele Liter braucht der geplante Flug (Platzrunde: 30)
  };
}

// Einen Schalter umlegen. Gibt einen Text zurück, wenn es gerade nicht geht.
export function schalte(f, id, wert) {
  const s = f.sys, def = schalterVon(id), steht = Math.hypot(f.v[0], f.v[2]) < 0.5 && f.amBoden;
  if (wert === undefined) wert = !s[id];
  if (def.draussen && !(steht && !f.motorAn)) return 'Dafür muss das Flugzeug stehen und der Motor aus sein.';
  if (id === 'klemme' && wert && !f.amBoden) return 'Die Ruderklemme setzt man nur am Boden ein.';
  s[id] = !!wert;
  return null;
}

// Anlasser drücken: Der Motor dreht gut eine Sekunde, dann zeigt sich, ob er anspringt.
export function anlassen(f) {
  const s = f.sys;
  if (f.motorAn) return 'Der Motor läuft schon.';
  if (!s.haupt || s.batterie < 0.1) { return s.haupt ? 'Klick – die Batterie ist leer. Der Mechaniker muss sie laden (beim Außencheck an der Nase).' : 'Nichts passiert: Der Hauptschalter ist aus.'; }
  s.anlassZeit = 1.3;
  return null;
}
// Warum springt der Motor nicht an? (für die Meldung)
function anlassFehler(f) {
  const s = f.sys;
  if (!s.zuend) return 'Der Motor dreht, springt aber nicht an: Die Zündung ist aus.';
  if (!s.gemisch) return 'Der Motor dreht, springt aber nicht an: Das Gemisch ist abgestellt.';
  if (!s.hahn) return 'Der Motor springt kurz an und stirbt wieder: Der Tankhahn ist zu.';
  if (f.sprit <= 0) return 'Der Motor springt nicht an: Der Tank ist leer.';
  return null;
}

// Nach jedem Physik-Schritt: Motor, Batterie, Vereisung, Tank. e = was der Pilot steuert (für „Ruder frei“).
export function sysSchritt(f, e, dt) {
  const s = f.sys; if (!s) return;
  const sag = (text, art = 'warn') => s.meldungen.push({ text, art });
  // Anlasser
  if (s.anlassZeit > 0) {
    s.anlassZeit -= dt; s.batterie = Math.max(0, s.batterie - 0.03 * dt);
    if (s.anlassZeit <= 0) { const fehler = anlassFehler(f); if (fehler) sag(fehler); else { f.motorAn = true; s.laufZeit = 0; s.hahnZeit = 0; sag('Der Motor läuft.', 'gut'); } }
  }
  // Was den laufenden Motor ausgehen lässt
  if (f.motorAn) {
    s.laufZeit += dt; s.batterie = Math.min(1, s.batterie + 0.01 * dt);
    s.hahnZeit = s.hahn ? 0 : s.hahnZeit + dt;
    const aus = !s.zuend ? 'Zündung aus – der Motor steht.' : !s.gemisch ? 'Gemisch abgestellt – der Motor steht.' : f.sprit <= 0 ? 'Der Tank ist leer! Der Motor ist aus. Such dir eine Wiese oder die Bahn und lande.' : s.hahnZeit > 10 ? 'Der Motor ist ausgegangen: Der Tankhahn ist zu.' : null;
    if (aus) { f.motorAn = false; sag(aus, f.amBoden && (!s.zuend || !s.gemisch) ? 'info' : 'schlimm'); }
  } else if (s.haupt) {
    // Batterie wird leer, wenn der Hauptschalter ohne Motor an bleibt (mit Licht schneller)
    s.batterie = Math.max(0, s.batterie - (0.0008 + (s.warn ? 0.0004 : 0) + (s.lande ? 0.0008 : 0)) * dt);
  }
  // Vergaser: Mit wenig Gas in der Luft wächst Eis, Vorwärmung taut es schnell weg
  if (s.vorwaerm) s.eis -= dt / 8; else if (f.motorAn && !f.amBoden && f.gas < 0.45) s.eis += dt / 100; else s.eis -= dt / 60;
  s.eis = Math.max(0, Math.min(1, s.eis));
  if (s.eis > 0.5 && !s.eisGemeldet) { s.eisGemeldet = true; sag('Der Motor verliert Kraft: Der Vergaser vereist. Vergaservorwärmung an!'); }
  if (s.eis < 0.1) s.eisGemeldet = false;
  // zu wenig Öl: Nach ein paar Minuten wird der Motor heiß und schwach
  const oelSchaden = s.oelWenig && s.laufZeit > 240;
  if (oelSchaden && !s.oelGemeldet) { s.oelGemeldet = true; sag('Der Öldruck fällt, der Motor wird schwach! Es war zu wenig Öl im Motor. Sofort landen.', 'schlimm'); }
  // Wasser im Benzin (keine Wasserprobe gemacht): Es liegt unten im Tank und kommt bei Vollgas kurz nach dem Start im Motor an
  if (s.wasser && f.motorAn && f.gas > 0.8) { s.vollZeit += dt; if (s.vollZeit > 25) { s.wasser = false; s.stotter = 20;
    sag('Der Motor stottert und verliert Kraft: Wasser im Benzin! Die Wasserprobe beim Außencheck hätte es gezeigt. Nase runter, Tempo halten – gleich läuft er wieder.', 'schlimm'); } }
  if (s.stotter > 0) { s.stotter -= dt; if (s.stotter <= 0) sag('Das Wasser ist durch, der Motor läuft wieder rund.', 'gut'); }
  f.motorKraft = (1 - 0.45 * s.eis) * (s.vorwaerm ? 0.92 : 1) * (oelSchaden ? 0.55 : 1) * (s.stotter > 0 ? 0.6 : 1);
  // Höhenmesser und Kurskreisel zeigen falsch, solange sie nicht eingestellt sind (instrumente.js rechnet das dazu)
  f.hoeheFehler = s.hmesser ? 0 : s.hmFehler; f.kursFehler = s.kreisel ? 0 : s.krFehler;
  // loser Tankdeckel: Im Flug saugt der Fahrtwind Benzin heraus
  if (!s.deckel && !f.amBoden && f.sprit > 0) { f.sprit = Math.max(0, f.sprit - 0.03 * dt); if (!s.deckelGemeldet) { s.deckelGemeldet = true; sag('Aus dem Flügel zieht eine Benzinfahne: Ein Tankdeckel ist lose. Der Tank wird schnell leer!'); } }
  // Staurohr-Hülle: Der Fahrtmesser bekommt keine Luft
  f.iasZeigt = s.huelle ? 0 : f.ias;
  if (s.huelle && f.ias > 25 * KN && !s.huelleGemeldet) { s.huelleGemeldet = true; sag('Der Fahrtmesser zeigt nichts! Die Staurohr-Hülle ist noch drauf.'); }
  // Hinweise, wenn etwas blockiert
  s.hinweisZeit = (s.hinweisZeit || 0) - dt;
  if (s.hinweisZeit <= 0 && f.amBoden) {
    const steht = Math.hypot(f.v[0], f.v[2]) < 0.3;
    if (s.klemme && s.drin && (Math.abs(e.hoehe) > 0.5 || Math.abs(e.quer) > 0.5)) { sag('Die Ruder bewegen sich nicht: Die Ruderklemme ist noch eingesetzt.'); s.hinweisZeit = 10; }
    else if (f.motorAn && f.gas > 0.3 && steht && s.keile) { sag('Das Flugzeug rollt nicht: Die Bremskeile liegen noch vor den Rädern.'); s.hinweisZeit = 10; }
    else if (f.motorAn && f.gas > 0.3 && steht && s.park && !s.motorProbe && s.probeZeit <= 0) { sag('Das Flugzeug rollt nicht: Die Parkbremse ist fest.'); s.hinweisZeit = 10; }
  }
  // „Ruder frei“: Knüppel einmal ganz in alle vier Richtungen bewegen
  if (!s.klemme && f.amBoden && s.drin) {
    if (e.hoehe > 0.8) s.ruderSah[0] = true; if (e.hoehe < -0.8) s.ruderSah[1] = true; if (e.quer > 0.8) s.ruderSah[2] = true; if (e.quer < -0.8) s.ruderSah[3] = true;
    if (!s.ruderFrei && s.ruderSah.every(Boolean)) { s.ruderFrei = true; sag('Ruder frei und richtig herum.', 'gut'); }
  }
  // Motor-Probe vor dem Start: mit Bremse 3 Sekunden lang etwa halbes Gas (1700 Umdrehungen)
  if (f.motorAn && f.amBoden && Math.hypot(f.v[0], f.v[2]) < 1 && f.gas > 0.42 && f.gas < 0.7) { s.probeZeit += dt; if (!s.motorProbe && s.probeZeit > 3) { s.motorProbe = true; sag('Motor-Probe gut: Er läuft rund.', 'gut'); } } else s.probeZeit = 0;
}

// Was die Schalter an der Steuerung ändern (nach der Hilfe aufrufen): Klemme hält die Ruder fest, Keile und Parkbremse bremsen.
export function sysRuder(e, f) {
  const s = f.sys; if (!s) return e;
  const r = { ...e };
  if (s.klemme) { r.hoehe = 0; r.quer = 0; }
  if (s.keile || s.park) r.bremse = 1;
  if (s.keile) r.gas = Math.min(r.gas, 0.35);       // gegen die Keile kommt der Motor nicht an (und soll es auch nicht versuchen)
  return r;
}

// Tanken am Tankautomaten: auf so viele Liter auffüllen. Gibt zurück, wie viele Liter dazukamen.
export function tanke(f, bisLiter) {
  const vorher = f.sprit; f.sprit = Math.min(f.T.tank, Math.max(f.sprit, bisLiter * LITER));
  return Math.round((f.sprit - vorher) / LITER);
}
export const gewicht = f => Math.round(masse(f));
