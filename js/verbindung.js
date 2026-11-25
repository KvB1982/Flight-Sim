// Flugsimulator – die Verbindung zwischen dem Handy (Steuerknüppel) und dem Gerät mit dem Spiel.
// Aufbau wie im Rennspiel (js/verbindung.js dort):
//   1. Das Spiel denkt sich einen Code mit 4 Zeichen aus und zeigt ihn als QR-Code.
//   2. Das Handy öffnet steuer.html?c=CODE.
//   3. Ein Vermittler im Internet (PeerJS) stellt beide einander vor, danach reden sie direkt miteinander.
// Zum Testen ohne Internet: zwei Fenster desselben Browsers mit ?lokal (BroadcastChannel).
// Die Nachrichten sind dieselben wie beim Steuerknüppel in Frontlinie 3, nur mit deutschen Namen:
//   Handy → Spiel  { k: 's', q, h, g, s, b }   30-mal pro Sekunde: Querruder, Höhenruder, Gas, Seitenruder, Bremse
//                  { k: 't', a }                ein Knopf: 'klappenAus', 'klappenEin', 'trimmHoch', 'trimmRunter', 'kamera', 'pause', 'neu'
//   Spiel → Handy  { k: 'i', ias, hoehe, klappen, boden, abriss }   10-mal pro Sekunde, { k: 'r' } rütteln, { k: 'mitte' } neu kalibrieren
//   Für den Flugrekorder: 's' trägt dazu n (laufende Nummer), rg, ng (rohe Haltung in Grad), e (Empfindlichkeit); der Knopf 'marke';
//                  { k: 'p', t } einmal pro Sekunde vom Spiel, das Handy schickt es sofort zurück (daran misst das Spiel die Verspätung)
//
// In der App (iPad und iPhone, Ordner ios/) gibt es zusätzlich den Weg ohne Internet: „NahLink“ benutzt Apples Multipeer
// wie Frontlinie 3 und das Rennspiel. Das iPad wartet, das iPhone sucht und verbindet sich mit dem ersten Flugsimulator
// in der Nähe. Die Nachrichten sind dieselben wie über PeerJS.
import { nahPlugin, bibliothek, inApp, NETZ_SEITE } from './native.js';

const PEERJS = bibliothek('peerjs.min.js', 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js');
const VORSILBE = 'flugsim-knueppel-';
const ZEICHEN = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SPEICHER = 'flugsim.code.v1';

let ladend = null;
function peerLaden() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (!ladend) ladend = new Promise((ok, nein) => {
    const s = document.createElement('script'); s.src = PEERJS; s.async = true;
    s.onload = () => ok(window.Peer); s.onerror = () => { ladend = null; nein(new Error('PeerJS nicht geladen')); };
    document.head.appendChild(s);
  });
  return ladend;
}

// ---------------------------------------------------------------- App: direkte Verbindung über Multipeer
// Zustände vom Plugin: searching (sucht oder wartet), connected, off, error. Es gibt nur einen NahLink (das Plugin auch nur einmal).
class NahLink {
  constructor(p) {
    this.p = p; this.zustand = 'off'; this.gegenueber = '';
    this.wennZustand = null; this.wennDaten = null;
    p.addListener('state', e => {
      this.zustand = e.state || 'off'; this.gegenueber = e.peer || '';
      if (this.wennZustand) this.wennZustand(this.zustand, this.gegenueber);
    });
    p.addListener('data', e => {
      let m = null;
      try { m = JSON.parse(e.d); } catch (err) { return; }
      if (m && typeof m === 'object' && this.wennDaten) this.wennDaten(m);
    });
  }
  rufe(name, arg) { try { const r = this.p[name](arg); if (r && r.catch) r.catch(() => {}); } catch (e) { /* egal */ } }
  warten() { this.rufe('host'); }     // iPad: zeigt den Flug
  suchen() { this.rufe('join'); }     // iPhone: ist der Steuerknüppel
  stop() { this.rufe('stop'); }
  // sicher = kommt bestimmt an (für Knöpfe); der Knüppel-Stand geht schnell und darf mal verloren gehen
  senden(m, sicher = false) { if (this.zustand === 'connected') this.rufe('send', { d: JSON.stringify(m), reliable: sicher }); }
}
let nahEiner = null;
export function nahLink() {
  const p = nahPlugin();
  if (!p) return null;
  return nahEiner || (nahEiner = new NahLink(p));
}

export function eigenerCode() {
  try { const c = localStorage.getItem(SPEICHER); if (c && /^[A-Z0-9]{4}$/.test(c)) return c; } catch (e) { /* dann eben ein neuer */ }
  let c = ''; for (let i = 0; i < 4; i++) c += ZEICHEN[Math.floor(Math.random() * ZEICHEN.length)];
  try { localStorage.setItem(SPEICHER, c); } catch (e) { /* egal */ }
  return c;
}
// Adresse, die das Handy öffnen soll. Aus der App heraus zeigt sie auf die Seite im Internet (GitHub Pages),
// weil ein fremdes Handy die Dateien in der App nicht erreicht.
export function handyAdresse(code, lokal) {
  const hier = new URL('steuer.html', inApp ? NETZ_SEITE : location.href);
  hier.search = '?c=' + code + (lokal ? '&lokal' : '');
  return hier.href;
}

