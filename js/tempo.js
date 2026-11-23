// Flugsimulator – Tempo-Wächter (abgeschaut vom Rennspiel): Dauert ein Bild im Schnitt länger als 1/48 Sekunde, malt das Spiel
// die Welt mit weniger Bildpunkten. Läuft es etwa sechs Sekunden ruhig, versucht es wieder mehr – aber nie die Stufe, die schon zu
// langsam war. Die Instrumente bleiben immer scharf. `?scharf` in der Adresse schaltet den Wächter ab.
export class TempoWaechter {
  constructor(renderer) {
    this.renderer = renderer;
    this.an = !new URLSearchParams(location.search).has('scharf');
    this.voll = Math.min(window.devicePixelRatio || 1, 2); this.jetzt = this.voll;
    this.zuLangsam = Infinity; this.schnitt = 1 / 60; this.ruhig = 0; this.warte = 2;
  }
  // sek = wie lange das letzte Bild gedauert hat; laeuft = false im Menü und in der Pause
  pruefe(sek, laeuft = true) {
    if (!this.an || sek <= 0 || !laeuft) return;
    this.schnitt += (sek - this.schnitt) * 0.05;
    if ((this.warte -= sek) > 0) return;                              // nach jedem Umschalten kurz abwarten
    if (this.schnitt > 1 / 48) {
      this.zuLangsam = this.jetzt;
      if (this.jetzt > 0.75) this.stelle(Math.max(0.75, this.jetzt - 0.25));
    } else if (this.schnitt < 1 / 56) {
      this.ruhig += sek;
      if (this.ruhig > 6 && this.jetzt + 0.25 <= this.voll && this.jetzt + 0.25 < this.zuLangsam) this.stelle(this.jetzt + 0.25);
    } else this.ruhig = 0;
  }
  stelle(neu) { this.jetzt = neu; this.renderer.setPixelRatio(neu); this.warte = 2; this.ruhig = 0; this.schnitt = 1 / 60; }
}
