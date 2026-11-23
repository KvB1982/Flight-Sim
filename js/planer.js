// Flugsimulator – der Flugplaner auf dem Bildschirm: links die Karte zum Antippen, rechts der Plan mit der Rechnung.
// Die Rechnung selbst (Kurs, Zeit, Sprit) steht in navigation.js, die Karte malt karte.js.
import { Karte } from './karte.js';
import { PLAETZE } from './region.js';
import { rechne, punktNah, punktVon, AUSFLUEGE, grad3, REISE } from './navigation.js';
import { WETTER } from './atmosphaere.js';
import { FT, GRAD } from './flugzeuge.js';

const $ = id => document.getElementById(id);
const ART = { platz: 'Flugplatz', feuer: 'Funkfeuer', ort: 'Ort', see: 'See', gipfel: 'Gipfel' };
const SPRIT_MAX = 200;       // so viele Liter passen in den Tank (150 kg)

// Eine Karte mit dem Finger oder der Maus bedienen: ziehen = schieben, Mausrad oder zwei Finger = näher und weiter,
// kurzer Tipp = wennTipp(x, z) mit dem Ort in der Welt. Gibt nichts zurück; nach jeder Änderung wird neu() gerufen.
export function bediene(canvas, karte, neu, wennTipp) {
  const finger = new Map(); let weg = 0, abstand = 0;
  canvas.addEventListener('pointerdown', ev => { finger.set(ev.pointerId, [ev.clientX, ev.clientY]); weg = finger.size > 1 ? 99 : 0; abstand = 0; try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ } });
  canvas.addEventListener('pointermove', ev => {
    const alt = finger.get(ev.pointerId); if (!alt) return;
    finger.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (finger.size === 1) { const dx = ev.clientX - alt[0], dy = ev.clientY - alt[1]; weg += Math.abs(dx) + Math.abs(dy); if (weg > 6) { karte.schiebe(dx, dy); neu(); } }
    else if (finger.size === 2) {
      const [a, b] = [...finger.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), r = canvas.getBoundingClientRect();
      if (abstand > 0 && d > 0) { karte.zoome(abstand / d, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); neu(); }
      abstand = d;
    }
  });
  const hoch = ev => {
    if (!finger.has(ev.pointerId)) return;
    finger.delete(ev.pointerId); abstand = 0;
    if (ev.type === 'pointerup' && weg <= 6 && finger.size === 0 && wennTipp) { const r = canvas.getBoundingClientRect(), [x, z] = karte.welt(ev.clientX - r.left, ev.clientY - r.top); wennTipp(x, z); }
  };
  canvas.addEventListener('pointerup', hoch); canvas.addEventListener('pointercancel', hoch);
  canvas.addEventListener('wheel', ev => { const r = canvas.getBoundingClientRect(); karte.zoome(Math.exp(ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top); neu(); ev.preventDefault(); }, { passive: false });
}

