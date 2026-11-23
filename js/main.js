// Flugsimulator – das Spiel: Menü, Schleife, Kameras, Anzeigen. Stufe 1: fliegen mit der Lerche 172. Stufe 2: die Flugschule.
import { neuesFlugzeug, setze, schritt, TAKT, KN } from './physik.js';
import { FT, GRAD } from './flugzeuge.js';
import { mitHilfe, STUFEN, STUFEN_TEXT } from './hilfen.js';
import { neueLuft, WETTER } from './atmosphaere.js';
import { PLATZ, bodenHoehe, platzrunde, anflugweg } from './platz.js';
import { LEKTIONEN, LEHRERIN, Unterricht, ladeStand, merkeStand, offen } from './schule.js';
import { maleNachflug } from './nachflug.js';
import { SCHALTER, neueSysteme, schalte, anlassen, sysSchritt, sysRuder, liter } from './systeme.js';
import { Ablauf, MODI, ladeBuch, ladeZustand, schreibeBuch, minuten } from './checklisten.js';
import { STELLEN, Geher, weltOrt } from './rundgang.js';
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
import { Kamera } from './kamera.js';
import { TempoWaechter } from './tempo.js';

const THREE = window.THREE;
const frage = new URLSearchParams(location.search);
const SPEICHER = 'flugsim.einstellungen.v1';
const $ = id => document.getElementById(id);

const KAMERAS = ['cockpit', 'hinten', 'turm'];

const E = Object.assign({ liste: 'gefuehrt', start: 'bahn', wetter: 'ruhig', hilfe: 'leicht', kamera: 'cockpit', ton: true, weg: true }, (() => { try { return JSON.parse(localStorage.getItem(SPEICHER)) || {}; } catch (e) { return {}; } })());
const merke = () => { try { localStorage.setItem(SPEICHER, JSON.stringify(E)); } catch (e) { /* egal */ } };

const welt = new Welt($('gl'));
const lerche = baueLerche(); welt.szene.add(lerche.gruppe);
const tempo = new TempoWaechter(welt.renderer);
const eingabe = new Eingabe(), neigung = eingabe.neigung = new Neigung(), klang = new Klang();
const empfang = new KnueppelEmpfang(frage.has('lokal'));
const istTouch = frage.has('touch') || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
let f = neuesFlugzeug('lerche'), luft = neueLuft(WETTER[E.wetter]), flug = new Flug();
let pause = true, imMenue = true, rest = 0, zuletzt = 0, infoZeit = 0;
// Flugschule: die Lektion, die gerade läuft (oder null im freien Flug), und die Spur des Flugs für die Nachbesprechung
let unterricht = null, spur = [], spurZeit = 0, marken = [], endeZeit = 0, lehrerZeit = 0, ergebnisAuf = false;
// Der ganze Flug (Stufe 3): der Ablauf mit den Checklisten und, solange man draußen ist, der Mensch zu Fuß
let ablauf = null, geher = null, brettAuf = false, listeAuf = true, panelStand = '';
// Welche Hilfe gilt gerade? Manche Lektion braucht mindestens „mittel“ (beim Abriss muss der Schutz aus sein).
const hilfeJetzt = () => unterricht && unterricht.l.hilfeMin && STUFEN.indexOf(E.hilfe) < STUFEN.indexOf(unterricht.l.hilfeMin) ? unterricht.l.hilfeMin : E.hilfe;
// Welcher Flugweg in der Luft gehört zu diesem Flug? In der Lektion sagt es die Lektion, sonst der Startort.
const wegJetzt = () => geher ? null : unterricht ? unterricht.l.weg : E.start === 'anflug' ? 'anflug' : 'runde';
const umwelt = { wind: (p, t) => luft.wind(p, t), boden: bodenHoehe };

// ---------------------------------------------------------------- Meldungen oben im Bild
function melde(text, art = 'info', sek = 6) {
  const m = document.createElement('div'); m.className = 'meldung ' + art; m.textContent = text; $('meldungen').appendChild(m);
  while ($('meldungen').children.length > 3) $('meldungen').firstChild.remove();
  setTimeout(() => { m.classList.add('weg'); setTimeout(() => m.remove(), 600); }, sek * 1000);
}

