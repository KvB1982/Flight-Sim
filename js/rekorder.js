// Flugsimulator – der Flugrekorder. Er schreibt bei jedem Flug mit, was wirklich passiert:
//   - was der Pilot steuert (Knüppel, Pedal, Gas) und wie das Handy dabei gehalten wird,
//   - was die Hilfe dazugibt,
//   - was das Flugzeug macht (Tempo, Höhe, Nase, Schräglage, Schieben, Drehen),
//   - wie gut der Funk zum Handy ist (Lücken, verlorene Nachrichten, Verspätung),
//   - Ereignisse (Abriss, Aufsetzen, Bruch) und Marken („Hier war es komisch“).
// Aus einer Aufzeichnung liest das Werkzeug tools/rekorder.mjs heraus, wo es hakt, und fliegt den Flug nach.
// Ohne three.js. Der obere Teil läuft auch in node, nur Merken und Teilen brauchen den Browser.

const GRAD = 180 / Math.PI, KN = 0.514444;
export const RATE = 30;              // so oft pro Sekunde wird eine Zeile geschrieben (so oft sendet auch das Handy)
export const STAND_ALLE = 2;         // alle 2 s der ganze Zustand des Flugzeugs: Von dort aus kann man nachfliegen
export const LAENGE_MAX = 45 * 60;   // länger als 45 Minuten wird nicht mitgeschrieben (der Speicher soll nicht volllaufen)
export const KURZ = 10;              // Flüge unter 10 Sekunden werden nicht gemerkt
export const MERKEN = 12;            // so viele Flüge bleiben auf dem Gerät

const WOMIT = ['Tastatur', 'Handy', 'Neigen', 'Touch', 'Gamepad'], HILFEN = ['leicht', 'mittel', 'echt'];

// Jede Spalte: Name, womit malgenommen wird (gespeichert werden ganze Zahlen, das spart viel Platz), und woher der Wert kommt.
// f = Flugzeug, c = { e: Eingabe des Piloten, a: was nach der Hilfe ans Flugzeug geht, funk, roh: [rollGrad, nickGrad], hilfe, womit, raffer }
export const SPALTEN = [
  ['t', 1000, f => f.t],                                  // Zeit seit Flugbeginn (s)
  ['eh', 1000, (f, c) => c.e.hoehe], ['eq', 1000, (f, c) => c.e.quer], ['es', 1000, (f, c) => c.e.seite],     // Pilot: Höhe, Quer, Seite
  ['eg', 1000, (f, c) => c.e.gas], ['eb', 100, (f, c) => c.e.bremse],
  ['ah', 1000, (f, c) => c.a.hoehe], ['aq', 1000, (f, c) => c.a.quer], ['as', 1000, (f, c) => c.a.seite],     // nach der Hilfe
  ['rh', 1000, f => f.ruder.hoehe], ['rq', 1000, f => f.ruder.quer], ['rs', 1000, f => f.ruder.seite],        // wo die Ruder wirklich stehen
  ['ias', 10, f => f.ias / KN],                           // Tempo (kn)
  ['y', 10, f => f.p[1]], ['hg', 10, f => f.hoeheGrund],  // Höhe und Höhe über Grund (m)
  ['steig', 100, f => f.steig],                           // Steigen (m/s)
  ['kurs', 10, f => f.kurs * GRAD], ['nick', 10, f => f.nick * GRAD], ['roll', 10, f => f.roll * GRAD],       // Lage (Grad)
  ['schiebe', 10, f => f.schiebe * GRAD], ['alpha', 10, f => f.alpha * GRAD],
  ['wn', 10, f => -f.w[0] * GRAD], ['wg', 10, f => -f.w[1] * GRAD], ['wr', 10, f => f.w[2] * GRAD],           // Drehen: Nase hoch, Nase rechts, rechts rollen (Grad/s)
  ['last', 100, f => f.last], ['abriss', 100, f => f.abriss], ['kugel', 100, f => f.kugel],
  ['gas', 1000, f => f.gas], ['trimm', 1000, f => f.trimm], ['kl', 1, f => f.klappenStufe], ['boden', 1, f => f.amBoden ? 1 : 0],
  ['x', 1, f => f.p[0]], ['z', 1, f => f.p[2]],
  ['rg', 10, (f, c) => c.roh ? c.roh[0] : 0], ['ng', 10, (f, c) => c.roh ? c.roh[1] : 0],                     // Handy roh: gedreht, gekippt (Grad)
  ['fl', 1, (f, c) => c.funk ? c.funk.luecke : 0],        // längste Pause zwischen zwei Handy-Nachrichten seit der letzten Zeile (ms)
  ['fv', 1, (f, c) => c.funk ? c.funk.verloren : 0],      // verlorene Handy-Nachrichten bisher
  ['fp', 1, (f, c) => c.funk ? c.funk.runde : 0],         // Funk hin und zurück (ms), zuletzt gemessen
  ['hilfe', 1, (f, c) => HILFEN.indexOf(c.hilfe)], ['womit', 1, (f, c) => WOMIT.indexOf(c.womit)], ['raffer', 1, (f, c) => c.raffer ? 1 : 0]
];

