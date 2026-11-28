// Flugsimulator – Geräusche, im Gerät selbst erzeugt: Motor, Fahrtwind, Abrisswarnung, Aufsetzen.
// Dazu die Stimmen: Aufnahmen aus dem Ordner sprache/ (Fluglehrerin Jule, Flugleiter am Funk, Höhen-Ansage).
// Gibt es zu einem Satz keine Aufnahme, liest ihn wie früher die Stimme des Geräts vor.
import { SPRACHE } from '../sprache/liste.js';
import { teileVon, dateiVon } from './sprache.js';

// Zahlen zum Einstellen
const STIMME_LAUT = { jule: 1.0, info: 1.5, ansage: 0.9 };   // Lautstärke je Stimme (der Funk verliert im Filter Kraft, deshalb mehr)
const LUECKE = 0.07;              // Pause in Sekunden zwischen zwei Stücken eines Funkspruchs
const FUNK_TIEF = 420, FUNK_HOCH = 2700;   // Funkgerät: alles unter und über diesen Tonhöhen (Hertz) wird abgeschnitten
const FUNK_KRATZEN = 2.2;         // wie stark die Stimme im Funk verzerrt (1 = gar nicht)
const FUNK_RAUSCHEN = 0.03;       // Rauschen, solange der Flugleiter spricht
const FUNK_KLICK = 0.13;          // kurzes lautes Rauschen, wenn der Funk auf- und zugeht

