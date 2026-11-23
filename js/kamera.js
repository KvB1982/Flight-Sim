// Flugsimulator – die Kameras: im Cockpit (Kopf des Piloten), hinter dem Flugzeug, vom Turm, und zu Fuß beim Außencheck.
// Aus main.js herausgelöst, damit die Hauptdatei kürzer wird.
import { GRAD } from './flugzeuge.js';
import { bodenHoehe } from './platz.js';
import { naechsterPlatz, platzWelt } from './region.js';
import { BRETT_ANTEIL } from './instrumente.js';

const THREE = window.THREE;
const V = new THREE.Vector3(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), Q3 = new THREE.Quaternion(), HOCH = new THREE.Vector3(0, 1, 0), QUER = new THREE.Vector3(1, 0, 0), UM = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
// Wohin man schaut. Im Cockpit: az = Kopf nach rechts gedreht, el = nach oben. In der Außenansicht: az = Kamera um das
// Flugzeug herum (0 = genau dahinter), el = Kamera höher, weit = Abstand. Mit dem Finger oder der Maus ziehen dreht den Blick
// und er bleibt so; die Tasten J L I K gelten im Cockpit nur, solange man sie hält (kurz zur Seite schauen).
const AUSSEN_EL = 0.27, AUSSEN_WEIT = 15;
export class Kamera {
  // welt, lerche, eingabe, E (Einstellungen) bleiben fest; das Flugzeug und der Mensch zu Fuß kommen bei jedem Bild neu mit
  constructor(welt, lerche, eingabe, E) {
    this.welt = welt; this.lerche = lerche; this.eingabe = eingabe; this.E = E;
    this.blick = { az: 0, el: 0, weit: AUSSEN_WEIT, jetztAz: 0, jetztEl: 0, brettWeg: false };
    this.alt = null;                     // wo die Kamera hinter dem Flugzeug zuletzt war (sie schwenkt weich nach)
  }
  // Blick geradeaus; mit sofort = true ohne weiches Nachdrehen
  mitte(sofort) { const b = this.blick; b.az = 0; b.el = 0; b.weit = AUSSEN_WEIT; if (sofort) { b.jetztAz = b.jetztEl = 0; this.alt = null; } }
  blickSchritt(dt) {
    const blick = this.blick, E = this.E, eingabe = this.eingabe;
    const cockpit = E.kamera === 'cockpit', li = eingabe.unten('KeyJ'), re = eingabe.unten('KeyL'), ho = eingabe.unten('KeyI'), ru = eingabe.unten('KeyK');
    let az = blick.az, el = blick.el;
    if (cockpit) {
      // Tasten: zur Seite 90°, beide zusammen oder K = nach hinten, I = nach oben
      if (li && re || ru) az = Math.PI * (blick.jetztAz < 0 ? -1 : 1); else if (li) az = -Math.PI / 2; else if (re) az = Math.PI / 2;
      if (ho) el = 0.45;
    } else {
      blick.az += ((re ? 1 : 0) - (li ? 1 : 0)) * 1.6 * dt; blick.el = Math.max(-0.2, Math.min(1.25, blick.el + ((ho ? 1 : 0) - (ru ? 1 : 0)) * 0.9 * dt));
      blick.weit = Math.max(6, Math.min(120, blick.weit * Math.exp(((eingabe.unten('Minus', 'NumpadSubtract') ? 1 : 0) - (eingabe.unten('Equal', 'BracketRight', 'NumpadAdd') ? 1 : 0)) * 1.2 * dt)));
      az = blick.az; el = blick.el;
    }
    const k = 1 - Math.exp(-9 * dt);
    blick.jetztAz += (az - blick.jetztAz) * k; blick.jetztEl += (el - blick.jetztEl) * k;
  }
  // stellt die Kamera für dieses Bild: f = Flugzeug, geher = Mensch zu Fuß (oder null)
  stelle(dt, f, geher) {
    const blick = this.blick, E = this.E, lerche = this.lerche, k = this.welt.kamera, W = window.innerWidth, H = window.innerHeight;
    this.blickSchritt(dt);
    // Zu Fuß: Die Kamera ist der Kopf des Menschen
    if (geher) {
      lerche.gruppe.visible = true; blick.brettWeg = true; k.clearViewOffset(); k.fov = 70; k.up.set(0, 1, 0);
      const y = bodenHoehe(geher.x, geher.z) + 1.6, el = Math.max(-0.7, Math.min(0.7, blick.el));
      k.position.set(geher.x, y, geher.z); k.lookAt(geher.x - Math.sin(geher.kurs) * Math.cos(el), y + Math.sin(el), geher.z + Math.cos(geher.kurs) * Math.cos(el));
      k.updateProjectionMatrix(); return;
    }
    // Wer im Cockpit zur Seite oder nach oben schaut, sieht das Instrumentenbrett nicht mehr – dafür Flügel und Streben
    blick.brettWeg = E.kamera === 'cockpit' && (Math.abs(blick.jetztAz) > 0.5 || blick.jetztEl > 0.3);
    lerche.gruppe.visible = E.kamera !== 'cockpit' || blick.brettWeg;
    if (E.kamera === 'cockpit') {
      // Der Kopf des Piloten. Das Instrumentenbrett verdeckt unten das Bild, deshalb liegt der Horizont weiter oben.
      Q.set(f.q[0], f.q[1], f.q[2], f.q[3]);
      V.set(...f.T.auge).applyQuaternion(Q); k.position.set(f.p[0] + V.x, f.p[1] + V.y, f.p[2] + V.z);
      k.quaternion.copy(Q).multiply(UM).multiply(Q2.setFromAxisAngle(HOCH, -blick.jetztAz)).multiply(Q3.setFromAxisAngle(QUER, blick.jetztEl));
      k.fov = 70;
      if (blick.brettWeg) k.clearViewOffset(); else { const mehr = 1 + BRETT_ANTEIL * 0.75; k.setViewOffset(W, H * mehr, 0, H * (mehr - 1), W, H); }
    } else {
      k.clearViewOffset();
      if (E.kamera === 'hinten') {
        // um das Flugzeug herum, der Horizont bleibt gerade; die Kamera schwenkt weich nach
        const w = f.kurs + blick.jetztAz, el = AUSSEN_EL + blick.jetztEl, d = blick.weit, vorn = Math.max(0, Math.cos(blick.jetztAz)) * 8;
        const ziel = new THREE.Vector3(f.p[0] + Math.sin(w) * d * Math.cos(el), f.p[1] + d * Math.sin(el) - Math.sin(f.nick) * 6 * Math.cos(blick.jetztAz), f.p[2] - Math.cos(w) * d * Math.cos(el));
        ziel.y = Math.max(ziel.y, bodenHoehe(ziel.x, ziel.z) + 1.2);
        if (!this.alt) this.alt = ziel.clone(); else this.alt.lerp(ziel, 1 - Math.exp(-6 * dt));
        k.position.copy(this.alt); k.up.set(0, 1, 0); k.lookAt(f.p[0] - Math.sin(f.kurs) * vorn, f.p[1] + 1, f.p[2] + Math.cos(f.kurs) * vorn); k.fov = 62;
      } else {
        // vom Turm aus: Die Kamera steht fest und schaut dem Flugzeug nach, je weiter weg, desto stärker das Fernglas
        // der Turm des Platzes, der am nächsten liegt
        const P = naechsterPlatz(f.p[0], f.p[2]).platz, [tx, tz] = platzWelt(P, P.vorfeld.x - 30, P.vorfeld.z - 48);
        k.position.set(tx, P.hoehe + 17, tz); k.up.set(0, 1, 0); k.lookAt(f.p[0], f.p[1], f.p[2]);
        k.fov = Math.max(1.2, Math.min(50, 2 * Math.atan(22 / k.position.distanceTo(new THREE.Vector3(...f.p))) / GRAD));
      }
    }
    k.updateProjectionMatrix();
  }
}
