// Flugsimulator – die Unterlagen auf dem Bildschirm: der Flugdurchführungsplan („Flugplan wie bei den Profis“)
// und die Flugplatzkarten für alle sechs Plätze. Die Zahlen dazu rechnet flugplan.js, hier wird nur gemalt.
//
// Aufgemacht wird das Fenster im Flugplaner, im Menü und im Flug (Taste F1 oder Knopf „Unterlagen“ – das Spiel hält so lange an).
import { Karte } from './karte.js';
import { PLAETZE, platzVon, platzWelt, NM } from './region.js';
import { grad3 } from './navigation.js';
import { flugplan, planBei, platzBlatt, uhr, himmel, fussMeer, bahnOrt, STARTLAUF, RUNDE_HOCH } from './flugplan.js';
import { FT, GRAD } from './flugzeuge.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text, eltern) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (eltern) eltern.appendChild(e); return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rund = (v, auf = 100) => Math.round(v / auf) * auf;
const ft = v => `${rund(v, 10)} ft`;
const WAS_FARBE = { steig: '#5fd07a', reise: '#7fc4ff', sink: '#ffc43c', eben: '#ffc43c', runde: '#ff9a5a' };
// Die drei Ausschnitte der Flugplatzkarte: so viele Meter sind von der Platzmitte bis zum Bildrand (an der kürzeren Seite) zu sehen
const AUSSCHNITTE = { platz: { name: 'Platz', halb: p => p.lang / 2 + 300 }, runde: { name: 'Platzrunde', halb: p => p.lang / 2 + 3300 }, umgebung: { name: 'Umgebung', halb: () => 12 * NM } };

export class Unterlagen {
  // wetter() = der Wind, der gerade eingestellt ist; wennZu() wird gerufen, wenn das Fenster zugeht
  constructor(wetter, wennZu) {
    this.wetter = wetter; this.wennZu = wennZu; this.an = false; this.tab = 'plan'; this.plan = null; this.F = null; this.minute = 0; this.jetzt = null; this.ausschnitt = 'runde';
    this.karte = new Karte($('ulKarte')); this.platzKarte = new Karte($('ulPlatzBild'));
    $('ulZu').onclick = () => this.zu();
    // Über das Höhenprofil fahren oder ziehen: Der Zeiger wandert durch den Flug
    const zieh = ev => { if (ev.type !== 'pointerdown' && !(ev.buttons & 1) && ev.pointerType === 'mouse') return; const r = $('ulProfil').getBoundingClientRect(); this.setze(this.zeitBei(ev.clientX - r.left)); };
    $('ulProfil').addEventListener('pointerdown', zieh); $('ulProfil').addEventListener('pointermove', zieh);
    $('ulRegler').oninput = () => this.setze(+$('ulRegler').value / 1000 * (this.F ? this.F.zeit : 0));
    window.addEventListener('resize', () => { if (this.an) this.male(); });
  }
  // was = { plan (aus dem Planer, darf fehlen), tab: 'plan' oder die id eines Platzes, minute: so weit ist der Flug schon (im Flug), f: das Flugzeug (im Flug) }
  auf(was = {}) {
    this.plan = was.plan && was.plan.punkte.length > 1 ? was.plan : null; this.F = this.plan ? flugplan(this.plan, this.wetter()) : null; if (this.F && !this.F.stuecke.length) this.F = null;
    this.jetzt = was.f ? { minute: was.minute || 0, hoehe: fussMeer(was.f.p[1]), x: was.f.p[0], z: was.f.p[2], kurs: was.f.kurs } : null;
    this.minute = this.F ? clamp(was.minute || 0, 0, this.F.zeit) : 0;
    this.tab = was.tab && (was.tab !== 'plan' || this.F) ? was.tab : this.F ? 'plan' : 'lerchenfeld';
    this.ausschnitt = 'runde'; this.an = true; $('unterlagen').classList.add('an'); this.male();
  }
  zu() { if (!this.an) return; this.an = false; $('unterlagen').classList.remove('an'); if (this.wennZu) this.wennZu(); }
  setze(minute) { if (!this.F) return; this.minute = clamp(minute, 0, this.F.zeit); this.maleJetzt(); }
  male() {
    // Die Reiter oben: der Flugplan (wenn es einen gibt) und die sechs Plätze. Plätze aus dem Plan stehen vorn und sind markiert.
    const reiter = $('ulReiter'); reiter.innerHTML = '';
    const imPlan = this.plan ? this.plan.punkte.filter(p => p.art === 'platz').map(p => p.id) : [];
    const knopf = (id, text, cls) => { const b = el('button', (this.tab === id ? 'an ' : '') + (cls || ''), text, reiter); b.onclick = () => { this.tab = id; this.male(); }; };
    if (this.F) knopf('plan', '📋 Flugplan');
    for (const P of [...PLAETZE].sort((a, b) => (imPlan.includes(b.id) ? 1 : 0) - (imPlan.includes(a.id) ? 1 : 0))) {
      const start = this.plan && P.id === imPlan[0], ziel = this.plan && imPlan.length > 1 && P.id === imPlan[imPlan.length - 1], rolle = start && ziel ? 'Start und Ziel: ' : start ? 'Start: ' : ziel ? 'Ziel: ' : '';
      knopf(P.id, '🛬 ' + rolle + P.name, imPlan.includes(P.id) ? 'dabei' : '');
    }
    const plan = this.tab === 'plan' && !!this.F;
    $('ulPlan').style.display = plan ? '' : 'none'; $('ulPlatz').style.display = plan ? 'none' : '';
    if (plan) this.malePlan(); else this.malePlatz(platzVon(this.tab) || PLAETZE[0]);
  }

