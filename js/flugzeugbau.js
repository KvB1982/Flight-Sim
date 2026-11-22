// Flugsimulator – das Flugzeug „Lerche 172“ aus einfachen Formen: Hochdecker mit Streben, Bugrad, Propeller.
// Die Achsen der Gruppe sind die Achsen der Physik: x = zur linken Fläche, y = oben, z = vorn.
// Ruder und Klappen bewegen sich sichtbar mit.
const THREE = window.THREE;

export function baueLerche() {
  const g = new THREE.Group();
  const weiss = new THREE.MeshLambertMaterial({ color: 0xf4f4f0 }), blau = new THREE.MeshLambertMaterial({ color: 0x1f5fae }), dunkel = new THREE.MeshLambertMaterial({ color: 0x23262b });
  const glas = new THREE.MeshLambertMaterial({ color: 0x2d4658 }), grau = new THREE.MeshLambertMaterial({ color: 0x9aa0a6 });
  const teil = (geo, mat, x, y, z, eltern = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); eltern.add(m); return m; };
  // Rumpf: Kabine, Motorhaube, Heckrohr (wird nach hinten dünner)
  teil(new THREE.BoxGeometry(1.15, 1.25, 2.5), weiss, 0, -0.05, 0.1);
  teil(new THREE.BoxGeometry(1.17, 0.5, 2.0), glas, 0, 0.32, 0.35);                       // Fenster rundum
  teil(new THREE.BoxGeometry(1.05, 0.95, 1.2), weiss, 0, -0.18, 1.5);                    // Motorhaube
  teil(new THREE.BoxGeometry(1.19, 0.16, 3.6), blau, 0, -0.2, 0.3);                      // Zierstreifen
  const heck = teil(new THREE.CylinderGeometry(0.16, 0.55, 3.9, 10), weiss, 0, 0.05, -3.05); heck.rotation.x = -Math.PI / 2;
  teil(new THREE.ConeGeometry(0.22, 0.45, 10), dunkel, 0, -0.18, 2.3).rotation.x = Math.PI / 2;   // Spinner
  // Flügel oben auf der Kabine, außen etwas schmaler, mit Streben
  teil(new THREE.BoxGeometry(11, 0.16, 1.5), weiss, 0, 0.72, 0.1);
  teil(new THREE.BoxGeometry(11.02, 0.17, 0.25), blau, 0, 0.72, 0.8);
  for (const s of [-1, 1]) {
    const strebe = teil(new THREE.CylinderGeometry(0.04, 0.04, 2.55, 6), grau, s * 1.55, 0.02, 0.2); strebe.rotation.z = s * 1.05;
  }
  // Klappen (innen) und Querruder (außen): hängen an der Hinterkante und drehen sich um sie
  const anHinterkante = (breit, x, mat) => { const gel = new THREE.Group(); gel.position.set(x, 0.72, -0.65); g.add(gel); teil(new THREE.BoxGeometry(breit, 0.08, 0.42), mat, 0, 0, -0.2, gel); return gel; };
  const klappen = [anHinterkante(2.5, 1.9, grau), anHinterkante(2.5, -1.9, grau)];
  const querL = anHinterkante(2.2, 4.3, weiss), querR = anHinterkante(2.2, -4.3, weiss);
  // Leitwerk: Höhenflosse mit Ruder, Seitenflosse mit Ruder
  teil(new THREE.BoxGeometry(3.4, 0.08, 0.7), weiss, 0, 0.12, -4.55);
  const hoehe = new THREE.Group(); hoehe.position.set(0, 0.12, -4.9); g.add(hoehe); teil(new THREE.BoxGeometry(3.4, 0.07, 0.5), blau, 0, 0, -0.25, hoehe);
  const flosse = teil(new THREE.BoxGeometry(0.08, 1.5, 0.9), weiss, 0, 0.9, -4.5); flosse.rotation.x = 0.35;
  const seite = new THREE.Group(); seite.position.set(0, 0.85, -5.0); g.add(seite); teil(new THREE.BoxGeometry(0.07, 1.4, 0.5), blau, 0, 0, -0.25, seite);
  // Fahrwerk: Bugrad und zwei Haupträder an Federbeinen
  const rad = new THREE.CylinderGeometry(0.2, 0.2, 0.14, 12); rad.rotateZ(Math.PI / 2);
  const raeder = [[0, 1.45], [1.3, -0.35], [-1.3, -0.35]].map(([x, z]) => teil(rad, dunkel, x, -0.9, z));
  teil(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), grau, 0, -0.55, 1.45);
  for (const s of [-1, 1]) { const bein = teil(new THREE.BoxGeometry(0.1, 0.07, 1.45), grau, s * 0.72, -0.72, -0.35); bein.rotation.y = Math.PI / 2; bein.rotation.z = -s * 0.32; }
  // Propeller: zwei Blätter und eine fast durchsichtige Scheibe, wenn er schnell dreht
  const prop = new THREE.Group(); prop.position.set(0, -0.18, 2.2); g.add(prop);
  const blatt = teil(new THREE.BoxGeometry(1.9, 0.14, 0.03), dunkel, 0, 0, 0, prop);
  const scheibe = teil(new THREE.CircleGeometry(0.95, 20), new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }), 0, 0, 0.01, prop);
  let dreh = 0;
  return {
    gruppe: g,
    // jedes Bild: Lage aus der Physik übernehmen, Ruder, Klappen und Propeller bewegen
    stelle(f, dt) {
      g.position.set(f.p[0], f.p[1], f.p[2]); g.quaternion.set(f.q[0], f.q[1], f.q[2], f.q[3]);
      const R = f.T.ruderMax;
      // Ruder nach oben = Hinterkante hoch. Am Gelenk (x-Achse) hebt eine positive Drehung die Hinterkante (−z).
      hoehe.rotation.x = f.ruder.hoehe * R.hoehe + f.trimm * 0.1;
      querR.rotation.x = f.ruder.quer * R.quer; querL.rotation.x = -f.ruder.quer * R.quer;       // nach rechts rollen: rechtes Querruder hoch
      seite.rotation.y = f.ruder.seite * R.seite;
      for (const k of klappen) k.rotation.x = -f.klappen * 30 * Math.PI / 180;
      raeder.forEach((r, i) => { r.position.y = -0.9 + Math.min(0.2, f.rad[i]); });
      dreh += f.drehzahl / 60 * 2 * Math.PI * dt; prop.rotation.z = dreh % (2 * Math.PI);
      blatt.visible = f.drehzahl < 500; scheibe.visible = f.drehzahl >= 300;
    }
  };
}
