// Flugsimulator – der Autopilot. Ohne Grafik, damit ihn auch das Prüfwerkzeug (tools/autopilot.mjs) fliegen kann.
// Er kann drei Dinge, jedes einzeln an und aus:
//   'hoehe' : hält eine Höhe (mit dem Höhenruder) und steigt oder sinkt dorthin, wenn man eine andere einstellt
//   'kurs'  : hält einen Kurs (mit dem Querruder) und dreht dorthin, wenn man einen anderen einstellt
//   'tempo' : hält ein Tempo (mit dem Gashebel)
// Er fliegt nach den Instrumenten, genau wie ein echter: Zeigt der Höhenmesser oder der Kurskreisel falsch
// (beim ganzen Flug, wenn man sie nicht eingestellt hat), hält er eben die falsche Höhe oder den falschen Kurs.
// Wie die Hilfen bewegt er nur Ruder und Gas – die Physik bleibt dieselbe.
import { KN, FT, GRAD } from './flugzeuge.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wickel = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// ---------------------------------------------------------------- Zahlen zum Einstellen (alle geschätzt)
export const TEILE = ['hoehe', 'kurs', 'tempo'];
export const NAMEN = { hoehe: 'Höhe', kurs: 'Kurs', tempo: 'Tempo' };
const AN_AB = 150;            // erst ab so vielen Metern über dem Boden lässt er sich einschalten (500 ft)
const AUS_UNTER = 60;         // tiefer als so viele Meter über dem Boden schaltet er sich ab (200 ft): Landen muss man selbst
const STEIGEN = 2.5;          // so schnell steigt und sinkt er zu einer neuen Höhe (m/s, das sind 500 ft/min)
const SCHRAEG = 22 * GRAD;    // so schräg legt er das Flugzeug höchstens in die Kurve
const LANGSAM = 58 * KN;      // langsamer lässt der Höhen-Halter das Flugzeug nicht werden: Dann gibt er lieber Höhe auf
const GRIFF = 0.5;            // Knüppel weiter als so (und länger als GRIFF_ZEIT) bewegt = „Ich fliege wieder selbst“
const GRIFF_ZEIT = 0.4;
const TRIMMEN = 0.08;         // so schnell trimmt er nach, was er am Höhenruder hält (damit beim Ausschalten nichts ruckt)
export const GRENZEN = { hoehe: [0, 12000 * FT], tempo: [60 * KN, 120 * KN] };
export const STUFE = { hoehe: 100 * FT, kurs: 1 * GRAD, tempo: 5 * KN };       // so viel ändert ein Tipp auf − oder ＋

// Was die Instrumente zeigen (danach fliegt der Autopilot)
const zeigt = {
  hoehe: f => f.p[1] + (f.nn || 0) + (f.hoeheFehler || 0),
  kurs: f => f.kurs + (f.kursFehler || 0),
  tempo: f => f.iasZeigt ?? f.ias
};
// … und als Text für die Anzeige
export const sollText = {
  hoehe: v => Math.round(v / FT / 100) * 100 + ' ft',
  kurs: v => String(Math.round(((v / GRAD) % 360 + 360) % 360) || 360).padStart(3, '0') + '°',
  tempo: v => Math.round(v / KN) + ' kn'
};

