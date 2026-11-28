// Flugsimulator – fasst alle Steuerungen zusammen: Handy als Steuerknüppel (Vorrang), dieses Gerät neigen,
// Knüppel auf dem Bildschirm, Tastatur. Heraus kommt immer dasselbe:
//   hoehe (+ ziehen = Nase hoch), quer (+ nach rechts), seite (+ Nase nach rechts), gas 0…1, bremse 0…1
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const TASTEN_HILFE = [
  ['← →', 'Querruder: Schräglage und Kurve'], ['↓ / ↑', 'ziehen (Nase hoch) / drücken (Nase runter)'],
  ['Q / E', 'Seitenruder links / rechts (am Boden: lenken)'], ['W / S', 'mehr Gas / weniger Gas (auch Bild↑ Bild↓, Ziffern 0–9)'],
  ['F / V', 'Klappen eine Stufe ausfahren / einfahren'], ['T / G', 'Trimmung: Nase schwerer / leichter (Shift+↑↓ geht auch)'],
  ['B oder Leertaste', 'Radbremse'], ['C', 'Ansicht wechseln'],
    ['J / L, I / K', 'Blick nach links / rechts, hoch / runter (im Cockpit: K = nach hinten). Außen dreht sich die Kamera ums Flugzeug, + und − = näher und weiter'],
      ['U', 'Blick wieder geradeaus'], ['R', 'Flugweg der Platzrunde an / aus'], ['H', 'Hilfen: leicht, mittel, echt'], ['P', 'Pause'], ['N', 'neu anfangen (Menü)'],
  ['Gamepad / Joystick', 'linker Knüppel = Höhe und Quer, rechter Knüppel = Seitenruder, Abzüge = Gas, A = Bremse, LB / RB = Klappen, Steuerkreuz = Trimmung, Y = Ansicht'],
  ['M / O / 1 2 3', 'Überlandflug: Karte auf und zu / Zeitraffer an und aus / Funkspruch wählen'],
  ['4 / 5 6 / 7', 'Überlandflug: nächstes Funkfeuer einstellen / Kurs am Funkfeuer 5° zurück und vor / Kurs direkt zum Funkfeuer. Im Überlandflug stellen die Ziffern nicht das Gas (dafür W und S)'],
  ['F6 / F7 / F8', 'Autopilot: Höhe / Kurs / Tempo halten, an und aus (geht auch mit der Maus im Kasten „Autopilot“ links)'],
  ['F9 / F10, Rücktaste', 'Autopilot: Ziel kleiner / größer (für das, was zuletzt geschaltet wurde) · Autopilot ganz aus. Knüppel kräftig bewegen oder Gas geben schaltet ihn auch aus'],
  ['F2', 'Flugrekorder: Marke setzen („Hier war es komisch“)'],
  ['X / Y / Enter', 'Der ganze Flug: Schalterbrett / Checkliste auf und zu / nächsten Handgriff erledigen. Zu Fuß: Pfeiltasten gehen und drehen'],
];

const PAD_TOT = 0.08;      // so viel Spiel hat ein Gamepad-Knüppel um die Mitte

