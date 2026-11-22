// Flugsimulator – das Spiel: Menü, Schleife, Kameras, Anzeigen. Stufe 1: fliegen mit der Lerche 172. Stufe 2: die Flugschule.
import { neuesFlugzeug, setze, schritt, TAKT, KN } from './physik.js';
import { FT, GRAD } from './flugzeuge.js';
import { mitHilfe, STUFEN, STUFEN_TEXT } from './hilfen.js';
import { neueLuft, WETTER } from './atmosphaere.js';
import { PLATZ, bodenHoehe, platzrunde, anflugweg } from './platz.js';
import { LEKTIONEN, LEHRERIN, Unterricht, ladeStand, merkeStand, offen } from './schule.js';
import { maleNachflug } from './nachflug.js';
import { Flug } from './flug.js';
import { STARTS } from './starts.js';
import { Eingabe, TASTEN_HILFE } from './eingabe.js';
import { Neigung } from './neigung.js';
import { KnueppelEmpfang, handyAdresse } from './verbindung.js';
import { Welt } from './welt.js';
import { baueLerche } from './flugzeugbau.js';
import { maleBrett, maleHud, maleWind, BRETT_ANTEIL } from './instrumente.js';
import { baueTouch } from './touch.js';
import { Klang } from './klang.js';

const THREE = window.THREE;
const frage = new URLSearchParams(location.search);
const SPEICHER = 'flugsim.einstellungen.v1';
const $ = id => document.getElementById(id);

const KAMERAS = ['cockpit', 'hinten', 'turm'];

const E = Object.assign({ start: 'bahn', wetter: 'ruhig', hilfe: 'leicht', kamera: 'cockpit', ton: true, weg: true }, (() => { try { return JSON.parse(localStorage.getItem(SPEICHER)) || {}; } catch (e) { return {}; } })());
const merke = () => { try { localStorage.setItem(SPEICHER, JSON.stringify(E)); } catch (e) { /* egal */ } };

const welt = new Welt($('gl'));
const lerche = baueLerche(); welt.szene.add(lerche.gruppe);
const eingabe = new Eingabe(), neigung = eingabe.neigung = new Neigung(), klang = new Klang();
const empfang = new KnueppelEmpfang(frage.has('lokal'));
const istTouch = frage.has('touch') || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
let f = neuesFlugzeug('lerche'), luft = neueLuft(WETTER[E.wetter]), flug = new Flug();
let pause = true, imMenue = true, rest = 0, zuletzt = 0, infoZeit = 0;
// Flugschule: die Lektion, die gerade läuft (oder null im freien Flug), und die Spur des Flugs für die Nachbesprechung
let unterricht = null, spur = [], spurZeit = 0, marken = [], endeZeit = 0, lehrerZeit = 0, ergebnisAuf = false;
// Welche Hilfe gilt gerade? Manche Lektion braucht mindestens „mittel“ (beim Abriss muss der Schutz aus sein).
const hilfeJetzt = () => unterricht && unterricht.l.hilfeMin && STUFEN.indexOf(E.hilfe) < STUFEN.indexOf(unterricht.l.hilfeMin) ? unterricht.l.hilfeMin : E.hilfe;
// Welcher Flugweg in der Luft gehört zu diesem Flug? In der Lektion sagt es die Lektion, sonst der Startort.
const wegJetzt = () => unterricht ? unterricht.l.weg : E.start === 'anflug' ? 'anflug' : 'runde';
const umwelt = { wind: (p, t) => luft.wind(p, t), boden: bodenHoehe };

// ---------------------------------------------------------------- Meldungen oben im Bild
function melde(text, art = 'info', sek = 6) {
  const m = document.createElement('div'); m.className = 'meldung ' + art; m.textContent = text; $('meldungen').appendChild(m);
  while ($('meldungen').children.length > 3) $('meldungen').firstChild.remove();
  setTimeout(() => { m.classList.add('weg'); setTimeout(() => m.remove(), 600); }, sek * 1000);
}

