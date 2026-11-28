// Flugsimulator – die Unterlagen für die Flugvorbereitung als Zahlen (ohne Grafik, das Prüfwerkzeug tools/flugplan.mjs rechnet mit):
//
// 1. Das Flugplatz-Blatt: alles, was man für Start und Landung an einem Platz wissen muss
//    (Pisten mit Nummer, genauem Kurs, Länge und Belag, Platzhöhe, Platzrunde, Funk, Funkfeuer, Gelände rundherum, Wind).
// 2. Der Flugdurchführungsplan: der ganze geplante Flug Stück für Stück – wann man wo ist, wie hoch, mit welchem Kurs,
//    wie schnell, wie viel Sprit schon weg ist. So ein Blatt füllen Piloten vor jedem Überlandflug aus.
//
// Die Zeiten und der Sprit stimmen mit dem Flugplaner überein (rechne in navigation.js). Neu ist hier nur, dass der Flug
// in Steigflug, Reiseflug, Sinkflug und Platzrunde aufgeteilt wird.
import { FT, GRAD } from './flugzeuge.js';
import { PLAETZE, ORTE, SEEN, GIPFEL, platzVon, platzWelt, bahnBeiWind, bahnKurs, bodenHoehe, NN, NM } from './region.js';
import { rechne, kursVon, wickel, grad3, FEUER, REISE } from './navigation.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const auf100 = ft => Math.ceil(ft / 100 - 1e-9) * 100;
export const fussMeer = y => (y + NN) / FT;                  // Höhe im Spiel (Meter ab Lerchenfeld) → Fuß über dem Meer

// ---------------------------------------------------------------- Zahlen zum Einstellen
export const RUNDE_HOCH = 1000;      // die Platzrunde liegt so viele Fuß über dem Platz
export const RUNDE_AB = 1500;        // der Gegenanflug liegt so viele Meter neben der Bahn
export const RUNDE_VOR = 2000;       // so weit vor dem Bahnanfang dreht man in den Endanflug (Meter)
export const RUNDE_NACH = 1000;      // so weit hinter dem Bahnende dreht man nach dem Start ab (Meter)
export const SINKEN = 500;           // geplanter Sinkflug: Fuß je Minute
export const EBEN_VOR = 3;           // so viele Meilen vor dem Zielplatz will man schon auf der Höhe der Platzrunde sein
export const STARTLAUF = 330;        // so viele Meter braucht die Lerche ungefähr bis zum Abheben (nachgemessen in tools/flugtest.mjs)
// Funk-Frequenzen der Flugleiter. Im Spiel muss man sie nicht einstellen – sie stehen nur auf dem Blatt wie bei einem echten.
// Alle Zahlen sind ausgedacht (nicht die echten Frequenzen der Plätze).
export const FREQUENZ = { lerchenfeld: '123,450', augsburg: '124,350', schleissheim: '122,850', vogtareuth: '118,650', koenigsdorf: '122,300', ohlstadt: '123,650' };

const HIMMEL = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
export const himmel = kurs => HIMMEL[Math.round(((kurs / GRAD) % 360 + 360) % 360 / 45) % 8];

// ---------------------------------------------------------------- Das Flugplatz-Blatt
// Ort von der Landebahn aus (laengs = Meter hinter dem Bahnanfang in Landerichtung, quer = Meter rechts der Mitte) → Ort in der Welt.
// ende 0 = erste Bahn (Richtung P.kurs), 1 = die Gegenrichtung. Das ist die Umkehrung von bahnLage in region.js.
export const bahnOrt = (P, ende, laengs, quer) => ende ? platzWelt(P, quer, P.lang - laengs) : platzWelt(P, -quer, laengs);

