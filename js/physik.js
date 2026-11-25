// Flugsimulator – die Flugphysik. Ohne Grafik, deshalb auch in node prüfbar (tools/flugtest.mjs).
//
// Das Flugzeug wird nicht „gesteuert wie ein Auto“, sondern aus Kräften gerechnet:
//   Auftrieb (trägt), Widerstand (bremst), Schub (zieht), Gewicht (zieht nach unten), dazu die Räder am Boden.
// Die Ruder erzeugen Drehmomente: Sie drehen das Flugzeug, und erst die neue Lage ändert die Flugbahn.
//
// Richtungen in der Welt: x, y hoch, z. Norden ist +z, Westen ist +x (wie in Frontline: Schaut man nach +z, liegt +x links).
// Richtungen am Flugzeug („Körper“): [0] = zur linken Tragfläche, [1] = nach oben, [2] = nach vorn.
// Die Lage ist eine Drehung q (Quaternion [x, y, z, w]), die Körper-Richtungen in Welt-Richtungen umrechnet.

import { FLUGZEUGE, KN } from './flugzeuge.js';

export const G = 9.81;
export const RHO0 = 1.225;                       // Luftdichte auf Meereshöhe (kg/m³)
export const TAKT = 1 / 120;                     // so lang ist ein Rechenschritt

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sanft = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- kleine Rechenhelfer für Richtungen und Drehungen
export const kreuz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mal = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// Körper-Richtung → Welt-Richtung
export function drehe(q, v) {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
// Welt-Richtung → Körper-Richtung
export const dreheZurueck = (q, v) => drehe([-q[0], -q[1], -q[2], q[3]], v);
const qMal = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
// Lage aus Kurs (0 = Norden, im Uhrzeigersinn), Längsneigung (Nase hoch +) und Schräglage (rechts +)
export function lageAus(kurs, nick, roll) {
  const achse = (a, w) => { const s = Math.sin(w / 2); return [a[0] * s, a[1] * s, a[2] * s, Math.cos(w / 2)]; };
  return qMal(qMal(achse([0, 1, 0], -kurs), achse([1, 0, 0], -nick)), achse([0, 0, 1], roll));
}

// Luftdichte in der Höhe h (Meter über dem Meer): Oben ist die Luft dünner, Flügel und Motor leisten weniger.
// Beim Überlandflug steht in f.nn, wie hoch die Spiel-Höhe 0 über dem Meer liegt (700 m) – dann zählt die echte Höhe.
export const dichte = h => RHO0 * Math.pow(Math.max(0.3, 1 - 2.2558e-5 * h), 4.2559);

// ---------------------------------------------------------------- ein neues Flugzeug
export function neuesFlugzeug(art = 'lerche', opt = {}) {
  const T = FLUGZEUGE[art];
  const f = {
    art, T,
    p: [0, 0, 0], v: [0, 0, 0], q: [0, 0, 0, 1], w: [0, 0, 0],     // Ort, Tempo (Welt), Lage, Drehtempo (Körper)
    sprit: opt.sprit ?? T.tank * 0.6, zuladung: opt.zuladung ?? T.zuladung,
    gas: 0, motorAn: true, klappen: 0, klappenStufe: 0, trimm: 0,
    ruder: { hoehe: 0, quer: 0, seite: 0 }, bremse: 0,
    t: 0, luftZeit: 0, bodenZeit: 0, amBoden: false, rad: [0, 0, 0], radQuer: [0, 0, 0], radLang: [0, 0, 0], bruch: null,
    alphaTempo: 0, trudelt: 0, trudelRichtung: 0, lastRuhig: 1, zuSchnell: 0, heckAuf: false,
    ereignisse: [],                                                 // was passiert ist (Aufsetzen, harte Landung …), liest flug.js
    // Anzeigen, nach jedem Schritt neu gerechnet
    ias: 0, tas: 0, alpha: 0, schiebe: 0, abriss: 0, steig: 0, last: 1, hoeheGrund: 0, drehzahl: T.leerlauf, schub: 0,
    kurs: 0, nick: 0, roll: 0, kugel: 0, wende: 0
  };
  return f;
}
export const masse = f => f.T.leer + f.zuladung + f.sprit;

// Flugzeug irgendwo hinsetzen: am Boden (stehend) oder in der Luft (mit Tempo in Flugrichtung)
export function setze(f, o) {
  const boden = o.boden ?? 0;
  f.q = lageAus(o.kurs ?? 0, o.nick ?? 0, o.roll ?? 0);
  const tempo = o.tempo ?? 0, bahn = o.bahn ?? 0, k = o.kurs ?? 0;
  f.v = [-Math.sin(k) * Math.cos(bahn) * tempo, Math.sin(bahn) * tempo, Math.cos(k) * Math.cos(bahn) * tempo];
  f.p = [o.x ?? 0, o.hoehe !== undefined ? o.hoehe : boden - f.T.raeder[1].ort[1] - 0.07, o.z ?? 0];
  f.w = [0, 0, 0]; f.bruch = null; f.ereignisse.length = 0;
  f.radQuer = [0, 0, 0]; f.radLang = [0, 0, 0]; f.alphaTempo = 0; f.trudelt = 0; f.trudelRichtung = 0; f.lastRuhig = 1; f.zuSchnell = 0; f.heckAuf = false; f.alpha = 0;
  f.amBoden = o.hoehe === undefined; f.luftZeit = f.amBoden ? 0 : 5; f.bodenZeit = f.amBoden ? 5 : 0;
  f.gas = o.gas ?? 0; f.trimm = o.trimm ?? 0; f.klappenStufe = o.klappen ?? 0; f.klappen = f.T.klappen[f.klappenStufe] / 30;
  f.ias = f.tas = tempo;
  anzeigen(f, { boden: () => boden, wind: () => [0, 0, 0] });
}

// ---------------------------------------------------------------- Auftrieb und Widerstand des Flügels
// a = Anstellwinkel (wie schräg die Luft von unten auf den Flügel trifft), kl = Klappen 0…1.
// Gibt [Auftriebsbeiwert, Widerstandsbeiwert, wie stark die Strömung abgerissen ist 0…1].
export function fluegel(T, a, kl, kEffekt = 1) {
  const ca0 = T.ca0 + T.caKlappe * kl, caMax = T.caMax + T.caMaxKlappe * kl;
  const aAb = (caMax - ca0) / T.caAnstieg;                       // bei diesem Winkel reißt die Strömung ab
  const aAbNeg = (-caMax * 0.6 - ca0) / T.caAnstieg;             // Rückenlage: reißt früher ab
  const weg = Math.max(sanft(a, aAb - 0.01, aAb + 0.09), sanft(-a, -aAbNeg - 0.01, -aAbNeg + 0.09));
  const glatt = ca0 + T.caAnstieg * clamp(a, aAbNeg, aAb);       // anliegende Strömung: Auftrieb wächst gleichmäßig
  const platte = 1.05 * Math.sin(2 * a);                         // abgerissen: der Flügel ist nur noch ein Brett im Wind
  const ca = glatt * (1 - weg) + platte * weg;
  const cw = T.cw0 + T.cwKlappe * Math.pow(kl, 1.5) + T.cwK * kEffekt * glatt * glatt * (1 - weg) + weg * 1.6 * Math.sin(a) * Math.sin(a);
  return [ca, cw, weg, aAb];
}

// So viel vom Seitenruder-Ausschlag schafft der Fuß bei diesem Tempo (angezeigte Fahrt in m/s): 1 = alles
export const fussKraft = (T, ias) => T.seiteWeichAb ? Math.min(1, Math.pow(T.seiteWeichAb / Math.max(1, ias), T.seiteWeichHoch || 2)) : 1;

// ---------------------------------------------------------------- ein Rechenschritt
// e = was der Pilot gerade will: hoehe (+ ziehen), quer (+ nach rechts), seite (+ Nase nach rechts), gas 0…1, bremse 0…1
// welt = { wind(p, t) → [x, y, z] in m/s, boden(x, z) → Höhe des Bodens }
export function schritt(f, e, dt, welt) {
  if (f.bruch) { f.v = [0, 0, 0]; f.w = [0, 0, 0]; return; }
  const T = f.T, m = masse(f), q = f.q;
  f.t += dt;

  // ---- Ruder, Gas und Klappen folgen dem Piloten mit kleiner Verzögerung (ein Ruder schlägt nicht in null Sekunden aus)
  const nach = (ist, soll, tempo) => ist + clamp(soll - ist, -tempo * dt, tempo * dt);
  f.ruder.hoehe = nach(f.ruder.hoehe, clamp(e.hoehe || 0, -1, 1), 6);
  f.ruder.quer = nach(f.ruder.quer, clamp(e.quer || 0, -1, 1), 6);
  f.ruder.seite = nach(f.ruder.seite, clamp(e.seite || 0, -1, 1), 6);
  f.gas = nach(f.gas, clamp(e.gas || 0, 0, 1), 1.5);
  f.bremse = clamp(e.bremse || 0, 0, 1);
  f.klappen = nach(f.klappen, T.klappen[f.klappenStufe] / 30, T.klappenTempo);

  // ---- Wie strömt die Luft am Flugzeug vorbei?
  const wind = welt.wind(f.p, f.t);
  const vl = dreheZurueck(q, [f.v[0] - wind[0], f.v[1] - wind[1], f.v[2] - wind[2]]);     // Fahrt durch die Luft, vom Flugzeug aus gesehen
  const V = Math.max(0.01, Math.hypot(vl[0], vl[1], vl[2]));
  const rho = dichte(f.p[1] + (f.nn || 0)), stau = 0.5 * rho * V * V;          // Staudruck: so fest „drückt“ die Luft
  const alpha = V > 1 ? Math.atan2(-vl[1], Math.max(0.01, vl[2])) : 0;
  const beta = V > 1 ? Math.asin(clamp(-vl[0] / V, -1, 1)) : 0;   // Schiebewinkel: + = Luft kommt von rechts
  // Wie schnell ändert sich der Anstellwinkel? Das Höhenleitwerk merkt es etwas später als der Flügel und bremst so das Nicken.
  f.alphaTempo += (clamp(V > 10 ? (alpha - f.alpha) / dt : 0, -1.5, 1.5) - f.alphaTempo) * Math.min(1, dt / 0.04);
  const boden = welt.boden(f.p[0], f.p[2]);
  const hRad = f.p[1] + T.raeder[1].ort[1] - boden;              // Höhe der Räder über dem Boden
  // Bodeneffekt: Dicht über der Bahn bremst der Flügel weniger, das Flugzeug „schwebt“
  const kEffekt = 1 - 0.55 * Math.exp(-Math.max(0, hRad + 1.5) / (0.25 * T.spann));
  const [ca, cw, weg] = fluegel(T, alpha, f.klappen, kEffekt);

  // Drehtempo in den üblichen Flieger-Größen: p = rollen nach rechts, qq = Nase hoch, r = Nase nach rechts
  const p = f.w[2], qq = -f.w[0], r = -f.w[1];
  // Böen von unten treffen die beiden Flügel verschieden stark: Das wirkt wie ein kleiner Stoß ums Rollen
  const tipp = drehe(q, [T.spann * 0.35, 0, 0]);
  const wL = welt.wind([f.p[0] + tipp[0], f.p[1] + tipp[1], f.p[2] + tipp[2]], f.t), wR = welt.wind([f.p[0] - tipp[0], f.p[1] - tipp[1], f.p[2] - tipp[2]], f.t);
  const pLuft = p - (wL[1] - wR[1]) / (T.spann * 0.7);
  const pb = pLuft * T.spann / (2 * V), rb = r * T.spann / (2 * V), qc = qq * T.tiefe / (2 * V);
  const iasJetzt = Math.max(0, vl[2]) * Math.sqrt(rho / RHO0);
  const handKraft = Math.min(1, Math.pow(T.ruderWeichAb / Math.max(1, iasJetzt), 2));       // bei viel Fahrt geht das Höhenruder nicht mehr ganz auf Anschlag
  const dh = f.ruder.hoehe * T.ruderMax.hoehe * handKraft + T.trimmMitte + f.trimm * T.trimmWeg, dq = f.ruder.quer * T.ruderMax.quer, ds = f.ruder.seite * T.ruderMax.seite * fussKraft(T, iasJetzt);

  // ---- Kräfte am Flugzeug (Körper-Richtungen)
  // Kommt die Luft schräg von der Seite, zählt für den Flügel nur der Teil, der quer über ihn streicht.
  // (Sonst würde ein geparktes Flugzeug bei Seitenwind „fliegen“ wollen und umkippen.)
  const quer2 = (vl[1] * vl[1] + vl[2] * vl[2]) / (V * V), sB = Math.sin(beta), sB2 = sB * Math.sqrt(quer2);
  const S = T.flaeche, A = stau * quer2 * S * ca, W = stau * quer2 * S * cw + stau * (1 - quer2) * S * T.cw0;
  const Y = stau * S * (T.cySchiebe * sB - T.cySeite * ds);     // Seitenkraft nach rechts
  const kraft = [-Y - W * vl[0] / V, A * Math.cos(alpha) - W * vl[1] / V, A * Math.sin(alpha) - W * vl[2] / V];
  // Motor: Leistung hängt an der Drehzahl, der Propeller macht daraus Schub
  const dreh = f.motorAn && f.sprit > 0 ? T.leerlauf + (T.vollDreh - T.leerlauf) * f.gas : 0;
  const hoehenFaktor = clamp(1.132 * rho / RHO0 - 0.132, 0, 1);
  const leistung = dreh > 0 ? T.leistung * Math.pow(dreh / T.vollDreh, 3) * hoehenFaktor * (f.motorKraft ?? 1) : 0;      // motorKraft: Vereisung und Schäden (systeme.js)
  const vVor = Math.max(0, vl[2]);
  let schub = leistung * T.propGut / Math.hypot(vVor, T.propV0);
  schub -= stau * 0.2 * Math.max(0, 1 - 3 * leistung / T.leistung);            // ein langsam drehender Propeller bremst ein wenig
  kraft[2] += schub;
  if (dreh > 0) f.sprit = Math.max(0, f.sprit - T.verbrauch * (0.08 + 0.92 * leistung / T.leistung) * dt);
  f.drehzahl = dreh > 0 ? dreh + (1 - f.gas) * vVor * 6 : Math.min(900, vVor * 12);
  f.schub = schub;

  // ---- Drehmomente: Stabilität (will zurück in die Strömung), Dämpfung (bremst das Drehen), Ruder
  const abrissNick = -0.35 * weg * Math.sign(alpha);              // abgerissen: Die Nase fällt
  const cm = T.cm0 + T.cmAnstell * alpha + T.cmDreh * qc + T.cmAnstellTempo * f.alphaTempo * T.tiefe / (2 * V) + T.cmRuder * dh * (1 - 0.4 * weg) + T.cmKlappe * f.klappen + abrissNick;
  // Im Strömungsabriss dämpft der Flügel das Rollen kaum noch: Wer jetzt schiebt oder giert, kippt über eine Fläche ab
  const cl = T.clSchiebe * sB2 + T.clRoll * pb * (1 - 0.75 * weg) + T.clGier * rb * (1 + 5 * weg) + T.clQuer * dq * (1 - 0.6 * weg) - T.clSeite * ds;
  const cn = T.cnSchiebe * sB + T.cnRoll * pb + T.cnGier * rb + T.cnQuer * dq + T.cnSeite * ds;
  const propGier = -schub * T.propDreh * clamp(1 - vVor / 60, 0, 1);    // Propeller zieht die Nase nach links
  // Nicken um die Querachse [0], Gieren um die Hochachse [1], Rollen um die Längsachse [2]
  const moment = [-stau * S * T.tiefe * cm, -(stau * S * T.spann * cn + propGier), stau * S * T.spann * cl];
  // ---- Trudeln. Reißt die Strömung ab, während der Pilot den Knüppel ganz gezogen hält und das Flugzeug giert (Seitenruder,
  // Schieben), sackt der eine Flügel tiefer in den Abriss als der andere: Er trägt weniger und bremst mehr, das Flugzeug dreht
  // sich von allein immer weiter (Autorotation). Das genau zu rechnen ist schwer – wir lassen es deshalb auf ein Trudeln
  // zulaufen, wie es Lehrbücher für so ein Flugzeug beschreiben: Nase gut 50° unten, etwa eine Umdrehung in 2,5 Sekunden,
  // um die 60 Knoten. Heraus kommt man wie in echt: Gas raus, Querruder neutral, Seitenruder gegen die Drehung, Knüppel nach vorn.
  {
    const rich = f.trudelRichtung || Math.sign(r) || 1, gegen = f.ruder.seite * rich < -0.5, gezogen = f.ruder.hoehe > 0.6;
    if (!f.amBoden && (weg > 0.4 || f.trudelt > 0.3) && gezogen && !gegen && Math.abs(r) > 0.3 && T.trudel > 0) {
      if (!f.trudelt) f.trudelRichtung = Math.sign(r);
      f.trudelt = Math.min(1, f.trudelt + 1.2 * dt);
    } else if (f.trudelt > 0) {
      const raus = (gegen ? 0.7 : 0) + (f.ruder.hoehe < 0.3 ? 0.5 : 0) + (gezogen ? 0 : 0.1) + (weg < 0.3 && f.trudelt < 0.3 ? 0.5 : 0);
      f.trudelt = Math.max(0, f.trudelt - raus * dt);
    }
    if (!f.trudelt) f.trudelRichtung = 0;
    const k = f.trudelt * T.trudel;
    if (k > 0) {
      const I = T.traeg, ri = f.trudelRichtung;
      // Ziel: Rollen und Gieren in die Drehrichtung, Anstellwinkel 40°
      const nickSoll = -I[0] * (6 * (0.7 - alpha) - 4 * qq);         // + = Nase runter (Achse [0])
      const gierSoll = -I[1] * 4 * (ri * 1.4 - r);
      const rollSoll = I[2] * 4 * (ri * 2.4 - p);
      // Auch die Kreiselkräfte (siehe unten) rechnet das Ziel schon mit ein, sonst wackelt die Nase auf und ab.
      const kr = kreuz(f.w, [I[0] * f.w[0], I[1] * f.w[1], I[2] * f.w[2]]);
      moment[0] = (1 - k) * moment[0] + k * (nickSoll + kr[0]);
      moment[1] = (1 - k) * moment[1] + k * (gierSoll + kr[1]);
      moment[2] = (1 - k) * moment[2] + k * (rollSoll + kr[2]);
    }
  }

  // ---- Räder: Federn tragen das Flugzeug, Reibung hält es in der Spur, Bremsen und Rollen bremsen
  const kraftWelt = drehe(q, kraft);
  kraftWelt[1] -= m * G;
  let beruehrt = 0;
  const vor = drehe(q, [0, 0, 1]), flach = Math.hypot(vor[0], vor[2]) || 1;
  const fv = [vor[0] / flach, 0, vor[2] / flach], fl = [fv[2], 0, -fv[0]];                 // am Boden: nach vorn und nach links
  const tempoBoden = Math.hypot(f.v[0], f.v[2]);
  T.raeder.forEach((rad, i) => {
    const arm = drehe(q, rad.ort), ort = [f.p[0] + arm[0], f.p[1] + arm[1], f.p[2] + arm[2]];
    const tief = welt.boden(ort[0], ort[2]) - ort[1];
    f.rad[i] = Math.max(0, tief);
    if (tief <= 0) { f.radQuer[i] = f.radLang[i] = 0; return; }
    beruehrt++;
    const vr = kreuz(f.w, rad.ort), vw = drehe(q, vr), vk = [f.v[0] + vw[0], f.v[1] + vw[1], f.v[2] + vw[2]];   // Tempo des Rads über den Boden
    const N = clamp(rad.feder * tief * (1 + 4 * Math.max(0, tief - 0.25)) - rad.daempf * vk[1], 0, 9 * m * G);
    // Das Bugrad lenkt mit dem Seitenruder: im Schritttempo bis 23°, schneller noch 10° (so ist es beim Vorbild über die Pedale verbunden)
    let rv = fv, rl = fl;
    if (rad.lenkt) {
      const w = -f.ruder.seite * (0.4 - 0.23 * sanft(tempoBoden, 3, 20)), c = Math.cos(w), s = Math.sin(w);
      rv = [fv[0] * c + fl[0] * s, 0, fv[2] * c + fl[2] * s]; rl = [rv[2], 0, -rv[0]];
    }
    const vLang = mal(vk, rv), vQuer = mal(vk, rl);
    // Der Reifen als Bürste: Die Borsten (radQuer, radLang) biegen sich, solange der Reifen hält, und ziehen ihn zurück.
    // Rollt das Rad, richten sich die Borsten nach reifenLang Metern neu aus – deshalb zählt beim Fahren der Winkel zur
    // Fahrtrichtung (Schräglauf), und im Stand hält der Reifen wie festgeklebt, bis die Kraft zu groß wird und er rutscht.
    const hart = T.reifenHart * N, ruhe = T.reifenDaempf * N / (1 + vLang * vLang);
    const haltQ = T.reifenHalt * N, haltL = N * (0.02 + (rad.bremst ? 0.65 * f.bremse : 0));
    let zq = f.radQuer[i] + (vQuer - Math.abs(vLang) * f.radQuer[i] / T.reifenLang) * dt, zl = f.radLang[i] + vLang * dt;
    if (hart > 1) { zq = clamp(zq, -haltQ / hart, haltQ / hart); zl = clamp(zl, -haltL / hart, haltL / hart); } else zq = zl = 0;
    f.radQuer[i] = zq; f.radLang[i] = zl;
    const FQ = clamp(-(hart * zq + ruhe * vQuer), -haltQ, haltQ), FL = clamp(-(hart * zl + ruhe * vLang), -haltL, haltL);
    const F = [rv[0] * FL + rl[0] * FQ, N, rv[2] * FL + rl[2] * FQ];
    kraftWelt[0] += F[0]; kraftWelt[1] += F[1]; kraftWelt[2] += F[2];
    const t = kreuz(rad.ort, dreheZurueck(q, F));
    moment[0] += t[0]; moment[1] += t[1]; moment[2] += t[2];
  });

  // ---- Der Sporn unter dem Heck: Wer zu steil zieht, kratzt mit dem Heck über die Bahn. Das bremst und kostet Lack, ein harter Schlag bricht das Heck.
  {
    const sp = T.sporn, arm = drehe(q, sp.ort), ort = [f.p[0] + arm[0], f.p[1] + arm[1], f.p[2] + arm[2]], tief = welt.boden(ort[0], ort[2]) - ort[1];
    if (tief > 0) {
      const vw = drehe(q, kreuz(f.w, sp.ort)), vk = [f.v[0] + vw[0], f.v[1] + vw[1], f.v[2] + vw[2]];
      if (!f.heckAuf) { f.heckAuf = true; f.ereignisse.push({ art: 'heck', sink: -vk[1], ias: f.ias }); if (-vk[1] > sp.bruchAb) f.bruch = 'Heck'; }
      const N = clamp(sp.feder * tief - sp.daempf * vk[1], 0, 4 * m * G), vb = Math.hypot(vk[0], vk[2]), reib = vb > 0.05 ? -0.4 * N / vb : 0;
      const F = [vk[0] * reib, N, vk[2] * reib];
      kraftWelt[0] += F[0]; kraftWelt[1] += F[1]; kraftWelt[2] += F[2];
      const t = kreuz(sp.ort, dreheZurueck(q, F)); moment[0] += t[0]; moment[1] += t[1]; moment[2] += t[2];
    } else if (tief < -0.15) f.heckAuf = false;
  }

  // ---- Aufsetzen merken: Wie hart, wie schräg, wie schnell?
  const warInLuft = !f.amBoden;
  if (beruehrt) { f.bodenZeit += dt; if (f.bodenZeit > 0.05) f.luftZeit = 0; } else { f.luftZeit += dt; if (f.luftZeit > 0.4) f.bodenZeit = 0; }
  if (beruehrt && warInLuft) {
    const sink = -f.v[1];
    f.ereignisse.push({ art: 'aufsetzen', sink, ias: f.ias, roll: f.roll, nick: f.nick, x: f.p[0], z: f.p[2], kurs: f.kurs,
      schraeg: Math.atan2(mal(f.v, fl), Math.max(1, mal(f.v, fv))), flugZeit: f.luftZeit, last: f.last });
    if (sink > 3.6) f.bruch = 'Fahrwerk';                          // über 700 Fuß pro Minute: Das Fahrwerk bricht
  }
  f.amBoden = beruehrt > 0;
  for (const [teil, x, y, z] of T.huelle) {
    const a = drehe(q, [x, y, z]);
    if (f.p[1] + a[1] < welt.boden(f.p[0] + a[0], f.p[2] + a[2])) { f.bruch = teil; break; }
  }

  // ---- bewegen und drehen
  const I = T.traeg, w = f.w;
  const kreisel = kreuz(w, [I[0] * w[0], I[1] * w[1], I[2] * w[2]]);
  w[0] += (moment[0] - kreisel[0]) / I[0] * dt; w[1] += (moment[1] - kreisel[1]) / I[1] * dt; w[2] += (moment[2] - kreisel[2]) / I[2] * dt;
  const ay = kraftWelt[1] / m;
  f.v[0] += kraftWelt[0] / m * dt; f.v[1] += ay * dt; f.v[2] += kraftWelt[2] / m * dt;
  f.p[0] += f.v[0] * dt; f.p[1] += f.v[1] * dt; f.p[2] += f.v[2] * dt;
  const wl = Math.hypot(w[0], w[1], w[2]);
  if (wl > 1e-9) {
    const s = Math.sin(wl * dt / 2) / wl;
    f.q = qMal(q, [w[0] * s, w[1] * s, w[2] * s, Math.cos(wl * dt / 2)]);
    const n = Math.hypot(...f.q); f.q = f.q.map(x => x / n);
  }

  // ---- Anzeigen
  f.alpha = alpha; f.schiebe = beta; f.abriss = weg; f.tas = V; f.ias = Math.max(0, vl[2]) * Math.sqrt(rho / RHO0);
  f.last = (mal(kraft, [0, 1, 0]) + 0) / (m * G);                // Lastvielfaches: 1 = normales Gewicht
  // ---- Festigkeit: Zu viel Last (zu hart gezogen oder gedrückt) oder viel zu schnell – dann bricht etwas.
  // lastRuhig glättet ganz kurz, damit ein einzelner Rechenschritt in einer Böe noch nichts kaputt macht.
  f.lastRuhig += (f.last - f.lastRuhig) * Math.min(1, dt / 0.08);
  if (!f.amBoden) {
    if (f.lastRuhig > (f.klappen > 0.05 ? T.lastMaxKlappen : T.lastMax) || f.lastRuhig < T.lastMin) f.bruch = 'Überlast';
    // Über der roten Marke fängt das Flugzeug an zu flattern: ein paar Sekunden hält es das aus, 15 % darüber gar nicht mehr
    f.zuSchnell = f.ias > T.v.nie * KN ? f.zuSchnell + dt : Math.max(0, f.zuSchnell - dt);
    if (f.zuSchnell > 8 || f.ias > T.v.nie * KN * 1.15) f.bruch = 'Tempo';
  }
  f.kugel = clamp(kraft[0] / (m * G) * 4, -1, 1);            // die Kugel im Wendezeiger: + = rechts von der Mitte
  anzeigen(f, welt);
}

// Kurs, Längsneigung, Schräglage und Höhe über Grund aus der Lage ausrechnen
function anzeigen(f, welt) {
  const vor = drehe(f.q, [0, 0, 1]), links = drehe(f.q, [1, 0, 0]), oben = drehe(f.q, [0, 1, 0]);
  f.nick = Math.asin(clamp(vor[1], -1, 1));
  if (Math.abs(vor[1]) < 0.999) f.kurs = (Math.atan2(-vor[0], vor[2]) + 2 * Math.PI) % (2 * Math.PI);
  f.roll = Math.atan2(links[1], oben[1]);
  f.steig = f.v[1];
  f.hoeheGrund = f.p[1] + f.T.raeder[1].ort[1] - welt.boden(f.p[0], f.p[2]);
  f.wende = -(f.w[1] * oben[1] + f.w[0] * links[1] + f.w[2] * vor[1]);     // wie schnell sich der Kurs dreht (rechts +)
  f.spur = Math.hypot(f.v[0], f.v[2]) > 1 ? (Math.atan2(-f.v[0], f.v[2]) + 2 * Math.PI) % (2 * Math.PI) : f.kurs;   // wohin das Flugzeug wirklich fliegt
  f.grund = Math.hypot(f.v[0], f.v[2]);
}

// Abrissgeschwindigkeit (m/s, angezeigt) für das jetzige Gewicht
export const abrissTempo = (f, kl = f.klappen) => Math.sqrt(2 * masse(f) * G / (RHO0 * f.T.flaeche * (f.T.caMax + f.T.caMaxKlappe * kl)));
export { KN };