// ---------------------------------------------------------------- Flug beginnen
function los(lektion) {
  const l = lektion && lektion.schritte ? lektion : null;
  // In der Flugschule ist immer ruhiges Wetter. Eine Lektion beginnt an einem der Startorte oder schon in der Luft.
  const s = l ? { lage: l.lage || STARTS[l.start].lage } : STARTS[E.start];
  unterricht = l ? new Unterricht(l) : null; spur = []; spurZeit = 0; marken = []; endeZeit = 0; lehrerZeit = 0; ergebnisAuf = false;
  f = neuesFlugzeug('lerche'); luft = neueLuft(WETTER[l ? 'ruhig' : E.wetter]); flug = new Flug();
  setze(f, { ...s.lage, boden: 0 });
  if (s.lage.tempo) { const w = luft.wind(f.p, 0); f.v[0] += w[0]; f.v[2] += w[2]; }      // in der Luft: Der Wind trägt das Flugzeug von Anfang an mit
  eingabe.e.gas = s.lage.gas || 0; eingabe.handyTrimm = 0;
  rest = 0; pause = false; imMenue = false; kamAlt = null; blickMitte(); blick.jetztAz = blick.jetztEl = 0;
  $('menue').classList.add('zu'); $('meldungen').innerHTML = '';
  $('ergebnis').classList.remove('an'); $('pause').classList.remove('an'); $('schule').classList.toggle('an', !!l); document.body.classList.toggle('in-schule', !!l);
  if (l) { $('sLehrer').textContent = ''; $('sAufgabe').textContent = ''; $('sName').textContent = l.name; if (hilfeJetzt() !== E.hilfe) melde('In dieser Lektion ist der Schutz vor dem Abriss ausgeschaltet (Hilfen: mittel).', 'info', 8); }
  else { melde(s.text, 'info', 9); melde(luft.text + ' · Hilfen: ' + E.hilfe, 'info', 7); }
  klang.stumm = !E.ton; klang.start();
  if (neigung.an) neigung.mitte();
  empfang.senden({ k: 'mitte' });
  window.__flugsim.f = f;
}
function menue() { pause = true; imMenue = true; unterricht = null; ergebnisAuf = false; stimmeAus(); $('ergebnis').classList.remove('an'); $('schule').classList.remove('an'); document.body.classList.remove('in-schule'); $('menue').classList.remove('zu'); maleMenue(); }
const stimmeAus = () => { try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) { /* egal */ } };