const r5 = v => Math.round(v * 1e5) / 1e5;
// Der ganze Zustand des Flugzeugs: genug, um von hier aus weiterzurechnen
export function standVon(f) {
  return { t: r5(f.t), p: f.p.map(r5), v: f.v.map(r5), q: f.q.map(v => Math.round(v * 1e7) / 1e7), w: f.w.map(r5), gas: r5(f.gas), trimm: r5(f.trimm), klappen: r5(f.klappen), kl: f.klappenStufe,
    sprit: r5(f.sprit), bremse: r5(f.bremse), ruder: [r5(f.ruder.hoehe), r5(f.ruder.quer), r5(f.ruder.seite)], boden: f.amBoden ? 1 : 0, luftZeit: r5(f.luftZeit), bodenZeit: r5(f.bodenZeit),
    rad: f.rad.map(r5), radQuer: f.radQuer.map(r5), radLang: f.radLang.map(r5), motor: f.motorAn ? 1 : 0, alphaTempo: r5(f.alphaTempo), trudelt: r5(f.trudelt), trudelRichtung: f.trudelRichtung,
    lastRuhig: r5(f.lastRuhig), zuSchnell: r5(f.zuSchnell), nn: f.nn || 0, kraft: f.motorKraft ?? 1 };
}
// … und umgekehrt: ein Flugzeug genau so hinstellen
export function standSetzen(f, s) {
  f.t = s.t; f.p = s.p.slice(); f.v = s.v.slice(); f.q = s.q.slice(); f.w = s.w.slice(); f.gas = s.gas; f.trimm = s.trimm; f.klappen = s.klappen; f.klappenStufe = s.kl;
  f.sprit = s.sprit; f.bremse = s.bremse; f.ruder = { hoehe: s.ruder[0], quer: s.ruder[1], seite: s.ruder[2] }; f.amBoden = !!s.boden; f.luftZeit = s.luftZeit; f.bodenZeit = s.bodenZeit;
  f.rad = s.rad.slice(); f.radQuer = s.radQuer.slice(); f.radLang = s.radLang.slice(); f.motorAn = !!s.motor; f.alphaTempo = s.alphaTempo; f.trudelt = s.trudelt; f.trudelRichtung = s.trudelRichtung;
  f.lastRuhig = s.lastRuhig; f.zuSchnell = s.zuSchnell; f.bruch = null; f.ereignisse.length = 0;
  if (s.nn) f.nn = s.nn; if (s.kraft !== 1) f.motorKraft = s.kraft;
  return f;
}

