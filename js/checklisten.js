// Flugsimulator – der ganze Flug von Parkposition zu Parkposition: Checklisten, Ablauf, Flugbuch. Ohne Grafik.
// Ein Flug hat acht Abschnitte (PHASEN). Jeder hat eine Checkliste mit Punkten:
//   text  : was zu tun ist
//   ok    : (f, s) => true, wenn es erledigt ist (f = Flugzeug, s = f.sys aus systeme.js)
//   tu    : (f, s) => erledigt es (für „Mit Hilfe“; bei Schaltern auch für das Antippen in „Geführt“)
//   tipp  : true = das ist ein Schalter, den man in „Geführt“ direkt in der Liste antippen darf
//   grund : warum man das macht (wird erklärt und steht im Flugbuch, wenn man es vergisst)
// Drei Arten zu spielen (MODI): hilfe = das Spiel macht jeden Punkt und erklärt ihn, gefuehrt = Liste zum Abhaken,
// selbst = die Liste ist zugeklappt und wird nur bewertet.
import { KN, FT } from './flugzeuge.js';
import { PLATZ } from './platz.js';
import { SCHALTER, schalte, anlassen, tanke, liter } from './systeme.js';

export const MODI = { hilfe: 'Mit Hilfe: Das Spiel macht jeden Handgriff und erklärt ihn', gefuehrt: 'Geführt: Checkliste zum Abhaken', selbst: 'Selbst: Die Checkliste ist zu und wird nur bewertet' };

const kn = f => f.ias / KN, fuss = f => f.hoeheGrund / FT, tempoBoden = f => Math.hypot(f.v[0], f.v[2]);
// Ein Punkt, der nur einen Schalter stellt
const sch = (id, wert, text) => { const d = SCHALTER.find(x => x.id === id); return { id, text: text || `${d.name} ${wert ? d.an : d.aus}`, ok: (f, s) => s[id] === wert, tu: f => { schalte(f, id, wert); }, tipp: true, grund: d.grund }; };
const START_TRIMM = 0.15;

