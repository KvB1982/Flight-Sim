// Flugsimulator – Zusätze für die iPad- und iPhone-App (Capacitor, wie im Rennspiel, in Frontlinie 3 und im Reitturnier).
// Im Browser ist hier alles aus: inApp ist false, nahPlugin() gibt null, ruetteln macht nichts.

const C = window.Capacitor;
export const inApp = !!(C && C.isNativePlatform && C.isNativePlatform());
if (inApp) document.documentElement.classList.add('app');

// In der App liegen PeerJS und der QR-Code auf dem Gerät (scripts/copy-web.mjs setzt FLUGSIM_LIB), sonst kommen sie aus dem Internet.
export const bibliothek = (datei, netz) => window.FLUGSIM_LIB ? window.FLUGSIM_LIB + datei : netz;

// Die Seite im Internet. Dorthin zeigt der QR-Code aus der App: Ein fremdes Handy kann die Dateien in der App nicht öffnen.
export const NETZ_SEITE = 'https://kvb1982.github.io/Flight-Sim/';

// Das Plugin „KnueppelLink“ (ios/App/App/AppDelegate.swift): iPad und iPhone finden sich direkt über WLAN
// oder Bluetooth (Apples Multipeer), ganz ohne Internet.
export const nahPlugin = () => (inApp && C.Plugins && C.Plugins.KnueppelLink) || null;

// Merkt sich, ob dieses Gerät der Steuerknüppel ist ('knueppel') oder selbst das Spiel zeigt (nichts gemerkt).
// index.html schaut beim Start nach und springt dann gleich zur Knüppel-Seite.
const ROLLE = 'flugsim.rolle.v1';
export function merkeRolle(r) { try { if (r) localStorage.setItem(ROLLE, r); else localStorage.removeItem(ROLLE); } catch (e) { /* dann eben nicht gemerkt */ } }

// Kurz rütteln (nur iPhones haben einen Vibrationsmotor, das iPad bleibt still)
let zuletzt = 0;
export function ruetteln(stark = 0.5) {
  const H = inApp && C.Plugins && C.Plugins.Haptics;
  const jetzt = performance.now();
  if (!H || jetzt - zuletzt < 110) return;
  zuletzt = jetzt;
  try { const p = H.impact({ style: stark > 0.7 ? 'HEAVY' : stark > 0.35 ? 'MEDIUM' : 'LIGHT' }); if (p && p.catch) p.catch(() => {}); } catch (e) { /* egal */ }
}