export class Rekorder {
  constructor() { this.an = false; }
  // kopf = was man über den Flug wissen muss: Art (frei, Lektion …), Hilfe, Wetter, Gerät
  beginn(kopf, f) {
    this.an = true; this.voll = false; this.kopf = { ...kopf }; this.sp = SPALTEN.map(() => []); this.staende = []; this.ereignisse = []; this.marken = [];
    this.letzte = -1; this.letzterStand = -1e9; this.alt = null; this.aufsetzer = f.ereignisse.length;
    this.ereignis(f, 'start', { hilfe: kopf.hilfe, womit: kopf.womit });
  }
  ereignis(f, art, mehr) { if (this.an) this.ereignisse.push({ t: +f.t.toFixed(2), art, ...mehr }); }
  marke(f, text) { if (!this.an) return 0; this.marken.push({ t: +f.t.toFixed(2), text: text || 'Hier war es komisch' }); return this.marken.length; }
  get dauer() { const t = this.sp && this.sp[0]; return t && t.length ? (t[t.length - 1] - t[0]) / 1000 : 0; }
  // Einmal je Bild aufrufen. Geschrieben wird nur, wenn seit der letzten Zeile genug Zeit vergangen ist.
  schritt(f, c) {
    if (!this.an || this.voll) return;
    this.wechsel(f, c);
    if (f.t - this.letzte < 1 / RATE - 1e-4) return;
    this.letzte = f.t;
    for (let i = 0; i < SPALTEN.length; i++) this.sp[i].push(Math.round((SPALTEN[i][2](f, c) || 0) * SPALTEN[i][1]));
    if (c.funk) c.funk.luecke = 0;                                    // die längste Pause zählt ab jetzt neu
    if (f.t - this.letzterStand >= STAND_ALLE) { this.letzterStand = f.t; this.staende.push(standVon(f)); }
    if (this.dauer > LAENGE_MAX) { this.voll = true; this.ereignis(f, 'voll'); }
  }
  // Was sich geändert hat, wird als Ereignis notiert: Abriss, Trudeln, Abheben, Aufsetzen, Bruch, Klappen, Hilfe, Steuerung
  wechsel(f, c) {
    const j = { abriss: f.abriss > 0.3, trudeln: f.trudelt > 0.5, boden: !!f.amBoden, bruch: f.bruch || '', kl: f.klappenStufe, hilfe: c.hilfe, womit: c.womit, raffer: !!c.raffer }, a = this.alt;
    if (a) {
      if (j.abriss !== a.abriss) this.ereignis(f, j.abriss ? 'abriss' : 'abrissEnde');
      if (j.trudeln !== a.trudeln) this.ereignis(f, j.trudeln ? 'trudeln' : 'trudelnEnde');
      if (j.boden !== a.boden) this.ereignis(f, j.boden ? 'boden' : 'abgehoben', { ias: +(f.ias / KN).toFixed(1) });
      if (j.bruch !== a.bruch && j.bruch) this.ereignis(f, 'bruch', { was: String(j.bruch) });
      if (j.kl !== a.kl) this.ereignis(f, 'klappen', { stufe: j.kl });
      if (j.hilfe !== a.hilfe) this.ereignis(f, 'hilfe', { hilfe: j.hilfe });
      if (j.womit !== a.womit) this.ereignis(f, 'womit', { womit: j.womit });
      if (j.raffer !== a.raffer) this.ereignis(f, j.raffer ? 'rafferAn' : 'rafferAus');
    }
    while (this.aufsetzer < f.ereignisse.length) { const x = f.ereignisse[this.aufsetzer++]; this.ereignis(f, 'aufsetzen', { sink: +(x.sink || 0).toFixed(2), ias: +(f.ias / KN).toFixed(1) }); }
    this.alt = j;
  }
  // Flug zu Ende: gibt die fertige Aufzeichnung zurück (oder null, wenn der Flug zu kurz war)
  ende(f, grund, mehr) {
    if (!this.an) return null;
    this.ereignis(f, 'ende', { grund });
    this.an = false;
    if (this.dauer < KURZ) return null;
    return packe({ kopf: { ...this.kopf, dauer: +this.dauer.toFixed(1), ...mehr }, sp: this.sp, staende: this.staende, ereignisse: this.ereignisse, marken: this.marken });
  }
}

// ---------------------------------------------------------------- Ein- und Auspacken
// Gespeichert wird je Spalte nur der Unterschied zur Zeile davor. Da stehen fast nur kleine Zahlen und viele Nullen – das lässt sich gut zusammendrücken.
export function packe(r) {
  const d = {};
  SPALTEN.forEach((s, i) => { const v = r.sp[i], o = new Array(v.length); for (let k = 0; k < v.length; k++) o[k] = k ? v[k] - v[k - 1] : v[k]; d[s[0]] = o; });
  return { art: 'flugsim-rekorder', v: 1, kopf: r.kopf, rate: RATE, mal: Object.fromEntries(SPALTEN.map(s => [s[0], s[1]])), d, staende: r.staende, ereignisse: r.ereignisse, marken: r.marken };
}
// Macht aus einer Aufzeichnung wieder echte Zahlen: { n, spalte: Float64Array … }
export function entpacke(a) {
  if (!a || a.art !== 'flugsim-rekorder') throw new Error('Das ist keine Aufzeichnung des Flugrekorders.');
  const o = { n: 0 };
  for (const name in a.d) {
    const v = a.d[name], mal = a.mal[name] || 1, z = new Float64Array(v.length); let summe = 0;
    for (let k = 0; k < v.length; k++) { summe += v[k]; z[k] = summe / mal; }
    o[name] = z; o.n = v.length;
  }
  return o;
}
export const womitName = n => WOMIT[n] || '?', hilfeName = n => HILFEN[n] || '?';