// ---------------------------------------------------------------- Flugschule: was die Lehrerin sagt, die Aufgabe, das Ergebnis
function schuleSchritt(sek) {
  const u = unterricht;
  u.schritt(f, sek, flug);
  for (const s of u.sagen.splice(0)) {
    // Ein neuer Auftrag unterbricht, was sie gerade noch sagt – sonst hinkt die Stimme hinterher
    if (s.art !== 'warn') stimmeAus();
    klang.sprich(s.text);
    $('sLehrer').textContent = s.text; $('sLehrer').className = s.art; lehrerZeit = 6 + s.text.length * 0.07;
    if (s.art === 'warn') marken.push({ x: f.p[0], z: f.p[2], text: s.text });
  }
  lehrerZeit -= sek; if (lehrerZeit <= 0) $('sLehrer').textContent = '';
  $('sAufgabe').textContent = u.l.allein && !u.fertig ? 'Alleinflug: eine Platzrunde fliegen und landen' : u.aufgabe ? `Aufgabe ${u.nr + 1} von ${u.l.schritte.length}: ${u.aufgabe}` : '';
  $('sTipp').textContent = u.tipp && !u.fertig && !u.l.allein && !eingabe.handyAn ? u.tipp[touch ? 1 : 0] : '';
  $('sBalken').style.width = (u.anteil * 100) + '%'; $('sLeiste').style.visibility = u.anteil > 0 ? 'visible' : 'hidden';
  // die Spur für die Nachbesprechung: zweimal pro Sekunde ein Punkt
  spurZeit -= sek;
  if (spurZeit <= 0 && !u.fertig) { spurZeit = 0.5; spur.push({ t: u.t, x: f.p[0], y: f.p[1], z: f.p[2], h: f.hoeheGrund, v: f.ias, boden: f.amBoden }); }
  // Nach dem Ende noch kurz zuschauen lassen, dann kommt die Nachbesprechung
  if (u.fertig && !ergebnisAuf) { endeZeit += sek; if (endeZeit > 3) zeigeErgebnis(); }
}
function zeigeErgebnis() {
  const u = unterricht, r = u.ergebnis, nr = LEKTIONEN.indexOf(u.l);
  ergebnisAuf = true; pause = true; $('schule').classList.remove('an');
  if (r.geschafft) merkeStand(localStorage, u.l.id, r.sterne);
  $('eTitel').textContent = u.l.name + (r.geschafft ? ' – geschafft!' : ' – noch nicht geschafft');
  $('eSterne').textContent = r.geschafft ? '★'.repeat(r.sterne) + '☆'.repeat(3 - r.sterne) : '';
  $('eText').textContent = r.text;
  $('eLandung').textContent = r.note ? `Deine Landung: ${'★'.repeat(r.note.sterne)}${'☆'.repeat(5 - r.note.sterne)} ${r.note.text}` : '';
  $('eFehler').innerHTML = ''; marken.forEach((m, i) => { const li = document.createElement('li'); li.textContent = m.text; li.value = i + 1; $('eFehler').appendChild(li); });
  $('eFehlerTitel').style.display = marken.length ? '' : 'none';
  // Soll-Weg in der Zeichnung: auch beim Alleinflug, dort sieht man ihn erst hinterher
  const soll = u.l.weg === 'anflug' ? anflugweg() : u.l.weg === 'runde' || u.l.allein ? platzrunde() : null;
  maleNachflug($('eBild'), spur, u.l.id === 'start' ? soll.filter(p => p.s < 2600) : soll, marken, !!u.l.landung);
  const weiter = r.geschafft && LEKTIONEN[nr + 1];
  $('eWeiter').style.display = weiter ? '' : 'none'; if (weiter) { $('eWeiter').textContent = 'Nächste Lektion: ' + weiter.name; $('eWeiter').onclick = () => los(weiter); }
  $('eNochmal').onclick = () => los(u.l);
  $('ergebnis').classList.add('an');
}

eingabe.wenn = {
  klappenAus() { if (f.klappenStufe < 3) { f.klappenStufe++; melde(`Klappen ${f.T.klappen[f.klappenStufe]}°`, 'info', 2); } },
  klappenEin() { if (f.klappenStufe > 0) { f.klappenStufe--; melde(`Klappen ${f.T.klappen[f.klappenStufe]}°`, 'info', 2); } },
  kamera() { E.kamera = KAMERAS[(KAMERAS.indexOf(E.kamera) + 1) % KAMERAS.length]; kamAlt = null; blickMitte(); merke(); },
  blickMitte() { blickMitte(); },
  weg() { E.weg = !E.weg; merke(); melde(E.weg ? 'Flugweg in der Luft: an' : 'Flugweg in der Luft: aus', 'info', 3); },
  pause() { if (imMenue || ergebnisAuf) return; pause = !pause; $('pause').classList.toggle('an', pause); },
  neu() { menue(); },
  hilfe() { E.hilfe = STUFEN[(STUFEN.indexOf(E.hilfe) + 1) % STUFEN.length]; merke(); melde(STUFEN_TEXT[E.hilfe], 'info', 4); }
};
empfang.wennDaten = m => eingabe.vomHandy(m);
empfang.wennZustand = z => { if (z !== 'verbunden') { eingabe.handyAn = false; eingabe.handy = null; } else melde('Handy als Steuerknüppel verbunden', 'gut', 4); maleMenue(); };