// Die Platzrunde für eine Landerichtung: ein Rechteck links herum. Gibt die Ecken zurück (in der Welt) und die Kurse der vier Seiten.
export function rundeVon(P, ende) {
  const k = bahnKurs(P, ende), L = P.lang;
  const ecken = [[0, 0], [L + RUNDE_NACH, 0], [L + RUNDE_NACH, -RUNDE_AB], [-RUNDE_VOR, -RUNDE_AB], [-RUNDE_VOR, 0], [P.zielpunkt, 0]].map(([l, q]) => bahnOrt(P, ende, l, q));
  // Wie hoch ist das Gelände unter der Platzrunde? (alle 150 m nachsehen)
  let hoch = -Infinity;
  for (let i = 1; i < ecken.length; i++) { const a = ecken[i - 1], b = ecken[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 150));
    for (let j = 0; j <= n; j++) hoch = Math.max(hoch, bodenHoehe(a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n)); }
  return { ecken, seite: 'links', hoch: fussMeer(hoch),
    teile: [{ name: 'Abflug', kurs: k }, { name: 'Querabflug', kurs: k - Math.PI / 2 }, { name: 'Gegenanflug', kurs: k + Math.PI }, { name: 'Queranflug', kurs: k + Math.PI / 2 }, { name: 'Endanflug', kurs: k }] };
}

// Höchstes Gelände in einem Stück Kreis um den Platz (von Kurs a bis Kurs b, bis `weit` Meter), in Fuß über dem Meer
function sektorHoch(P, a, b, weit) {
  let hoch = -Infinity;
  for (let r = 500; r <= weit; r += 500) for (let w = a; w <= b + 1e-6; w += Math.max(4 * GRAD, 500 / r)) hoch = Math.max(hoch, bodenHoehe(P.mx - Math.sin(w) * r, P.mz + Math.cos(w) * r));
  return fussMeer(hoch);
}