export const PHASEN = [
  {
    id: 'aussen', name: 'Außencheck', wo: 'Geh einmal um das Flugzeug und schau dir alles an.',
    punkte: [
      { id: 'tank', text: 'In den Tank schauen: genug Benzin?', ok: (f, s) => s.geprueft.tank && liter(f) >= 30, tu: (f, s) => { s.geprueft.tank = true; if (liter(f) < 60) tanke(f, 100); }, grund: 'Die Tankanzeige kann sich irren. Für eine Platzrunde mit Reserve sollen mindestens 30 Liter im Tank sein.' },
      { id: 'deckel', text: 'Beide Tankdeckel fest zu', ok: (f, s) => s.deckel && s.geprueft.deckelR, tu: (f, s) => { s.deckel = true; s.geprueft.deckelR = true; }, grund: 'Ein loser Deckel lässt im Flug das Benzin herausziehen.' },
      { id: 'oel', text: 'Ölstand prüfen', ok: (f, s) => s.geprueft.oel && !s.oelWenig, tu: (f, s) => { s.geprueft.oel = true; s.oelWenig = false; }, grund: 'Mit zu wenig Öl geht der Motor nach ein paar Minuten kaputt.' },
      sch('huelle', false, 'Staurohr-Hülle abnehmen'),
      { id: 'ruder', text: 'Ruder am Heck bewegen: frei?', ok: (f, s) => s.geprueft.ruder, tu: (f, s) => { s.geprueft.ruder = true; }, grund: 'Ein Ruder, das hakt oder falsch herum angeschlossen ist, merkt man lieber am Boden.' },
      sch('keile', false, 'Bremskeile wegnehmen')
    ]
  },
  {
    id: 'vorAnlassen', name: 'Vor dem Anlassen', wo: 'Im Cockpit: Schalter stellen.',
    punkte: [sch('klemme', false, 'Ruderklemme abnehmen'), sch('gurte', true, 'Gurte anlegen'), sch('park', true), sch('hahn', true), sch('gemisch', true), sch('haupt', true), sch('warn', true)]
  },
  {
    id: 'anlassen', name: 'Anlassen', wo: 'Motor starten.',
    punkte: [
      { id: 'spalt', text: 'Gas einen Spalt auf (etwa 10 %)', ok: (f, s) => f.motorAn || (f.gas > 0.03 && f.gas < 0.3), tu: (f, s, e) => { if (e) e.gas = 0.1; }, tipp: true, grund: 'Ganz ohne Gas springt der Motor schlecht an, mit viel Gas macht das Flugzeug einen Satz.' },
      sch('zuend', true),
      { id: 'anlasser', text: 'Anlasser drücken, bis der Motor läuft', ok: f => f.motorAn, tu: (f, s) => { if (s.anlassZeit <= 0) anlassen(f); }, tipp: true, grund: 'Vorher rufen Piloten laut „Propeller frei!“.' },
      { id: 'oeldruck', text: 'Öldruck steigt (ein paar Sekunden warten)', ok: (f, s) => f.motorAn && s.laufZeit > 3, tu: () => { }, grund: 'Kommt kein Öldruck, muss der Motor sofort wieder aus.' }
    ]
  },
  {
    id: 'vorStart', name: 'Vor dem Start', wo: 'Zur Bahn rollen. Vor der Bahn anhalten und prüfen.',
    punkte: [
      sch('park', false, 'Parkbremse lösen und zur Bahn rollen'),
      { id: 'ruderFrei', text: 'Ruder frei: Knüppel einmal ganz in alle Richtungen', ok: (f, s) => s.ruderFrei, tu: (f, s) => { s.ruderFrei = true; }, grund: 'Letzte Gelegenheit zu merken, dass ein Ruder klemmt.' },
      { id: 'probe', text: 'Motor-Probe: mit Bremse 3 Sekunden halbes Gas', ok: (f, s) => s.motorProbe, tu: (f, s) => { s.motorProbe = true; }, grund: 'Läuft der Motor hier unrund, bleibt man am Boden.' },
      { id: 'trimm', text: 'Trimmung auf Start', ok: f => Math.abs(f.trimm - START_TRIMM) < 0.08, tu: f => { f.trimm = START_TRIMM; }, grund: 'Mit falscher Trimmung hebt das Flugzeug zu früh oder gar nicht ab.' },
      { id: 'klappenStart', text: 'Klappen 0° oder 10°', ok: f => f.klappenStufe <= 1, tu: f => { f.klappenStufe = 0; }, grund: 'Mit vollen Klappen steigt das Flugzeug kaum.' },
      sch('vorwaerm', false), sch('lande', true)
    ]
  },
  {
    id: 'nachStart', name: 'Nach dem Start', wo: 'Steigen mit 75 kn.',
    punkte: [{ id: 'klappenEin', text: 'Klappen einfahren', ok: f => f.klappenStufe === 0, tu: f => { f.klappenStufe = 0; }, grund: 'Klappen bremsen im Steigflug.' }]
  },
  {
    id: 'landung', name: 'Vor der Landung', wo: 'Im Gegenanflug vorbereiten.',
    punkte: [
      sch('vorwaerm', true), sch('gemisch', true), sch('lande', true),
      { id: 'klappenLandung', text: 'Klappen mindestens 10°', ok: f => f.klappenStufe >= 1, tu: f => { if (kn(f) < 100 && f.klappenStufe < 2) f.klappenStufe = 2; }, grund: 'Mit Klappen fliegt man langsamer und steiler an und braucht weniger Bahn.' }
    ]
  },
  {
    id: 'nachLandung', name: 'Nach der Landung', wo: 'Bahn verlassen, zum Vorfeld rollen.',
    punkte: [{ id: 'klappenWeg', text: 'Klappen einfahren', ok: f => f.klappenStufe === 0, tu: f => { f.klappenStufe = 0; }, grund: 'Am Boden wirft der Propeller sonst Steine gegen die Klappen.' }, sch('vorwaerm', false), sch('lande', false)]
  },
  {
    id: 'abstellen', name: 'Abstellen', wo: 'Auf dem Vorfeld: Motor aus, alles sichern, Flugbuch schreiben.',
    punkte: [
      sch('park', true),
      { id: 'leerlauf', text: 'Gas auf Leerlauf', ok: f => f.gas < 0.08, tu: (f, s, e) => { if (e) e.gas = 0; }, grund: 'Der Motor soll vor dem Abstellen kurz ruhig laufen.' },
      sch('gemisch', false, 'Gemisch abstellen (Motor aus)'), sch('zuend', false), sch('warn', false, 'Warnlicht aus'), sch('haupt', false),
      sch('klemme', true, 'Ruderklemme einsetzen'), sch('keile', true, 'Aussteigen: Bremskeile vorlegen'), sch('huelle', true, 'Staurohr-Hülle aufsetzen')
    ]
  }
];
const nrVon = id => PHASEN.findIndex(p => p.id === id);

