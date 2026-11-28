// Flugsimulator – die Seite auf dem Handy: Das Handy ist der Steuerknüppel.
// Neigen = Quer- und Höhenruder, rechts der Gashebel, unten der Schieber für das Seitenruder und die Bremse,
// links Klappen und Trimmung. 30-mal pro Sekunde geht der Stand ans Spiel.
// Testen ohne Handy: steuer.html?c=CODE&lokal in einem zweiten Fenster, dann __steuer.start() und __steuer.neigung.sensor(beta, gamma).
// In der App (iPhone) gibt es die Seite auch ohne Code: steuer.html?nah sucht direkt ein iPad in der Nähe (Multipeer, ohne Internet).
import { Neigung } from './neigung.js';
import { KnueppelSender } from './verbindung.js';
import { inApp, ruetteln, merkeRolle } from './native.js';

const $ = id => document.getElementById(id);
const frage = new URLSearchParams(location.search);
const lokal = frage.has('lokal');
const nah = inApp && frage.has('nah');
const neigung = new Neigung();
const z = { gas: 0, seite: 0, seiteZiel: 0, bremse: 0, gasZeit: 0, nummer: 0 };       // was außer dem Neigen gesendet wird (gasZeit = wann der Gashebel zuletzt bewegt wurde)
let sender = null, laeuft = false;

$('code').value = (frage.get('c') || '').toUpperCase().slice(0, 4);
if (nah) {
  // In der App braucht es keinen Code. Dafür gibt es den Weg zurück: Dieses Gerät zeigt wieder selbst das Spiel.
  $('titel').textContent = '✈️ Dieses iPhone ist der Steuerknüppel';
  $('code').hidden = true; $('nahText').hidden = false; $('bSpiel').hidden = false; $('bSpielStart').hidden = false;
  const zumSpiel = () => { merkeRolle(null); if (sender) sender.trennen(); location.href = 'index.html'; };
  $('bSpiel').addEventListener('click', zumSpiel); $('bSpielStart').addEventListener('click', zumSpiel);
}

function zeigeStand(s) {
  const text = { sucht: nah ? 'suche ein iPad mit dem Flugsimulator …' : 'suche das Spiel …', verbunden: nah && sender && sender.gegenueber ? '✅ ' + sender.gegenueber : 'verbunden ✔',
    fehler: 'keine Verbindung (Internet? Code richtig?)', nahFehler: 'keine Verbindung – bitte WLAN oder Bluetooth einschalten' }[s] || s;
  $('stand').textContent = text; $('stand').className = s === 'verbunden' ? 'gut' : s === 'fehler' || s === 'nahFehler' ? 'schlecht' : '';
  $('startStand').textContent = text;
}

// Los: muss aus einem Fingertipp kommen, weil iPhone und iPad dann nach dem Bewegungssensor fragen.
async function start() {
  const code = $('code').value.trim().toUpperCase();
  if (!nah && !/^[A-Z0-9]{4}$/.test(code)) { $('startStand').textContent = 'Bitte den Code mit 4 Zeichen aus dem Spiel eintippen.'; return false; }
  const ok = await neigung.start();
  if (!ok && !lokal) { $('startStand').textContent = 'Der Bewegungssensor ist nicht freigegeben. Ohne ihn geht der Knüppel nicht.'; return false; }
  neigung.an = true;
  if (!sender) {
    sender = new KnueppelSender(code, lokal, nah);
    sender.wennZustand = zeigeStand;
    sender.wennDaten = vomSpiel;
    sender.start();
  }
  $('start').style.display = 'none';
  if (!laeuft) { laeuft = true; setInterval(senden, 1000 / 30); requestAnimationFrame(malen); }
  // Bildschirm soll nicht ausgehen, solange man fliegt (geht nicht auf jedem Gerät)
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* dann eben nicht */ }
  return true;
}
$('bLos').addEventListener('click', start);