// ---------------------------------------------------------------- Kameras
const V = new THREE.Vector3(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), Q3 = new THREE.Quaternion(), HOCH = new THREE.Vector3(0, 1, 0), QUER = new THREE.Vector3(1, 0, 0), UM = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
let kamAlt = null;
// Wohin man schaut. Im Cockpit: az = Kopf nach rechts gedreht, el = nach oben. In der Außenansicht: az = Kamera um das
// Flugzeug herum (0 = genau dahinter), el = Kamera höher, weit = Abstand. Mit dem Finger oder der Maus ziehen dreht den Blick
// und er bleibt so; die Tasten J L I K gelten im Cockpit nur, solange man sie hält (kurz zur Seite schauen).
const AUSSEN_EL = 0.27, AUSSEN_WEIT = 15;
const blick = { az: 0, el: 0, weit: AUSSEN_WEIT, jetztAz: 0, jetztEl: 0, brettWeg: false };
function blickMitte() { blick.az = 0; blick.el = 0; blick.weit = AUSSEN_WEIT; }
function blickSchritt(dt) {
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
function stelleKamera(dt) {
  const k = welt.kamera, W = window.innerWidth, H = window.innerHeight;
  blickSchritt(dt);
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
      if (!kamAlt) kamAlt = ziel.clone(); else kamAlt.lerp(ziel, 1 - Math.exp(-6 * dt));
      k.position.copy(kamAlt); k.up.set(0, 1, 0); k.lookAt(f.p[0] - Math.sin(f.kurs) * vorn, f.p[1] + 1, f.p[2] + Math.cos(f.kurs) * vorn); k.fov = 62;
    } else {
      // vom Turm aus: Die Kamera steht fest und schaut dem Flugzeug nach, je weiter weg, desto stärker das Fernglas
      k.position.set(PLATZ.vorfeld.x - 30, 17, PLATZ.vorfeld.z - 48); k.up.set(0, 1, 0); k.lookAt(f.p[0], f.p[1], f.p[2]);
      k.fov = Math.max(1.2, Math.min(50, 2 * Math.atan(22 / k.position.distanceTo(new THREE.Vector3(...f.p))) / GRAD));
    }
  }
  k.updateProjectionMatrix();
}

// ---------------------------------------------------------------- Malfläche für Instrumente
const hudC = $('hud'), hg = hudC.getContext('2d');
function maleAnzeigen() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = window.innerWidth, H = window.innerHeight;
  if (hudC.width !== Math.round(W * dpr) || hudC.height !== Math.round(H * dpr)) { hudC.width = Math.round(W * dpr); hudC.height = Math.round(H * dpr); }
  hg.setTransform(dpr, 0, 0, dpr, 0, 0); hg.clearRect(0, 0, W, H);
  if (imMenue) return;
  if (E.kamera === 'cockpit' && !blick.brettWeg) maleBrett(hg, W, H, f); else maleHud(hg, W, H, f);
  maleWind(hg, W, H, f, luft.wind(f.p, f.t));
}

// ---------------------------------------------------------------- ein Bild
function bild(sek, ohneBild) {
  let e = eingabe.schritt(sek);
  if (window.__flugsim.pilot && !pause) e = window.__flugsim.pilot(f, sek, unterricht) || e;      // nur zum Testen: ein künstlicher Pilot fliegt
  if (!pause) {
    f.trimm = Math.max(-1, Math.min(1, f.trimm + eingabe.trimm * 0.25 * sek));
    rest = Math.min(rest + sek, 0.1);
    while (rest >= TAKT) {
      const warBoden = f.amBoden, n = f.ereignisse.length;
      schritt(f, mitHilfe(e, f, hilfeJetzt(), TAKT), TAKT, umwelt);
      if (f.ereignisse.length > n) { const a = f.ereignisse[f.ereignisse.length - 1]; klang.rumms(a.sink); empfang.senden({ k: 'r', s: a.sink > 1.8 ? 'schwer' : 'leicht' }); }
      if (warBoden && !f.amBoden && f.hoeheGrund > 0.3 && !flug.abgehoben) { flug.abgehoben = true; }
      rest -= TAKT;
    }
    flug.schritt(f, sek);
    for (const m of flug.meldungen.splice(0)) melde(m.text, m.art, m.art === 'info' ? 5 : 9);
    if (flug.ruf) { klang.sprich(flug.ruf); flug.ruf = null; }
    if (unterricht) schuleSchritt(sek);
  }
  lerche.stelle(f, pause ? 0 : sek); welt.schritt(f, luft); { const w = wegJetzt(); for (const k in welt.wege) welt.wege[k].visible = !!E.weg && k === w; } stelleKamera(sek); if (!ohneBild) { welt.male(); maleAnzeigen(); } klang.schritt(f, pause);
  if (touch) touch.zeige(neigung.an, eingabe.handyAn);
  empfang.pruefen();
  infoZeit -= sek;
  if (infoZeit <= 0 && empfang.verbunden) { infoZeit = 0.1; empfang.senden({ k: 'i', ias: Math.round(f.ias / KN), hoehe: Math.round(f.hoeheGrund / FT), klappen: f.T.klappen[f.klappenStufe], boden: f.amBoden ? 1 : 0, abriss: f.abriss > 0.3 ? 1 : 0, gas: +f.gas.toFixed(2), trimm: +f.trimm.toFixed(2) }); }
}
function schleife(t) {
  const sek = Math.min(0.1, (t - zuletzt) / 1000 || 0); zuletzt = t;
  if (!window.__flugsim.angehalten) bild(sek);
  requestAnimationFrame(schleife);
}