// ---------------------------------------------------------------- der Ablauf eines ganzen Flugs
export class Ablauf {
  constructor(modus = 'gefuehrt') {
    this.modus = modus; this.nr = 0; this.t = 0; this.flugZeit = 0;
    this.vergessen = [];             // { phase, text, grund } – was beim Ende eines Abschnitts nicht erledigt war
    this.gezaehlt = 0;               // wie viele Punkte schon bewertet sind
    this.meldungen = [];             // { text, art }
    this.hilfeZeit = 1.5; this.stehZeit = 0; this.warHoch = false; this.fertig = false; this.eintrag = null;
  }
  get phase() { return PHASEN[this.nr]; }
  // Stand der aktuellen Liste: [{ text, ok, tipp }]
  liste(f) { return this.phase.punkte.map(p => ({ id: p.id, text: p.text, ok: !!p.ok(f, f.sys), tipp: !!p.tipp, grund: p.grund })); }
  // In „Geführt“: einen Punkt in der Liste antippen. Geht nur bei Schaltern.
  tippe(f, id, e) { const p = this.phase.punkte.find(x => x.id === id); if (p && p.tipp && this.modus === 'gefuehrt' && !p.ok(f, f.sys)) p.tu(f, f.sys, e); }
  // Abschnitt beenden: Was nicht erledigt ist, kommt auf den Merkzettel fürs Flugbuch
  wechsle(f, zuId) {
    for (const p of this.phase.punkte) { this.gezaehlt++; if (!p.ok(f, f.sys)) this.vergessen.push({ phase: this.phase.name, text: p.text, grund: p.grund }); }
    this.nr = nrVon(zuId); this.hilfeZeit = 2; this.stehZeit = 0;
    this.meldungen.push({ text: `Checkliste „${this.phase.name}“: ${this.phase.wo}`, art: 'info' });
  }
  // nach jedem Bild. e = Eingabe des Spiels (damit die Hilfe auch das Gas stellen kann), flug = Flug aus flug.js
  schritt(f, dt, flug, e) {
    if (this.fertig) return;
    const s = f.sys, id = this.phase.id, alle = this.phase.punkte.every(p => p.ok(f, s));
    this.t += dt; if (!f.amBoden) this.flugZeit += dt;
    // Mit Hilfe: alle zwei Sekunden macht das Spiel den nächsten offenen Punkt und sagt, warum
    if (this.modus === 'hilfe' && !f.bruch) {
      this.hilfeZeit -= dt;
      const offen = this.phase.punkte.find(p => !p.ok(f, s));
      if (offen && this.hilfeZeit <= 0 && this.hilfeDarf(f, offen)) {
        offen.tu(f, s, e); this.hilfeZeit = 2.4;
        if (offen.id !== 'oeldruck') this.meldungen.push({ text: `✔ ${offen.text}. ${offen.grund}`, art: 'gut' });
      }
    }
    // Wann geht es zum nächsten Abschnitt?
    if (id === 'aussen' && s.drin) this.wechsle(f, 'vorAnlassen');
    else if (id === 'vorAnlassen' && (alle || f.motorAn)) this.wechsle(f, 'anlassen');
    else if (id === 'anlassen' && f.motorAn && s.laufZeit > 3) this.wechsle(f, 'vorStart');
    else if (id === 'vorStart' && !f.amBoden && fuss(f) > 50) this.wechsle(f, 'nachStart');
    else if (id === 'nachStart' && (fuss(f) > 800 || (alle && fuss(f) > 600))) { this.warHoch = true; this.wechsle(f, 'landung'); }
    else if ((id === 'landung' || id === 'nachStart') && f.amBoden && kn(f) < 40) this.wechsle(f, 'nachLandung');
    else if (id === 'nachLandung') {
      if (!f.amBoden && fuss(f) > 50) this.wechsle(f, 'nachStart');                 // durchgestartet: noch eine Runde
      this.stehZeit = f.amBoden && tempoBoden(f) < 0.5 ? this.stehZeit + dt : 0;
      const nebenBahn = Math.abs(f.p[0]) > PLATZ.breit / 2 + 5;
      if (this.stehZeit > 2 && (nebenBahn || alle)) this.wechsle(f, 'abstellen');
    }
  }
  // Manche Handgriffe macht auch die Hilfe erst, wenn es passt
  hilfeDarf(f, p) {
    if (p.id === 'park' && this.phase.id === 'vorStart') return true;
    if (this.phase.id === 'nachStart') return fuss(f) > 250;
    if (p.id === 'klappenLandung') return f.steig < -0.5 && fuss(f) < 950;       // Klappen erst, wenn es wirklich abwärts geht
    if (this.phase.id === 'abstellen' && (p.id === 'keile' || p.id === 'huelle' || p.id === 'klemme')) return !f.motorAn && tempoBoden(f) < 0.5;
    if (this.phase.id === 'abstellen') return tempoBoden(f) < 0.5;
    return true;
  }
  // Darf das Flugbuch geschrieben werden? Erst wenn das Flugzeug steht und der Motor aus ist (oder nach einem Bruch).
  kannEnden(f) { return !this.fertig && (f.bruch || (f.amBoden && tempoBoden(f) < 0.5 && !f.motorAn && this.nr >= nrVon('nachLandung'))); }
  // Flug beenden und den Eintrag fürs Flugbuch bauen
  ende(f, flug, datum = new Date()) {
    if (this.nr !== nrVon('abstellen') && !f.bruch) this.wechsle(f, 'abstellen');
    if (!f.bruch) for (const p of this.phase.punkte) { this.gezaehlt++; if (!p.ok(f, f.sys)) this.vergessen.push({ phase: this.phase.name, text: p.text, grund: p.grund }); }
    const V = PLATZ.vorfeld, amPlatz = Math.hypot(f.p[0] - V.x, f.p[2] - V.z) < 70, n = this.vergessen.length;
    const regeln = f.bruch ? 1 : Math.max(1, 5 - n - (amPlatz ? 0 : 1));
    this.fertig = true;
    this.eintrag = {
      datum: datum.toISOString(), modus: this.modus, dauer: Math.round(this.t), flugZeit: Math.round(this.flugZeit), landungen: flug.landungen,
      landung: flug.note ? flug.note.sterne : 0, landeText: flug.note ? flug.note.text : '', regeln, bruch: f.bruch || null, amPlatz,
      vergessen: this.vergessen, sprit: liter(f), batterieAn: !!f.sys.haupt
    };
    return this.eintrag;
  }
}