export class Planer {
  // E = Einstellungen (E.plan = { ids, hoehe, sprit }, E.wetter), merke() speichert sie, wennLos(plan) startet den Flug
  constructor(E, merke, wennLos, wennZu) {
    this.E = E; this.merke = merke; this.karte = new Karte($('plBild')); this.an = false;
    if (!E.plan || !Array.isArray(E.plan.ids) || E.plan.ids.some(id => !punktVon(id))) E.plan = { ids: [...AUSFLUEGE[0].punkte], hoehe: AUSFLUEGE[0].hoehe, sprit: 90 };
    bediene($('plBild'), this.karte, () => this.maleKarte(), (x, z) => this.tipp(x, z));
    $('plPlus').onclick = () => { this.karte.zoome(0.7); this.maleKarte(); }; $('plMinus').onclick = () => { this.karte.zoome(1.4); this.maleKarte(); };
    $('plAlles').onclick = () => { this.passe(); this.maleKarte(); };
    $('plLeer').onclick = () => { E.plan.ids = ['lerchenfeld']; this.neu(); };
    $('plUm').onclick = () => { E.plan.ids.reverse(); this.neu(true); };
    $('plTiefer').onclick = () => { E.plan.hoehe = Math.max(2500, E.plan.hoehe - 500); this.neu(); }; $('plHoeher').onclick = () => { E.plan.hoehe = Math.min(11000, E.plan.hoehe + 500); this.neu(); };
    $('plWeniger').onclick = () => { E.plan.sprit = Math.max(20, E.plan.sprit - 10); this.neu(); }; $('plMehr').onclick = () => { E.plan.sprit = Math.min(SPRIT_MAX, E.plan.sprit + 10); this.neu(); };
    $('plLos').onclick = () => { const p = this.plan(); if (rechne(p, WETTER[E.wetter]).ok) { this.zu(); wennLos(p); } };
    $('plZurueck').onclick = () => { this.zu(); wennZu(); };
    window.addEventListener('resize', () => { if (this.an) this.maleKarte(); });
  }
  plan() { const P = this.E.plan; return { punkte: P.ids.map(punktVon), hoehe: P.hoehe, sprit: P.sprit }; }
  passe() { const p = this.plan().punkte; this.karte.passe(p.length > 1 ? p : PLAETZE.map(P => ({ x: P.mx, z: P.mz })), p.length > 1 ? 9000 : 12000); }
  auf() { this.an = true; $('planer').classList.add('an'); this.neu(true); }
  zu() { this.an = false; $('planer').classList.remove('an'); }
  // Auf die Karte getippt: Der nächste Punkt kommt in den Plan
  tipp(x, z) {
    const p = punktNah(x, z, Math.max(2500, this.karte.mpp * 22)), ids = this.E.plan.ids; if (!p) return;
    if (ids[ids.length - 1] === p.id) return;                                  // derselbe Punkt zweimal hintereinander gibt kein Bein
    const letzter = punktVon(ids[ids.length - 1]);
    // Ein Wegpunkt gehört vor das Ziel. Ein Flugplatz ist das neue Ziel.
    if (p.art !== 'platz' && ids.length >= 2 && letzter.art === 'platz') { if (ids[ids.length - 2] === p.id) return; ids.splice(ids.length - 1, 0, p.id); } else ids.push(p.id);
    this.neu();
  }
  neu(passen) { this.merke(); if (passen) { this.karte.masse(); this.passe(); } this.maleSeite(); this.maleKarte(); }
  maleKarte() { this.karte.male({ plan: this.plan().punkte }); }
  maleSeite() {
    const E = this.E, P = E.plan, plan = this.plan(), wetter = WETTER[E.wetter], R = rechne(plan, wetter);
    const aus = $('plAusfluege'); aus.innerHTML = '';
    let passt = null;
    for (const A of AUSFLUEGE) {
      const gleich = A.punkte.join() === P.ids.join(); if (gleich) passt = A;
      const b = document.createElement('button'); b.textContent = A.name; b.className = gleich ? 'an' : ''; b.onclick = () => { P.ids = [...A.punkte]; P.hoehe = A.hoehe; this.neu(true); }; aus.appendChild(b);
    }
    $('plAusflugText').textContent = passt ? passt.text : '';
    const liste = $('plPunkte'); liste.innerHTML = '';
    plan.punkte.forEach((p, i) => {
      const d = document.createElement('div'); d.className = 'plPunkt'; d.innerHTML = '<i></i><span></span><small></small>';
      d.querySelector('i').textContent = i === 0 ? 'S' : i === plan.punkte.length - 1 && p.art === 'platz' ? 'Z' : String(i); d.querySelector('span').textContent = p.name; d.querySelector('small').textContent = ART[p.art];
      const x = document.createElement('button'); x.className = 'klein'; x.textContent = '✕'; x.title = 'aus dem Plan nehmen'; x.onclick = () => { P.ids.splice(i, 1); if (!P.ids.length) P.ids = ['lerchenfeld']; this.neu(); }; d.appendChild(x);
      liste.appendChild(d);
    });
    $('plHoehe').textContent = `${P.hoehe} ft`; $('plSprit').textContent = `${P.sprit} Liter`;
    const w = $('plWetter'); w.innerHTML = '';
    for (const [key, W] of Object.entries(WETTER)) { const b = document.createElement('button'); b.textContent = W.name.replace(' von vorn', '').replace(' von links', '').replace(' von rechts', ''); b.className = E.wetter === key ? 'an' : ''; b.onclick = () => { E.wetter = key; this.neu(); }; w.appendChild(b); }
    const beine = $('plBeine'); beine.innerHTML = '';
    for (const b of R.beine) {
      const d = document.createElement('div'); d.innerHTML = '<b></b><b></b><span></span>';
      d.children[0].textContent = `${b.von.name} → ${b.nach.name}`; d.children[1].textContent = `Kurs ${grad3(b.steuer)}°`;
      d.children[2].textContent = `${b.strecke.toFixed(0)} NM · ${Math.round(b.min)} min · ${Math.round(b.liter)} Liter` + (Math.abs(b.vor) > 1.5 * GRAD ? ` · Linie ${grad3(b.kurs)}°, ${Math.round(Math.abs(b.vor) / GRAD)}° gegen den Wind vorhalten` : '') + ` · höchstes Gelände ${Math.round(b.hoch / 100) * 100} ft`;
      beine.appendChild(d);
    }
    $('plSumme').textContent = R.beine.length ? `Zusammen ${R.weit.toFixed(0)} NM in etwa ${Math.round(R.zeit)} Minuten bei ${REISE.tempo} kn. Sprit: ${Math.ceil(R.liter)} Liter, mit ${REISE.reserve} Minuten Reserve ${Math.ceil(R.noetig)} Liter. Mindesthöhe ${R.mindest} ft.` : '';
    const h = $('plHinweise'); h.innerHTML = '';
    for (const x of R.hinweise) { const d = document.createElement('div'); d.className = x.art; d.textContent = x.text; h.appendChild(d); }
    if (!R.hinweise.length) { const d = document.createElement('div'); d.className = 'gut'; d.textContent = 'Der Plan passt. Merk dir den Kurs für das erste Bein – oder schau im Flug auf die Karte (Taste M).'; h.appendChild(d); }
    $('plLos').disabled = !R.ok;
  }
}
export { FT };
