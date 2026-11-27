// Flugsimulator – was man vom Überlandflug sieht und bedient: Navi-Kasten oder Planzettel, Funkfeuer-Nadel,
// Funk-Kasten, die Karte im Flug und die Auswertung am Ende. Der Ablauf selbst (ohne Bild) steht in ueberland.js.
import { NM } from './region.js';
import { grad3, wickel, kursVon, FEUER, feuerAnzeige, punktNah, REISE } from './navigation.js';
import { RAFFER } from './ueberland.js';
import { RUF, laut } from './funk.js';
import { Karte } from './karte.js';
import { bediene } from './planer.js';
import { maleNavi, maleZettel, maleFeuer, maleRaffer } from './instrumente.js';
import { GRAD } from './flugzeuge.js';

const $ = id => document.getElementById(id);
const sterne = (n, von = 5) => '★'.repeat(n) + '☆'.repeat(von - n);
const SCHRITT = 5 * GRAD;                  // so weit dreht ein Tastendruck den gewählten Kurs am Funkfeuer

export class ReiseAnsicht {
  // d = was die Ansicht vom Spiel braucht: melde(text, art, sek), sprich(text), stimmeAus(), druecke(knopf),
  //     pause() = ist gerade Pause?, offen() = ist die Auswertung schon auf?, ende() = Auswertung zeigen
  constructor(d) {
    this.d = d; this.karte = new Karte($('fkBild'));
    bediene($('fkBild'), this.karte, () => { this.folgt = false; this.maleKarte(); }, (x, z) => this.tippKarte(x, z));
    $('fkPlus').onclick = () => { this.karte.zoome(0.7); this.maleKarte(); };
    $('fkMinus').onclick = () => { this.karte.zoome(1.4); this.maleKarte(); };
    $('fkMitte').onclick = () => { this.folgt = true; this.maleKarte(); };
    $('fkZu').onclick = () => d.druecke('karte');
    $('fkFeuer').onclick = () => this.ziffer(4); $('fkKursM').onclick = () => this.ziffer(5); $('fkKursP').onclick = () => this.ziffer(6);
    this.neu(null, null);
  }
  // Ein neuer Flug beginnt (oder mit reise = null: zurück ins Menü)
  neu(reise, f) {
    this.reise = reise; this.f = f; this.spur = []; this.spurZeit = 0; this.endeZeit = 0;
    this.kartenAuf = false; this.kartenZeit = 0; this.folgt = true; this.gepasst = false;
    this.funkStand = ''; this.verlauf = []; this.funkZahl = 0; this.funkZeit = 0; this.funkTipp = '';
    this.zu();
    if (reise) { let d = Infinity; for (const F of FEUER) { const e = Math.hypot(F.x - f.p[0], F.z - f.p[2]); if (e < d) { d = e; this.feuer = F; } } this.feuerKurs = 0; }
  }
  zu() { this.kartenAuf = false; $('funk').classList.remove('an'); $('flugkarte').classList.remove('an'); document.body.classList.remove('mit-funk'); }
  get selbst() { return this.reise.stufe === 'selbst'; }

  // ---------------------------------------------------------------- Funkfeuer wählen und Kurs drehen
  waehleFeuer(F) {
    const f = this.f; this.feuer = F;
    // Kurs zuerst direkt zum Sender (auf 5° gerundet): Dann steht die Nadel in der Mitte, und man fliegt einfach hin
    this.feuerKurs = Math.round(kursVon(f.p[0], f.p[2], F.x, F.z) / SCHRITT) * SCHRITT;
    this.d.melde(`${F.name} (${F.id}) eingestellt, Kurs ${grad3(this.feuerKurs)}°.`, 'info', 4);
    if (this.kartenAuf) this.maleKarte();
  }
  // Ziffern-Tasten im Überlandflug: 1 2 3 = Funkspruch, 4 = nächstes Funkfeuer, 5 / 6 = Kurs zurück / vor, 7 = Kurs direkt zum Sender.
  // Gibt immer true zurück: Im Überlandflug stellen die Ziffern nie das Gas (sonst zieht „2“ nach dem Funken das Gas auf 20 %).
  ziffer(n) {
    const R = this.reise; if (!R || this.d.pause()) return true;
    if (n >= 1 && n <= 3) { if (R.funk.frage) R.funk.waehle(n - 1); }
    else if (n === 4) this.waehleFeuer(FEUER[(FEUER.indexOf(this.feuer) + 1) % FEUER.length]);
    else if (n === 5 || n === 6) { this.feuerKurs = wickel(this.feuerKurs + (n === 6 ? SCHRITT : -SCHRITT)); if (this.kartenAuf) this.maleKarte(); }
    else if (n === 7) this.waehleFeuer(this.feuer);
    return true;
  }