// ---------------------------------------------------------------- Flugbuch und der Zustand des Flugzeugs zwischen zwei Flügen
const BUCH = 'flugsim.flugbuch.v1', ZUSTAND = 'flugsim.zustand.v1';
const lies = (speicher, name, leer) => { try { return JSON.parse(speicher.getItem(name)) || leer; } catch (e) { return leer; } };
export const ladeBuch = speicher => lies(speicher, BUCH, []);
// Was vom letzten Flug übrig ist: Benzin im Tank (kg) und ob die Batterie leer ist. Beim allerersten Flug: 20 kg (knapp 30 Liter).
export const ladeZustand = speicher => ({ sprit: 20, batterieLeer: false, ...lies(speicher, ZUSTAND, {}) });
export function schreibeBuch(speicher, eintrag, f) {
  const buch = ladeBuch(speicher); buch.unshift(eintrag); buch.length = Math.min(buch.length, 40);
  try { speicher.setItem(BUCH, JSON.stringify(buch)); speicher.setItem(ZUSTAND, JSON.stringify({ sprit: +f.sprit.toFixed(1), batterieLeer: !!f.sys.haupt })); } catch (e) { /* egal */ }
  return buch;
}
// Zeiten schön schreiben: 372 → „6:12“
export const minuten = sek => `${Math.floor(sek / 60)}:${String(Math.round(sek % 60)).padStart(2, '0')}`;