export class Autopilot {
  constructor() { this.neu(); }
  neu() {
    this.an = { hoehe: false, kurs: false, tempo: false }; this.soll = { hoehe: 0, kurs: 0, tempo: 0 };
    this.meldungen = []; this.gas = null; this.gasAlt = null; this.iH = 0; this.iG = 0; this.iK = 0; this.griffH = 0; this.griffQ = 0; this.warnZeit = 0; this.gewaehlt = 'hoehe';
  }
  get aktiv() { return this.an.hoehe || this.an.kurs || this.an.tempo; }
  sag(text, art = 'info') { this.meldungen.push({ text, art }); }
  // Darf er gerade an sein? Gibt den Grund zurück, warum nicht (oder null = ja). ein = true: Er soll gerade eingeschaltet werden.
  nein(f, ein) {
    if (f.bruch) return 'Das Flugzeug ist kaputt.';
    if (f.sys && !f.sys.haupt) return 'Der Autopilot braucht Strom: Der Hauptschalter ist aus.';
    if (f.amBoden) return 'Der Autopilot geht nur in der Luft.';
    if (f.hoeheGrund < (ein ? AN_AB : AUS_UNTER)) return ein ? 'Zu tief für den Autopiloten (mindestens 500 ft über dem Boden).' : 'Unter 200 ft fliegst du selbst – landen kann der Autopilot nicht.';
    if (f.abriss > 0.3 || f.trudelt > 0.3 || Math.abs(f.roll) > 45 * GRAD || Math.abs(f.nick) > 25 * GRAD) return ein ? 'Erst ruhig fliegen, dann den Autopiloten einschalten.' : 'Das Flugzeug fliegt zu wild – du musst es selbst abfangen!';
    return null;
  }
  // Ein Teil an- oder ausschalten. Beim Einschalten merkt er sich, was das Instrument gerade zeigt (Höhe auf 100 ft, Kurs auf 1°, Tempo auf 5 kn genau).
  schalte(was, f) {
    this.gewaehlt = was;
    if (this.an[was]) { this.aus(was, `Autopilot ${NAMEN[was]}: aus.`); return false; }
    const nein = this.nein(f, true);
    if (nein) { this.sag(nein, 'warn'); return false; }
    const s = STUFE[was], g = GRENZEN[was], v = Math.round(zeigt[was](f) / s) * s;
    this.soll[was] = g ? clamp(v, g[0], g[1]) : v; this.an[was] = true;
    if (was === 'hoehe') this.iH = clamp(f.nick, -0.2, 0.25);          // dort weitermachen, wo die Nase gerade steht – dann ruckt nichts
    if (was === 'tempo') { this.iG = f.gas; this.gas = this.gasAlt = null; }
    if (was === 'kurs') this.iK = 0;
    this.griffH = this.griffQ = 0;
    this.sag(`Autopilot hält ${NAMEN[was]} ${sollText[was](this.soll[was])}.` + (was === 'tempo' ? ' Gashebel bewegen = aus.' : ' Knüppel kräftig bewegen = aus.'), 'gut');
    return true;
  }
  // Ziel verstellen: r = −1 oder +1 (eine Stufe). Geht auch, wenn der Teil aus ist – dann ist es schon einmal eingestellt.
  stelle(was, r, f) {
    this.gewaehlt = was;
    if (!this.an[was] && f) { const s = STUFE[was]; this.soll[was] = Math.round(zeigt[was](f) / s) * s; }
    const g = GRENZEN[was];
    this.soll[was] += r * STUFE[was];
    if (g) this.soll[was] = clamp(this.soll[was], g[0], g[1]); else this.soll[was] = wickel(this.soll[was]);
  }
  aus(was, grund, art = 'info') {
    if (!this.an[was]) return;
    this.an[was] = false; if (was === 'tempo') this.gas = this.gasAlt = null;
    if (grund) this.sag(grund, art);
  }
  alleAus(grund, art = 'warn') { if (!this.aktiv) return; for (const k of TEILE) this.aus(k); if (grund) this.sag(grund, art); }
  // Einmal je Bild: Fliegt der Pilot wieder selbst? Geht es überhaupt noch? pilot = was der Mensch gerade steuert.
  pruefe(f, pilot, dt) {
    if (!this.aktiv) return;
    const nein = this.nein(f, false);
    if (nein) { this.alleAus('Autopilot aus: ' + nein); return; }
    // Wer kräftig am Knüppel zieht oder ihn zur Seite legt, übernimmt wieder selbst. Kleine Bewegungen (eine unruhige Hand) zählen nicht.
    this.griffH = this.an.hoehe && Math.abs(pilot.hoehe) > GRIFF ? this.griffH + dt : 0;
    this.griffQ = this.an.kurs && Math.abs(pilot.quer) > GRIFF ? this.griffQ + dt : 0;
    if (this.griffH > GRIFF_ZEIT) this.aus('hoehe', 'Autopilot Höhe aus: Du steuerst die Höhe wieder selbst.', 'warn');
    if (this.griffQ > GRIFF_ZEIT) this.aus('kurs', 'Autopilot Kurs aus: Du steuerst den Kurs wieder selbst.', 'warn');
    // Der Autopilot bewegt den Gashebel selbst. Steht er anders, als der Autopilot ihn hingestellt hat, war es der Pilot.
    if (this.an.tempo && this.gasAlt !== null && Math.abs(pilot.gas - this.gasAlt) > 0.002) this.aus('tempo', 'Autopilot Tempo aus: Du gibst wieder selbst Gas.', 'warn');
    // Hält er die Höhe, aber das Gas reicht nicht, wird das Flugzeug langsam: Dann warnt er (und gibt Höhe auf, siehe steuer)
    this.warnZeit -= dt;
    if (this.an.hoehe && !this.an.tempo && zeigt.tempo(f) < LANGSAM + 1 && this.warnZeit <= 0) { this.warnZeit = 12; this.sag('Autopilot: zu langsam, um die Höhe zu halten – mehr Gas!', 'warn'); }
  }
  // In jedem Rechenschritt: vor = was ohne Autopilot ans Flugzeug ginge (Pilot oder Zeitraffer). Zurück kommt dasselbe,
  // nur dass der Autopilot seine Teile übernommen hat. hilfe = 'leicht' | 'mittel' | 'echt' (bei „leicht“ trimmt schon die Hilfe).
  steuer(f, vor, dt, hilfe) {
    if (!this.aktiv) return vor;
    const a = { ...vor };
    if (this.an.kurs) {
      // Was am Ende noch fehlt (ein, zwei Grad – der Propeller zieht, die Hilfe „leicht“ richtet die Flügel auf), merkt er sich und hält dagegen
      const fehl = wickel(this.soll.kurs - zeigt.kurs(f));
      this.iK = Math.abs(fehl) < 5 * GRAD ? clamp(this.iK + fehl * 0.3 * dt, -4 * GRAD, 4 * GRAD) : this.iK;
      const roll = clamp(1.4 * fehl + this.iK, -SCHRAEG, SCHRAEG);
      a.quer = clamp(2.5 * (roll - f.roll) - 0.6 * f.w[2], -1, 1);
    }
    if (this.an.hoehe) {
      let steigSoll = clamp((this.soll.hoehe - zeigt.hoehe(f)) * 0.25, -STEIGEN, STEIGEN);
      // Nie in den Abriss ziehen: Wird es zu langsam, lässt er die Nase sinken, bis das Tempo wieder reicht
      steigSoll = Math.min(steigSoll, (zeigt.tempo(f) - LANGSAM) * 1.2);
      const fehl = steigSoll - f.steig;
      this.iH = clamp(this.iH + fehl * 0.006 * dt, -0.25, 0.3);
      const nick = clamp(0.03 * fehl + this.iH, -0.2, 0.25);
      a.hoehe = clamp(3.5 * (nick - f.nick) + 0.9 * f.w[0], -1, 1);
      // Was er dauernd halten muss, trimmt er langsam weg – wie der Trimm-Motor eines echten Autopiloten
      if (hilfe !== 'leicht') f.trimm = clamp(f.trimm + a.hoehe * TRIMMEN * dt, -1, 1);
    }
    if (this.an.tempo) {
      const fehl = this.soll.tempo - zeigt.tempo(f);                       // m/s zu langsam
      this.iG = clamp(this.iG + fehl * 0.02 * dt, 0, 1);
      a.gas = this.gas = clamp(0.1 * fehl + this.iG, 0, 1);
    }
    return a;
  }
  // Nach den Rechenschritten: Der Gashebel des Piloten steht jetzt dort, wo der Autopilot ihn hingeschoben hat
  fertig(pilot) { if (this.an.tempo && this.gas !== null) pilot.gas = this.gasAlt = this.gas; }
  // Für Anzeige und Handy: je Teil an/aus und das Ziel als Text
  stand() { return TEILE.map(k => ({ id: k, name: NAMEN[k], an: this.an[k], text: sollText[k](this.soll[k]) })); }
}
