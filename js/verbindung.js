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
const PEERJS = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
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
export function eigenerCode() {
  try { const c = localStorage.getItem(SPEICHER); if (c && /^[A-Z0-9]{4}$/.test(c)) return c; } catch (e) { /* dann eben ein neuer */ }
  let c = ''; for (let i = 0; i < 4; i++) c += ZEICHEN[Math.floor(Math.random() * ZEICHEN.length)];
  try { localStorage.setItem(SPEICHER, c); } catch (e) { /* egal */ }
  return c;
}
// Adresse, die das Handy öffnen soll. Bewegungssensoren gehen nur über https, deshalb zeigt der QR-Code von localhost aus auf GitHub Pages.
export function handyAdresse(code, lokal) {
  const hier = new URL('steuer.html', location.href);
  hier.search = '?c=' + code + (lokal ? '&lokal' : '');
  return hier.href;
}

// ---------------------------------------------------------------- im Spiel: auf das Handy warten
export class KnueppelEmpfang {
  constructor(lokal) {
    this.code = eigenerCode(); this.lokal = lokal; this.zustand = 'aus'; this.verbunden = false;
    this.wennDaten = null; this.wennZustand = null; this.conn = null; this.kanal = null; this.zuletzt = 0;
  }
  melde(z) { this.zustand = z; this.verbunden = z === 'verbunden'; if (this.wennZustand) this.wennZustand(z); }
  start() {
    if (this.zustand !== 'aus') return;
    this.melde('wartet');
    if (this.lokal) {
      this.kanal = new BroadcastChannel(VORSILBE + this.code);
      this.kanal.onmessage = ev => { const m = ev.data; if (!m || m.von !== 'handy') return; this.zuletzt = performance.now(); if (!this.verbunden) this.melde('verbunden'); if (this.wennDaten) this.wennDaten(m); };
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
    if (this.kanal) this.kanal.postMessage({ ...m, von: 'spiel' });
    else if (this.conn && this.conn.open) this.conn.send(m);
  }
  // Kommt eine Sekunde lang nichts mehr, gilt das Handy als weg (Bildschirm aus, Funkloch)
  pruefen() { if (this.verbunden && this.kanal && performance.now() - this.zuletzt > 1500) this.melde('wartet'); }
}

// ---------------------------------------------------------------- auf dem Handy: zum Spiel verbinden
export class KnueppelSender {
  constructor(code, lokal) { this.code = code; this.lokal = lokal; this.zustand = 'aus'; this.wennDaten = null; this.wennZustand = null; }
  melde(z) { this.zustand = z; if (this.wennZustand) this.wennZustand(z); }
  start() {
    this.melde('sucht');
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
    if (this.kanal) this.kanal.postMessage({ ...m, von: 'handy' });
    else if (this.conn && this.conn.open) this.conn.send(m);
  }
}