// ---------------------------------------------------------------- Menü
function wahl(id, liste, schluessel, text) {
  const k = $(id); k.innerHTML = '';
  for (const [key, w] of Object.entries(liste)) {
    const b = document.createElement('button'); b.textContent = text(w, key); b.className = E[schluessel] === key ? 'an' : '';
    b.onclick = () => { E[schluessel] = key; merke(); maleMenue(); }; k.appendChild(b);
  }
}
function maleMenue() {
  // Flugschule: acht Lektionen, die nächste geht auf, wenn die davor geschafft ist
  const stand = ladeStand(localStorage), sch = $('wSchule'); sch.innerHTML = '';
  LEKTIONEN.forEach((l, nr) => {
    const auf = E.allesOffen || offen(stand, nr), st = stand[l.id] || 0, b = document.createElement('button');
    b.className = 'lektion' + (auf ? '' : ' zu') + (st ? ' fertig' : ''); b.disabled = !auf;
    b.innerHTML = `<b></b><span></span><i>${auf ? (st ? '★'.repeat(st) + '☆'.repeat(3 - st) : 'neu') : '🔒'}</i>`;
    b.querySelector('b').textContent = l.name; b.querySelector('span').textContent = l.kurz;
    b.onclick = () => los(l); sch.appendChild(b);
  });
  $('bAlles').textContent = E.allesOffen ? 'Alle Lektionen sind freigeschaltet (tippen = wieder der Reihe nach)' : 'Alle Lektionen freischalten';
  wahl('wStart', STARTS, 'start', w => w.name);
  wahl('wWetter', WETTER, 'wetter', w => w.name);
  wahl('wHilfe', Object.fromEntries(STUFEN.map(s => [s, s])), 'hilfe', s => STUFEN_TEXT[s]);
  wahl('wKamera', { cockpit: 'Cockpit mit Instrumenten', hinten: 'Hinter dem Flugzeug', turm: 'Vom Turm aus' }, 'kamera', w => w);
  $('startText').textContent = STARTS[E.start].text;
  $('bNeigen').textContent = neigung.an ? 'Dieses Gerät neigen: an (tippen = aus)' : 'Dieses Gerät neigen';
  $('bNeigen').classList.toggle('an', neigung.an);
  $('bTon').textContent = 'Ton: ' + (E.ton ? 'an' : 'aus');
  $('bWeg').textContent = 'Flugweg in der Luft zeigen: ' + (E.weg ? 'an' : 'aus'); $('bWeg').classList.toggle('an', !!E.weg);
  $('handyStand').textContent = { aus: '', wartet: 'wartet auf das Handy …', verbunden: 'verbunden ✔', fehler: 'keine Verbindung zum Vermittler (Internet?)' }[empfang.zustand];
}
$('bLos').onclick = () => los(null);
$('bAlles').onclick = () => { E.allesOffen = !E.allesOffen; merke(); maleMenue(); };
$('eMenue').onclick = menue;
$('bWeg').onclick = () => { E.weg = !E.weg; merke(); maleMenue(); };
$('bTon').onclick = () => { E.ton = !E.ton; merke(); maleMenue(); };
$('bNeigen').onclick = () => { if (neigung.an) { neigung.stopp(); maleMenue(); } else neigung.start().then(ok => { if (!ok) melde('Dieses Gerät hat keinen Neigungssensor oder er ist nicht erlaubt.', 'warn'); maleMenue(); }); };
$('bHandy').onclick = () => {
  empfang.start();
  const adr = handyAdresse(empfang.code, frage.has('lokal'));
  $('handyCode').textContent = empfang.code; $('handyAdr').textContent = adr; $('handy').classList.add('an');
  // QR-Code malen (Bibliothek aus dem Internet). Klappt das nicht, bleibt die Adresse zum Abtippen.
  const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
  s.onload = () => { try { const q = window.qrcode(0, 'M'); q.addData(adr); q.make(); $('handyQr').innerHTML = q.createSvgTag({ cellSize: 5, margin: 2 }); } catch (e) { /* dann ohne Bild */ } };
  document.head.appendChild(s);
  maleMenue();
};
$('tasten').innerHTML = TASTEN_HILFE.map(([t, was]) => `<div><b>${t}</b><span>${was}</span></div>`).join('');