// Alles über einen Flugplatz. wind = { aus: Grad, kn } (wie in WETTER) – daraus die Bahn in Betrieb und der Wind von vorn und von der Seite.
export function platzBlatt(P, wind = { aus: 0, kn: 0 }) {
  const meer = P.meer / FT, wAus = wind.aus * GRAD, inBetrieb = bahnBeiWind(P, wAus, wind.kn), rundeHoehe = auf100(meer + RUNDE_HOCH);
  const bahnen = [0, 1].map(ende => {
    const k = bahnKurs(P, ende), runde = rundeVon(P, ende), [sx, sz] = bahnOrt(P, ende, 0, 0);
    // Gelände im Anflug (5 km vor der Bahn) und im Abflug (5 km dahinter), je ein Streifen von 600 m Breite
    const streifen = (von, bis) => { let h = -Infinity; for (let l = von; l <= bis; l += 200) for (const q of [-300, 0, 300]) { const [x, z] = bahnOrt(P, ende, l, q); h = Math.max(h, bodenHoehe(x, z)); } return fussMeer(h); };
    return { ende, nr: P.bahnen[ende], kurs: k, grad: grad3(k), lang: P.lang, breit: P.breit, belag: P.belag, schwelle: { x: sx, z: sz }, zielpunkt: P.zielpunkt,
      papi: P.id === 'lerchenfeld', runde, anflugHoch: streifen(-5000, -300), abflugHoch: streifen(P.lang + 300, P.lang + 5000),
      // Wind: gegen = von vorn (minus = Rückenwind), seite = von rechts (minus = von links)
      gegen: wind.kn * Math.cos(wAus - k), seite: wind.kn * Math.sin(wAus - k), inBetrieb: ende === inBetrieb };
  });
  // Die vier Himmelsrichtungen bis 10 km: höchstes Gelände und die sichere Höhe (1000 Fuß darüber, auf 100 aufgerundet)
  const sektoren = [0, 1, 2, 3].map(i => { const hoch = sektorHoch(P, i * Math.PI / 2, (i + 1) * Math.PI / 2, 10000); return { name: ['Nordost', 'Südost', 'Südwest', 'Nordwest'][i], von: i * 90, hoch, sicher: auf100(hoch + 1000) }; });
  const peil = q => ({ kurs: kursVon(P.mx, P.mz, q.x, q.z), nm: Math.hypot(q.x - P.mx, q.z - P.mz) / NM });
  // Funkfeuer in der Nähe: kurs = vom Platz zum Sender, vomFeuer = in welcher Richtung der Platz vom Sender aus liegt
  const feuer = FEUER.map(F => ({ id: F.id, name: F.kurz, x: F.x, z: F.z, ...peil(F) })).map(F => ({ ...F, vomFeuer: F.kurs + Math.PI })).sort((a, b) => a.nm - b.nm).slice(0, 2);
  // Woran erkennt man den Platz aus der Luft? Orte, Seen und Gipfel bis 12 Meilen
  const marken = [...ORTE.map(o => ({ name: o.name, art: 'Ort', x: o.x, z: o.z, gross: o.gross })), ...SEEN.map(s => ({ name: s.name, art: 'See', x: s.x, z: s.z, gross: 2 })),
    ...GIPFEL.map(g => ({ name: `${g.name} (${Math.round(g.meer / FT / 100) * 100} ft)`, art: 'Gipfel', x: g.x, z: g.z, gross: 1 }))]
    .map(m => ({ ...m, ...peil(m) })).filter(m => m.nm < 12 && m.nm > 0.3).sort((a, b) => a.nm - b.nm).slice(0, 6);
  const hinweise = [];
  if (P.belag === 'gras') hinweise.push('Grasbahn: Das Flugzeug rollt holpriger. Die Bahn ist von oben schwerer zu sehen als Asphalt.');
  if (P.lang < 700) hinweise.push(`Kurze Bahn (${P.lang} m): Im Anflug nicht schneller als 65 kn, volle Klappen, am Anfang der Bahn aufsetzen.`);
  for (const B of bahnen) {
    if (B.runde.hoch > rundeHoehe - 500) hinweise.push(`Vorsicht in der Platzrunde der Piste ${B.nr}: Das Gelände reicht dort bis ${auf100(B.runde.hoch)} ft – nur ${Math.round((rundeHoehe - B.runde.hoch) / 50) * 50} ft unter der Platzrunde.`);
    if (B.anflugHoch > meer + 400) hinweise.push(`Anflug auf die Piste ${B.nr}: Vor der Bahn liegt Gelände bis ${auf100(B.anflugHoch)} ft. Nicht zu früh sinken.`);
    if (B.abflugHoch > meer + 400) hinweise.push(`Start auf der Piste ${B.nr}: Hinter der Bahn steigt das Gelände bis ${auf100(B.abflugHoch)} ft an.`);
  }
  if (!bahnen[0].papi) hinweise.push('Keine Anflug-Lichter (PAPI): Die Höhe im Anflug schätzt du selbst – die Bahn soll nicht flacher und nicht steiler aussehen als gewohnt.');
  const hoechstes = Math.max(...sektoren.map(s => s.hoch));
  return { id: P.id, name: P.name, text: P.text, meer, rundeHoehe, frequenz: FREQUENZ[P.id] || '–', ruf: `${P.name} Info`, belag: P.belag, bahnen, inBetrieb: bahnen[inBetrieb], sektoren, sicher: auf100(hoechstes + 1000), feuer, marken, hinweise,
    wind: { aus: wind.aus, kn: wind.kn, boe: wind.boe || 0 }, vorfeld: platzWelt(P, P.vorfeld.x, P.vorfeld.z), rollhalt: platzWelt(P, P.rollhalt.x, P.rollhalt.z), echt: P.id !== 'lerchenfeld' };
}
export const alleBlaetter = wind => PLAETZE.map(P => platzBlatt(P, wind));

