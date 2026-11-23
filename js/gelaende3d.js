// Flugsimulator – das Alpenvorland in 3D: Gelände, Seen, Flüsse, Autobahnen, Städte.
// Das Gelände ist viel zu groß, um es überall fein zu zeichnen. Deshalb wandert es mit dem Flugzeug mit:
// Acht Tücher liegen ineinander. Das innerste ist fein (ein Punkt alle 40 m) und klein, jedes weitere ist doppelt so grob
// und doppelt so groß. So sieht man nah jeden Hügel und fern noch die Alpen, mit immer gleich vielen Dreiecken.
import { bodenHoehe, bodenArt, seeBei, flussNah, SEEN, FLUESSE, STRASSEN, ORTE, NN } from './region.js';

const THREE = window.THREE;
const M = 64, N = M + 1;                       // ein Tuch hat 64 × 64 Kästchen
const FEIN = 40, STUFEN = 8;                   // feinstes Tuch: 40 m, gröbstes: 5 km je Kästchen
const bruch = v => v - Math.floor(v);
const wirr = (a, b) => bruch(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);       // fester „Zufall“ für einen Ort

// Farben je Bodenart. Felder bekommen je Acker eine andere Farbe.
const FELD = [0x6f9a45, 0x86a84f, 0xb5b062, 0x5e8a3b, 0x9aa455, 0x7c9c58, 0xc2b56a].map(c => new THREE.Color(c));
const FARBE = { see: 0x34689c, fluss: 0x4a80b4, ort: 0x8d8377, wald: 0x2f5a2c, alm: 0x748f52, fels: 0x77746d, schnee: 0xe9edf2 };
for (const k in FARBE) FARBE[k] = new THREE.Color(FARBE[k]);
export function bodenFarbe(x, z, h, c) {
  const art = bodenArt(x, z, h);
  if (art === 'feld') c.copy(FELD[Math.floor(wirr(Math.floor(x / 700), Math.floor(z / 520)) * FELD.length)]); else c.copy(FARBE[art]);
  // ein Fluss ist schmal: Nah dran färbt er das Ufer nur ein wenig
  if (art !== 'see' && art !== 'fluss') { const fl = flussNah(x, z); if (fl < 120) c.lerp(FARBE.fluss, 0.5 * (1 - fl / 120)); }
  const hell = (art === 'feld' ? 0.8 : 1) * (0.92 + 0.16 * wirr(x * 0.37, z * 0.53));
  c.r *= hell; c.g *= hell; c.b *= hell;
  return c;
}