// Was das Spiel zurückmeldet: Tempo, Höhe, Klappen – und Rütteln beim Aufsetzen (nur Android kann rütteln)
function vomSpiel(m) {
  if (m.k === 'i') {
    $('zTempo').textContent = m.ias; $('zHoehe').textContent = m.boden ? 'Boden' : m.hoehe; $('zKlappen').textContent = m.klappen + '°';
    $('warn').textContent = m.abriss ? '⚠ ZU LANGSAM – Nase runter!' : '';
    // Wer den Gashebel gerade nicht anfasst, sieht das Gas aus dem Spiel (dort kann es auch die Tastatur oder ein neuer Start verstellen)
    // Autopilot: Welche Teile halten gerade? (Höhe, Kurs, Tempo) – der Knopf wird grün
    if (Array.isArray(m.ap)) ['bApH', 'bApK', 'bApT'].forEach((id, i) => $(id).classList.toggle('haelt', !!m.ap[i]));
    if (typeof m.gas === 'number' && performance.now() - z.gasZeit > 700) gasZeigen(m.gas);
  } else if (m.k === 'r') {
    if (inApp) ruetteln(m.s === 'schwer' ? 1 : 0.5);      // in der App rüttelt auch das iPhone
    else try { if (navigator.vibrate) navigator.vibrate(m.s === 'schwer' ? [120, 60, 160] : 60); } catch (e) { /* egal */ }
  }
  else if (m.k === 'mitte') neigung.mitte();
  else if (m.k === 'p') { if (sender) sender.senden(m); }      // „Ping“: gleich zurückschicken, das Spiel misst daran die Verspätung des Funks
}

function senden() {
  // Die Pedale laufen kurz weich hoch, damit das Flugzeug nicht ruckt
  z.seite += Math.max(-0.1, Math.min(0.1, z.seiteZiel - z.seite));           // höchstens 0,1 je Nachricht: voller Weg in einer Drittelsekunde
  const m = { k: 's', q: +neigung.quer.toFixed(3), h: +neigung.hoehe.toFixed(3), s: +z.seite.toFixed(3), b: z.bremse };
  // Für den Flugrekorder im Spiel: laufende Nummer (so merkt das Spiel verlorene Nachrichten), die rohe Haltung des Handys in Grad
  // (gedreht, gekippt – vor toter Mitte und Kurve) und die eingestellte Empfindlichkeit
  m.n = z.nummer++; m.rg = +(neigung.rollGrad || 0).toFixed(1); m.ng = +(neigung.nickGrad || 0).toFixed(1); m.e = neigung.stufe;
  if (performance.now() - z.gasZeit < 500) m.g = +z.gas.toFixed(3);          // Gas nur mitschicken, solange der Hebel bewegt wird
  if (sender) sender.senden(m);
}
function malen() {
  $('punkt').style.transform = `translate(${neigung.quer * 190}%, ${neigung.hoehe * 190}%)`;      // ziehen = Punkt nach unten, wie ein echter Knüppel
  requestAnimationFrame(malen);
}