// ---------------------------------------------------------------- Flug beginnen
function los(lektion) {
  const l = lektion && lektion.schritte ? lektion : null, ganz = lektion === 'ganz';
  // In der Flugschule ist immer ruhiges Wetter. Eine Lektion beginnt an einem der Startorte oder schon in der Luft.
  const s = l ? { lage: l.lage || STARTS[l.start].lage } : ganz ? STARTS.vorfeld : STARTS[E.start];
  unterricht = l ? new Unterricht(l) : null; spur = []; spurZeit = 0; marken = []; endeZeit = 0; lehrerZeit = 0; ergebnisAuf = false;
  const zustand = ganz ? ladeZustand(localStorage) : null;
  f = neuesFlugzeug('lerche', ganz ? { sprit: zustand.sprit } : {}); luft = neueLuft(WETTER[l ? 'ruhig' : E.wetter]); flug = new Flug();
  setze(f, { ...s.lage, boden: 0 });
  if (s.lage.tempo) { const w = luft.wind(f.p, 0); f.v[0] += w[0]; f.v[2] += w[2]; }      // in der Luft: Der Wind trägt das Flugzeug von Anfang an mit
  // Der ganze Flug beginnt draußen vor dem geparkten Flugzeug: Motor aus, alles gesichert
  ablauf = null; geher = null; brettAuf = false; panelStand = '';
  if (ganz) { f.motorAn = false; f.sys = neueSysteme(zustand); ablauf = new Ablauf(E.liste); geher = new Geher(f); listeAuf = E.liste !== 'selbst' && window.innerHeight >= 500; /* auf dem kleinen Handy-Bildschirm fängt die Liste zugeklappt an */ blick.el = 0; }
  eingabe.e.gas = s.lage.gas || 0; eingabe.handyTrimm = 0;
  rest = 0; pause = false; imMenue = false; kam.mitte(true);
  $('menue').classList.add('zu'); $('meldungen').innerHTML = '';
  $('ergebnis').classList.remove('an'); $('pause').classList.remove('an'); $('schule').classList.toggle('an', !!l); document.body.classList.toggle('in-schule', !!l);
  if (l) { $('sLehrer').textContent = ''; $('sAufgabe').textContent = ''; $('sName').textContent = l.name; if (hilfeJetzt() !== E.hilfe) melde('In dieser Lektion ist der Schutz vor dem Abriss ausgeschaltet (Hilfen: mittel).', 'info', 8); }
  else if (ganz) { melde('Dein Flugzeug steht geparkt auf dem Vorfeld. Zuerst der Außencheck: Geh zu den gelben Kreisen und sieh nach dem Rechten.', 'info', 12); melde(luft.text + ' · ' + MODI[E.liste].split(':')[0], 'info', 8); }
  else { melde(s.text, 'info', 9); melde(luft.text + ' · Hilfen: ' + E.hilfe, 'info', 7); }
  malePanels();
  klang.stumm = !E.ton; klang.start();
  if (neigung.an) neigung.mitte();
  empfang.senden({ k: 'mitte' });
  window.__flugsim.f = f;
}
function menue() { pause = true; imMenue = true; unterricht = null; ablauf = null; geher = null; brettAuf = false; malePanels(); ergebnisAuf = false; stimmeAus(); $('ergebnis').classList.remove('an'); $('schule').classList.remove('an'); document.body.classList.remove('in-schule'); $('menue').classList.remove('zu'); maleMenue(); }
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
  maleNachflug($('eBild'), spur, u.l.id === 'start' ? soll.filter(p => p.s < 2600) : soll, marken, !!u.l.landung); $('eLegRot').style.display = '';
  const weiter = r.geschafft && LEKTIONEN[nr + 1];
  $('eWeiter').style.display = weiter ? '' : 'none'; if (weiter) { $('eWeiter').textContent = 'Nächste Lektion: ' + weiter.name; $('eWeiter').onclick = () => los(weiter); }
  $('eFehlerTitel').textContent = 'Das hat die Fluglehrerin angemerkt'; $('eNochmal').textContent = 'Noch einmal'; $('eNochmal').onclick = () => los(u.l);
  $('ergebnis').classList.add('an');
}

