// Ein künstlicher Pilot für die Prüfwerkzeuge. Er fliegt mit einfachen Reglern:
// „Nase auf diesen Winkel“, „Flügel auf diese Schräglage“, „dieses Tempo halten“.
// Mit `verzug` (Sekunden) sieht er alles etwas zu spät – wie ein Mensch mit Schrecksekunde.
import { schritt, TAKT, KN } from '../js/physik.js';
import { mitHilfe } from '../js/hilfen.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wickel = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const GRAD = Math.PI / 180;

export class Pilot {
  constructor(f, welt, opt = {}) {
    this.f = f; this.welt = welt; this.hilfe = opt.hilfe || 'mittel'; this.verzug = opt.verzug || 0;
    this.e = { hoehe: 0, quer: 0, seite: 0, gas: 0, bremse: 0 };
    this.iV = 0; this.iH = 0; this.alt = []; this.log = [];
  }
  // was der Pilot „sieht“: bei Verzug der Stand von vor ein paar Augenblicken
  sicht() {
    const f = this.f, jetzt = { ias: f.ias, nick: f.nick, roll: f.roll, kurs: f.kurs, steig: f.steig, y: f.p[1], x: f.p[0], z: f.p[2], qq: -f.w[0], p: f.w[2], spur: f.spur, hg: f.hoeheGrund };
    if (!this.verzug) return jetzt;
    this.alt.push(jetzt);
    const n = Math.round(this.verzug / TAKT);
    if (this.alt.length > n + 1) this.alt.shift();
    return this.alt[0];
  }
  nase(s, soll) { this.e.hoehe = clamp(3.5 * (soll - s.nick) - 0.9 * s.qq, -1, 1); }
  flaeche(s, soll) { this.e.quer = clamp(2.5 * (soll - s.roll) - 0.6 * s.p, -1, 1); }
  kurs(s, soll, grenze = 25) { this.flaeche(s, clamp(1.4 * wickel(soll - s.kurs), -grenze * GRAD, grenze * GRAD)); }
  // Tempo mit der Nase halten (zu schnell = Nase höher)
  tempoMitNase(s, vSoll, dt) {
    const fehl = s.ias - vSoll;
    this.iV = clamp(this.iV + fehl * 0.004 * dt, -0.3, 0.3);
    this.nase(s, clamp(0.02 * fehl + this.iV, -0.3, 0.35));
  }
  // Höhe mit der Nase halten
  hoeheMitNase(s, ySoll, dt) {
    const steigSoll = clamp((ySoll - s.y) * 0.25, -5, 5), fehl = steigSoll - s.steig;
    this.iH = clamp(this.iH + fehl * 0.006 * dt, -0.25, 0.3);
    this.nase(s, clamp(0.03 * fehl + this.iH, -0.25, 0.3));
  }
  // n Sekunden fliegen; tu(s, dt, t) stellt jedes Mal die Ruder
  flieg(sek, tu) {
    const f = this.f;
    for (let t = 0; t < sek && !f.bruch; t += TAKT) {
      const s = this.sicht();
      if (tu(s, TAKT, t) === false) break;
      schritt(f, mitHilfe(this.e, f, this.hilfe, TAKT), TAKT, this.welt);
    }
  }
}
export const ruhig = { wind: () => [0, 0, 0], boden: () => 0 };
// Wind aus Richtung `aus` (Grad, wie auf dem Kompass) mit `kn` Knoten
export const windWelt = (aus, kn) => { const a = aus * GRAD, v = kn * KN; return { wind: () => [Math.sin(a) * v, 0, -Math.cos(a) * v], boden: () => 0 }; };