  // ---------------------------------------------------------------- Karte im Flug
  karteUm() {
    if (!this.reise || this.d.offen()) return;
    this.kartenAuf = !this.kartenAuf; $('flugkarte').classList.toggle('an', this.kartenAuf);
    if (!this.kartenAuf) return;
    this.karte.masse(); $('fkMitte').style.display = this.selbst ? 'none' : '';
    // In der Stufe „Selbst“ zeigt die Karte nicht, wo man ist – sie zeigt beim ersten Öffnen den ganzen Plan
    if (this.selbst) { if (!this.gepasst) { this.gepasst = true; this.karte.passe(this.reise.plan.punkte, 7000); } }
    else { this.folgt = true; this.karte.mpp = 140; }
    this.maleKarte();
  }
  tippKarte(x, z) { const p = punktNah(x, z, Math.max(2500, this.karte.mpp * 22)); if (p && p.art === 'feuer') this.waehleFeuer(FEUER.find(F => F.id === p.id)); }
  maleKarte() {
    const R = this.reise, f = this.f; if (!R) return;
    if (this.folgt && !this.selbst) { this.karte.mx = f.p[0]; this.karte.mz = f.p[2]; }
    const L = R.navi.lage(f), b = R.rechnung.beine[R.navi.nr - 1], sender = `Funkfeuer ${this.feuer.id}, Kurs ${grad3(this.feuerKurs)}°`;
    if (this.selbst) {
      this.karte.male({ plan: R.plan.punkte, feuer: this.feuer });
      $('fkText').textContent = `Wo bist du? Vergleiche Seen, Orte und Straßen mit dem Blick aus dem Fenster. Du fliegst ${grad3(f.kurs)}° · ${sender}`;
    } else {
      this.karte.male({ plan: R.plan.punkte, nr: R.navi.nr, f, spur: this.spur, feuer: this.feuer });
      $('fkText').textContent = `Nächster Punkt: ${L.nach.name} · ${(L.weit / NM).toFixed(1)} NM · Kurs laut Plan ${grad3(b.steuer)}° · Du fliegst ${grad3(f.kurs)}° · ${sender}`;
    }
    $('fkFeuer').textContent = 'Funkfeuer: ' + this.feuer.id;
  }

  // ---------------------------------------------------------------- die Kästen oben rechts (auf der Malfläche der Instrumente)
  // Navi-Stufe „Leicht“: der nächste Punkt mit Pfeil, Entfernung und Ablage von der Linie
  naviInfo() {
    const R = this.reise, L = R.navi.lage(this.f), b = R.rechnung.beine[R.navi.nr - 1];
    return { name: L.nach.name, nm: L.weit / NM, min: L.min, kurs: grad3(b.steuer), peil: L.peil, ablage: R.navi.letztes && L.weit < 6000 ? 0 : L.ablage };
  }
  // Navi-Stufe „Selbst“: der Planzettel. „an bei“ = zu welcher Minute auf der Stoppuhr man am Punkt sein sollte.
  zettel() {
    const R = this.reise, r = R.rechnung;
    let an = r.steigMin * (1 - REISE.steigTempo / r.tas);
    return { uhr: R.abhebZeit === null ? null : R.t - R.abhebZeit, beine: r.beine.map(b => ({ name: b.nach.name, kurs: grad3(b.steuer), min: b.min, an: (an += b.min) })) };
  }
  male(g, W, H, oben, rechts, mitTasten) {
    const R = this.reise, f = this.f; let y = oben;
    if (R.stufe === 'leicht') y = maleNavi(g, W, H, f, this.naviInfo(), oben, rechts) + 6;
    else if (R.stufe === 'selbst') y = maleZettel(g, W, H, this.zettel(), oben, rechts) + 6;
    maleFeuer(g, W, H, { ...feuerAnzeige(f, this.feuer, this.feuerKurs), kurz: this.feuer.kurz }, y, rechts, mitTasten);
    if (R.raffer) maleRaffer(g, W, H, RAFFER);
  }