class Tuch {
  constructor(nr, szene, mat) {
    this.nr = nr; this.s = FEIN * 2 ** nr; this.cx = NaN; this.cz = NaN; this.loch = '';
    const g = this.geo = new THREE.BufferGeometry();
    this.ort = new Float32Array(N * N * 3); this.farbe = new Float32Array(N * N * 3); this.norm = new Float32Array(N * N * 3); this.h = new Float32Array(N * N);
    g.setAttribute('position', new THREE.BufferAttribute(this.ort, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.farbe, 3)); g.setAttribute('normal', new THREE.BufferAttribute(this.norm, 3));
    // Das feinste Tuch ist ganz, alle anderen haben in der Mitte ein Loch (dort liegt das feinere Tuch)
    this.index = new Uint16Array((M * M - (nr ? (M / 2) * (M / 2) : 0)) * 6); g.setIndex(new THREE.BufferAttribute(this.index, 1));
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; szene.add(this.mesh);
  }
  // Mitte des Tuchs für diesen Ort: springt in ganzen Kästchen des nächstgröberen Tuchs, damit die Ränder genau aufeinander passen
  mitte(v) { return Math.round(v / (2 * this.s)) * 2 * this.s; }
  // neu ausrechnen (nur wenn sich die Mitte verschoben hat). fein = das nächstfeinere Tuch (für das Loch)
  stelle(x, z, fein, grob) {
    const cx = this.mitte(x), cz = this.mitte(z), s = this.s, c = new THREE.Color();
    let neu = false;
    if (cx !== this.cx || cz !== this.cz) {
      this.cx = cx; this.cz = cz; neu = true;
      const { ort, farbe, norm, h } = this;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) h[j * N + i] = bodenHoehe(cx + (i - M / 2) * s, cz + (j - M / 2) * s);
      // Am Rand hat das gröbere Tuch nur jeden zweiten Punkt. Damit kein Spalt klafft, liegen die Zwischenpunkte genau auf seiner Kante.
      if (grob) for (let k = 1; k < M; k += 2) {
        h[k] = (h[k - 1] + h[k + 1]) / 2; h[M * N + k] = (h[M * N + k - 1] + h[M * N + k + 1]) / 2;
        h[k * N] = (h[(k - 1) * N] + h[(k + 1) * N]) / 2; h[k * N + M] = (h[(k - 1) * N + M] + h[(k + 1) * N + M]) / 2;
      }
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = j * N + i, k3 = k * 3, wx = cx + (i - M / 2) * s, wz = cz + (j - M / 2) * s;
        ort[k3] = wx; ort[k3 + 1] = h[k] - 0.15; ort[k3 + 2] = wz;
        // Neigung aus den Nachbarn: daraus weiß das Licht, welche Hänge zur Sonne schauen
        const hx = (h[j * N + Math.min(M, i + 1)] - h[j * N + Math.max(0, i - 1)]) / ((Math.min(M, i + 1) - Math.max(0, i - 1)) * s);
        const hz = (h[Math.min(M, j + 1) * N + i] - h[Math.max(0, j - 1) * N + i]) / ((Math.min(M, j + 1) - Math.max(0, j - 1)) * s);
        const l = 1 / Math.hypot(hx, 1, hz); norm[k3] = -hx * l; norm[k3 + 1] = l; norm[k3 + 2] = -hz * l;
        bodenFarbe(wx, wz, h[k], c); farbe[k3] = c.r; farbe[k3 + 1] = c.g; farbe[k3 + 2] = c.b;
      }
      const g = this.geo; g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.normal.needsUpdate = true;
    }
    // das Loch: Wo liegt das feinere Tuch in meinen Kästchen?
    const li = fein ? M / 4 + (fein.cx - cx) / s : -1, lj = fein ? M / 4 + (fein.cz - cz) / s : -1, loch = li + ':' + lj;
    if (loch !== this.loch) {
      this.loch = loch; let n = 0; const ix = this.index;
      for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
        if (fein && i >= li && i < li + M / 2 && j >= lj && j < lj + M / 2) continue;
        const a = j * N + i, b = a + 1, d = a + N, e = d + 1;
        ix[n++] = a; ix[n++] = d; ix[n++] = b; ix[n++] = b; ix[n++] = d; ix[n++] = e;
      }
      this.geo.index.needsUpdate = true; this.geo.setDrawRange(0, n);
    }
    return neu;
  }
}

export class Gelaende {
  constructor(szene) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.tuecher = []; for (let i = 0; i < STUFEN; i++) this.tuecher.push(new Tuch(i, szene, mat));
    this.dreiecke = this.tuecher.reduce((s, t) => s + t.index.length / 3, 0);
  }
  // jedes Bild: Tücher um diesen Ort legen. Vom feinen zum groben, damit jedes Loch zum feineren Tuch passt.
  schritt(x, z) {
    const T = this.tuecher;
    for (let i = 0; i < T.length; i++) T[i].stelle(x, z, i ? T[i - 1] : null, i < T.length - 1);
  }
}

// ---------------------------------------------------------------- Seen: flache blaue Scheiben in Form eines Ovals
export function baueSeen(szene) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x34689c }), gr = new THREE.Group();
  for (const S of SEEN) {
    const g = new THREE.CircleGeometry(1, 56); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat); m.scale.set(S.b * 1.03, 1, S.a * 1.03); m.rotation.y = S.dreh; m.position.set(S.x, S.y, S.z); gr.add(m);
  }
  szene.add(gr); return gr;
}

