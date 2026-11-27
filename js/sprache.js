// Flugsimulator – welche Aufnahme gehört zu welchem Satz? Ohne Grafik und ohne Ton, damit auch das Prüfwerkzeug es benutzen kann.
//
// Im Ordner sprache/ liegen Aufnahmen von drei Stimmen:
//   jule/    die Fluglehrerin (alles, was sie in der Flugschule sagt)
//   info/    der Flugleiter am Funk – in kleinen Stücken („Piste zwo fünf“), aus denen ein Funkspruch zusammengesetzt wird
//   ansage/  die Höhen-Ansage kurz vor dem Aufsetzen („Fünfzig“, „Zwanzig“, „Zehn“)
// Die Liste sprache/liste.js sagt zu jeder Aufnahme, welcher Text darin gesprochen wird. Sie wird von
// tools/sprache.mjs geschrieben. Ändert jemand einen Satz im Spiel, passt die Aufnahme nicht mehr – dann liest
// wieder die Stimme des Geräts, bis neu aufgenommen ist.
import { SPRACHE } from '../sprache/liste.js';

// Zerlegt einen Text in Aufnahmen der Stimme `wer`: ['info/ruf', 'info/piste_36', …]. Passt nicht alles genau: null.
// Es wird immer das längste Stück genommen, das an der Stelle passt; Leerzeichen, Punkte und Kommas dazwischen sind egal.
export function teileVon(wer, text, liste = SPRACHE) {
  const stuecke = Object.keys(liste).filter(n => n.startsWith(wer + '/')).sort((a, b) => liste[b].length - liste[a].length);
  const namen = [], luecke = /^[\s,.!?]*/;
  let rest = String(text).replace(luecke, '');
  while (rest) {
    const n = stuecke.find(k => rest.startsWith(liste[k]));
    if (!n) return null;
    namen.push(n); rest = rest.slice(liste[n].length).replace(luecke, '');
  }
  return namen.length ? namen : null;
}
export const dateiVon = name => `sprache/${name}.mp3`;