// ---------------------------------------------------------------- Der Flugdurchführungsplan
// plan = { punkte, hoehe (Fuß über dem Meer), sprit (Liter im Tank, darf fehlen) }, wind = { aus, kn }.
// Zurück kommt:
//   stuecke = der Flug in Stücken, jedes mit gleichbleibendem Kurs und gleicher Flugart (Steigflug, Reiseflug, Sinkflug, Platzrunde)
//   zeilen  = die Stellen dazwischen (Start, Reisehöhe erreicht, Wegpunkte, Beginn des Sinkflugs, Platzrunde erreicht, Landung)
// Zeiten in Minuten ab dem Abheben, Strecken in Meilen (NM), Höhen in Fuß über dem Meer, Sprit in Litern.
export function flugplan(plan, wind = { aus: 0, kn: 0 }) {
  const R = rechne(plan, wind), B = R.beine, S = platzVon(plan.punkte[0]?.id), Z = platzVon(plan.punkte[plan.punkte.length - 1]?.id);
  if (!B.length || !S || !Z) return { ok: false, R, stuecke: [], zeilen: [], zeit: 0, liter: 0, weit: 0 };
  const hS = S.meer / FT, hZ = Z.meer / FT, k = REISE.steigTempo / R.tas;        // k: Im Steigflug kommt man nur so viel voran wie im Reiseflug mal k
  const anfang = [0]; for (const b of B) anfang.push(anfang[anfang.length - 1] + b.strecke);
  const D = anfang[B.length], eben = Math.max(0, D - Math.min(EBEN_VOR, D / 3));
  // Wo ist die Reisehöhe h erreicht? Vom Start aus Bein für Bein vorwärts gehen, bis die Steigzeit verbraucht ist.
  const steigEnde = h => { let t = Math.max(0, h - hS) / REISE.steigen; for (let i = 0; i < B.length; i++) { const kann = t * B[i].grund * k / 60; if (kann <= B[i].strecke) return anfang[i] + kann; t -= B[i].strecke / (B[i].grund * k) * 60; } return Infinity; };
  // Wo muss der Sinkflug beginnen? Von der Stelle „eben“ aus rückwärts gehen, bis die Sinkzeit verbraucht ist.
  const sinkAnfang = (h, hUnten) => {
    let t = Math.max(0, h - hUnten) / SINKEN, s = eben;
    for (let i = B.length - 1; i >= 0; i--) { if (s <= anfang[i]) continue; const stueck = s - anfang[i], kann = t * B[i].grund / 60; if (kann <= stueck) return s - kann; t -= stueck / B[i].grund * 60; s = anfang[i]; }
    return -Infinity;
  };
  // Ist die Strecke zu kurz, um so hoch zu steigen und wieder herunterzukommen? Dann die höchste Höhe suchen, die noch geht.
  const hRunde = auf100(hZ + RUNDE_HOCH);
  let hoch = Math.max(plan.hoehe, hS), gekuerzt = false;
  const passt = h => steigEnde(h) <= sinkAnfang(h, Math.min(hRunde, h)) + 1e-9;
  if (!passt(hoch)) { gekuerzt = true; let a = hS, b = hoch; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (passt(m)) a = m; else b = m; } hoch = a; }
  const hUnten = Math.min(hRunde, hoch), sToc = Math.min(D, steigEnde(hoch)), sTod = clamp(sinkAnfang(hoch, hUnten), sToc, eben);
  // Alle Stellen, an denen sich etwas ändert, der Reihe nach
  const stellen = [{ s: 0, art: 'start', name: S.name }];
  if (hoch > hS + 1) stellen.push({ s: sToc, art: 'toc', name: 'Reisehöhe erreicht' });
  for (let i = 1; i < B.length; i++) stellen.push({ s: anfang[i], art: 'punkt', name: B[i].von.name, punkt: B[i].von });
  if (hoch > hUnten + 1) { stellen.push({ s: sTod, art: 'tod', name: 'Sinkflug beginnen' }); stellen.push({ s: eben, art: 'eben', name: 'Höhe der Platzrunde' }); }
  stellen.push({ s: D, art: 'ziel', name: Z.name });
  const rang = { start: 0, toc: 1, punkt: 2, tod: 3, eben: 4, ziel: 5 };
  stellen.sort((a, b) => a.s - b.s || rang[a.art] - rang[b.art]);
  const ortBei = s => { let i = B.findIndex((b, n) => s <= anfang[n + 1] + 1e-9); if (i < 0) i = B.length - 1; const b = B[i], u = b.strecke ? clamp((s - anfang[i]) / b.strecke, 0, 1) : 0; return { i, x: b.von.x + (b.nach.x - b.von.x) * u, z: b.von.z + (b.nach.z - b.von.z) * u }; };
  const feuerBei = (x, z) => { let best = null; for (const F of FEUER) { const nm = Math.hypot(F.x - x, F.z - z) / NM; if (!best || nm < best.nm) best = { id: F.id, name: F.kurz, nm, kurs: kursVon(x, z, F.x, F.z) }; } return best; };
  const NAME = { steig: 'Steigflug', reise: 'Reiseflug', sink: 'Sinkflug', eben: 'Geradeaus zur Platzrunde', runde: 'Platzrunde und Landung' };
  // Die Stücke zwischen den Stellen
  const stuecke = []; let t = 0, liter = REISE.rollen, h = hS;
  for (let n = 1; n < stellen.length; n++) {
    const a = stellen[n - 1], e = stellen[n], lang = e.s - a.s; if (lang < 1e-6) continue;
    const mitte = (a.s + e.s) / 2, i = ortBei(mitte).i, b = B[i];
    const art = mitte < sToc ? 'steig' : mitte > sTod && mitte < eben && hoch > hUnten + 1 ? 'sink' : mitte >= eben && hoch > hUnten + 1 ? 'eben' : 'reise';
    const grund = b.grund * (art === 'steig' ? k : 1), min = lang / grund * 60, je = art === 'steig' ? REISE.steigVerbrauch : REISE.verbrauch;
    const h1 = art === 'steig' ? Math.min(hoch, h + min * REISE.steigen) : art === 'sink' ? Math.max(hUnten, h - min * SINKEN) : h;
    const A = ortBei(a.s), E = ortBei(e.s);
    stuecke.push({ art, name: NAME[art], bein: i, von: a.name, nach: e.name, nachPunkt: b.nach.name, s0: a.s, s1: e.s, lang, t0: t, t1: t + min, min, h0: h, h1, kurs: b.kurs, steuer: b.steuer, vor: b.vor, grund,
      ias: art === 'steig' ? REISE.steigTempo : REISE.tempo, steig: art === 'steig' ? REISE.steigen : art === 'sink' ? -SINKEN : 0, liter0: liter, liter1: liter + min / 60 * je, je,
      x0: A.x, z0: A.z, x1: E.x, z1: E.z, sicher: auf100(b.hoch + 1000), gelaende: b.hoch });
    t += min; liter += min / 60 * je; h = h1;
  }
  // Zum Schluss die Platzrunde am Ziel: fünf Minuten mit wenig Gas, von der Höhe der Platzrunde bis auf die Bahn
  const bz = bahnBeiWind(Z, wind.aus * GRAD, wind.kn), kz = bahnKurs(Z, bz), lz = REISE.anflug / 60 * REISE.anflugVerbrauch;
  stuecke.push({ art: 'runde', name: NAME.runde, bein: B.length - 1, von: Z.name, nach: `Piste ${Z.bahnen[bz]}`, nachPunkt: Z.name, s0: D, s1: D, lang: 0, t0: t, t1: t + REISE.anflug, min: REISE.anflug, h0: h, h1: hZ, kurs: kz, steuer: kz, vor: 0, grund: 0,
    ias: 65, steig: -(h - hZ) / REISE.anflug, liter0: liter, liter1: liter + lz, je: REISE.anflugVerbrauch, x0: Z.mx, z0: Z.mz, x1: Z.mx, z1: Z.mz, sicher: hRunde, gelaende: hZ });
  t += REISE.anflug; liter += lz;
  // Die Zeilen des Plans: jede Stelle mit Zeit, Höhe und Sprit – und was von dort an zu tun ist
  const tank = Number.isFinite(plan.sprit) ? plan.sprit : null;
  const WAS = { start: 'Start', toc: 'Reisehöhe erreicht', punkt: 'Wegpunkt', tod: 'Sinkflug beginnen', eben: 'Höhe der Platzrunde', ziel: 'Über dem Zielplatz', landung: 'Landung' };
  const zeilen = stellen.map(st => {
    const davor = [...stuecke].reverse().find(x => x.art !== 'runde' && x.s1 <= st.s + 1e-6), danach = stuecke.find(x => x.s0 >= st.s - 1e-6 && (x.lang > 0 || st.art === 'ziel'));
    const zeit = davor ? davor.t1 : 0, verbraucht = davor ? davor.liter1 : REISE.rollen, o = ortBei(st.s);
    return { art: st.art, was: WAS[st.art], name: st.name, s: st.s, rest: D - st.s, zeit, hoehe: davor ? davor.h1 : hS, verbraucht, tank: tank === null ? null : tank - verbraucht, x: o.x, z: o.z, feuer: feuerBei(o.x, o.z), danach: danach || null };
  });
  zeilen.push({ art: 'landung', was: WAS.landung, name: `${Z.name}, Piste ${Z.bahnen[bz]}`, s: D, rest: 0, zeit: t, hoehe: hZ, verbraucht: liter, tank: tank === null ? null : tank - liter, x: Z.mx, z: Z.mz, feuer: feuerBei(Z.mx, Z.mz), danach: null });
  // Wann wird gefunkt? (so wie das Spiel die Funksprüche auslöst)
  const funk = [{ zeit: 0, text: `Vor dem Start: ${S.name} Info rufen (${FREQUENZ[S.id]}), Piste und QNH zurücklesen.` }];
  const minBei = s => { const x = stuecke.find(q => q.lang > 0 && s <= q.s1 + 1e-9) || stuecke[stuecke.length - 2]; return x.t0 + (clamp(s, x.s0, x.s1) - x.s0) / (x.lang || 1) * x.min; };
  if (D > 5) funk.push({ zeit: minBei(Math.min(D, 4000 / NM)), text: 'Platzrunde verlassen: Abflug melden.' });
  funk.push({ zeit: minBei(Math.max(0, D - 16000 / NM)), text: `Etwa 8 Meilen vor dem Ziel: ${Z.name} Info rufen (${FREQUENZ[Z.id]}), Ort und Höhe sagen, Piste zurücklesen.` });
  funk.push({ zeit: t - 1.5, text: 'Im Endanflug melden.' }, { zeit: t, text: 'Nach der Landung melden und zum Vorfeld rollen.' });
  const hinweise = [...R.hinweise];
  if (gekuerzt) hinweise.push({ art: 'warn', text: `Die Strecke ist zu kurz für ${plan.hoehe} ft: Mehr als ${Math.floor(hoch / 100) * 100} ft schaffst du nicht, bevor du wieder sinken musst. Plane tiefer.` });
  return { ok: R.ok, R, stuecke, zeilen, funk, zeit: t, liter, weit: D, hoch, gekuerzt, hStart: hS, hZiel: hZ, hRunde: hUnten, start: S, ziel: Z, bahnStart: S.bahnen[bahnBeiWind(S, wind.aus * GRAD, wind.kn)], bahnZiel: Z.bahnen[bz],
    tas: R.tas, tank, reserve: REISE.reserve / 60 * REISE.verbrauch, noetig: R.noetig, hinweise, wind };
}