// Blick drehen: auf dem freien Bild ziehen (Maus oder ein Finger), Mausrad = näher oder weiter weg, Doppel-Tipp = wieder geradeaus
{
  const gl = $('gl'); let zieh = null, letzterTipp = 0;
  gl.addEventListener('pointerdown', ev => { if (imMenue || zieh) return; zieh = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, weg: 0, t: performance.now() }; try { gl.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ } });
  gl.addEventListener('pointermove', ev => {
    if (!zieh || ev.pointerId !== zieh.id) return;
    const dx = ev.clientX - zieh.x, dy = ev.clientY - zieh.y; zieh.x = ev.clientX; zieh.y = ev.clientY; zieh.weg += Math.abs(dx) + Math.abs(dy);
    if (E.kamera === 'cockpit') { blick.az = Math.max(-2.9, Math.min(2.9, blick.az - dx * 0.005)); blick.el = Math.max(-0.5, Math.min(1.0, blick.el + dy * 0.004)); }
    else if (E.kamera === 'hinten') { blick.az -= dx * 0.006; blick.el = Math.max(-0.2, Math.min(1.25, blick.el + dy * 0.005)); }
  });
  const los = ev => {
    if (!zieh || ev.pointerId !== zieh.id) return;
    const jetzt = performance.now();
    if (zieh.weg < 8 && jetzt - zieh.t < 300) { if (jetzt - letzterTipp < 400) blickMitte(); letzterTipp = jetzt; }
    zieh = null;
  };
  gl.addEventListener('pointerup', los); gl.addEventListener('pointercancel', los);
  gl.addEventListener('wheel', ev => { if (!imMenue && E.kamera === 'hinten') { blick.weit = Math.max(6, Math.min(120, blick.weit * Math.exp(ev.deltaY * 0.0012))); ev.preventDefault(); } }, { passive: false });
}

const touch = istTouch ? baueTouch(eingabe, { kamera: () => eingabe.druecke('kamera'), menue, weg: () => eingabe.druecke('weg'), blickMitte, mitte: () => { neigung.mitte(); empfang.senden({ k: 'mitte' }); melde('Diese Haltung ist jetzt die Mitte', 'info', 2); }, neigen: () => $('bNeigen').onclick() }) : null;
document.body.classList.toggle('mit-touch', !!touch);

// Zum Testen: __flugsim.angehalten = true hält die eigene Schleife an, step(n) rechnet n Bilder (je 1/60 s) vor.
window.__flugsim = { f, E, blick, eingabe, neigung, empfang, welt, STARTS, LEKTIONEN, los, menue, zeigeErgebnis, get unterricht() { return unterricht; }, get spur() { return spur; }, angehalten: false, step(n = 1) { for (let i = 0; i < n; i++) bild(1 / 60, i < n - 1); }, get flug() { return flug; } };
maleMenue();
if (frage.has('lektion')) { const l = LEKTIONEN.find(x => x.id === frage.get('lektion')); if (l) los(l); }
else if (frage.has('start')) { if (STARTS[frage.get('start')]) E.start = frage.get('start'); los(null); }
requestAnimationFrame(schleife);
