// Flugsimulator – Geräusche, im Gerät selbst erzeugt (noch keine Aufnahmen): Motor, Fahrtwind, Abrisswarnung, Aufsetzen.
export class Klang {
  constructor() { this.ctx = null; this.stumm = false; }
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
  // kurzer dumpfer Schlag beim Aufsetzen, lauter bei harter Landung
  rumms(stark) {
    if (!this.ctx || this.stumm) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(110, c.currentTime); o.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.25);
    g.gain.setValueAtTime(Math.min(0.9, 0.2 + stark * 0.25), c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3); o.connect(g); g.connect(this.aus); o.start(); o.stop(c.currentTime + 0.32);
  }
  sprich(text) { try { if (this.stumm || !window.speechSynthesis) return; const u = new SpeechSynthesisUtterance(text); u.lang = 'de-DE'; u.rate = 1.15; speechSynthesis.speak(u); } catch (e) { /* ohne Stimme geht es auch */ } }
}