  // ---------------------------------------------------------------- Der Flugdurchführungsplan
  malePlan() {
    const F = this.F, w = F.wind, P = this.plan;
    $('ulPlanKopf').textContent = `${F.start.name} (Piste ${F.bahnStart}) → ${F.ziel.name} (Piste ${F.bahnZiel}) · ${F.weit.toFixed(0)} NM · ${uhr(F.zeit)} min in der Luft · Reisehöhe ${rund(F.hoch)} ft · `
      + (w.kn ? `Wind aus ${grad3(w.aus * GRAD)}° mit ${w.kn} kn` : 'windstill') + ` · wahres Tempo in der Reisehöhe ${Math.round(F.tas)} kn`;
    // Die Tabelle: eine Zeile je Stelle im Plan. Rechts daneben steht, wie es von dort an weitergeht.
    const kopf = ['Zeit', 'Stelle', 'Höhe', 'ab hier', 'Steuerkurs', 'Kurs ü. Grund', 'Fahrtmesser', 'Strecke', 'Dauer', 'Sprit weg', 'Im Tank', 'Sichere Höhe', 'Funkfeuer'];
    const T = $('ulTabelle'); T.innerHTML = ''; const kz = el('tr', '', null, el('thead', '', null, T)); for (const k of kopf) el('th', '', k, kz);
    const rumpf = el('tbody', '', null, T); this.zeilenEl = [];
    for (const Z of F.zeilen) {
      const d = Z.danach, tr = el('tr', 'z-' + Z.art, null, rumpf); tr.onclick = () => this.setze(Z.zeit); this.zeilenEl.push(tr);
      el('td', 'zeit', uhr(Z.zeit), tr); const st = el('td', 'stelle', null, tr); el('b', '', Z.was, st); if (Z.name !== Z.was) el('span', '', ' ' + Z.name, st);
      el('td', '', ft(Z.hoehe), tr);
      if (d) {
        const art = el('td', '', null, tr); el('i', 'punkt', null, art).style.background = WAS_FARBE[d.art]; el('span', '', d.name + (d.steig ? ` (${d.steig > 0 ? '+' : '−'}${rund(Math.abs(d.steig), 50)} ft/min)` : ''), art);
        const boden = d.art === 'runde';
        el('td', 'fett', boden ? `Piste ${F.bahnZiel}` : grad3(d.steuer) + '°' + (Math.abs(d.vor) > 1.5 * GRAD ? ` (${d.vor > 0 ? '+' : '−'}${Math.round(Math.abs(d.vor) / GRAD)}° Wind)` : ''), tr);
        el('td', '', boden ? '–' : grad3(d.kurs) + '°', tr);
        el('td', '', boden ? `${d.ias} kn im Anflug` : `${d.ias} kn (${Math.round(d.grund)} über Grund)`, tr);
        el('td', '', boden ? '–' : `${d.lang.toFixed(1)} NM`, tr); el('td', '', uhr(d.min), tr);
      } else for (let i = 0; i < 6; i++) el('td', '', i ? '' : 'gelandet', tr);
      el('td', '', `${Z.verbraucht.toFixed(1)} l`, tr); el('td', Z.tank !== null && Z.tank < F.reserve ? 'rot' : '', Z.tank === null ? '–' : `${Math.round(Z.tank)} l`, tr);
      el('td', '', d && d.art !== 'runde' ? `${d.sicher} ft` : '', tr);
      el('td', '', Z.feuer ? `${Z.feuer.id} ${grad3(Z.feuer.kurs)}° · ${Z.feuer.nm.toFixed(1)} NM` : '', tr);
    }
    const tank = F.tank === null ? 'Getankt wird beim Außencheck – dort steht, wie viel der Flug braucht.' : `Im Tank beim Start: ${Math.round(F.tank)} Liter.`;
    $('ulSprit').textContent = `Sprit: ${F.liter.toFixed(1)} Liter für den Flug (davon 3 Liter für Anlassen und Rollen), dazu ${Math.round(F.reserve)} Liter Reserve für 30 Minuten = mindestens ${Math.ceil(F.noetig)} Liter. ${tank} `
      + `„Steuerkurs“ ist die Zahl, die du am Kurskreisel fliegst (der Wind ist schon eingerechnet). „Sichere Höhe“ = 1000 ft über dem höchsten Gelände auf dem Bein. „Funkfeuer“ = Kurs und Entfernung zum nächsten Sender an dieser Stelle – zum Nachprüfen.`;
    const fu = $('ulFunk'); fu.innerHTML = ''; for (const x of F.funk) { const li = el('li', '', null, fu); el('b', '', uhr(x.zeit) + ' ', li); el('span', '', x.text, li); }
    const h = $('ulHinweise'); h.innerHTML = ''; for (const x of F.hinweise) el('div', x.art, x.text, h);
    this.karte.passe(P.punkte, 7000); this.maleJetzt();
  }
  // Ränder des Höhenprofils und die Umrechnung Zeit ↔ Bildpunkt
  profilMasse() { const c = $('ulProfil'), r = c.getBoundingClientRect(); return { W: Math.max(50, r.width), H: Math.max(50, r.height), l: 48, r: 12, o: 34, u: 24 }; }
  zeitBei(px) { const m = this.profilMasse(); return clamp((px - m.l) / (m.W - m.l - m.r), 0, 1) * this.F.zeit; }
  // Alles, was sich mit dem Zeiger ändert: das Höhenprofil, die Karte, der Kasten „In dieser Minute“
  maleJetzt() {
    const F = this.F, J = planBei(F, this.minute); if (!J) return;
    this.maleProfil(J);
    this.karte.male({ plan: this.plan.punkte, f: { p: [J.x, 0, J.z], kurs: J.art === 'runde' ? J.kurs : J.steuer } });
    $('ulRegler').value = String(Math.round(this.minute / F.zeit * 1000));
    const k = $('ulJetzt'); k.innerHTML = '';
    const feld = (name, wert, cls) => { const d = el('div', cls || '', null, k); el('small', '', name, d); el('b', '', wert, d); };
    el('h3', '', `Minute ${uhr(J.zeit)} – ${J.name}`, k).style.borderColor = WAS_FARBE[J.art];
    feld('Höhe', ft(J.hoehe) + (J.steig ? ` ${J.steig > 0 ? '↗' : '↘'} ${rund(Math.abs(J.steig), 50)} ft/min` : ' halten'));
    feld('Steuerkurs', J.art === 'runde' ? `Platzrunde Piste ${F.bahnZiel}` : grad3(J.steuer) + '°'); feld('Kurs über Grund', J.art === 'runde' ? '–' : grad3(J.kurs) + '°');
    feld('Fahrtmesser', `${J.ias} kn`); feld('Über Grund', J.art === 'runde' ? '–' : `${Math.round(J.grund)} kn`);
    feld('Nächster Punkt', `${J.punkt.name}: ${J.bisPunktNm.toFixed(1)} NM, ${uhr(J.bisPunktMin)} min`);
    feld('Als Nächstes', `${J.naechste.was} in ${uhr(J.bisNaechste)} min`);
    feld('Bis zur Landung', `${J.rest.toFixed(1)} NM, ${uhr(J.restMin)} min`);
    feld('Sprit', `${J.verbraucht.toFixed(1)} l weg` + (J.tank === null ? '' : `, ${Math.round(J.tank)} l im Tank`), J.tank !== null && J.tank < F.reserve ? 'rot' : '');
    feld('Gelände darunter', `${rund(J.gelaende)} ft, du bist ${rund(J.hoehe - J.gelaende)} ft darüber`, ['reise', 'sink', 'eben'].includes(J.art) && J.hoehe - J.gelaende < 500 ? 'rot' : '');
    if (this.jetzt) { const soll = planBei(F, this.jetzt.minute), ab = this.jetzt.hoehe - soll.hoehe, weg = Math.hypot(this.jetzt.x - soll.x, this.jetzt.z - soll.z) / NM;
      feld('Dein Flug gerade', `${uhr(this.jetzt.minute)} min in der Luft, ${ft(this.jetzt.hoehe)} (${ab >= 0 ? '+' : '−'}${rund(Math.abs(ab), 10)} ft zum Plan), ${weg.toFixed(1)} NM neben der Stelle im Plan`, 'breit'); }
    // die Zeile in der Tabelle hervorheben, in deren Abschnitt der Zeiger steht
    let dran = 0; F.zeilen.forEach((Z, i) => { if (Z.zeit <= J.zeit + 1e-6) dran = i; }); (this.zeilenEl || []).forEach((tr, i) => tr.classList.toggle('dran', i === dran));
  }
  maleProfil(J) {
    const F = this.F, c = $('ulProfil'), g = c.getContext('2d'), m = this.profilMasse(), dpr = Math.min(window.devicePixelRatio || 1, 2), { W, H } = m;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); g.fillStyle = '#101820'; g.fillRect(0, 0, W, H);
    // Das Gelände unter der Strecke: nur einmal je Plan ausrechnen
    if (this.profilVon !== F) { this.profilVon = F; this.boden = []; for (let i = 0; i <= 260; i++) this.boden.push(planBei(F, F.zeit * i / 260).gelaende); }
    const sicherMax = Math.max(...F.stuecke.map(s => s.sicher)), h0 = Math.floor((Math.min(...this.boden, F.hStart, F.hZiel) - 300) / 500) * 500, h1 = Math.ceil((Math.max(F.hoch, sicherMax, ...this.boden) + 400) / 500) * 500;
    const X = t => m.l + t / F.zeit * (W - m.l - m.r), Y = h => H - m.u - (h - h0) / (h1 - h0) * (H - m.o - m.u);
    // Gitter: Höhen alle 1000 ft (bei wenig Platz alle 2000), Zeiten alle 5 Minuten (bei kurzen Flügen alle 2)
    g.font = '11px sans-serif'; g.textBaseline = 'middle'; g.lineWidth = 1;
    const hs = (h1 - h0) / 1000 > 7 ? 2000 : 1000;
    for (let h = Math.ceil(h0 / hs) * hs; h <= h1; h += hs) { g.strokeStyle = '#24323e'; g.beginPath(); g.moveTo(m.l, Y(h)); g.lineTo(W - m.r, Y(h)); g.stroke(); g.fillStyle = '#9fb0bd'; g.textAlign = 'right'; g.fillText(String(h), m.l - 6, Y(h)); }
    const ts = F.zeit > 60 ? 10 : F.zeit > 18 ? 5 : 2; g.textAlign = 'center';
    for (let t = 0; t <= F.zeit; t += ts) { g.strokeStyle = '#24323e'; g.beginPath(); g.moveTo(X(t), m.o); g.lineTo(X(t), H - m.u); g.stroke(); g.fillStyle = '#9fb0bd'; g.fillText(t + ' min', X(t), H - 10); }
    // Gelände als Fläche
    g.fillStyle = '#5d6b44'; g.beginPath(); g.moveTo(X(0), H - m.u); this.boden.forEach((h, i) => g.lineTo(X(F.zeit * i / 260), Y(Math.max(h0, h)))); g.lineTo(X(F.zeit), H - m.u); g.closePath(); g.fill();
    // Sichere Höhe je Bein (rot gestrichelt)
    g.strokeStyle = '#ef5a4c'; g.setLineDash([5, 4]); g.lineWidth = 1.5; g.beginPath();
    for (const s of F.stuecke) if (s.art !== 'runde') { g.moveTo(X(s.t0), Y(s.sicher)); g.lineTo(X(s.t1), Y(s.sicher)); } g.stroke(); g.setLineDash([]);
    // Der geplante Flug: jedes Stück in seiner Farbe
    g.lineWidth = 3.5; g.lineCap = 'round';
    for (const s of F.stuecke) { g.strokeStyle = WAS_FARBE[s.art]; g.beginPath(); g.moveTo(X(s.t0), Y(s.h0)); g.lineTo(X(s.t1), Y(s.h1)); g.stroke(); }
    // Die Stellen des Plans: senkrechte Striche mit Namen (abwechselnd in zwei Reihen, damit sie sich nicht überdecken)
    g.font = '600 11px sans-serif'; let reihe = 0, letztesX = -999;
    for (const Z of F.zeilen) {
      const x = X(Z.zeit), text = Z.art === 'punkt' || Z.art === 'start' || Z.art === 'ziel' ? Z.name : Z.art === 'toc' ? 'oben' : Z.art === 'tod' ? 'sinken' : Z.art === 'eben' ? 'Runde' : 'Landung';
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(x, m.o - 4); g.lineTo(x, H - m.u); g.stroke(); g.setLineDash([]);
      reihe = x - letztesX < g.measureText(text).width + 14 ? 1 - reihe : 0; letztesX = x;
      g.fillStyle = Z.art === 'punkt' || Z.art === 'start' || Z.art === 'ziel' ? '#ff8ad0' : '#cfe0ec'; g.textAlign = x < m.l + 30 ? 'left' : x > W - m.r - 30 ? 'right' : 'center'; g.fillText(text, x, reihe ? 22 : 9);
    }
    // Wo der echte Flug gerade ist (nur im Flug)
    if (this.jetzt) { g.fillStyle = '#ffffff'; g.strokeStyle = '#1b232b'; g.lineWidth = 2; g.beginPath(); g.arc(X(clamp(this.jetzt.minute, 0, F.zeit)), Y(clamp(this.jetzt.hoehe, h0, h1)), 6, 0, 7); g.fill(); g.stroke(); }
    // Der Zeiger
    g.strokeStyle = '#ffdc3c'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(J.zeit), m.o - 6); g.lineTo(X(J.zeit), H - m.u); g.stroke();
    g.fillStyle = '#ffdc3c'; g.strokeStyle = '#1b232b'; g.beginPath(); g.arc(X(J.zeit), Y(J.hoehe), 5.5, 0, 7); g.fill(); g.stroke();
  }

  // ---------------------------------------------------------------- Die Flugplatzkarte
  malePlatz(P) {
    const B = platzBlatt(P, this.wetter()), S = $('ulPlatzSeite'); S.innerHTML = '';
    const h2 = t => el('h2', '', t, S), p = (t, cls) => el('p', cls || '', t, S);
    el('h1', '', 'Flugplatz ' + B.name, S); p(B.text, 'hinweis');
    const kasten = el('div', 'ulZahlen', null, S), zahl = (name, wert) => { const d = el('div', '', null, kasten); el('small', '', name, d); el('b', '', wert, d); };
    zahl('Platzhöhe', `${rund(B.meer, 10)} ft (${Math.round(P.meer)} m über dem Meer)`); zahl('Platzrunde', `${B.rundeHoehe} ft, links herum (${RUNDE_HOCH} ft über dem Platz)`);
    zahl('Funk', `${B.ruf} · ${B.frequenz}`); zahl('Wind heute', B.wind.kn ? `aus ${grad3(B.wind.aus * GRAD)}° mit ${B.wind.kn} kn` + (B.wind.boe > 4 ? `, Böen ${B.wind.kn + B.wind.boe}` : '') : 'windstill');
    h2('Pisten');
    const T = el('table', 'ulTab', null, S), kz = el('tr', '', null, T); for (const k of ['Piste', 'Kurs', 'Länge × Breite', 'Belag', 'Wind heute']) el('th', '', k, kz);
    for (const b of B.bahnen) {
      const tr = el('tr', b.inBetrieb ? 'dran' : '', null, T); el('td', 'fett', b.nr + (b.inBetrieb ? ' ✔' : ''), tr); el('td', '', b.grad + '°', tr); el('td', '', `${b.lang} × ${b.breit} m`, tr); el('td', '', b.belag === 'gras' ? 'Gras' : 'Asphalt', tr);
      const wind = !B.wind.kn ? 'kein Wind' : `${Math.abs(Math.round(b.gegen))} kn ${b.gegen >= 0 ? 'von vorn' : 'von HINTEN'}` + (Math.abs(b.seite) >= 1 ? `, ${Math.abs(Math.round(b.seite))} kn von ${b.seite > 0 ? 'rechts' : 'links'}` : '');
      el('td', b.gegen < -1 ? 'rot' : '', wind, tr);
    }
    const A = B.inBetrieb;
    p(`✔ = in Betrieb: Gestartet und gelandet wird gegen den Wind, heute auf der Piste ${A.nr}. Die Lerche braucht etwa ${STARTLAUF} m bis zum Abheben.`
      + (A.papi ? ' Neben der Bahn stehen vier Anflug-Lichter (PAPI): zwei weiß und zwei rot = richtig.' : ''), 'hinweis');
    h2(`Platzrunde Piste ${A.nr}`);
    const ol = el('ol', 'ulRunde', null, S), was = ['nach dem Abheben geradeaus steigen', 'links abdrehen, weiter steigen', `parallel zur Bahn zurück in ${B.rundeHoehe} ft, Klappen 10°`, 'links eindrehen und sinken, Klappen 20°', 'auf die Bahn zu, 65 bis 70 kn, Klappen 30°'];
    A.runde.teile.forEach((t, i) => { const li = el('li', '', null, ol); el('b', '', `${t.name} ${grad3(t.kurs)}°`, li); el('span', '', ' – ' + was[i], li); });
    p(`Endanflug mit 3° Gleitweg: 3 Meilen vor der Bahn ${rund(B.meer + 950, 50)} ft, 2 Meilen ${rund(B.meer + 640, 50)} ft, 1 Meile ${rund(B.meer + 320, 50)} ft. Aufsetzen ${A.zielpunkt} m hinter dem Bahnanfang.`, 'hinweis');
    h2('Gelände im Umkreis von 10 km');
    const sek = el('div', 'ulZahlen', null, S); for (const s of B.sektoren) { const d = el('div', '', null, sek); el('small', '', s.name, d); el('b', '', `bis ${rund(s.hoch)} ft · sicher ab ${s.sicher} ft`, d); }
    h2('Funkfeuer'); for (const f of B.feuer) p(`${f.id} ${f.name}: ${f.nm.toFixed(1)} NM vom Platz in Richtung ${grad3(f.kurs)}° (${himmel(f.kurs)}). Vom Sender zum Platz: Kurs ${grad3(f.vomFeuer)}°.`);
    h2('Daran erkennst du den Platz'); for (const m of B.marken) p(`${m.name}: ${m.nm.toFixed(1)} NM im ${himmel(m.kurs)} (${grad3(m.kurs)}°)`);
    if (B.hinweise.length) { h2('Achtung'); for (const t of B.hinweise) el('div', 'warn', t, S); }
    p(B.echt ? 'Diesen Platz gibt es wirklich. Lage, Bahnrichtung und Höhe stimmen ungefähr, die Gebäude und die Funk-Frequenz sind ausgedacht. Nicht für echte Flüge!' : 'Lerchenfeld ist ein ausgedachter Platz.', 'hinweis klein');
    // Knöpfe für den Ausschnitt
    const k = $('ulAusschnitt'); k.innerHTML = '';
    for (const [id, a] of Object.entries(AUSSCHNITTE)) { const b = el('button', 'klein' + (this.ausschnitt === id ? ' an' : ''), a.name, k); b.onclick = () => { this.ausschnitt = id; this.male(); }; }
    this.malePlatzBild(P, B);
  }
  malePlatzBild(P, B) {
    const K = this.platzKarte, g = K.g, nah = this.ausschnitt === 'platz', weit = this.ausschnitt === 'umgebung';
    K.masse(); K.mx = P.mx; K.mz = P.mz; K.mpp = AUSSCHNITTE[this.ausschnitt].halb(P) * 2 / Math.min(K.W, K.H);
    const W = K.W, H = K.H, mpp = K.mpp, A = B.inBetrieb;
    if (nah) { g.fillStyle = P.belag === 'gras' ? '#a9c98a' : '#b9d49a'; g.fillRect(0, 0, W, H); } else K.male({});
    // Ort auf dem Platz (Meter links der Mitte, Meter hinter dem Anfang der ersten Bahn) → Bildpunkt
    const L = (lx, lz) => K.bild(...platzWelt(P, lx, lz));
    const flaeche = (b, l, x, z, farbe, rand) => { g.beginPath(); [[x - b / 2, z - l / 2], [x + b / 2, z - l / 2], [x + b / 2, z + l / 2], [x - b / 2, z + l / 2]].forEach(([a, c], i) => { const [px, py] = L(a, c); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
      g.closePath(); g.fillStyle = farbe; g.fill(); if (rand) { g.strokeStyle = rand; g.lineWidth = 1; g.stroke(); } };
    const text = (t, x, y, farbe = '#1b232b', gr = 12, fett = true) => { g.font = `${fett ? '600 ' : ''}${gr}px sans-serif`; g.lineWidth = 3.5; g.strokeStyle = 'rgba(255,255,255,0.88)'; g.strokeText(t, x, y); g.fillStyle = farbe; g.fillText(t, x, y); };
    const pfeil = (x0, y0, x1, y1, farbe, breit = 2) => { const w = Math.atan2(y1 - y0, x1 - x0); g.strokeStyle = g.fillStyle = farbe; g.lineWidth = breit; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - 10 * Math.cos(w - 0.4), y1 - 10 * Math.sin(w - 0.4)); g.lineTo(x1 - 10 * Math.cos(w + 0.4), y1 - 10 * Math.sin(w + 0.4)); g.closePath(); g.fill(); };
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.setLineDash([]);
    const Lg = P.lang, V = P.vorfeld, asphalt = P.belag !== 'gras', grau = asphalt ? '#6a6d72' : '#7fae5c';
    if (weit) {
      // Umgebung: Kreise in 5 und 10 Meilen, in jeder Himmelsrichtung das höchste Gelände
      const [cx, cy] = K.bild(P.mx, P.mz);
      for (const nm of [5, 10]) { g.strokeStyle = 'rgba(160,16,96,0.55)'; g.lineWidth = 1.2; g.setLineDash([6, 5]); g.beginPath(); g.arc(cx, cy, nm * NM / mpp, 0, 7); g.stroke(); g.setLineDash([]); text(nm + ' NM', cx, cy - nm * NM / mpp - 8, '#a01060', 11); }
      B.sektoren.forEach((s, i) => { const w = (i * 90 + 45) * GRAD, r = 3.7 * NM / mpp; text(`${rund(s.hoch)} ft`, cx + Math.sin(w) * r, cy - Math.cos(w) * r - 8, '#8a2a12', 14); text(`sicher ${s.sicher}`, cx + Math.sin(w) * r, cy - Math.cos(w) * r + 9, '#8a2a12', 11, false); });
      for (const f of B.feuer) if (f.nm > 2) { const [fx, fy] = K.bild(f.x, f.z); g.strokeStyle = 'rgba(31,65,143,0.7)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(fx, fy); g.stroke();
        text(`${grad3(f.kurs)}° · ${f.nm.toFixed(1)} NM`, (cx + fx) / 2, (cy + fy) / 2 - 8, '#1f418f', 11); }
    }
    if (!nah) {
      // Die Platzrunde der Bahn in Betrieb: Rechteck mit Pfeilen, an jeder Seite der Kurs
      const E = A.runde.ecken.map(([x, z]) => K.bild(x, z));
      g.strokeStyle = '#0a58c8'; g.lineWidth = weit ? 2 : 3; g.setLineDash(weit ? [] : [10, 6]); g.beginPath(); E.forEach(([x, y], i) => { if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); g.setLineDash([]);
      if (!weit) A.runde.teile.forEach((t, i) => {
        const [x0, y0] = E[i], [x1, y1] = E[i + 1], mx = (x0 + x1) / 2, my = (y0 + y1) / 2, w = Math.atan2(y1 - y0, x1 - x0);
        pfeil(mx - 14 * Math.cos(w), my - 14 * Math.sin(w), mx + 14 * Math.cos(w), my + 14 * Math.sin(w), '#0a58c8', 3);
        // die Beschriftung nach außen neben die Linie setzen (links herum geflogen ist außen rechts von der Flugrichtung)
        g.font = '600 12px sans-serif'; const ax = -Math.sin(w), ay = Math.cos(w), ab = -(16 + Math.abs(ax) * g.measureText(`${t.name} 000°`).width / 2 + Math.abs(ay) * 14);
        text(`${t.name} ${grad3(t.kurs)}°`, mx - ax * ab, my - ay * ab - 7, '#0a3f94', 12); if (i === 2) text(`${B.rundeHoehe} ft`, mx - ax * ab, my - ay * ab + 8, '#0a3f94', 11, false);
      });
      // der Endanflug als Linie mit Höhen-Marken (3° Gleitweg): 1, 2 und 3 Meilen vor der Bahn
      if (!weit) for (const nm of [1]) { const [x, z] = bahnOrt(P, A.ende, -nm * NM, 0), [px, py] = K.bild(x, z); g.fillStyle = '#0a58c8'; g.beginPath(); g.arc(px, py, 4, 0, 7); g.fill(); text(`${nm} NM: ${rund(B.meer + nm * 320, 50)} ft`, px + 52, py + 12, '#0a3f94', 11, false); }
    }
    // Der Platz selbst: Rollwege, Vorfeld, Häuser, Bahn
    if (mpp < 30) {
      flaeche(12, Lg - 60, -45, Lg / 2, grau); for (const z of [30, Lg / 2, Lg - 30]) flaeche(40, 12, -28, z, grau);
      flaeche(70, 110, V.x - 10, V.z, asphalt ? '#7b7e83' : '#8fb86c', '#555'); flaeche(32, 12, -58, V.z, grau);
      flaeche(34, 26, V.x - 60, V.z + 30, '#8c3a30', '#333'); flaeche(18, 12, V.x - 55, V.z - 25, '#b0563c', '#333'); if (asphalt) flaeche(6, 6, V.x - 30, V.z - 48, '#3d5d78', '#222');
    }
    flaeche(Math.max(P.breit, 2.2 * mpp), Lg, 0, Lg / 2, asphalt ? '#2f3237' : '#4f8a3a', '#fff');
    if (nah) {
      // Mittellinie, Schwellen, Aufsetzpunkte, Lichter, Windsack, Wartepunkt – alles, was man am Boden braucht
      g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.setLineDash([8, 8]); g.beginPath(); g.moveTo(...L(0, 80)); g.lineTo(...L(0, Lg - 80)); g.stroke(); g.setLineDash([]);
      for (const b of B.bahnen) {
        const [zx, zy] = K.bild(...bahnOrt(P, b.ende, b.zielpunkt, 0)); g.fillStyle = '#fff'; g.beginPath(); g.arc(zx, zy, 3, 0, 7); g.fill();
        if (b.papi) for (let i = 0; i < 4; i++) { const [px, py] = K.bild(...bahnOrt(P, b.ende, b.zielpunkt, -(P.breit / 2 + 8 + i * 4))); g.fillStyle = i < 2 ? '#fff' : '#e03030'; g.strokeStyle = '#333'; g.lineWidth = 0.8; g.beginPath(); g.arc(px, py, 2.6, 0, 7); g.fill(); g.stroke(); }
      }
      const [wx, wy] = L(30, 200); g.fillStyle = '#ff6a1f'; g.beginPath(); g.arc(wx, wy, 5, 0, 7); g.fill(); text('Windsack', wx, wy - 13, '#8a3a08', 11);
      const [hx, hy] = L(P.rollhalt.x, P.rollhalt.z); g.strokeStyle = '#e8c63a'; g.lineWidth = 3; g.beginPath(); g.arc(hx, hy, 7, 0, 7); g.stroke(); text('Wartepunkt', hx, hy + 17, '#6a5200', 11);
      g.textAlign = 'left'; const [vx, vy] = L(V.x - 85, V.z - 4); text('Vorfeld (hier parken)', vx, vy, '#1b232b', 12);
      const [ax, ay] = L(V.x - 85, V.z + 34); text('Halle', ax, ay, '#5a1a12', 11); g.textAlign = 'center'; if (asphalt) { const [tx, ty] = L(V.x - 30, V.z - 60); text('Turm', tx, ty + 6, '#1b3550', 10); }
      text(`${Lg} × ${P.breit} m ${asphalt ? 'Asphalt' : 'Gras'}`, ...L(-(P.breit / 2 + 70 * mpp), Lg * 0.78), '#1b232b', 12);
    }
    // Pisten-Nummern und Kurse an beiden Enden. Die Nummer steht an dem Ende, an dem man mit diesem Kurs aufsetzt.
    for (const b of B.bahnen) {
      const ab = nah ? 0 : Math.max(26 * mpp, 400), [x, z] = bahnOrt(P, b.ende, nah ? 55 : -ab, 0), [px, py] = K.bild(x, z);
      if (nah) { g.save(); g.translate(px, py); g.rotate(b.kurs); g.fillStyle = '#fff'; g.font = `700 ${clamp(P.breit / mpp * 0.8, 11, 20)}px sans-serif`; g.fillText(b.nr, 0, 0); g.restore(); }
      const [bx, by] = K.bild(...bahnOrt(P, b.ende, nah ? -70 : -ab - 30 * mpp, 0)), [cx, cy] = K.bild(...bahnOrt(P, b.ende, nah ? -150 : -ab - 62 * mpp, 0));
      if (!weit) { pfeil(cx, cy, bx, by, b.inBetrieb ? '#c01878' : '#555', 2.5); text(`${b.nr} · ${b.grad}°`, cx + (cx - bx) * 0.7, cy + (cy - by) * 0.7, b.inBetrieb ? '#a01060' : '#333', nah ? 15 : 13); }
    }
    // Wind-Pfeil oben links (zeigt, wohin der Wind weht), Titel, Maßstab und Nordpfeil
    g.fillStyle = 'rgba(255,255,255,0.86)'; g.fillRect(8, 8, 190, 54); g.textAlign = 'left'; g.fillStyle = '#1b232b'; g.font = '700 14px sans-serif'; g.fillText(`${B.name} · ${rund(B.meer, 10)} ft`, 16, 22);
    g.font = '12px sans-serif'; g.fillText(B.wind.kn ? `Wind ${grad3(B.wind.aus * GRAD)}° / ${B.wind.kn} kn → Piste ${A.nr}` : `windstill → Piste ${A.nr}`, 16, 40); g.fillText(`${B.ruf} ${B.frequenz}`, 16, 54);
    if (B.wind.kn) { const w = B.wind.aus * GRAD, mx = 226, my = 35; g.fillStyle = 'rgba(255,255,255,0.86)'; g.beginPath(); g.arc(mx, my, 24, 0, 7); g.fill(); pfeil(mx + Math.sin(w) * 18, my - Math.cos(w) * 18, mx - Math.sin(w) * 18, my + Math.cos(w) * 18, '#1f6fd0', 3); }
    const stufen = nah ? [100, 200, 500] : [1000, 1852, 2 * 1852, 5 * 1852, 10 * 1852], m = stufen.find(s => s / mpp > 60) || stufen[stufen.length - 1], breit = m / mpp;
    if (nah) { g.fillStyle = 'rgba(255,255,255,0.86)'; g.fillRect(10, H - 30, breit + 16, 22); g.strokeStyle = '#1b232b'; g.lineWidth = 2; g.beginPath(); g.moveTo(18, H - 16); g.lineTo(18, H - 12); g.lineTo(18 + breit, H - 12); g.lineTo(18 + breit, H - 16); g.stroke();
    g.fillStyle = '#1b232b'; g.font = '11px sans-serif'; g.textAlign = 'center'; g.fillText(m < 1800 ? `${m} m` : m === 1852 ? '1 NM' : `${Math.round(m / 1852)} NM`, 18 + breit / 2, H - 21); }
    if (nah) { g.fillStyle = 'rgba(255,255,255,0.86)'; g.beginPath(); g.arc(W - 24, 26, 16, 0, 7); g.fill();
      g.fillStyle = '#c0202a'; g.beginPath(); g.moveTo(W - 24, 12); g.lineTo(W - 29, 28); g.lineTo(W - 19, 28); g.closePath(); g.fill(); g.fillStyle = '#1b232b'; g.font = '700 10px sans-serif'; g.fillText('N', W - 24, 35); }
  }
}
export { FT };