// ---------------------------------------------------------------- Knöpfe
const knopf = (id, runter, hoch) => {
  const b = $(id);
  b.addEventListener('pointerdown', ev => { ev.preventDefault(); b.classList.add('unten'); try { b.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ } ruetteln(0.2); runter(); });
  const los = () => { b.classList.remove('unten'); if (hoch) hoch(); };
  b.addEventListener('pointerup', los); b.addEventListener('pointercancel', los);
};
const tipp = a => () => { if (sender) sender.senden({ k: 't', a }); };
knopf('bKlEin', tipp('klappenEin')); knopf('bKlAus', tipp('klappenAus'));
knopf('bTrH', tipp('trimmHoch'), tipp('trimmAus')); knopf('bTrR', tipp('trimmRunter'), tipp('trimmAus'));
knopf('bKamera', tipp('kamera')); knopf('bPause', tipp('pause')); knopf('bMarke', tipp('marke'));      // ❗ = Marke im Flugrekorder: „Hier war es komisch“
knopf('bApH', tipp('apHoehe')); knopf('bApK', tipp('apKurs')); knopf('bApT', tipp('apTempo'));      // Autopilot: hält, was gerade anliegt. Ziel verstellen geht am Spiel-Bildschirm
knopf('bMitte', () => neigung.mitte());
knopf('bStufe', () => { $('bStufe').textContent = '🎚 ' + neigung.stufeWeiter(); });
$('bStufe').textContent = '🎚 ' + neigung.stufe;
// Seitenruder: ein Schieber statt zwei Knöpfen. Mit Knöpfen gab es nur „voll“ oder „gar nicht“ – damit schlingert jedes Flugzeug.
// Wo der Daumen aufsetzt, ist die Mitte (man muss nicht hinschauen). PEDAL_WEG = so weit schieben (Anteil der Feldbreite) ist voller Ausschlag,
// PEDAL_WEICH = um die Mitte herum feiner (1 = gleichmäßig). Loslassen = Ruder zurück in die Mitte.
const PEDAL_WEG = 0.32, PEDAL_WEICH = 1.5;
const pedal = $('pedalFeld'); let pedalFinger = null, pedalStart = 0;
const pedalZeigen = () => {
  $('pedalKnopf').style.transform = `translateX(${(z.seiteZiel * 280).toFixed(0)}%)`;
  $('pedalText').textContent = z.seiteZiel ? `Seitenruder ${z.seiteZiel < 0 ? '◀ links' : 'rechts ▶'} ${Math.round(Math.abs(z.seiteZiel) * 100)} %` : '◀ Seitenruder ▶ · Daumen auflegen und schieben';
};
function pedalVon(ev) {
  const weit = (ev.clientX - pedalStart) / (pedal.getBoundingClientRect().width * PEDAL_WEG), a = Math.min(1, Math.abs(weit));
  z.seiteZiel = Math.sign(weit) * Math.pow(a, PEDAL_WEICH); pedalZeigen();
}
pedal.addEventListener('pointerdown', ev => { ev.preventDefault(); if (pedalFinger !== null) return; pedalFinger = ev.pointerId; pedalStart = ev.clientX; pedal.classList.add('unten'); try { pedal.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ } ruetteln(0.2); pedalVon(ev); });
pedal.addEventListener('pointermove', ev => { if (ev.pointerId === pedalFinger) pedalVon(ev); });
const pedalLos = ev => { if (ev.pointerId !== pedalFinger) return; pedalFinger = null; z.seiteZiel = 0; pedal.classList.remove('unten'); pedalZeigen(); };
pedal.addEventListener('pointerup', pedalLos); pedal.addEventListener('pointercancel', pedalLos);
knopf('bBremse', () => { z.bremse = 1; }, () => { z.bremse = 0; });

// Gashebel: Der Finger schiebt den Balken, er bleibt stehen, wo man loslässt.
const feld = $('gasFeld');
function gasZeigen(g) { z.gas = Math.max(0, Math.min(1, g)); $('gasBalken').style.height = (z.gas * 100) + '%'; $('gasText').textContent = 'Gas ' + Math.round(z.gas * 100) + ' %'; }
const gasSetzen = g => { z.gasZeit = performance.now(); gasZeigen(g); };
const gasVon = ev => { const r = feld.getBoundingClientRect(); gasSetzen(1 - (ev.clientY - r.top - 10) / (r.height - 20)); };
feld.addEventListener('pointerdown', ev => { ev.preventDefault(); try { feld.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ } gasVon(ev); });
feld.addEventListener('pointermove', ev => { if (ev.buttons || ev.pointerType === 'touch') gasVon(ev); });

window.addEventListener('contextmenu', ev => ev.preventDefault());
window.__steuer = { neigung, z, start, gasSetzen, get sender() { return sender; } };