eingabe.wenn = {
  klappenAus() { if (f.klappenStufe < 3) { f.klappenStufe++; melde(`Klappen ${f.T.klappen[f.klappenStufe]}°`, 'info', 2); } },
  klappenEin() { if (f.klappenStufe > 0) { f.klappenStufe--; melde(`Klappen ${f.T.klappen[f.klappenStufe]}°`, 'info', 2); } },
  kamera() { E.kamera = KAMERAS[(KAMERAS.indexOf(E.kamera) + 1) % KAMERAS.length]; kam.alt = null; kam.mitte(); merke(); },
  blickMitte() { kam.mitte(); },
  weg() { E.weg = !E.weg; merke(); melde(E.weg ? 'Flugweg in der Luft: an' : 'Flugweg in der Luft: aus', 'info', 3); },
  brett() { if (ablauf && !geher && !ergebnisAuf) { brettAuf = !brettAuf; malePanels(); } },
  liste() { if (ablauf) { listeAuf = !listeAuf; malePanels(); } },
  // Enter: zu Fuß das Nächste an dieser Stelle tun; im Cockpit („Geführt“) den nächsten Schalter der Checkliste stellen
  tun() {
    if (!ablauf || pause) return;
    if (geher) { const st = geher.nah(f), a = st && st.tun(f, f.sys).find(x => !x.fertig); if (a) stelleTun(a); }
    else { const p = ablauf.liste(f).find(x => !x.ok); if (p && p.tipp) ablauf.tippe(f, p.id, eingabe.e); }
  },
  pause() { if (imMenue || ergebnisAuf) return; pause = !pause; $('pause').classList.toggle('an', pause); },
  neu() { menue(); },
  hilfe() { E.hilfe = STUFEN[(STUFEN.indexOf(E.hilfe) + 1) % STUFEN.length]; merke(); melde(STUFEN_TEXT[E.hilfe], 'info', 4); }
};
empfang.wennDaten = m => eingabe.vomHandy(m);
empfang.wennZustand = z => { if (z !== 'verbunden') { eingabe.handyAn = false; eingabe.handy = null; } else melde('Handy als Steuerknüppel verbunden', 'gut', 4); maleMenue(); };