// Wo soll das Flugzeug nach `minute` Minuten sein – und wie hoch, mit welchem Kurs, wie schnell?
export function planBei(F, minute) {
  if (!F.stuecke.length) return null;
  const t = clamp(minute, 0, F.zeit), q = F.stuecke.find(x => t <= x.t1 + 1e-9) || F.stuecke[F.stuecke.length - 1], u = q.min ? clamp((t - q.t0) / q.min, 0, 1) : 0;
  const x = q.x0 + (q.x1 - q.x0) * u, z = q.z0 + (q.z1 - q.z0) * u, s = q.s0 + q.lang * u;
  // Die nächste Stelle im Plan und der nächste Wegpunkt
  const naechste = F.zeilen.find(Z => Z.zeit > t + 1e-6) || F.zeilen[F.zeilen.length - 1];
  const punkt = F.zeilen.find(Z => Z.zeit > t + 1e-6 && (Z.art === 'punkt' || Z.art === 'ziel')) || F.zeilen[F.zeilen.length - 1];
  const boden = Math.max(...[[0, 0], [1000, 0], [-1000, 0], [0, 1000], [0, -1000]].map(([a, b]) => bodenHoehe(x + a, z + b)));
  return { zeit: t, stueck: q, art: q.art, name: q.name, x, z, s, rest: F.weit - s, restMin: F.zeit - t, hoehe: q.h0 + (q.h1 - q.h0) * u, steig: q.steig, kurs: q.kurs, steuer: q.steuer, vor: q.vor, grund: q.grund, ias: q.ias,
    verbraucht: q.liter0 + (q.liter1 - q.liter0) * u, tank: F.tank === null ? null : F.tank - (q.liter0 + (q.liter1 - q.liter0) * u), naechste, bisNaechste: naechste.zeit - t,
    punkt, bisPunktMin: punkt.zeit - t, bisPunktNm: Math.max(0, punkt.s - s), gelaende: fussMeer(boden), sicher: q.sicher };
}
// Minuten als „12:30“
export const uhr = min => { const sek = Math.round(Math.max(0, min) * 60); return Math.floor(sek / 60) + ':' + String(sek % 60).padStart(2, '0'); };
export { wickel };
