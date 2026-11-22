// Flugsimulator – die Welt in 3D: Himmel, Gelände, Flugplatz mit Bahn, PAPI-Lichter, Windsack, Bäume, Häuser.
// Alles aus einfachen Formen und selbst gemalten Bildern. three.js kommt als normales Skript (window.THREE).
import { PLATZ, bodenHoehe, PAPI_WINKEL, anflug, platzrunde } from './platz.js';

const THREE = window.THREE;
const zufall = saat => () => { saat = (saat * 1664525 + 1013904223) >>> 0; return saat / 4294967296; };

// ---------------------------------------------------------------- gemalte Bilder
function bild(w, h, male) { const c = document.createElement('canvas'); c.width = w; c.height = h; male(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t; }
function sprenkel(g, w, h, farben, n, r) { const z = zufall(7); for (let i = 0; i < n; i++) { g.fillStyle = farben[Math.floor(z() * farben.length)]; g.globalAlpha = 0.25 + z() * 0.4; g.fillRect(z() * w, z() * h, 1 + z() * r, 1 + z() * r); } g.globalAlpha = 1; }

// Die Bahn als ein langes Bild: Asphalt, Mittellinie, Schwellen-Streifen, Zahlen 36 und 18, Zielpunkt-Balken
function bahnBild() {
  const P = 8, W = Math.round(PLATZ.breit * P), H = 4096, m = H / PLATZ.lang;      // quer 8 Punkte pro Meter, längs gut 4
  return bild(W, H, (g) => {
    g.fillStyle = '#3b3d40'; g.fillRect(0, 0, W, H);
    sprenkel(g, W, H, ['#2f3133', '#46494c', '#505356'], 9000, 5);
    g.fillStyle = '#e9e9e4';
    g.fillRect(2, 0, 3, H); g.fillRect(W - 5, 0, 3, H);                             // Randlinien
    for (let z = 90; z < PLATZ.lang - 90; z += 50) g.fillRect(W / 2 - 2, H - (z + 30) * m, 4, 30 * m);     // Mittellinie
    for (const ende of [0, 1]) {
      g.save();
      if (ende) { g.translate(W, 0); g.scale(-1, 1); } else { g.translate(0, H); g.scale(1, -1); }   // jedes Ende von seiner Seite aus malen
      for (let i = 0; i < 8; i++) g.fillRect(14 + i * (W - 28) / 8 + 3, 6 * m, (W - 28) / 8 - 8, 30 * m);  // Schwellen-Streifen („Zebra“)
      g.fillRect(W * 0.2, PLATZ.zielpunkt * m, W * 0.16, 45 * m); g.fillRect(W * 0.64, PLATZ.zielpunkt * m, W * 0.16, 45 * m);   // Zielpunkt
      g.restore();
    }
    // Zahlen: Wer nach Norden landet, liest „36“, wer nach Süden landet, „18“
    g.font = `bold ${Math.round(W * 0.42)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const zahl = (text, y, kopf) => { g.save(); g.translate(W / 2, y); if (kopf) g.rotate(Math.PI); g.scale(1, m * 30 / (W * 0.42)); g.fillText(text, 0, 0); g.restore(); };
    zahl('36', H - 62 * m, false); zahl('18', 62 * m, true);
  });
}

function grasBild() { return bild(256, 256, (g, w, h) => { g.fillStyle = '#5d8a3c'; g.fillRect(0, 0, w, h); sprenkel(g, w, h, ['#4f7a33', '#6b9944', '#587f38', '#74a04c'], 5000, 4); }); }

export class Welt {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.szene = new THREE.Scene();
    this.kamera = new THREE.PerspectiveCamera(62, 1, 0.3, 30000);
    this.szene.fog = new THREE.Fog(0xbcd3e6, 2500, 24000);
    this.baueHimmel(); this.baueLicht(); this.baueGelaende(); this.bauePlatz(); this.baueBaeume(); this.baueSchatten(); this.baueWeg();
    this.groesse();
    window.addEventListener('resize', () => this.groesse());
  }
  groesse() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false); this.kamera.aspect = w / h; this.kamera.updateProjectionMatrix();
  }
  baueHimmel() {
    // große Kugel von innen, oben blau, am Horizont hell
    const geo = new THREE.SphereGeometry(26000, 24, 12), farbe = [], a = new THREE.Color(0x3f7fd0), b = new THREE.Color(0xbcd3e6), c = new THREE.Color();
    for (let i = 0; i < geo.attributes.position.count; i++) { const y = geo.attributes.position.getY(i) / 26000; c.copy(b).lerp(a, Math.pow(Math.max(0, y), 0.55)); farbe.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(farbe, 3));
    this.himmel = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.szene.add(this.himmel);
    // ein paar Wolken als flache helle Scheiben weit oben
    const z = zufall(31), mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, fog: false, depthWrite: false });
    const wolken = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), mat, 90), M = new THREE.Matrix4(), Q = new THREE.Quaternion();
    for (let i = 0; i < 90; i++) { const w = 250 + z() * 500; M.compose(new THREE.Vector3((z() - 0.5) * 30000, 1500 + z() * 900, (z() - 0.5) * 30000), Q, new THREE.Vector3(w, 60 + z() * 60, w * (0.6 + z() * 0.5))); wolken.setMatrixAt(i, M); }
    this.szene.add(wolken);
  }
  baueLicht() {
    this.szene.add(new THREE.HemisphereLight(0xdfeeff, 0x5a6b45, 0.95));
    const s = new THREE.DirectionalLight(0xfff3dc, 1.0); s.position.set(-0.5, 0.8, -0.4); this.szene.add(s);
  }
  baueGelaende() {
    // ein großes Tuch aus Dreiecken, in die Höhe gezogen; Farben nach Feldern und Höhe
    const R = 22000, N = 220, geo = new THREE.PlaneGeometry(2 * R, 2 * R, N, N); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, farbe = [], c = new THREE.Color(), z = zufall(5);
    const FELD = [0x6f9a45, 0x86a84f, 0xb5b062, 0x5e8a3b, 0x9aa455, 0x7c9c58, 0xc2b56a];
    const feldFarbe = {};
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), zz = pos.getZ(i) + PLATZ.lang / 2, h = bodenHoehe(x, zz);
      pos.setZ(i, zz); pos.setY(i, h - 0.15);
      const kx = Math.floor(x / 800), kz = Math.floor(zz / 600), key = kx + ':' + kz;
      if (feldFarbe[key] === undefined) feldFarbe[key] = FELD[Math.floor(z() * FELD.length)];
      c.set(h > 90 ? 0x3f6b35 : feldFarbe[key]);                               // Hügel sind bewaldet
      const hell = 0.9 + 0.2 * z(); farbe.push(c.r * hell, c.g * hell, c.b * hell);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(farbe, 3)); geo.computeVertexNormals();
    this.szene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
    // Gras rund um den Platz mit feinem Muster, damit man dicht über dem Boden das Tempo sieht
    const gras = grasBild(); gras.wrapS = gras.wrapT = THREE.RepeatWrapping; gras.repeat.set(500, 500);
    const nah = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshLambertMaterial({ map: gras }));
    nah.rotation.x = -Math.PI / 2; nah.position.set(0, 0, PLATZ.lang / 2); this.szene.add(nah);
    // ein Fluss und eine Straße als Landmarken
    const band = (punkte, breit, farbe, y) => {
      const kurve = new THREE.CatmullRomCurve3(punkte.map(p => new THREE.Vector3(p[0], 0, p[1]))), n = 120, v = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const p = kurve.getPoint(i / n), t = kurve.getTangent(i / n), qx = t.z, qz = -t.x, l = Math.hypot(qx, qz) || 1;
        for (const s of [-1, 1]) { const x = p.x + s * qx / l * breit / 2, zz = p.z + s * qz / l * breit / 2; v.push(x, bodenHoehe(x, zz) + y, zz); }
        if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex(idx); g.computeVertexNormals();
      this.szene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: farbe, side: THREE.DoubleSide })));
    };
    band([[2600, -9000], [1900, -5000], [1500, -2200], [900, -400], [1300, 1600], [800, 4200], [1500, 9000]], 60, 0x4f86b8, 0.25);
    band([[-9000, -1400], [-4000, -1250], [-900, -1300], [-300, -900], [-260, 300], [-900, 1900], [-3000, 2600], [-9000, 3100]], 9, 0x55585c, 0.3);
  }
  bauePlatz() {
    const S = this.szene, L = PLATZ.lang, B = PLATZ.breit;
    const flach = (w, l, x, z, farbe, y = 0.03, map) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshLambertMaterial({ color: farbe, map: map || null })); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); S.add(m); return m; };
    // Bild oben = Nordende. Eine liegende Fläche zeigt ihr „oben“ nach −z, deshalb um die Hochachse drehen.
    const bahn = flach(B, L, 0, L / 2, 0xffffff, 0.05, bahnBild()); bahn.rotation.z = Math.PI;
    // Rollweg, Vorfeld, gelbe Rolllinie
    const V = PLATZ.vorfeld;
    flach(12, L - 60, -45, L / 2, 0x4a4c50, 0.035);                         // Rollweg östlich neben der Bahn (Osten = −x)
    for (const z of [30, L / 2, L - 30]) flach(40, 12, -28, z, 0x4a4c50, 0.035);   // Abzweige zur Bahn
    flach(70, 110, V.x - 10, V.z, 0x505357, 0.04);                          // Vorfeld
    flach(32, 12, -58, V.z, 0x4a4c50, 0.035); flach(40, 0.3, -65, V.z, 0xe8c63a, 0.06);   // vom Vorfeld zum Rollweg
    flach(0.3, L - 60, -45, L / 2, 0xe8c63a, 0.06);
    for (const z of [30, L / 2, L - 30]) flach(34, 0.3, -28, z, 0xe8c63a, 0.06);
    // Häuser: Halle, Vereinsheim, Turm
    const kiste = (w, h, l, x, z, farbe) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), new THREE.MeshLambertMaterial({ color: farbe })); m.position.set(x, h / 2, z); S.add(m); return m; };
    kiste(34, 9, 26, V.x - 60, V.z + 30, 0xb9bec4); kiste(34, 1.2, 26.6, V.x - 60, V.z + 30, 0x7a2f2a).position.y = 9.6;
    kiste(18, 5, 12, V.x - 55, V.z - 25, 0xd9cfb8); kiste(19, 0.8, 13, V.x - 55, V.z - 25, 0x8b3a30).position.y = 5.4;
    kiste(5, 14, 5, V.x - 30, V.z - 48, 0xcfd3d6); kiste(8, 3.2, 8, V.x - 30, V.z - 48, 0x3d5d78).position.y = 15.6;
    // Windsack: ein Mast und ein Kegel, der sich in den Wind dreht
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd })); mast.position.set(30, 3, 200); S.add(mast);
    this.sack = new THREE.Group(); this.sack.position.set(30, 6, 200); S.add(this.sack);
    const tuete = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.2, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0xff6a1f, side: THREE.DoubleSide }));
    tuete.rotation.x = -Math.PI / 2; tuete.position.z = 1.6; this.sack.add(tuete);
    // PAPI: je vier Lampen links neben der Bahn (vom Anflug aus gesehen), an beiden Enden
    this.papi = [36, 18].map(richtung => {
      const nord = richtung === 36, z = nord ? PLATZ.zielpunkt : L - PLATZ.zielpunkt, lampen = [];
      for (let i = 0; i < 4; i++) {
        const x = (nord ? 1 : -1) * (B / 2 + 8 + i * 4);                  // links vom Anflug: beim Flug nach Norden ist links +x
        const l = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })); l.position.set(x, 1.0, z); S.add(l);
        lampen.push(l);
      }
      // die äußerste Lampe gehört zum kleinsten Winkel
      return { richtung, lampen: lampen.reverse() };
    });
    // Bahnlichter am Rand, damit man die Bahn auch von weit sieht
    const licht = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }), 2 * 21 + 24), M = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i <= 20; i++) for (const s of [-1, 1]) { M.makeTranslation(s * (B / 2 + 1.5), 0.4, i * L / 20); licht.setMatrixAt(n++, M); }
    for (let i = 0; i < 12; i++) for (const zz of [-3, L + 3]) { M.makeTranslation(-B / 2 + 1 + i * (B - 2) / 11, 0.4, zz); licht.setMatrixAt(n++, M); }
    S.add(licht);
  }
  baueBaeume() {
    const z = zufall(11), N = 3500, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), c = new THREE.Color();
    const krone = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
    let n = 0;
    while (n < N) {
      // Wälder in Flecken, nicht auf der Bahn und nicht in der An- und Abflugschneise
      const x = (z() - 0.5) * 9000, zz = (z() - 0.5) * 9000 + PLATZ.lang / 2;
      const fleck = Math.sin(x * 0.0021 + 1) * Math.cos(zz * 0.0017 - 2) + Math.sin(x * 0.006 + zz * 0.004);
      if (fleck < 0.55 || (Math.abs(x) < 260 && zz > -1500 && zz < PLATZ.lang + 1500)) continue;
      const h = 9 + z() * 9;
      M.compose(new THREE.Vector3(x, bodenHoehe(x, zz) + h / 2, zz), Q, new THREE.Vector3(2.5 + z() * 2.5, h, 2.5 + z() * 2.5)); krone.setMatrixAt(n, M);
      c.setHSL(0.27 + z() * 0.06, 0.45, 0.2 + z() * 0.1); krone.setColorAt(n, c); n++;
    }
    this.szene.add(krone);
    // ein Dorf an der Straße
    const dorf = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), 60);
    for (let i = 0; i < 60; i++) {
      const x = -1100 + (z() - 0.5) * 700, zz = -1300 + (z() - 0.5) * 380, h = 5 + z() * 4;
      M.compose(new THREE.Vector3(x, h / 2, zz), Q, new THREE.Vector3(8 + z() * 6, h, 8 + z() * 6)); dorf.setMatrixAt(i, M);
      c.set([0xe6dccb, 0xd8c9b0, 0xb5503e, 0xf0e9dc][Math.floor(z() * 4)]); dorf.setColorAt(i, c);
    }
    this.szene.add(dorf);
  }
  baueSchatten() {
    // dunkler Fleck unter dem Flugzeug: Daran sieht man beim Landen, wie hoch man noch ist
    const b = bild(64, 64, (g) => { const v = g.createRadialGradient(32, 32, 2, 32, 32, 30); v.addColorStop(0, 'rgba(0,0,0,0.55)'); v.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = v; g.fillRect(0, 0, 64, 64); });
    this.schatten = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: b, transparent: true, depthWrite: false }));
    this.schatten.rotation.x = -Math.PI / 2; this.szene.add(this.schatten);
  }
  // Der perfekte Flugweg der Platzrunde als blasse Straße in der Luft. Die Straße liegt ein Stück UNTER dem Flugweg,
  // damit man sie wie eine Straße unter sich sieht (genau auf Augenhöhe wäre sie nur ein Strich). Wer über ihr bleibt
  // und durch die Tore fliegt, fliegt richtig. Nah am Boden (Start und Aufsetzen) hört sie auf.
  baueWeg() {
    const TIEFER = 28, BREIT = 46, P = platzrunde().filter(p => p.y > TIEFER + 8), gr = this.weg = new THREE.Group();
    const ort = [], uv = [], idx = [];
    P.forEach((p, i) => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = (b.z - a.z) / l, nz = -(b.x - a.x) / l;
      ort.push(p.x + nx * BREIT / 2, p.y - TIEFER, p.z + nz * BREIT / 2, p.x - nx * BREIT / 2, p.y - TIEFER, p.z - nz * BREIT / 2); uv.push(0, p.s / 150, 1, p.s / 150);
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(ort, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    // Bild der Straße: blasse Fläche, hellere Ränder, ein Pfeil in Flugrichtung
    const b = bild(64, 256, g => {
      g.clearRect(0, 0, 64, 256); g.fillStyle = 'rgba(120,225,255,0.16)'; g.fillRect(0, 0, 64, 256);
      g.fillStyle = 'rgba(190,245,255,0.75)'; g.fillRect(0, 0, 4, 256); g.fillRect(60, 0, 4, 256);
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 5; g.beginPath(); g.moveTo(16, 150); g.lineTo(32, 106); g.lineTo(48, 150); g.stroke();
    });
    b.wrapT = THREE.RepeatWrapping; b.needsUpdate = true;
    const band = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: b, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false })); band.renderOrder = 5; gr.add(band);
    // Tore genau auf dem Flugweg, alle 600 m: ein Rahmen zum Durchfliegen
    const rahmen = [], RB = 34, RH = 22; let naechstes = 0;
    P.forEach((p, i) => {
      if (p.s < naechstes || !i) return; naechstes = p.s + 600;
      const a = P[i - 1], l = Math.hypot(p.x - a.x, p.z - a.z) || 1, nx = (p.z - a.z) / l, nz = -(p.x - a.x) / l;
      const e = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [p.x + nx * u * RB, p.y + v * RH, p.z + nz * u * RB]);
      for (let k = 0; k < 4; k++) rahmen.push(...e[k], ...e[(k + 1) % 4]);
    });
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rahmen, 3));
    gr.add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.55, fog: false })));
    this.szene.add(gr);
  }
  // jedes Bild: PAPI-Farben für diesen Betrachter, Windsack, Schatten, Himmel mitnehmen
  schritt(f, luft) {
    for (const p of this.papi) {
      const w = anflug(f.p, p.richtung).winkel;
      // Aus der Ferne wären die Lampen kleiner als ein Bildpunkt. Deshalb wachsen sie mit dem Abstand und rücken auseinander
      // (mit Absicht größer als echt, damit man den Gleitweg schon weit vor der Bahn sieht).
      const l0 = p.lampen[0], gross = Math.max(1, Math.hypot(f.p[0] - l0.position.x, f.p[2] - l0.position.z) / 350), seite = Math.sign(l0.position.x);
      p.lampen.forEach((l, i) => { l.material.color.set(w > PAPI_WINKEL[i] ? 0xffffff : 0xff2a1a); l.scale.setScalar(gross); l.position.x = seite * (PLATZ.breit / 2 + 8 + i * 4 * gross); l.position.y = gross; });
    }
    const w = luft.wind([30, 6, 200], f.t), stark = Math.hypot(w[0], w[2]);
    this.sack.rotation.y = Math.atan2(w[0], w[2]); this.sack.rotation.x = Math.max(0, 1.1 - stark * 0.16);     // wenig Wind: Der Sack hängt
    const h = Math.max(0, f.hoeheGrund), g = 12 + h * 0.12;
    this.schatten.position.set(f.p[0] + h * 0.25, bodenHoehe(f.p[0], f.p[2]) + 0.09, f.p[2] + h * 0.2);
    this.schatten.scale.set(g, g, 1); this.schatten.material.opacity = Math.max(0, 1 - h / 250);
    this.himmel.position.copy(this.kamera.position);
  }
  male() { this.renderer.render(this.szene, this.kamera); }
}