// ---------------------------------------------------------------- Der ganze Flug: Checkliste am Rand, Schalterbrett, Rundgang, Flugbuch
function ganzSchritt(sek) {
  const s = f.sys;
  ablauf.schritt(f, sek, flug, eingabe.e);
  for (const m of s.meldungen.splice(0)) melde(m.text, m.art, m.art === 'gut' ? 4 : 9);
  for (const m of ablauf.meldungen.splice(0)) melde(m.text, m.art, m.art === 'gut' ? 7 : 6);
  // eingestiegen: ab jetzt sitzt man im Cockpit
  if (geher && s.drin) { geher = null; kam.mitte(true); melde('Du sitzt im Cockpit. Schalterbrett: Taste X oder Knopf „Schalter“.', 'info', 8); }
  spurZeit -= sek;
  if (spurZeit <= 0 && !geher && !ablauf.fertig) { spurZeit = 0.5; spur.push({ t: ablauf.t, x: f.p[0], y: f.p[1], z: f.p[2], h: f.hoeheGrund, v: f.ias, boden: f.amBoden }); }
  malePanels();
}
// An einer Stelle des Rundgangs etwas tun
function stelleTun(a) { const text = a.tu(); if (text) melde(text, 'info', 8); malePanels(); }
// Checkliste, Schalterbrett und Rundgang-Kasten neu malen – aber nur, wenn sich etwas geändert hat
function malePanels() {
  const an = !!ablauf && !imMenue && !ergebnisAuf;
  document.body.classList.toggle('mit-liste', an);
  $('liste').classList.toggle('an', an); $('brett').classList.toggle('an', an && brettAuf && !geher); $('stelle').classList.toggle('an', an && !!geher);
  if (!an) { panelStand = ''; return; }
  const s = f.sys, punkte = ablauf.liste(f), st = geher ? geher.nah(f) : null, tun = st ? st.tun(f, s) : [], kannEnden = ablauf.kannEnden(f);
  const stand = JSON.stringify([ablauf.nr, punkte.map(p => p.ok), listeAuf, brettAuf, SCHALTER.map(x => s[x.id]), f.motorAn, st && st.id, tun.map(a => a.text + a.fertig), kannEnden, s.anlassZeit > 0, liter(f)]);
  if (stand === panelStand) return; panelStand = stand;
  // die Checkliste
  const offen = punkte.filter(p => !p.ok).length;
  $('lKopf').textContent = `${listeAuf ? '▾' : '▸'} ${ablauf.phase.name}${offen ? ` (${offen} offen)` : ' ✔'}`;
  $('lWo').textContent = listeAuf ? ablauf.phase.wo : ''; $('lPunkte').innerHTML = '';
  if (listeAuf) for (const p of punkte) {
    const d = document.createElement('div'); d.className = 'punkt' + (p.ok ? ' ok' : '') + (p.tipp && ablauf.modus === 'gefuehrt' && !p.ok && !geher ? ' tipp' : ''); d.textContent = (p.ok ? '☑ ' : '☐ ') + p.text; d.title = p.grund;
    d.onclick = () => { if (geher) return; ablauf.tippe(f, p.id, eingabe.e); if (!p.ok) melde(p.grund, 'info', 6); malePanels(); };
    $('lPunkte').appendChild(d);
  }
  $('lBuch').style.display = kannEnden ? '' : 'none';
  { const fehlt = ablauf.phase.id === 'abstellen' ? punkte.filter(p => !p.ok).length : 0; $('lBuch').textContent = f.bruch || !fehlt ? 'Flugbuch schreiben' : `Flugbuch schreiben (noch ${fehlt} offen)`; $('lBuch').classList.toggle('blass', !f.bruch && fehlt > 0); }
  // das Schalterbrett
  if (brettAuf && !geher) {
    const b = $('bSchalter'); b.innerHTML = '';
    const knopf = (name, wert, an, tu) => { const k = document.createElement('button'); k.className = 'schalter' + (an ? ' an' : ''); k.innerHTML = '<b></b><span></span>'; k.querySelector('b').textContent = name; k.querySelector('span').textContent = wert; k.onclick = () => { tu(); k.blur(); malePanels(); }; b.appendChild(k); };
    for (const x of SCHALTER) knopf(x.name, s[x.id] ? x.an : x.aus, s[x.id], () => { const nein = schalte(f, x.id); if (nein) melde(nein, 'warn', 5); });
    knopf('Anlasser', s.anlassZeit > 0 ? 'dreht …' : f.motorAn ? 'Motor läuft' : 'drücken', f.motorAn, () => { const nein = anlassen(f); if (nein) melde(nein, 'warn', 6); });
    $('bTank').textContent = `Tank: ${liter(f)} Liter · Batterie: ${Math.round(s.batterie * 100)} %`;
  }
  // der Kasten beim Rundgang
  if (geher) {
    $('stName').textContent = st ? st.name : 'Außencheck'; $('stTun').innerHTML = '';
    $('stText').textContent = st ? '' : 'Geh zu den gelben Kreisen am Flugzeug (Pfeiltasten oder Knüppel, ziehen = umschauen). Zum Schluss an der Tür einsteigen.';
    for (const a of tun) { const k = document.createElement('button'); k.textContent = (a.fertig ? '✔ ' : '') + a.text; k.disabled = !!a.fertig; k.onclick = () => { k.blur(); stelleTun(a); }; $('stTun').appendChild(k); }
  }
}
$('lKopf').onclick = () => eingabe.druecke('liste');
$('bZu').onclick = () => eingabe.druecke('brett');
$('lBuch').onclick = () => schreibeFlugbuch();
const sterne = (n, von = 5) => '★'.repeat(n) + '☆'.repeat(von - n);
const buchZeile = b => `${new Date(b.datum).toLocaleDateString('de-DE')}  ·  ${minuten(b.dauer)} min (in der Luft ${minuten(b.flugZeit)})  ·  Landung ${b.landung ? sterne(b.landung) : '–'}  ·  Regeln ${sterne(b.regeln)}${b.bruch ? '  ·  Bruch' : ''}${b.vergessen.length ? '  ·  vergessen: ' + b.vergessen.map(v => v.text).join(', ') : ''}`;
// Flug beenden: Eintrag ins Flugbuch und die Nachbesprechung zeigen
function schreibeFlugbuch() {
  if (!ablauf || !ablauf.kannEnden(f)) return;
  const b = ablauf.ende(f, flug); schreibeBuch(localStorage, b, f);
  ergebnisAuf = true; pause = true; malePanels();
  $('eTitel').textContent = b.bruch ? 'Flugbuch – das ging schief' : 'Flugbuch – Flug eingetragen';
  $('eSterne').textContent = '';
  $('eText').textContent = `Dauer ${minuten(b.dauer)} Minuten, davon ${minuten(b.flugZeit)} in der Luft. ${b.landungen} ${b.landungen === 1 ? 'Landung' : 'Landungen'}. Im Tank bleiben ${b.sprit} Liter.  Regeln: ${sterne(b.regeln)}`
    + (b.bruch ? '  Das Flugzeug muss in die Werkstatt.' : b.amPlatz ? '' : '  Das Flugzeug steht nicht auf dem Vorfeld (ein Stern Abzug).') + (b.batterieAn ? '  Der Hauptschalter ist noch an: Beim nächsten Flug ist die Batterie leer!' : '');
  $('eLandung').textContent = b.landung ? `Deine Landung: ${sterne(b.landung)} ${b.landeText}` : '';
  $('eFehler').innerHTML = ''; for (const v of b.vergessen) { const li = document.createElement('li'); li.textContent = `${v.phase}: ${v.text}. ${v.grund}`; $('eFehler').appendChild(li); }
  $('eFehlerTitel').textContent = 'Das hast du vergessen'; $('eFehlerTitel').style.display = b.vergessen.length ? '' : 'none';
  maleNachflug($('eBild'), spur, platzrunde(), [], b.landungen > 0); $('eLegRot').style.display = 'none';
  $('eWeiter').style.display = 'none'; $('eNochmal').textContent = 'Neuer Flug'; $('eNochmal').onclick = () => los('ganz');
  $('ergebnis').classList.add('an');
}
// Die gelben Kreise am Boden, an denen es beim Rundgang etwas zu tun gibt (grün = erledigt)
const marken3d = new THREE.Group(); marken3d.visible = false; welt.szene.add(marken3d);
const markenTeile = STELLEN.map(() => { const m = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 24), new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; marken3d.add(m); return m; });
function stelleMarken() {
  STELLEN.forEach((st, i) => { const [x, z] = weltOrt(f, st.ort); markenTeile[i].position.set(x, bodenHoehe(x, z) + 0.04, z); markenTeile[i].material.color.set(st.erledigt(f, f.sys) ? 0x5fd07a : st.id === 'tuer' ? 0x46dcff : 0xffd23c); });
}
// Namen der Stellen ins Bild schreiben (über dem Kreis)
function maleSchilder(W, H) {
  hg.font = '600 14px sans-serif'; hg.textAlign = 'center'; hg.textBaseline = 'middle';
  // Die nächste Stelle zuerst: Ein Schild, das ein näheres verdecken würde, bleibt weg (der gelbe Ring am Boden bleibt)
  const weit = st => { const [x, z] = weltOrt(f, st.ort); return Math.hypot(x - geher.x, z - geher.z); }, gemalt = [];
  for (const st of [...STELLEN].sort((a, b) => weit(a) - weit(b))) {
    const [x, z] = weltOrt(f, st.ort); V.set(x, bodenHoehe(x, z) + 1.25, z);
    if (V.clone().sub(welt.kamera.position).dot(welt.kamera.getWorldDirection(new THREE.Vector3())) < 0.3) continue;      // hinter mir
    V.project(welt.kamera); const sx = (V.x + 1) / 2 * W, sy = (1 - V.y) / 2 * H, text = (st.erledigt(f, f.sys) ? '✔ ' : '') + st.name, b = hg.measureText(text).width + 16;
    if (gemalt.some(g => Math.abs(g.x - sx) < (g.b + b) / 2 + 4 && Math.abs(g.y - sy) < 28)) continue;
    gemalt.push({ x: sx, y: sy, b });
    hg.fillStyle = 'rgba(14,19,24,0.75)'; hg.fillRect(sx - b / 2, sy - 12, b, 24); hg.fillStyle = st.erledigt(f, f.sys) ? '#8fe6a3' : '#ffe08a'; hg.fillText(text, sx, sy);
  }
}