  // ---------------------------------------------------------------- Funk-Kasten: was zuletzt gesagt wurde und die drei Antworten
  maleFunk(sek) {
    const F = this.reise.funk, d = this.d;
    for (const s of F.sagen.splice(0)) {
      this.verlauf.push(s); if (this.verlauf.length > 3) this.verlauf.shift();
      this.funkZahl++; this.funkZeit = 14; this.funkTipp = s.tipp || '';
      if (s.wer === 'Info') { d.stimmeAus(); d.sprich(s.text, 'info', laut(s.text)); }
    }
    if (!F.frage) { this.funkZeit -= sek; if (this.funkZeit <= 0 && this.verlauf.length) { this.verlauf = []; this.funkZahl++; } }
    const stand = [F.nr, F.stufe, !!F.frage, this.funkZahl].join();
    if (stand === this.funkStand) return;
    this.funkStand = stand;
    const an = !!F.frage || this.verlauf.length > 0;
    $('funk').classList.toggle('an', an); document.body.classList.toggle('mit-funk', an);
    $('fuKopf').textContent = `Funk · ${RUF}` + (F.frage ? ` · ${F.frage.name}` : '');
    $('fuVerlauf').innerHTML = '';
    for (const s of this.verlauf) {
      const z = document.createElement('div'); z.className = s.wer === 'Du' ? 'du' : ''; z.innerHTML = '<b></b> ';
      z.querySelector('b').textContent = s.wer + ':'; z.append(s.text); $('fuVerlauf').appendChild(z);
    }
    $('fuTipp').textContent = F.frage ? this.funkTipp : '';
    $('fuFrage').textContent = F.frage ? `${F.frage.was} – was sagst du?` : '';
    $('fuAntworten').innerHTML = '';
    if (F.frage) F.frage.antworten.forEach((a, i) => {
      const k = document.createElement('button'); k.innerHTML = `<b>${i + 1}</b>`; k.append(a.text);
      k.onclick = () => { k.blur(); this.ziffer(i + 1); }; $('fuAntworten').appendChild(k);
    });
  }

  // ---------------------------------------------------------------- jedes Bild
  // ablauf = die Checklisten beim ganzen Flug (oder null): Sie erfahren hier, wann der Zielplatz nah ist
  schritt(f, sek, flug, ablauf) {
    const R = this.reise, d = this.d; this.f = f;
    R.schritt(f, sek, flug);
    for (const m of R.meldungen.splice(0)) d.melde(m.text, m.art, 8);
    if (ablauf) ablauf.zielNah = R.navi.letztes && Math.hypot(f.p[0] - R.ziel.mx, f.p[2] - R.ziel.mz) < 14000;
    this.maleFunk(sek);
    this.spurZeit -= sek; if (this.spurZeit <= 0 && !R.fertig) { this.spurZeit = 2; this.spur.push([f.p[0], f.p[2]]); }
    this.kartenZeit -= sek; if (this.kartenAuf && this.kartenZeit <= 0) { this.kartenZeit = 0.3 * (R.raffer ? RAFFER : 1); this.maleKarte(); }
    if (R.fertig && !d.offen()) { this.endeZeit += sek; if (this.endeZeit > 2.5) d.ende(); }
  }

  // ---------------------------------------------------------------- Auswertung: fünf Sterne, Karte mit Plan und geflogenem Weg
  // r = Ergebnis der Reise, b = Eintrag der Checklisten (ganzer Flug) oder null, nochmal / neuPlanen = was die Knöpfe tun
  auswertung(f, r, b, nochmal, neuPlanen) {
    const R = this.reise; this.zu();
    $('eTitel').textContent = r.bruch ? 'Überlandflug – das ging schief' : r.amZiel ? `Überlandflug – gelandet in ${r.nach}` : 'Überlandflug – nicht am Ziel gelandet';
    $('eSterne').textContent = sterne(r.sterne);
    $('eText').textContent = `Von ${r.von}${r.ueber.length ? ' über ' + r.ueber.join(' und ') : ''} ${r.von === r.nach ? 'zurück nach' : 'nach'} ${r.nach}: `
      + `${Math.round(r.strecke)} NM geplant, ${Math.round(r.min)} Minuten in der Luft. Der Flug steht im Flugbuch.`
      + (b ? `  Checklisten und Regeln: ${sterne(b.regeln)}` + (b.bruch || b.amPlatz ? '' : ' (nicht auf dem Vorfeld geparkt)') + (b.batterieAn ? '  Der Hauptschalter ist noch an: Beim nächsten Flug ist die Batterie leer!' : '') : '');
    $('eLandung').textContent = '';
    $('eFehler').innerHTML = '';
    const zeile = text => { const li = document.createElement('li'); li.textContent = text; $('eFehler').appendChild(li); };
    for (const z of r.zeilen) zeile(`${z.ok ? '★' : '☆'} ${z.name}: ${z.text}`);
    if (b) for (const v of b.vergessen) zeile(`Vergessen – ${v.phase}: ${v.text}. ${v.grund}`);
    $('eFehlerTitel').textContent = 'Die fünf Sterne'; $('eFehlerTitel').style.display = ''; $('eLeg').style.display = 'none';
    $('eWeiter').style.display = ''; $('eWeiter').textContent = 'Neuen Flug planen'; $('eWeiter').onclick = neuPlanen;
    $('eNochmal').textContent = 'Noch einmal'; $('eNochmal').onclick = nochmal;
    $('ergebnis').classList.add('an');
    $('eBild').style.height = '340px';
    const k = new Karte($('eBild')); k.passe([...R.plan.punkte, ...this.spur.map(([x, z]) => ({ x, z }))], 6000); k.male({ plan: R.plan.punkte, spur: this.spur, f });
  }
}
