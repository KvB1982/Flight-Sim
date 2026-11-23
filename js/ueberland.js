// Flugsimulator – der Ablauf eines Überlandflugs: Start am ersten Platz, Wegpunkte abfliegen, funken, am Ziel landen.
// Ohne Grafik, damit das Prüfwerkzeug (tools/ueberland.mjs) denselben Ablauf fliegen kann.
import { KN, FT, GRAD } from './flugzeuge.js';
import { platzVon, platzWelt, bahnBeiWind, bahnKurs, bahnLage, bodenHoehe, NN, NM } from './region.js';
import { Navi, rechne, wickel, kursVon, grad3, REISE, NAVI_GRENZE } from './navigation.js';
import { Funk, richtungVon, meilen, fussMeer, windText } from './funk.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const LITER = 0.72;                       // ein Liter Flugbenzin wiegt etwa 0,72 kg

// ---------------------------------------------------------------- Zeitraffer: Kurs und Höhe halten
// Im Zeitraffer läuft die Zeit viermal so schnell. Das kann kein Mensch steuern – deshalb hält das Spiel so lange
// Kurs und Höhe (wie ein einfacher Autopilot). Sobald man selbst steuert, ist der Zeitraffer aus.
export const RAFFER = 4;
export function halte(f, soll, dt) {
  const roll = clamp(1.4 * wickel(soll.kurs - f.kurs), -22 * GRAD, 22 * GRAD);
  const steigSoll = clamp((soll.y - f.p[1]) * 0.25, -4, 4), fehl = steigSoll - f.steig;
  soll.i = clamp((soll.i || 0) + fehl * 0.006 * dt, -0.25, 0.3);
  const nick = clamp(0.03 * fehl + soll.i, -0.2, 0.25);
  return { hoehe: clamp(3.5 * (nick - f.nick) + 0.9 * f.w[0], -1, 1), quer: clamp(2.5 * (roll - f.roll) - 0.6 * f.w[2], -1, 1), seite: 0 };
}