// ---------------------------------------------------------------- Flüsse und Autobahnen: Bänder, die sich über das Gelände legen
export function baueBaender(szene) {
  const ort = [], idx = [], farbe = [], c = new THREE.Color();
  const band = (L, col, hoch, schritt) => {
    c.set(col);
    for (let k = 1; k < L.p.length; k++) {
      const a = L.p[k - 1], b = L.p[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(l / schritt)), qx = (b[1] - a[1]) / l * L.breit / 2, qz = -(b[0] - a[0]) / l * L.breit / 2;
      for (let i = 0; i <= n; i++) {
        const x = a[0] + (b[0] - a[0]) * i / n, z = a[1] + (b[1] - a[1]) * i / n;
        if (seeBei(x, z)) { if (i < n) continue; }                              // im See braucht es kein Band
        const y = Math.max(bodenHoehe(x, z), bodenHoehe(x + qx, z + qz), bodenHoehe(x - qx, z - qz)) + hoch, v = ort.length / 3;
        ort.push(x + qx, y, z + qz, x - qx, y, z - qz); farbe.push(c.r, c.g, c.b, c.r, c.g, c.b);
        if (i < n && !seeBei(a[0] + (b[0] - a[0]) * (i + 1) / n, a[1] + (b[1] - a[1]) * (i + 1) / n)) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
  };
  for (const f of FLUESSE) band(f, 0x4f86b8, 1.2, 160);
  for (const s of STRASSEN) band(s, 0x62666b, 2.0, 200);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(ort, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(farbe, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.frustumCulled = false; szene.add(m); return m;
}

// ---------------------------------------------------------------- Städte und Dörfer: viele kleine Kisten, dazu ein Kirchturm je Ort
export function baueOrte(szene) {
  let saat = 99; const z = () => { saat = (saat * 1664525 + 1013904223) >>> 0; return saat / 4294967296; };
  const anzahl = [0, 70, 380, 1500], gesamt = ORTE.reduce((s, o) => s + anzahl[o.gross] + 1, 0) + 3;
  const haus = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), gesamt), Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), c = new THREE.Color();
  const WAND = [0xcfc5b4, 0xbfb29c, 0xd6cfc2, 0xb0a898, 0xa5483a, 0x96402c];
  let n = 0;
  const kiste = (x, zz, w, h, l, farbe, dreh = 0) => { Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), dreh); Mx.compose(new THREE.Vector3(x, bodenHoehe(x, zz) + h / 2 - 0.5, zz), Q, new THREE.Vector3(w, h, l)); haus.setMatrixAt(n, Mx); c.set(farbe); haus.setColorAt(n, c); n++; };
  for (const o of ORTE) {
    kiste(o.x, o.z, 9, 38 + o.gross * 10, 9, 0xd9d2c4);                                           // Kirchturm
    for (let i = 0; i < anzahl[o.gross]; i++) {
      const r = o.r * 0.8 * Math.sqrt(z()), w = z() * Math.PI * 2, x = o.x + Math.cos(w) * r, zz = o.z + Math.sin(w) * r, mitte = 1 - r / o.r;
      if (seeBei(x, zz) || flussNah(x, zz) < 30) { kiste(o.x, o.z, 1, 1, 1, 0xd9d2c4); continue; }
      const gr = o.gross >= 2 ? 22 + z() * 30 : 12 + z() * 12;
      kiste(x, zz, gr, (o.gross >= 2 ? 10 + z() * 12 * (0.4 + mitte) : 6 + z() * 5) + (o.gross === 3 && mitte > 0.75 ? z() * 30 : 0), gr * (0.6 + z() * 0.8), WAND[Math.floor(z() * WAND.length)], z() * 3);
    }
  }
  // München: zwei Türme mit Hauben (Frauenkirche) und der Fernsehturm im Norden – daran erkennt man die Stadt von weitem
  const mu = ORTE[0]; kiste(mu.x + 60, mu.z, 14, 98, 14, 0xa5563c); kiste(mu.x + 85, mu.z, 14, 98, 14, 0xa5563c); kiste(mu.x + 2600, mu.z + 4000, 9, 290, 9, 0xc9cdd2);
  haus.count = n; szene.add(haus); return haus;
}
export { NN };