// ---------------------------------------------------------------- im Spiel: auf das Handy warten
export class KnueppelEmpfang {
  constructor(lokal) {
    this.code = eigenerCode(); this.lokal = lokal; this.zustand = 'aus'; this.verbunden = false;
    this.wennDaten = null; this.wennZustand = null; this.conn = null; this.kanal = null; this.zuletzt = 0;
    this.nah = null; this.nahVerbunden = false; this.geraet = ''; this.netz = 'aus';      // netz = Stand des Wegs über das Internet (QR-Code)
  }
  // Es gibt zwei Wege: das iPhone in der Nähe (nur in der App) und das Handy über das Internet. melde() bekommt den Stand
  // des Internet-Wegs; daraus und aus dem Weg in der Nähe wird der Zustand, den das Spiel sieht:
  // aus, nah (wartet nur auf ein iPhone in der Nähe), wartet, verbunden, fehler.
  melde(z) { this.netz = z; this.rechne(); }
  rechne() {
    const z = this.nahVerbunden || this.netz === 'verbunden' ? 'verbunden' : this.netz !== 'aus' ? this.netz : this.nah ? 'nah' : 'aus';
    if (z === this.zustand) return;
    this.zustand = z; this.verbunden = z === 'verbunden'; if (this.wennZustand) this.wennZustand(z);
  }
  // App: auf ein iPhone in der Nähe warten (Multipeer). Läuft vom Start der App an, ohne Code und ohne Internet.
  nahStarten() {
    const nah = this.nah = nahLink();
    if (!nah) return false;
    nah.wennDaten = m => { this.zuletzt = performance.now(); if (this.wennDaten) this.wennDaten(m); };
    nah.wennZustand = (z, wer) => {
      this.nahVerbunden = z === 'connected';
      if (this.nahVerbunden) this.geraet = String(wer || 'iPhone').slice(0, 30);
      this.rechne();
    };
    nah.warten();
    this.rechne();
    return true;
  }
  start() {
    if (this.netz !== 'aus') return;
    this.melde('wartet');
    if (this.lokal) {
      this.kanal = new BroadcastChannel(VORSILBE + this.code);
      this.kanal.onmessage = ev => { const m = ev.data; if (!m || m.von !== 'handy') return; this.zuletzt = performance.now(); if (this.netz !== 'verbunden') this.melde('verbunden'); if (this.wennDaten) this.wennDaten(m); };
      return;
    }
    peerLaden().then(Peer => {
      const peer = this.peer = new Peer(VORSILBE + this.code);
      peer.on('connection', c => {
        this.conn = c;
        c.on('open', () => this.melde('verbunden'));
        c.on('data', m => { this.zuletzt = performance.now(); if (m && typeof m === 'object' && this.wennDaten) this.wennDaten(m); });
        c.on('close', () => { this.conn = null; this.melde('wartet'); });
      });
      peer.on('error', () => this.melde('fehler'));
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* später noch einmal */ } });
    }).catch(() => this.melde('fehler'));
  }
  senden(m) {
    if (this.nahVerbunden) { this.nah.senden(m, m.k !== 'i' && m.k !== 'p'); return; }
    if (this.kanal) this.kanal.postMessage({ ...m, von: 'spiel' });
    else if (this.conn && this.conn.open) this.conn.send(m);
  }
  // Kommt eine Sekunde lang nichts mehr, gilt das Handy als weg (Bildschirm aus, Funkloch)
  pruefen() { if (this.netz === 'verbunden' && this.kanal && performance.now() - this.zuletzt > 1500) this.melde('wartet'); }
}

// ---------------------------------------------------------------- auf dem Handy: zum Spiel verbinden
export class KnueppelSender {
  // nah = true: in der App über Multipeer zum iPad in der Nähe (ohne Code und ohne Internet)
  constructor(code, lokal, nah = false) {
    this.code = code; this.lokal = lokal; this.nah = nah ? nahLink() : null; this.gegenueber = '';
    this.zustand = 'aus'; this.wennDaten = null; this.wennZustand = null;
  }
  melde(z) { this.zustand = z; if (this.wennZustand) this.wennZustand(z); }
  start() {
    this.melde('sucht');
    if (this.nah) {
      const nah = this.nah;
      nah.wennDaten = m => { if (this.wennDaten) this.wennDaten(m); };
      nah.wennZustand = (z, wer) => { this.gegenueber = wer || ''; this.melde(z === 'connected' ? 'verbunden' : z === 'error' ? 'nahFehler' : 'sucht'); };
      nah.suchen();
      return;
    }
    if (this.lokal) {
      this.kanal = new BroadcastChannel(VORSILBE + this.code);
      this.kanal.onmessage = ev => { const m = ev.data; if (m && m.von === 'spiel' && this.wennDaten) this.wennDaten(m); };
      this.melde('verbunden'); return;
    }
    peerLaden().then(Peer => {
      const peer = this.peer = new Peer();
      const verbinde = () => {
        const c = this.conn = peer.connect(VORSILBE + this.code, { reliable: false });
        c.on('open', () => this.melde('verbunden'));
        c.on('data', m => { if (m && typeof m === 'object' && this.wennDaten) this.wennDaten(m); });
        c.on('close', () => { this.melde('sucht'); setTimeout(verbinde, 1500); });
      };
      peer.on('open', verbinde);
      peer.on('error', () => { this.melde('fehler'); setTimeout(() => { if (this.zustand === 'fehler') { this.melde('sucht'); verbinde(); } }, 2500); });
    }).catch(() => this.melde('fehler'));
  }
  senden(m) {
    if (this.nah) { this.nah.senden(m, m.k !== 's' && m.k !== 'p'); return; }
    if (this.kanal) this.kanal.postMessage({ ...m, von: 'handy' });
    else if (this.conn && this.conn.open) this.conn.send(m);
  }
  trennen() { if (this.nah) this.nah.stop(); if (this.peer) this.peer.destroy(); }
}
