// Flugsimulator – das Gerät neigen wie einen Steuerknüppel. Die Rechnung stammt aus Frontlinie 3 (js/touch.js dort):
// Aus dem Bewegungssensor kommt die Richtung „oben“. Beim Kalibrieren merkt sich das Spiel die Haltung als Mitte,
// danach zählt nur der Unterschied dazu. Das Gerät wird quer gehalten wie ein Lenkrad.
//   quer  : + = nach rechts gedreht (rechte Seite tiefer)
//   hoehe : + = Oberkante zu sich gezogen (ziehen, Nase hoch)
// Die Eingabe wird nicht geglättet – Ruhe kommt aus dem Flugzeug, nicht aus der Steuerung.
const DEG = 180 / Math.PI, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ROLL_VOLL = 30, NICK_VOLL = 22, TOT = 2, WEICH = 1.3;      // Grad für vollen Ausschlag, tote Mitte, sanfte Kurve um die Mitte
const STUFEN = [1.6, 1.3, 1, 0.8, 0.65];                         // Empfindlichkeit 1 bis 5 (3 = normal)
const SPEICHER = 'flugsim.neigung.v1';

export class Neigung {
  constructor() {
    this.an = false; this.quer = 0; this.hoehe = 0; this.u = null; this.u0 = null; this.th = null; this.sicher = false; this.quert = null;
    this.neuMitte = false; this.hoert = false; this.stufe = 3;
    try { const n = +localStorage.getItem(SPEICHER); if (n >= 1 && n <= 5) this.stufe = n; } catch (e) { /* ohne Speicher eben Stufe 3 */ }
  }
  kurve(grad, voll) {
    const a = Math.abs(grad);
    if (a < TOT) return 0;
    return Math.sign(grad) * Math.pow(Math.min(1, (a - TOT) / (voll * STUFEN[this.stufe - 1] - TOT)), WEICH);
  }
  stufeWeiter() { this.stufe = this.stufe % 5 + 1; try { localStorage.setItem(SPEICHER, String(this.stufe)); } catch (e) { /* egal */ } return this.stufe; }
  // Richtung „oben“ umgerechnet auf den gedrehten Bildschirm: [nach rechts, nach oben, aus dem Bildschirm heraus]
  aufSchirm(u, th) { return [u[0] * Math.cos(th) - u[1] * Math.sin(th), u[0] * Math.sin(th) + u[1] * Math.cos(th), u[2]]; }
  istQuer() { return window.innerWidth >= window.innerHeight; }
  // Wie herum der Bildschirm gedreht ist, verrät die Schwerkraft: Die Oberkante des Bildes zeigt nach oben.
  winkelWaehlen(u) {
    const quer = this.quert = this.istQuer(), wahl = quer ? [90, 270] : [0, 180];
    const sy = this.aufSchirm(u, wahl[0] / DEG)[1];
    if (Math.abs(sy) > 0.3) { this.sicher = true; this.th = wahl[sy > 0 ? 0 : 1] / DEG; return; }
    this.sicher = false;
    const so = window.screen && screen.orientation;
    const gemeldet = (((so && typeof so.angle === 'number' ? so.angle : (window.orientation || 0)) % 360) + 360) % 360;
    this.th = (wahl.includes(gemeldet) ? gemeldet : wahl[0]) / DEG;
  }
  mitte() { if (this.u) { this.winkelWaehlen(this.u); this.u0 = this.u.slice(); this.neuMitte = false; } else this.neuMitte = true; this.quer = this.hoehe = 0; }
  // beta, gamma = Winkel aus dem Sensor (Grad). Auch von den Tests aufrufbar.
  sensor(beta, gamma) {
    const b = beta / DEG, g = gamma / DEG;
    const u = this.u = [-Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g)];
    if (!this.u0 || this.neuMitte || this.quert !== this.istQuer()) this.mitte();
    let s = this.aufSchirm(u, this.th);
    if (!this.sicher && Math.abs(s[1]) > 0.42) { this.sicher = true; if (s[1] < 0) { this.th += Math.PI; s = this.aufSchirm(u, this.th); } }
    const n = this.aufSchirm(this.u0, this.th);
    const lim = v => Math.asin(clamp(v, -1, 1)) * DEG;
    const roll = lim(s[0]) - lim(n[0]);                                   // + = linke Seite tiefer
    let nick = (Math.atan2(s[1], s[2]) - Math.atan2(n[1], n[2])) * DEG;   // + = Oberkante zu sich gezogen
    while (nick > 180) nick -= 360; while (nick < -180) nick += 360;
    this.rollGrad = roll; this.nickGrad = nick;
    this.quer = this.an ? -this.kurve(roll, ROLL_VOLL) : 0;
    this.hoehe = this.an ? this.kurve(nick, NICK_VOLL) : 0;
  }
  // Muss direkt aus einem Fingertipp heraus aufgerufen werden: iPad und iPhone fragen dann einmal um Erlaubnis.
  start() {
    const D = window.DeviceOrientationEvent;
    if (!D) return Promise.resolve(false);
    const los = () => {
      if (!this.hoert) { this.hoert = true; window.addEventListener('deviceorientation', e => { if (e.beta !== null && e.gamma !== null && e.beta !== undefined) this.sensor(e.beta, e.gamma); }); window.addEventListener('orientationchange', () => { this.neuMitte = true; }); }
      this.an = true; this.neuMitte = true; this.quer = this.hoehe = 0; return true;
    };
    if (typeof D.requestPermission === 'function') return D.requestPermission().then(r => r === 'granted' ? los() : false).catch(() => false);
    return Promise.resolve(los());
  }
  stopp() { this.an = false; this.quer = this.hoehe = 0; }
}