// ---------------------------------------------------------------- Kameras (js/kamera.js)
const kam = new Kamera(welt, lerche, eingabe, E), blick = kam.blick;
const V = new THREE.Vector3();          // Hilfs-Punkt für die Schilder beim Außencheck

// ---------------------------------------------------------------- Malfläche für Instrumente
const hudC = $('hud'), hg = hudC.getContext('2d');
function maleAnzeigen() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = window.innerWidth, H = window.innerHeight;
  if (hudC.width !== Math.round(W * dpr) || hudC.height !== Math.round(H * dpr)) { hudC.width = Math.round(W * dpr); hudC.height = Math.round(H * dpr); }
  hg.setTransform(dpr, 0, 0, dpr, 0, 0); hg.clearRect(0, 0, W, H);
  if (imMenue) return;
  if (geher) { maleSchilder(W, H); return; }
  if (E.kamera === 'cockpit' && !blick.brettWeg) maleBrett(hg, W, H, f); else maleHud(hg, W, H, f);
  maleWind(hg, W, H, f, luft.wind(f.p, f.t));
}

// ---------------------------------------------------------------- ein Bild
function bild(sek, ohneBild) {
  let e = eingabe.schritt(sek);
  // Zu Fuß: Die Tasten und der Knüppel bewegen den Menschen, das Flugzeug bleibt stehen
  if (geher && !pause) {
    const vor = (eingabe.unten('ArrowUp', 'KeyW') ? 1 : 0) - (eingabe.unten('ArrowDown', 'KeyS') ? 1 : 0) + (eingabe.stick.an ? eingabe.stick.y : 0) - (eingabe.pad ? eingabe.pad.hoehe : 0);
    const dreh = (eingabe.unten('ArrowRight', 'KeyD', 'KeyE') ? 1 : 0) - (eingabe.unten('ArrowLeft', 'KeyA', 'KeyQ') ? 1 : 0) + (eingabe.stick.an ? eingabe.stick.x : 0) + eingabe.pedal + (eingabe.pad ? eingabe.pad.quer + eingabe.pad.seite : 0);
    geher.schritt(f, Math.max(-1, Math.min(1, vor)), Math.max(-1, Math.min(1, dreh)), sek);
    eingabe.e.gas = 0; e = { hoehe: 0, quer: 0, seite: 0, gas: 0, bremse: 1 };
  }
  if (window.__flugsim.pilot && !pause) e = window.__flugsim.pilot(f, sek, unterricht) || e;      // nur zum Testen: ein künstlicher Pilot fliegt
  if (!pause) {
    f.trimm = Math.max(-1, Math.min(1, f.trimm + eingabe.trimm * 0.25 * sek));
    rest = Math.min(rest + sek, 0.1);
    while (rest >= TAKT) {
      const warBoden = f.amBoden, n = f.ereignisse.length;
      schritt(f, sysRuder(mitHilfe(e, f, hilfeJetzt(), TAKT), f), TAKT, umwelt); sysSchritt(f, e, TAKT);
      if (f.ereignisse.length > n) { const a = f.ereignisse[f.ereignisse.length - 1]; klang.rumms(a.sink); empfang.senden({ k: 'r', s: a.sink > 1.8 ? 'schwer' : 'leicht' }); }
      if (warBoden && !f.amBoden && f.hoeheGrund > 0.3 && !flug.abgehoben) { flug.abgehoben = true; }
      rest -= TAKT;
    }
    flug.schritt(f, sek);
    for (const m of flug.meldungen.splice(0)) melde(m.text, m.art, m.art === 'info' ? 5 : 9);
    if (flug.ruf) { klang.sprich(flug.ruf); flug.ruf = null; }
    if (unterricht) schuleSchritt(sek);
    if (ablauf) ganzSchritt(sek);
  }
  lerche.stelle(f, pause ? 0 : sek); welt.schritt(f, luft); marken3d.visible = !!geher; if (geher) stelleMarken(); { const w = wegJetzt(); for (const k in welt.wege) welt.wege[k].visible = !!E.weg && k === w; } kam.stelle(sek, f, geher); if (!ohneBild) { welt.male(); maleAnzeigen(); } klang.schritt(f, pause);
  if (touch) touch.zeige(neigung.an, eingabe.handyAn, !!ablauf, !!geher);
  empfang.pruefen();
  infoZeit -= sek;
  if (infoZeit <= 0 && empfang.verbunden) { infoZeit = 0.1; empfang.senden({ k: 'i', ias: Math.round((f.iasZeigt ?? f.ias) / KN), hoehe: Math.round(f.hoeheGrund / FT), klappen: f.T.klappen[f.klappenStufe], boden: f.amBoden ? 1 : 0, abriss: f.abriss > 0.3 ? 1 : 0, gas: +f.gas.toFixed(2), trimm: +f.trimm.toFixed(2) }); }
}
function schleife(t) {
  const sek = Math.min(0.1, (t - zuletzt) / 1000 || 0); zuletzt = t;
  if (!window.__flugsim.angehalten) { bild(sek); tempo.pruefe(sek, !pause && !imMenue); }
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
  wahl('wListe', MODI, 'liste', w => w.split(':')[0]);
  $('listeText').textContent = MODI[E.liste].split(': ')[1] + '.';
  const buch = ladeBuch(localStorage), z = ladeZustand(localStorage);
  $('buchKopf').textContent = `Flugbuch (${buch.length} ${buch.length === 1 ? 'Flug' : 'Flüge'})`;
  $('buchListe').innerHTML = buch.length ? '' : '<p>Noch kein Flug eingetragen.</p>';
  for (const b of buch) { const d = document.createElement('div'); d.textContent = buchZeile(b); $('buchListe').appendChild(d); }
  $('ganzStand').textContent = `Im Tank sind ${Math.round(z.sprit / 0.72)} Liter.`;
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
$('bGanz').onclick = () => los('ganz');
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
    if (geher) { geher.kurs -= dx * 0.005; blick.el = Math.max(-0.7, Math.min(0.7, blick.el + dy * 0.004)); }
    else if (E.kamera === 'cockpit') { blick.az = Math.max(-2.9, Math.min(2.9, blick.az - dx * 0.005)); blick.el = Math.max(-0.5, Math.min(1.0, blick.el + dy * 0.004)); }
    else if (E.kamera === 'hinten') { blick.az -= dx * 0.006; blick.el = Math.max(-0.2, Math.min(1.25, blick.el + dy * 0.005)); }
  });
  const los = ev => {
    if (!zieh || ev.pointerId !== zieh.id) return;
    const jetzt = performance.now();
    if (zieh.weg < 8 && jetzt - zieh.t < 300) { if (jetzt - letzterTipp < 400 && !geher) kam.mitte(); letzterTipp = jetzt; }
    zieh = null;
  };
  gl.addEventListener('pointerup', los); gl.addEventListener('pointercancel', los);
  gl.addEventListener('wheel', ev => { if (!imMenue && E.kamera === 'hinten') { blick.weit = Math.max(6, Math.min(120, blick.weit * Math.exp(ev.deltaY * 0.0012))); ev.preventDefault(); } }, { passive: false });
}