// ---------------------------------------------------------------- Nur im Browser: auf dem Gerät merken und teilen
const DB = 'flugsim.rekorder', LAGER = 'fluege';
function lager(schreiben) {
  return new Promise((ok, nein) => {
    const auf = indexedDB.open(DB, 1);
    auf.onupgradeneeded = () => auf.result.createObjectStore(LAGER, { keyPath: 'id' });
    auf.onerror = () => nein(auf.error);
    auf.onsuccess = () => ok(auf.result.transaction(LAGER, schreiben ? 'readwrite' : 'readonly').objectStore(LAGER));
  });
}
const warte = anfrage => new Promise((ok, nein) => { anfrage.onsuccess = () => ok(anfrage.result); anfrage.onerror = () => nein(anfrage.error); });
// Aufzeichnung merken; die ältesten fliegen raus, wenn es mehr als MERKEN sind
export async function merkeFlug(a) {
  const id = Date.now(); a.kopf.id = id;
  const l = await lager(true); await warte(l.put({ id, kopf: a.kopf, a }));
  const alle = await warte((await lager(false)).getAllKeys());
  if (alle.length > MERKEN) { const weg = await lager(true); for (const k of alle.slice(0, alle.length - MERKEN)) weg.delete(k); }
  return id;
}
// Liste der gemerkten Flüge (nur die Köpfe, neueste zuerst)
export async function ladeFluege() { try { return (await warte((await lager(false)).getAll())).map(x => x.kopf).reverse(); } catch (e) { return []; } }
export async function ladeFlug(id) { const x = await warte((await lager(false)).get(id)); return x ? x.a : null; }
export async function loescheFlug(id) { await warte((await lager(true)).delete(id)); }

export function dateiName(kopf) {
  const d = new Date(kopf.id || Date.now()), zwei = n => String(n).padStart(2, '0');
  return `flug_${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}_${zwei(d.getHours())}${zwei(d.getMinutes())}_${kopf.hilfe}`;
}
// Zusammendrücken (gzip), wenn der Browser das kann – eine Aufzeichnung wird dabei etwa zehnmal kleiner
async function druecke(text) {
  if (typeof CompressionStream === 'undefined') return null;
  try { return await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob(); } catch (e) { return null; }
}
const alsBase64 = blob => new Promise((ok, nein) => { const l = new FileReader(); l.onload = () => ok(String(l.result).split(',')[1]); l.onerror = () => nein(l.error); l.readAsDataURL(blob); });
// Flug teilen. Drei Wege, der erste, der geht, gewinnt:
//   1. in der App: Datei schreiben und das „Teilen“-Blatt von iPhone und iPad öffnen (Plugins Filesystem und Share),
//   2. im Browser auf dem Handy: das „Teilen“-Blatt des Browsers,
//   3. sonst: die Datei herunterladen.
// Gibt zurück, welcher Weg es war ('app', 'teilen', 'datei') oder 'abbruch'.
export async function teile(a) {
  const text = JSON.stringify(a), gz = await druecke(text);
  const blob = gz || new Blob([text], { type: 'application/json' }), name = dateiName(a.kopf) + (gz ? '.json.gz' : '.json');
  const P = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins;
  if (P && P.Filesystem && P.Share) {
    try {
      const geschrieben = await P.Filesystem.writeFile({ path: name, data: await alsBase64(blob), directory: 'CACHE' });
      await P.Share.share({ title: 'Flugrekorder', files: [geschrieben.uri] });
      return 'app';
    } catch (e) { if (/cancel/i.test(String(e && e.message))) return 'abbruch'; /* sonst den nächsten Weg probieren */ }
  }
  try {
    const datei = new File([blob], name, { type: gz ? 'application/gzip' : 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [datei] })) { await navigator.share({ files: [datei], title: 'Flugrekorder' }); return 'teilen'; }
  } catch (e) { if (e && e.name === 'AbortError') return 'abbruch'; }
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; document.body.appendChild(link); link.click();
  setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 2000);
  return 'datei';
}
