// Flugsimulator – Funk am kleinen Flugplatz. Ohne Grafik.
//
// An kleinen Plätzen gibt es keinen Lotsen, sondern einen Flugleiter („Info“). Er gibt keine Befehle, er gibt Auskunft:
// welche Bahn in Betrieb ist, woher der Wind kommt, ob jemand in der Platzrunde ist. Der Pilot sagt, wer er ist,
// wo er ist und was er vorhat – und wiederholt das Wichtige („zurücklesen“), damit beide sicher dasselbe meinen.
// Im Spiel wählt man seinen Funkspruch aus drei Antworten. Die falschen sind typische Fehler.
// Das Kennzeichen D-ELRC ist ausgedacht.
import { FT, GRAD } from './flugzeuge.js';
import { NM, NN } from './region.js';
import { grad3 } from './navigation.js';

export const RUF = 'D-ELRC', RUF_LAUT = 'Delta Echo Lima Romeo Charlie';
// So spricht die Stimme einen Spruch: Kennzeichen buchstabiert, Bahn-Zahlen einzeln („zwo fünf“)
const ZIFFER = ['null', 'eins', 'zwo', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'];
export const laut = text => text.replaceAll(RUF, RUF_LAUT).replace(/Piste (\d)(\d)/g, (m, a, b) => `Piste ${ZIFFER[a]} ${ZIFFER[b]}`).replace(/QNH (\d)(\d)(\d)(\d)/g, (m, a, b, c, d) => `Q N H ${ZIFFER[a]} ${ZIFFER[b]} ${ZIFFER[c]} ${ZIFFER[d]}`);
// Aus diesen Stücken setzt der Flugleiter seine Sprüche zusammen. Für jedes Stück gibt es eine Aufnahme
// (sprache/info/<name>.mp3, siehe tools/sprache.mjs): text = so steht es im Funkspruch, laut = so wird es gesprochen.
// plaetze = die Flugplätze aus region.js, winde = alle Wind-Texte, die vorkommen können (aus windText).
const ZAHL = ['null', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn', 'zwanzig'];
export function funkStuecke(plaetze, winde) {
  const z = t => t.replace(/\d/g, d => ZIFFER[d] + ' ').trim(), kurz = n => n.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_');
  const s = [{ name: 'ruf', text: RUF, laut: RUF_LAUT + ',' }, { name: 'qnh', text: 'QNH 1013', laut: 'Q N H eins null eins drei,' },
    { name: 'kein_verkehr', text: 'Kein Verkehr gemeldet', laut: 'Kein Verkehr gemeldet.' }, { name: 'in_betrieb', text: 'in Betrieb', laut: 'in Betrieb,' },
    { name: 'platzrunde', text: 'Platzrunde links herum', laut: 'Platzrunde links herum.' }, { name: 'piste_frei', text: 'Piste frei', laut: 'Piste frei,' },
    { name: 'wiederhoeren', text: 'auf Wiederhören und guten Flug', laut: 'auf Wiederhören und guten Flug!' },
    { name: 'wiederholen', text: 'bitte wiederholen Sie', laut: 'bitte wiederholen Sie.' }, { name: 'negativ', text: 'negativ, ich wiederhole', laut: 'negativ, ich wiederhole.' }];
  const bahnen = new Set();
  for (const P of plaetze) {
    s.push({ name: 'info_' + P.id, text: `${P.name} Info`, laut: `${P.name} Info,` }, { name: 'willkommen_' + P.id, text: `willkommen in ${P.name}`, laut: `willkommen in ${P.name}!` });
    P.bahnen.forEach(b => bahnen.add(b));
  }
  for (const b of [...bahnen].sort()) s.push({ name: 'piste_' + b, text: `Piste ${b}`, laut: `Piste ${z(b)},` });
  for (const w of new Set(winde)) s.push({ name: kurz(w), text: w, laut: w.replace(/(\d+) Grad/, (m, g) => z(g) + ' Grad').replace(/(\d+) Knoten/, (m, k) => (ZAHL[k] || k) + ' Knoten') + ',' });
  return s;
}
const HIMMEL = ['nördlich', 'nordöstlich', 'östlich', 'südöstlich', 'südlich', 'südwestlich', 'westlich', 'nordwestlich'];
// Auch der Pilot (du) hat eine Stimme: Seine Funksprüche werden genauso aus Stücken zusammengesetzt (sprache/pilot/<name>.mp3).
// plaetze = die Flugplätze, namen = alle Namen, die als Wegpunkt vorkommen können (aus PUNKTE in navigation.js).
export function pilotStuecke(plaetze, namen) {
  const z = t => t.replace(/\d/g, d => ZIFFER[d] + ' ').trim(), kurz = n => n.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_');
  const s = [{ name: 'ruf', text: RUF, laut: RUF_LAUT + ',' }, { name: 'lerche', text: 'Lerche 172', laut: 'Lerche eins sieben zwo,' }, { name: 'an_der', text: 'an der', laut: 'an der' },
    { name: 'abflugbereit', text: 'abflugbereit', laut: 'abflugbereit.' }, { name: 'ich_fliege_los', text: 'ich fliege jetzt los', laut: 'ich fliege jetzt los.' },
    { name: 'erbitte_landung', text: 'erbitte Landung', laut: 'erbitte Landung.' }, { name: 'qnh', text: 'QNH 1013', laut: 'Q N H eins null eins drei,' }, { name: 'ich_starte', text: 'ich starte', laut: 'ich starte,' },
    { name: 'verstanden', text: 'Verstanden, danke', laut: 'Verstanden, danke.' }, { name: 'verlaesst', text: 'verlässt die Platzrunde Richtung', laut: 'verlässt die Platzrunde Richtung' },
    { name: 'wiederhoeren', text: 'auf Wiederhören', laut: 'auf Wiederhören!' }, { name: 'erbitte_rollen', text: 'erbitte Rollen zum Vorfeld', laut: 'erbitte Rollen zum Vorfeld.' },
    { name: 'endanflug', text: 'Endanflug', laut: 'Endanflug' }, { name: 'gegenanflug', text: 'Gegenanflug', laut: 'Gegenanflug' }, { name: 'zur_landung', text: 'zur Landung', laut: 'zur Landung.' },
    { name: 'alles_klar', text: 'Alles klar, ich komme', laut: 'Alles klar, ich komme,' }, { name: 'gelandet', text: 'gelandet, rolle zum Vorfeld. Danke', laut: 'gelandet, rolle zum Vorfeld. Danke!' },
    { name: 'startinfo', text: 'erbitte Startinformation', laut: 'erbitte Startinformation.' }, { name: 'sichtflug', text: 'Sichtflug nach', laut: 'Sichtflug nach' }, { name: 'rundflug', text: 'Rundflug über', laut: 'Rundflug über' },
    { name: 'des_platzes', text: 'des Platzes', laut: 'des Platzes,' }, { name: 'fuss', text: 'Fuß', laut: 'Fuß,' }];
  const bahnen = new Set();
  for (const P of plaetze) { s.push({ name: 'info_' + P.id, text: `${P.name} Info`, laut: `${P.name} Info,` }, { name: 'hallo_' + P.id, text: `Hallo ${P.name}`, laut: `Hallo ${P.name},` }); P.bahnen.forEach(b => bahnen.add(b)); }
  for (const b of [...bahnen].sort()) s.push({ name: 'piste_' + b, text: `Piste ${b}`, laut: `Piste ${z(b)},` });
  for (let n = 1; n <= 9; n++) s.push({ name: 'meilen_' + n, text: `${n} Meilen`, laut: n === 1 ? 'eine Meile' : `${ZIFFER[n]} Meilen` });
  for (const h of HIMMEL) s.push({ name: kurz(h), text: h, laut: h });
  for (let n = 1; n <= 13; n++) s.push({ name: 'tausend_' + n, text: `${n} tausend`, laut: `${ZAHL[n]}tausend` });
  for (let n = 1; n <= 9; n++) s.push({ name: 'hundert_' + n, text: `${n} hundert`, laut: `${ZAHL[n]}hundert` });
  for (const n of new Set(namen)) s.push({ name: 'ort_' + kurz(n), text: n, laut: n + ',' });
  return s;
}
// Macht aus einem Funkspruch des Piloten den Text, der sich aus Stücken zusammensetzen lässt: „4500 Fuß“ → „4 tausend 5 hundert Fuß“
export const pilotText = text => text.replace(/(\d+) Fuß/, (m, f) => [f >= 1000 ? Math.floor(f / 1000) + ' tausend' : '', f % 1000 >= 100 ? Math.floor(f % 1000 / 100) + ' hundert' : '', 'Fuß'].filter(Boolean).join(' '));
// In welcher Himmelsrichtung vom Platz ist das Flugzeug? (+x ist Westen)
export const richtungVon = (P, x, z) => HIMMEL[Math.round(((Math.atan2(-(x - P.mx), z - P.mz) / GRAD) % 360 + 360) % 360 / 45) % 8];

// Die Funksprüche eines Überlandflugs, der Reihe nach. Jeder hat: wann = wann er dran ist, frage = was man selbst sagt
// (die erste Antwort ist richtig, gemischt wird beim Anzeigen), info = was der Flugleiter antwortet,
// zurueck = was man danach wiederholen muss (oder nichts).
// l = Lage: { start, ziel (Plätze), bahnStart, bahnZiel (Zahlen als Text), andereZiel, wind: 'Wind 270 Grad, 8 Knoten', naechster (Name des ersten Wegpunkts), vorhaben: 'Sichtflug nach …' oder 'Rundflug über …' }
export const SPRUECHE = [
  { id: 'start', name: 'Vor dem Start', wann: (f, l) => f.amBoden && !l.warOben && l.bereit !== false, vorbei: (f, l) => l.warOben,
    frage: l => [`${l.start.name} Info, ${RUF}, Lerche 172 an der Piste ${l.bahnStart}, ${l.vorhaben}, abflugbereit.`, `Hallo ${l.start.name}, ich fliege jetzt los.`, `${l.start.name} Info, ${RUF}, erbitte Landung.`],
    info: l => `${RUF}, ${l.start.name} Info, Piste ${l.bahnStart}, ${l.wind}, QNH 1013. Kein Verkehr gemeldet.`,
    zurueck: l => [`Piste ${l.bahnStart}, QNH 1013, ich starte, ${RUF}.`, `Piste ${l.bahnStartFalsch}, QNH 1013, ich starte, ${RUF}.`, 'Verstanden, danke.'],
    falsch: ['Man nennt zuerst die Station, dann das eigene Kennzeichen, dann wo man ist und was man vorhat.', 'Die Bahn und das QNH liest man genau zurück – „verstanden“ reicht nicht.'] },
  { id: 'abflug', name: 'Platz verlassen', wann: (f, l) => l.warOben && l.vomStart > 4000 && l.vomStart < 15000, vorbei: (f, l) => l.vomStart > 15000,
    frage: l => [`${RUF} verlässt die Platzrunde Richtung ${l.naechster}, auf Wiederhören.`, `${RUF}, erbitte Rollen zum Vorfeld.`, `${l.start.name} Info, ${RUF}, Endanflug Piste ${l.bahnStart}.`],
    info: l => `${RUF}, auf Wiederhören und guten Flug.`,
    falsch: ['Du bist gerade abgeflogen: Jetzt sagt man nur, wohin man den Platz verlässt.'] },
  { id: 'anflug', name: 'Vor dem Zielplatz', wann: (f, l) => l.letztes && l.zumZiel < 16000 && !f.amBoden, vorbei: (f, l) => l.zumZiel < 3500 || f.amBoden && l.amZiel,
    frage: l => [`${l.ziel.name} Info, ${RUF}, Lerche 172, ${l.meilen} Meilen ${l.richtung} des Platzes, ${l.fuss} Fuß, zur Landung.`, `${l.start.name} Info, ${RUF}, ${l.meilen} Meilen ${l.richtung}, zur Landung.`, `${l.ziel.name} Info, ${RUF}, abflugbereit.`],
    info: l => `${RUF}, ${l.ziel.name} Info, Piste ${l.bahnZiel} in Betrieb, ${l.wind}, QNH 1013, Platzrunde links herum.`,
    zurueck: l => [`Piste ${l.bahnZiel}, QNH 1013, ${RUF}.`, `Piste ${l.andereZiel}, QNH 1013, ${RUF}.`, `Alles klar, ich komme, ${RUF}.`],
    falsch: ['Am Zielplatz ruft man dessen Flugleiter, sagt wo und wie hoch man ist und dass man landen will.', 'Die Bahn in Betrieb liest man genau zurück. Sie richtet sich nach dem Wind: Gelandet wird gegen den Wind.'] },
  { id: 'endanflug', name: 'Im Endanflug', wann: (f, l) => l.aufLinie && !f.amBoden, vorbei: (f, l) => f.amBoden && l.amZiel,
    frage: l => [`${RUF}, Endanflug Piste ${l.bahnJetzt}.`, `${RUF}, Gegenanflug Piste ${l.bahnJetzt}.`, `${RUF}, abflugbereit Piste ${l.bahnJetzt}.`],
    info: l => `${RUF}, Piste frei, ${l.wind}.`,
    falsch: ['Du fliegst gerade auf die Bahn zu: Das ist der Endanflug.'] },
  { id: 'gelandet', name: 'Nach der Landung', wann: (f, l) => f.amBoden && l.amZiel && l.warOben && l.tempo < 12, vorbei: () => false,
    frage: l => [`${RUF}, gelandet, rolle zum Vorfeld. Danke!`, `${RUF}, Endanflug Piste ${l.bahnZiel}.`, `${RUF}, erbitte Startinformation.`],
    info: l => `${RUF}, willkommen in ${l.ziel.name}!`,
    falsch: ['Du bist gelandet: Jetzt meldet man nur noch, dass man die Bahn verlässt.'] }
];

export class Funk {
  // zufall = Würfel für das Mischen der Antworten (das Prüfwerkzeug gibt einen festen mit, damit es immer dasselbe sieht)
  constructor(zufall = Math.random) { this.zufall = zufall; this.nr = 0; this.stufe = 0; this.frage = null; this.sagen = []; this.richtig = 0; this.falsch = 0; this.verpasst = []; this.verlauf = []; this.wart = 0; }
  get fertig() { return this.nr >= SPRUECHE.length; }
  // Antworten mischen: Die richtige steht jedes Mal an einem anderen Platz (sonst lernt man nur die Plätze auswendig)
  stelle(texte, was, l) {
    const reihe = [0, 1, 2]; for (let i = 2; i > 0; i--) { const j = Math.floor(this.zufall() * (i + 1)); [reihe[i], reihe[j]] = [reihe[j], reihe[i]]; }
    this.frage = { name: SPRUECHE[this.nr].name, was, antworten: reihe.map(i => ({ text: texte[i], richtig: i === 0 })) }; this.l = { ...l };
  }
  // jedes Bild: Ist ein Funkspruch dran? Ist einer verpasst?
  schritt(f, l, dt) {
    if (this.fertig) return;
    const S = SPRUECHE[this.nr];
    this.wart -= dt;
    if (!this.frage) {
      if (S.vorbei(f, l)) { this.verpasst.push(S.name); this.nr++; this.stufe = 0; return; }
      if (this.wart <= 0 && S.wann(f, l)) this.stelle(S.frage(l), 'Dein Funkspruch', l);
    } else if (this.stufe === 0 && S.vorbei(f, l)) { this.frage = null; this.verpasst.push(S.name); this.nr++; }
  }
  // Der Pilot hat Antwort i gewählt
  waehle(i) {
    if (!this.frage) return;
    const S = SPRUECHE[this.nr], a = this.frage.antworten[i], l = this.l; if (!a) return;
    this.sagen.push({ wer: 'Du', text: a.text });
    if (!a.richtig) {
      this.falsch++; this.verlauf.push({ spruch: S.name, falsch: a.text });
      this.sagen.push({ wer: 'Info', text: this.stufe === 0 ? `${RUF}, bitte wiederholen Sie.` : `${RUF}, negativ, ich wiederhole.`, tipp: S.falsch[Math.min(this.stufe, S.falsch.length - 1)] });
      return;                                              // die Frage bleibt stehen: noch einmal
    }
    this.richtig++;
    if (this.stufe === 0) {
      this.sagen.push({ wer: 'Info', text: S.info(l) });
      if (S.zurueck) { this.stufe = 1; this.stelle(S.zurueck(l), 'Lies zurück', l); return; }
    }
    this.frage = null; this.stufe = 0; this.nr++; this.wart = 2;
  }
}
// Für die Lage: Entfernung in Meilen und Höhe in Fuß schön gerundet
export const meilen = m => Math.max(1, Math.round(m / NM));
export const fussMeer = y => Math.round((y + NN) / FT / 100) * 100;
export const windText = (aus, kn) => kn < 1 ? 'Wind still' : `Wind ${grad3(Math.round(aus / 10) * 10 * GRAD)} Grad, ${Math.round(kn)} Knoten`;