const touch = istTouch ? baueTouch(eingabe, { brett: () => eingabe.druecke('brett'), liste: () => eingabe.druecke('liste'), kamera: () => eingabe.druecke('kamera'), menue, weg: () => eingabe.druecke('weg'), blickMitte: () => kam.mitte(), mitte: () => { neigung.mitte(); empfang.senden({ k: 'mitte' }); melde('Diese Haltung ist jetzt die Mitte', 'info', 2); }, neigen: () => $('bNeigen').onclick() }) : null;
document.body.classList.toggle('mit-touch', !!touch);

// Zum Testen: __flugsim.angehalten = true hält die eigene Schleife an, step(n) rechnet n Bilder (je 1/60 s) vor.
window.__flugsim = { tempo, kam, f, E, blick, eingabe, neigung, empfang, welt, STARTS, LEKTIONEN, STELLEN, los, menue, zeigeErgebnis, schreibeFlugbuch, get ablauf() { return ablauf; }, get geher() { return geher; }, get unterricht() { return unterricht; }, get spur() { return spur; }, angehalten: false, step(n = 1) { for (let i = 0; i < n; i++) bild(1 / 60, i < n - 1); }, get flug() { return flug; } };
maleMenue();
if (frage.has('lektion')) { const l = LEKTIONEN.find(x => x.id === frage.get('lektion')); if (l) los(l); }
else if (frage.has('ganz')) { if (MODI[frage.get('ganz')]) E.liste = frage.get('ganz'); los('ganz'); }
else if (frage.has('start')) { if (STARTS[frage.get('start')]) E.start = frage.get('start'); los(null); }
requestAnimationFrame(schleife);