export class Klang {
  constructor() { this.ctx = null; this.stumm = false; this.puffer = new Map(); this.schlange = []; this.spricht = null; this.sprechNr = 0; this.quellen = []; }
  // Muss aus einem Tipp oder Tastendruck heraus aufgerufen werden, sonst erlaubt der Browser keinen Ton.
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
    const c = this.ctx = new A(), aus = this.aus = c.createGain(); aus.gain.value = 0.5; aus.connect(c.destination);
    // Motor: zwei brummende Töne durch einen Filter
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 500;
    this.motorLaut = c.createGain(); this.motorLaut.gain.value = 0; filter.connect(this.motorLaut); this.motorLaut.connect(aus);
    this.motor = [1, 2.02].map((k, i) => { const o = c.createOscillator(); o.type = i ? 'square' : 'sawtooth'; const g = c.createGain(); g.gain.value = i ? 0.15 : 0.5; o.connect(g); g.connect(filter); o.start(); return { o, k }; });
    // Wind: Rauschen
    const n = c.sampleRate * 2, puffer = c.createBuffer(1, n, c.sampleRate), d = puffer.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.rauschPuffer = puffer;
    const rauschen = c.createBufferSource(); rauschen.buffer = puffer; rauschen.loop = true;
    const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 700; wf.Q.value = 0.6;
    this.windLaut = c.createGain(); this.windLaut.gain.value = 0; rauschen.connect(wf); wf.connect(this.windLaut); this.windLaut.connect(aus); rauschen.start();
    // Abrisswarnung: hoher Dauerton
    const horn = c.createOscillator(); horn.type = 'square'; horn.frequency.value = 2400; this.hornLaut = c.createGain(); this.hornLaut.gain.value = 0; horn.connect(this.hornLaut); this.hornLaut.connect(aus); horn.start();
  }
  schritt(f, pause) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, an = !this.stumm && !pause && !f.bruch;
    for (const m of this.motor) m.o.frequency.setTargetAtTime(Math.max(12, f.drehzahl / 60 * 2 * m.k), t, 0.05);    // Zweiblatt-Propeller: zwei „Schläge“ pro Umdrehung
    this.motorLaut.gain.setTargetAtTime(an && f.drehzahl > 100 ? 0.12 + 0.3 * f.gas : 0, t, 0.08);
    this.windLaut.gain.setTargetAtTime(an ? Math.min(0.5, Math.pow(f.tas / 70, 2) * 0.35) : 0, t, 0.1);
    // Die Warnung kommt schon kurz vor dem Abriss, wie in echt
    const nah = !f.amBoden && f.ias > 8 && f.alpha > (f.T.caMax + f.T.caMaxKlappe * f.klappen - f.T.ca0 - f.T.caKlappe * f.klappen) / f.T.caAnstieg - 0.045;
    this.hornLaut.gain.setTargetAtTime(an && nah ? 0.06 : 0, t, 0.02);
  }
  // zwei kurze Töne: Der Autopilot hat sich abgeschaltet oder warnt – jetzt fliegt der Mensch
  piep() {
    if (!this.ctx || this.stumm) return;
    const c = this.ctx, t = c.currentTime;
    for (const [ab, hz] of [[0, 880], [0.16, 660]]) { const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, t + ab); g.gain.linearRampToValueAtTime(0.08, t + ab + 0.01); g.gain.linearRampToValueAtTime(0.0001, t + ab + 0.13); o.connect(g); g.connect(this.aus); o.start(t + ab); o.stop(t + ab + 0.15); }
  }
  // kurzer dumpfer Schlag beim Aufsetzen, lauter bei harter Landung
  rumms(stark) {
    if (!this.ctx || this.stumm) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(110, c.currentTime); o.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.25);
    g.gain.setValueAtTime(Math.min(0.9, 0.2 + stark * 0.25), c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3); o.connect(g); g.connect(this.aus); o.start(); o.stop(c.currentTime + 0.32);
  }
  // ---------------------------------------------------------------- Stimmen
  // Das Funkgerät: Die Stimme des Flugleiters klingt dünn und kratzig, dazu rauscht es leise, solange er spricht.
  funkBauen() {
    const c = this.ctx, ein = c.createGain(), hp = c.createBiquadFilter(), tp = c.createBiquadFilter(), nase = c.createBiquadFilter(), kratz = c.createWaveShaper(), aus = c.createGain();
    hp.type = 'highpass'; hp.frequency.value = FUNK_TIEF; hp.Q.value = 0.9; tp.type = 'lowpass'; tp.frequency.value = FUNK_HOCH; tp.Q.value = 0.9;
    nase.type = 'peaking'; nase.frequency.value = 1500; nase.Q.value = 1; nase.gain.value = 6;
    const kurve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; kurve[i] = Math.tanh(FUNK_KRATZEN * x) / Math.tanh(FUNK_KRATZEN); }
    kratz.curve = kurve; aus.gain.value = 0.8;
    ein.connect(hp); hp.connect(nase); nase.connect(kratz); kratz.connect(tp); tp.connect(aus); aus.connect(c.destination);
    const r = c.createBufferSource(), rf = c.createBiquadFilter(), rl = c.createGain(); r.buffer = this.rauschPuffer; r.loop = true;
    rf.type = 'bandpass'; rf.frequency.value = 1800; rf.Q.value = 0.5; rl.gain.value = 0; r.connect(rf); rf.connect(rl); rl.connect(aus); r.start();
    this.funk = { ein, rauschen: rl };
  }
  // Wohin eine Stimme spielt: der Flugleiter durch das Funkgerät, alle anderen direkt
  stimmeZiel(wer) {
    const c = this.ctx;
    if (wer === 'info') { if (!this.funk) this.funkBauen(); return this.funk.ein; }
    if (!this.direkt) { this.direkt = c.createGain(); this.direkt.connect(c.destination); }
    return this.direkt;
  }
  // Eine Aufnahme holen und auspacken. Jede wird nur einmal geladen. Klappt es nicht, kommt null zurück.
  lade(name) {
    if (!this.puffer.has(name)) {
      const c = this.ctx;
      this.puffer.set(name, fetch(dateiVon(name)).then(a => a.ok ? a.arrayBuffer() : Promise.reject(new Error('fehlt')))
        .then(d => new Promise((ja, nein) => c.decodeAudioData(d, ja, nein))).catch(() => null));
    }
    return this.puffer.get(name);
  }
  // Schon vorher laden, was gleich gebraucht wird (z. B. 'jule/rollen_' oder 'info/'), damit die Stimme nicht hinterherhinkt
  ladeVor(anfang) { if (this.ctx && !this.stumm) for (const n in SPRACHE) if (n.startsWith(anfang)) this.lade(n); }
  // Spielt Aufnahmen hintereinander ab und ruft `fertig`, wenn die letzte zu Ende ist
  spiele(wer, puffer, fertig) {
    const c = this.ctx, ziel = this.stimmeZiel(wer), laut = STIMME_LAUT[wer] || 1, funk = wer === 'info';
    let t = c.currentTime + 0.03 + (funk ? 0.08 : 0);
    const t0 = t;
    puffer.forEach((p, i) => {
      const q = c.createBufferSource(), g = c.createGain(); q.buffer = p; g.gain.value = laut; q.connect(g); g.connect(ziel); q.start(t); t += p.duration + LUECKE;
      this.quellen.push(q); q.onended = () => { this.quellen = this.quellen.filter(x => x !== q); if (i === puffer.length - 1 && fertig) fertig(); };
    });
    if (funk) {         // Funk geht auf (Klick), rauscht leise, geht zu (Klick)
      const r = this.funk.rauschen.gain, ende = t - LUECKE;
      r.cancelScheduledValues(c.currentTime); r.setValueAtTime(FUNK_KLICK, t0 - 0.08); r.linearRampToValueAtTime(FUNK_RAUSCHEN, t0 - 0.02);
      r.setValueAtTime(FUNK_RAUSCHEN, ende); r.linearRampToValueAtTime(FUNK_KLICK, ende + 0.03); r.linearRampToValueAtTime(0, ende + 0.14);
    }
  }
  // Die Stimme des Geräts liest vor (Ersatz, wenn es keine Aufnahme gibt)
  geraet(text, fertig) {
    let einmal = fertig; const ende = () => { const e = einmal; einmal = null; if (e) e(); };
    try {
      if (!window.speechSynthesis) return ende();
      const u = new SpeechSynthesisUtterance(text); u.lang = 'de-DE'; u.rate = 1.15; u.onend = u.onerror = ende; speechSynthesis.speak(u);
      setTimeout(ende, 2500 + text.length * 110);      // manche Geräte melden das Ende nie
    } catch (e) { ende(); }
  }
  // Etwas sagen. wer = 'jule', 'info' oder 'ansage' (ohne: immer die Stimme des Geräts); ersatz = so soll es das Gerät lesen, wenn keine Aufnahme da ist.
  // Sätze kommen in eine Warteschlange und werden nacheinander gesprochen; nur die kurze Höhen-Ansage kommt sofort.
  sprich(text, wer, ersatz) {
    if (this.stumm) return;
    const a = { wer, text: ersatz || text, namen: this.ctx && wer ? teileVon(wer, text) : null };
    if (wer === 'ansage') {
      if (!a.namen) return this.geraet(a.text);
      Promise.all(a.namen.map(n => this.lade(n))).then(p => p.includes(null) ? this.geraet(a.text) : this.spiele(wer, p));
      return;
    }
    this.schlange.push(a); this.weiter();
  }
  weiter() {
    if (this.spricht || !this.schlange.length) return;
    const a = this.spricht = this.schlange.shift(), nr = ++this.sprechNr;
    const fertig = () => { if (nr === this.sprechNr) { this.spricht = null; this.weiter(); } };
    if (!a.namen) return this.geraet(a.text, fertig);
    Promise.all(a.namen.map(n => this.lade(n))).then(p => { if (nr !== this.sprechNr) return; if (p.includes(null)) this.geraet(a.text, fertig); else this.spiele(a.wer, p, fertig); });
  }
  // Sofort still: was gerade gesprochen wird und was noch wartet
  still() {
    this.sprechNr++; this.schlange = []; this.spricht = null;
    for (const q of this.quellen.splice(0)) { q.onended = null; try { q.stop(); } catch (e) { /* lief noch nicht */ } }
    if (this.funk) { const r = this.funk.rauschen.gain; r.cancelScheduledValues(this.ctx.currentTime); r.setValueAtTime(0, this.ctx.currentTime); }
    try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) { /* egal */ }
  }
}