export class Eingabe {
  constructor() {
    this.e = { hoehe: 0, quer: 0, seite: 0, gas: 0, bremse: 0 };
    this.taste = {}; this.tast = { hoehe: 0, quer: 0, seite: 0 };
    this.stick = { x: 0, y: 0, an: false }; this.pedal = 0; this.bremsKnopf = 0;      // Knüppel, Pedale und Bremse auf dem Bildschirm
    this.neigung = null;                                                              // dieses Gerät neigen (Neigung aus neigung.js)
    this.handy = null; this.handyAn = false;                                          // letzte Nachricht vom Handy
    // Wie gut ist der Funk zum Handy? (für den Flugrekorder) n = Nummer der letzten Nachricht, luecke = längste Pause seit der letzten Rekorder-Zeile (ms),
    // verloren = Nachrichten, die nie ankamen, alt = zu spät gekommene (werden weggeworfen), runde = Funk hin und zurück (ms)
    this.funk = { n: -1, zeit: 0, luecke: 0, verloren: 0, alt: 0, runde: 0, zahl: 0 };
    this.trimm = 0;                                                                   // −1, 0, +1: Trimmrad wird gerade gedreht
    this.wenn = {};                                                                   // Knöpfe: klappenAus, klappenEin, kamera, pause, neu, hilfe
    this.womit = 'Tastatur';
    window.addEventListener('keydown', ev => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'PageUp', 'PageDown', 'Enter'].includes(ev.code)) ev.preventDefault();
      // Autopilot: F6 Höhe, F7 Kurs, F8 Tempo an und aus, F9 / F10 Ziel kleiner und größer (gehalten zählt es weiter), Rücktaste = alles aus
      const apTaste = { F6: 'apHoehe', F7: 'apKurs', F8: 'apTempo', F9: 'apMinus', F10: 'apPlus', Backspace: 'apAus' }[ev.code];
      if (apTaste) { ev.preventDefault(); if (!ev.repeat || ev.code === 'F9' || ev.code === 'F10') this.druecke(apTaste); return; }
      if (ev.repeat) return;
      this.taste[ev.code] = true;
      const k = { KeyF: 'klappenAus', KeyV: 'klappenEin', KeyC: 'kamera', KeyP: 'pause', KeyN: 'neu', KeyH: 'hilfe', KeyU: 'blickMitte', KeyR: 'weg', Escape: 'pause', KeyX: 'brett', KeyY: 'liste', KeyZ: 'liste', Enter: 'tun', KeyM: 'karte', KeyO: 'raffer', F2: 'marke' }[ev.code];
      if (k) this.druecke(k);
      if (/^Digit\d$/.test(ev.code) && this.ziffer && this.ziffer(+ev.code.slice(5))) return;      // im Überlandflug gehören die Ziffern dem Funk und dem Funkfeuer
      if (/^Digit\d$/.test(ev.code)) this.e.gas = ev.code === 'Digit0' ? 1 : +ev.code.slice(5) / 10;
    });
    window.addEventListener('keyup', ev => { this.taste[ev.code] = false; });
    window.addEventListener('blur', () => { this.taste = {}; });
  }
  druecke(k) { if (this.wenn[k]) this.wenn[k](); }
  unten(...codes) { return codes.some(c => this.taste[c]); }
  // Nachricht vom Handy
  vomHandy(m) {
    if (m.k === 's') {
      const jetzt = performance.now(), fu = this.funk;
      // Das Handy zählt seine Nachrichten durch. Kommt eine ältere nach einer neueren an, ist sie überholt und fliegt weg.
      if (typeof m.n === 'number') {
        if (fu.n >= 0 && m.n < fu.n && fu.n - m.n < 60) { fu.alt++; return; }
        if (fu.n >= 0 && m.n > fu.n + 1 && m.n - fu.n < 600) fu.verloren += m.n - fu.n - 1;
        fu.n = m.n;
      }
      if (fu.zeit) fu.luecke = Math.max(fu.luecke, jetzt - fu.zeit);
      fu.zeit = jetzt; fu.zahl++;
      this.handy = m; this.handyAn = true;
    }
    else if (m.k === 'p' && typeof m.t === 'number') this.funk.runde = Math.max(1, Math.round(performance.now() - m.t));      // unser „Ping“ ist zurück
    else if (m.k === 't' && typeof m.a === 'string') {
      if (m.a === 'trimmHoch') this.handyTrimm = 1; else if (m.a === 'trimmRunter') this.handyTrimm = -1; else if (m.a === 'trimmAus') this.handyTrimm = 0;
      else this.druecke(m.a);
    }
  }
  // Gamepad oder Joystick (alles, was der Browser als „Gamepad“ meldet). Belegung wie bei den meisten Controllern:
  //   linker Knüppel = Höhen- und Querruder, rechter Knüppel links/rechts = Seitenruder (nur bei Geräten mit der
  //   Standard-Belegung: Bei vielen Joysticks liegt auf dieser Achse der Schubhebel, das wäre dauerndes Seitenruder),
  //   rechter Abzug = mehr Gas, linker Abzug = weniger Gas, A = Bremse, LB/RB = Klappen ein/aus,
  //   Steuerkreuz hoch/runter = Trimmung, Y = Kamera, Start = Pause
  padLesen(dt) {
    const liste = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of liste) if (p && p.connected && p.axes.length >= 2) { pad = p; break; }
    if (!pad) { this.padAlt = null; return null; }
    const tot = v => { const a = Math.abs(v || 0); return a < PAD_TOT ? 0 : Math.sign(v) * (a - PAD_TOT) / (1 - PAD_TOT); };   // kleine tote Mitte, sonst wackelt es
    const b = n => pad.buttons[n] ? pad.buttons[n].value || (pad.buttons[n].pressed ? 1 : 0) : 0;
    const g = { quer: tot(pad.axes[0]), hoehe: tot(pad.axes[1]), seite: pad.mapping === 'standard' ? tot(pad.axes[2]) : 0, bremse: b(0), trimm: b(13) - b(12), benutzt: false };
    const gasTempo = b(7) - b(6);
    if (gasTempo) this.e.gas = clamp(this.e.gas + gasTempo * 0.6 * dt, 0, 1);
    // Knöpfe zählen nur beim Herunterdrücken, nicht solange sie gehalten werden
    const jetzt = { klappenEin: b(4) > 0.5, klappenAus: b(5) > 0.5, kamera: b(3) > 0.5, pause: b(9) > 0.5 }, alt = this.padAlt || jetzt;
    for (const k in jetzt) if (jetzt[k] && !alt[k]) this.druecke(k);
    this.padAlt = jetzt;
    g.benutzt = !!(g.quer || g.hoehe || g.seite || g.bremse || gasTempo);
    return g;
  }
  schritt(dt) {
    const e = this.e, t = this.tast, shift = this.unten('ShiftLeft', 'ShiftRight');
    // Tastatur: Eine Taste ist ganz oder gar nicht gedrückt. Der Ausschlag läuft deshalb weich hoch und schnell zurück.
    const ziel = {
      hoehe: shift ? 0 : (this.unten('ArrowDown') ? 1 : 0) - (this.unten('ArrowUp') ? 1 : 0),
      quer: (this.unten('ArrowRight', 'KeyD') ? 1 : 0) - (this.unten('ArrowLeft', 'KeyA') ? 1 : 0),
      seite: (this.unten('KeyE', 'Period') ? 1 : 0) - (this.unten('KeyQ', 'Comma') ? 1 : 0)
    };
    for (const k of ['hoehe', 'quer', 'seite']) {
      const tempo = ziel[k] === 0 ? 5 : Math.sign(ziel[k]) !== Math.sign(t[k]) && t[k] !== 0 ? 6 : 1.6;
      t[k] += clamp(ziel[k] * (k === 'seite' ? 1 : 0.8) - t[k], -tempo * dt, tempo * dt);
    }
    const gasTaste = (this.unten('KeyW', 'PageUp') ? 1 : 0) - (this.unten('KeyS', 'PageDown') ? 1 : 0);
    e.gas = clamp(e.gas + gasTaste * 0.45 * dt, 0, 1);
    this.trimm = (this.unten('KeyT') || (shift && this.unten('ArrowUp')) ? -1 : 0) + (this.unten('KeyG') || (shift && this.unten('ArrowDown')) ? 1 : 0) + (this.handyAn ? (this.handyTrimm || 0) : 0) + (this.trimmKnopf || 0);
    let hoehe = t.hoehe, quer = t.quer, seite = t.seite, bremse = this.unten('KeyB', 'Space') ? 1 : 0;
    this.womit = 'Tastatur';
    if (this.handyAn && this.handy) {
      const h = this.handy;
      hoehe += +h.h || 0; quer += +h.q || 0; seite += +h.s || 0; bremse = Math.max(bremse, +h.b || 0);
      if (!gasTaste && typeof h.g === 'number') e.gas = clamp(h.g, 0, 1);
      this.womit = 'Handy';
    } else {
      if (this.neigung && this.neigung.an) { hoehe += this.neigung.hoehe; quer += this.neigung.quer; this.womit = 'Neigen'; }
      if (this.stick.an) { hoehe += -this.stick.y; quer += this.stick.x; this.womit = 'Touch'; }
      // Die Pedal-Knöpfe auf dem Bildschirm sind nur an oder aus. Der Ausschlag läuft deshalb langsam hoch (0,8 s bis voll) und schnell zurück –
      // wer kurz tippt, bekommt wenig Ruder, wer hält, bekommt mehr.
      this.pedalIst = (this.pedalIst || 0) + clamp(this.pedal - (this.pedalIst || 0), -(this.pedal ? 1.25 : 5) * dt, (this.pedal ? 1.25 : 5) * dt);
      seite += this.pedalIst; bremse = Math.max(bremse, this.bremsKnopf);
      const g = this.pad = this.padLesen(dt);
      if (g) { hoehe += g.hoehe; quer += g.quer; seite += g.seite; bremse = Math.max(bremse, g.bremse); this.trimm += g.trimm; if (g.benutzt) this.womit = 'Gamepad'; }
    }
    this.trimm = clamp(this.trimm, -1, 1);
    e.hoehe = clamp(hoehe, -1, 1); e.quer = clamp(quer, -1, 1); e.seite = clamp(seite, -1, 1); e.bremse = bremse;
    return e;
  }
}