export class Reise {
  // plan = { punkte, hoehe (ft über dem Meer), sprit (Liter) }, wetter = Eintrag aus WETTER
  // opt: navi = 'leicht' | 'mittel' | 'selbst' (wie viel das Navi verrät), ganz = true: Der Flug beginnt geparkt mit Außencheck
  // und endet erst mit dem Flugbuch, zufall = Würfel für den Funk
  constructor(plan, wetter, opt = {}) {
    this.plan = plan; this.wetter = wetter; this.rechnung = rechne(plan, wetter);
    this.stufe = opt.navi || 'leicht'; this.ganz = !!opt.ganz; this.abhebZeit = null;
    this.start = platzVon(plan.punkte[0].id); this.ziel = platzVon(plan.punkte[plan.punkte.length - 1].id);
    this.navi = new Navi(plan); this.funk = new Funk(opt.zufall);
    this.endeStart = bahnBeiWind(this.start, wetter.aus * GRAD, wetter.kn); this.endeZiel = bahnBeiWind(this.ziel, wetter.aus * GRAD, wetter.kn);
    this.t = 0; this.flugZeit = 0; this.warOben = false; this.fertig = false; this.steht = 0; this.meldungen = []; this.tief = 0; this.tiefGemeldet = 0;
    this.raffer = false; this.soll = null; this.spritStart = plan.sprit; this.note = null;
  }
  // Wo und wie das Flugzeug am Anfang steht: auf der Bahn, die zum Wind passt – oder (ganzer Flug) geparkt auf dem Vorfeld, Nase zur Bahn
  startLage() {
    const P = this.start, e = this.endeStart, [x, z] = this.ganz ? platzWelt(P, P.vorfeld.x, P.vorfeld.z) : platzWelt(P, 0, e ? P.lang - 40 : 40);
    if (this.ganz) return { x, z, kurs: P.kurs - Math.PI / 2, boden: P.hoehe, trimm: 0 };
    return { x, z, kurs: bahnKurs(P, e), boden: P.hoehe, trimm: -0.35 };
  }
  sag(text, art = 'info') { this.meldungen.push({ text, art }); }
  // Was der Funk über die Lage wissen muss
  lage(f) {
    const S = this.start, Z = this.ziel, w = this.wetter, zumZiel = Math.hypot(f.p[0] - Z.mx, f.p[2] - Z.mz);
    // Welche Bahn fliegt man gerade an? Auf der Linie = innerhalb von 5 km vor einem Bahnanfang, ungefähr in Bahnrichtung, im Sinken oder tief
    let aufLinie = false, bahnJetzt = Z.bahnen[this.endeZiel];
    for (const e of [0, 1]) { const L = bahnLage(Z, e, f.p[0], f.p[2]);
      if (L.laengs < 0 && L.laengs > -5000 && Math.abs(L.quer) < 500 + 0.25 * -L.laengs && Math.abs(wickel(f.kurs - bahnKurs(Z, e))) < 35 * GRAD && f.p[1] - Z.hoehe < 450) { aufLinie = true; bahnJetzt = Z.bahnen[e]; this.endeJetzt = e; } }
    return { start: S, ziel: Z, bahnStart: S.bahnen[this.endeStart], bahnStartFalsch: S.bahnen[1 - this.endeStart], bahnZiel: Z.bahnen[this.endeZiel], andereZiel: Z.bahnen[1 - this.endeZiel], bahnJetzt,
      bereit: !f.sys || (f.motorAn && Math.abs(bahnLage(S, 0, f.p[0], f.p[2]).quer) < 60),      // beim ganzen Flug funkt man erst, wenn man vor der Bahn steht
      vorhaben: S === Z ? `Rundflug über ${this.plan.punkte[1].name}` : `Sichtflug nach ${Z.name}`, wind: windText(w.aus, w.kn), naechster: this.plan.punkte[1].name, warOben: this.warOben, vomStart: Math.hypot(f.p[0] - S.mx, f.p[2] - S.mz), zumZiel, letztes: this.navi.letztes,
      amZiel: zumZiel < Z.lang / 2 + 400, aufLinie, meilen: meilen(zumZiel), richtung: richtungVon(Z, f.p[0], f.p[2]), fuss: fussMeer(f.p[1]), tempo: Math.hypot(f.v[0], f.v[2]) };
  }
  // Geht der Zeitraffer gerade? Gibt den Grund zurück, warum nicht (oder null = geht)
  rafferNein(f) {
    if (f.amBoden) return 'Zeitraffer geht nur in der Luft.';
    if (f.hoeheGrund < 250) return 'Zu tief für den Zeitraffer (mindestens 800 ft über dem Boden).';
    if (f.abriss > 0.2 || Math.abs(f.roll) > 35 * GRAD) return 'Erst ruhig geradeaus fliegen.';
    const L = this.navi.lage(f);
    if (L.weit < 4000) return this.navi.letztes ? 'Der Zielplatz ist nah: Jetzt fliegst du selbst.' : 'Der Wegpunkt ist gleich da: Jetzt fliegst du selbst.';
    if (this.funk.frage) return 'Erst den Funkspruch beantworten.';
    return null;
  }
  rafferAn(f) { const nein = this.rafferNein(f); if (nein) { this.sag(nein, 'warn'); return false; } this.raffer = true; this.soll = { kurs: f.kurs, y: f.p[1] };
    this.sag(`Zeitraffer ×${RAFFER}: Das Flugzeug hält Kurs ${grad3(f.kurs)}° und ${fussMeer(f.p[1])} ft. Knüppel bewegen = aus.`, 'info'); return true; }
  rafferAus(grund) { if (!this.raffer) return; this.raffer = false; this.soll = null; if (grund) this.sag(grund, 'info'); }
  // Im Zeitraffer steuert das Spiel. e = was der Pilot gerade macht (bewegt er den Knüppel, ist Schluss).
  steuer(f, e, dt) {
    if (!this.raffer) return e;
    if (Math.abs(e.hoehe) > 0.25 || Math.abs(e.quer) > 0.25) { this.rafferAus('Zeitraffer aus: Du steuerst wieder selbst.'); return e; }
    return { ...e, ...halte(f, this.soll, dt) };
  }
  // jedes Bild (dt = Spielzeit, im Zeitraffer also mehr): Navi, Funk, Regeln, Ende
  schritt(f, dt, flug) {
    if (this.fertig) return;
    this.t += dt; if (!f.amBoden) { this.flugZeit += dt; if (f.hoeheGrund > 15) this.warOben = true; }
    if (!f.amBoden && this.abhebZeit === null) this.abhebZeit = this.t;                 // ab jetzt läuft die Stoppuhr auf dem Planzettel
    if (this.ganz && !this.warOben) this.spritStart = f.sprit / LITER;                 // beim ganzen Flug zählt, was beim Abheben wirklich im Tank ist
    const p = this.navi.schritt(f);
    if (p) {
      const n = this.navi.ziel, b = this.rechnung.beine[this.navi.nr - 1];
      // In der Stufe „Selbst“ sagt einem niemand, dass der Wegpunkt erreicht ist – das sieht man aus dem Fenster und auf der Uhr
      if (this.stufe !== 'selbst') this.sag(p.getroffen ? `Wegpunkt ${p.name} erreicht. Weiter nach ${n.name}: Kurs ${grad3(b.steuer)}°, ${b.strecke.toFixed(0)} NM.`
        : `An ${p.name} vorbeigeflogen (${(p.nah / 1000).toFixed(1)} km daneben). Weiter nach ${n.name}: Kurs ${grad3(b.steuer)}°.`, p.getroffen ? 'gut' : 'warn');
    }
    const l = this.lage(f);
    this.funk.schritt(f, l, dt);
    // Zeitraffer endet von allein, wenn es eng wird
    if (this.raffer) { const nein = this.rafferNein(f); if (nein) this.rafferAus('Zeitraffer aus: ' + nein); }
    // zu tief über Land (außer bei Start und Landung): Über freiem Land sind mindestens 500 Fuß Pflicht
    if (this.warOben && !f.amBoden && f.hoeheGrund < 150 && l.vomStart > 4000 && l.zumZiel > 4000) { this.tief += dt; this.tiefGemeldet -= dt; if (this.tiefGemeldet <= 0) { this.tiefGemeldet = 30; this.sag('Zu tief! Über freiem Land mindestens 500 Fuß über dem Boden bleiben.', 'warn'); } }
    if (f.sprit <= 0 && !this.leerGemeldet) { this.leerGemeldet = true; this.sag('Der Tank ist leer! Such dir eine Wiese zum Landen.', 'schlimm'); }
    // die letzte Landung merken (für die Note), und auf welcher Bahn sie war
    if (flug.note && flug.note !== this.note) { this.note = flug.note; this.landeBahn = l.amZiel ? this.endeJetzt ?? (Math.cos(f.kurs - this.ziel.kurs) >= 0 ? 0 : 1) : null; this.landeOrt = l.amZiel ? this.ziel.id : null; }
    // Ende: am Zielplatz gelandet und ausgerollt – oder Bruch
    const steht = f.amBoden && this.warOben && l.tempo < 1.5;
    this.steht = steht ? this.steht + dt : 0;
    if (f.bruch || (!this.ganz && this.steht > 2.5)) { this.fertig = true; this.rafferAus(); }
  }
  // Die Auswertung am Ende: fünf Punkte, je einer ein Stern
  ergebnis(f) {
    const R = this.rechnung, Z = this.ziel, amZiel = !f.bruch && Math.hypot(f.p[0] - Z.mx, f.p[2] - Z.mz) < Z.lang / 2 + 400;
    const wp = this.navi.punkte.slice(1, -1), getroffen = wp.filter(p => p.getroffen).length;
    const min = this.flugZeit / 60, liter = this.spritStart - f.sprit / LITER, rest = f.sprit / LITER;
    const richtigeBahn = this.landeBahn === this.endeZiel || this.wetter.kn < 2, reserve = REISE.reserve / 60 * REISE.verbrauch;
    const ab = this.navi.maxAb / NM, grenze = NAVI_GRENZE[this.stufe], zeitGrenze = R.zeit * 1.15 + 2;
    const zeilen = [
      {
        name: 'Navigation', ok: amZiel && getroffen === wp.length && ab <= grenze,
        text: !amZiel ? `Nicht in ${Z.name} gelandet.` : (wp.length ? `${getroffen} von ${wp.length} Wegpunkten getroffen.` : `Direkt nach ${Z.name} gefunden.`)
          + ` Weiteste Abweichung von der Linie: ${ab.toFixed(1)} NM (erlaubt ${grenze.toFixed(1)}).`
      },
      { name: 'Zeit', ok: amZiel && min <= zeitGrenze, text: `Geplant ${Math.round(R.zeit)} Minuten mit Steigflug und Anflug, geflogen ${Math.round(min)} Minuten (für den Stern höchstens ${Math.floor(zeitGrenze)}).` },
      {
        name: 'Sprit', ok: !f.bruch && rest >= reserve,
        text: `Geplant ${Math.round(R.liter)} Liter, verbraucht ${Math.round(liter)} Liter. Im Tank sind noch ${Math.round(rest)} Liter`
          + (rest < reserve ? ` – das ist weniger als die Reserve für ${REISE.reserve} Minuten (${Math.round(reserve)} Liter)!` : '.')
      },
      {
        name: 'Funk', ok: this.funk.falsch + this.funk.verpasst.length <= 1 && this.funk.richtig > 0,
        text: `${this.funk.richtig} Funksprüche richtig, ${this.funk.falsch} falsch` + (this.funk.verpasst.length ? `, nicht gemeldet: ${this.funk.verpasst.join(', ')}.` : '.')
      },
      {
        name: 'Landung', ok: amZiel && !!this.note && this.note.sterne >= 3 && richtigeBahn && this.tief < 20,
        text: !this.note ? 'Keine Landung.' : `${'★'.repeat(this.note.sterne)}${'☆'.repeat(5 - this.note.sterne)} ${this.note.text}`
          + (amZiel && !richtigeBahn ? ` Aber auf der falschen Bahn: In Betrieb war die ${Z.bahnen[this.endeZiel]} (gegen den Wind).` : '') + (this.tief >= 20 ? ' Unterwegs warst du lange zu tief.' : '')
      }
    ];
    const sterne = f.bruch ? 0 : zeilen.filter(z => z.ok).length;
    return { sterne, zeilen, amZiel, bruch: f.bruch, min, liter, rest, strecke: R.weit, von: this.start.name, nach: Z.name, ueber: wp.map(p => p.name), landung: this.note ? this.note.sterne : 0, datum: Date.now(), dauer: this.t, flugZeit: this.flugZeit };
  }
}
export { KN, FT, NN, bodenHoehe, kursVon };
