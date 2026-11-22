# Flugsimulator – Hinweise für Claude

Eigener Flugsimulator für den Browser (PC, iPad, iPhone). Ziel: das Leben eines Verkehrspiloten vom Flugschüler bis zum Kapitän.
Familien-Lernprojekt wie die Geschwister-Spiele Powershot, Frontline, Rennspiel, Reitturnier und Police Quest.
Repository: https://github.com/KvB1982/Flight-Sim · Arbeitstitel „Kapitän“.
Das Konzept in neun Stufen ist ein Claude Doc: https://claude.ai/artifact/ByjuAPggzH9R5qRKWdBvHR

**Stand: Stufe 1** – das Schulflugzeug „Lerche 172“ (ausgedacht, einem kleinen Hochdecker mit Bugrad nachempfunden), ein Flugplatz, alle Steuerungen.

## Arbeitsweise

- Antworten, Code-Kommentare und Texte im Spiel auf **Deutsch**. Kommentare so schreiben, dass ein Kind mitlesen kann.
- Kein Build-Schritt: reines HTML/CSS/JavaScript. three.js r160 als klassisches Skript (`lib/three.min.js`, aus Frontline), der eigene Code als ES-Module.
  Wegen der Module braucht das Spiel einen kleinen Server (`python3 tools/server.py`), ein Doppelklick auf `index.html` reicht nicht.
- Commits als `KvB1982 <KvB1982@users.noreply.github.com>`.
- Nach Änderungen im Browser prüfen, nicht nur mit den Testwerkzeugen. Ehrlich sagen, was nur gerechnet oder nur als Standbild geprüft wurde.
- Nur ausgedachte Namen: keine echten Flugzeug-Marken, Fluggesellschaften oder Logos. Vorbild ist das Genre der klassischen Flugsimulatoren, nichts wird daraus kopiert.
- Entscheidungen von Kristian (22.11.2026): Einheiten Knoten und Fuß. Die Welt wird später das echte Alpenvorland (dann Deutschland und Europa), keine erfundene Gegend – der Flugplatz „Lerchenfeld“ von Stufe 1 ist nur ein Übungsplatz. Das Cockpit als gemaltes Instrumentenbrett reicht.

## Starten und testen

```bash
python3 tools/server.py         # http://localhost:8765, ohne Zwischenspeicher
node tools/flugtest.mjs         # Flugphysik nachmessen: 47 Zahlen (Abriss, Startstrecke, Steigen, Reise, Gleiten, Anflug, Stabilität, vier Landungen); `laut` zeigt mehr
node tools/trimm.mjs            # sucht Trimmung und Gas für Steigflug, Reise, Platzrunde, Anflug (die Zahlen stehen in STARTS in js/main.js)
```

**Vor und nach jeder Änderung an `js/physik.js`, `js/flugzeuge.js` oder `js/hilfen.js` `node tools/flugtest.mjs` laufen lassen.**
`tools/pilot.mjs` ist der künstliche Pilot dafür (einfache Regler, mit `verzug` sieht er alles etwas zu spät wie ein Mensch).

Im Browser: `window.__flugsim` enthält `f` (Flugzeug), `E` (Einstellungen), `eingabe`, `neigung`, `empfang`, `welt`, `flug`, `los()`, `menue()`.
`__flugsim.angehalten = true` hält die eigene Schleife an, `step(n)` rechnet n Bilder (je 1/60 s) vor und malt nur das letzte.
Adresse: `?start=bahn|anflug|runde|vorfeld` überspringt das Menü, `?touch` zeigt die Finger-Steuerung auch am PC, `?lokal` verbindet das Handy über BroadcastChannel statt übers Internet.
Handy ohne Handy testen: zweites Fenster im selben Browser mit `steuer.html?c=CODE&lokal`, dort „Los geht's“ und `__steuer.neigung.sensor(beta, gamma)`.
Test-Browser: Playwright mit `--use-gl=swiftshader --enable-unsafe-swiftshader`. PeerJS und der QR-Code kommen von jsDelivr und sind dort nicht erreichbar.

## Aufbau

Koordinaten: Meter, y nach oben, **Norden = +z, Westen = +x** (wie in Frontline: Wer nach +z schaut, hat +x links).
Achsen des Flugzeugs: `[0]` = zur linken Fläche, `[1]` = oben, `[2]` = vorn. Kurs im Uhrzeigersinn ab Norden. Lage als Quaternion `[x, y, z, w]`.
Drehraten `f.w`: Nase hoch = `-w[0]`, Nase nach rechts = `-w[1]`, rechts rollen = `+w[2]`.
Eingabe überall gleich: `hoehe` (+ = ziehen, Nase hoch), `quer` (+ = rechts), `seite` (+ = Nase rechts), `gas` 0…1, `bremse` 0…1.
Gerechnet wird in Metern und m/s, angezeigt in Knoten und Fuß (`KN`, `FT` in `js/flugzeuge.js`).

| Datei | Inhalt |
|---|---|
| `js/flugzeuge.js` | Alle Zahlen der Lerche 172 (`FLUGZEUGE.lerche`): Gewicht, Flügel, Beiwerte für Auftrieb, Widerstand und Ruder (angelehnt an veröffentlichte Lehrbuch-Werte für ein Flugzeug dieser Größe), Motor, Klappen 0/10/20/30°, Räder, Stellen für den Bruch (`huelle`), Tempo-Marken für den Fahrtmesser (`v`) |
| `js/physik.js` | Flugphysik ohne three.js, 120 Schritte pro Sekunde (`TAKT`): Kräfte (Auftrieb, Widerstand, Schub, Gewicht) und Drehmomente, Strömungsabriss, Bodeneffekt, Propeller (Schub fällt mit dem Tempo, zieht die Nase nach links), Fahrwerk als Federn mit Reibung, Bremsen und lenkendem Bugrad, Wind. `neuesFlugzeug`, `setze` (hinstellen), `schritt`. Beim Aufsetzen ein Eintrag in `f.ereignisse`; Bruch (`f.bruch`) bei mehr als 3,6 m/s Sinken oder wenn Flügel, Heck, Propeller oder Rumpf den Boden berühren. Anzeige-Werte: `ias`, `hoeheGrund`, `steig`, `kurs`, `nick`, `roll`, `kugel`, `wende`, `abriss`, `drehzahl` |
| `js/hilfen.js` | Hilfen `leicht` / `mittel` / `echt` (`mitHilfe`). Die Physik bleibt gleich, die Hilfe bewegt nur Ruder: Seitenruder von allein (Kugel in der Mitte; am Boden lenkt der Knüppel und die Richtung wird gehalten), bei `leicht` dazu Trimmung wandert nach, Schräglage höchstens 35°, Nase höchstens 15° hoch und 12° runter, kein Ziehen in den Abriss, Flügel richten sich beim Loslassen auf, Heck schlägt beim Abheben nicht auf |
| `js/atmosphaere.js` | Wetter (`WETTER`: windstill, leichter Wind, Seitenwind, böig) |
| `js/platz.js` | Flugplatz Lerchenfeld: Bahn 36/18 (1000 × 23 m), Vorfeld, Gelände (`bodenHoehe`: 3 km flach, dahinter Hügel), Gleitweg 3° und PAPI (`anflug`, `PAPI_WINKEL`) |
| `js/flug.js` | Ablauf eines Flugs: Meldungen, Warnungen, Höhenansagen und die Note für die Landung (`landeNote`: 1 bis 5 Sterne aus Sinkrate, Tempo, Mittellinie, Aufsetzpunkt, Schräglage) |
| `js/eingabe.js` | Fasst alle Steuerungen zusammen: Handy (Vorrang), Neigen dieses Geräts, Knüppel auf dem Bildschirm, Tastatur (`TASTEN_HILFE`) |
| `js/neigung.js` | Gerät neigen wie einen Steuerknüppel, Rechnung aus Frontline (`js/touch.js` dort): Mitte merken, 5 Stufen Empfindlichkeit, tote Mitte, **kein Glätten** |
| `js/verbindung.js` | Handy ↔ Spiel wie im Rennspiel: PeerJS, Code mit 4 Zeichen, QR-Code; zum Testen BroadcastChannel. Nachrichten stehen oben in der Datei |
| `steuer.html`, `js/steuerseite.js` | Die Seite auf dem Handy: Neigen = Knüppel, Gashebel rechts (Gas wird nur mitgeschickt, solange man den Hebel bewegt), Pedale und Bremse unten, Klappen und Trimmung links, Anzeige von Tempo, Höhe, Klappen; rüttelt beim Aufsetzen (nur Android) |
| `js/touch.js` | Finger-Steuerung auf dem iPad: Knüppel rechts, Schubhebel links, Knöpfe |
| `js/welt.js` | Die Welt in 3D: Himmel, Wolken, Gelände, Bahn mit Zahlen, Rollweg, Vorfeld, Halle und Turm, Windsack, PAPI-Lampen (wachsen mit dem Abstand, damit man sie von weitem sieht), Bäume, Dorf |
| `js/flugzeugbau.js` | Die Lerche aus einfachen Formen, Ruder, Klappen und Propeller bewegen sich |
| `js/instrumente.js` | Gemaltes Instrumentenbrett (Fahrtmesser, Horizont, Höhenmesser, Wendezeiger mit Kugel, Kurskreisel, Variometer, Drehzahl, Klappen/Trimmung/Tank) und das HUD der Außenansichten |
| `js/klang.js` | Motor, Wind, Abriss-Warnton, Aufsetzen (alles selbst erzeugt), Höhenansagen über die Sprachausgabe |
| `js/main.js` | Menü, Start-Situationen (`STARTS`), Kameras (Cockpit, hinter dem Flugzeug, vom Turm), Spiel-Schleife |
| Blick drehen | `blick` in `js/main.js` (`blickSchritt`, `stelleKamera`): über das Bild ziehen (Maus oder ein Finger) dreht im Cockpit den Kopf und außen die Kamera um das Flugzeug, der Blick bleibt so; Doppel-Tipp oder U = geradeaus. Tasten J L I K: im Cockpit nur solange gehalten (links, rechts, hoch, K = nach hinten), außen drehen sie die Kamera; + − und Mausrad = Abstand. Schaut man im Cockpit weiter als etwa 30° zur Seite, verschwindet das Instrumentenbrett (`blick.brettWeg`), dafür sieht man HUD, Flügel und Strebe |
| Flugweg der Platzrunde | `platzrunde()` und `RUNDE` in `js/platz.js` (ohne three.js): der Soll-Weg als Punkte alle 25 m (Linksrunde Bahn 36, Gegenanflug 1500 m westlich in 1000 ft, Kurven mit 400 m Halbmesser, Endanflug 3°). `baueWeg` in `js/welt.js` malt ihn als blasse Straße 28 m **unter** dem Flugweg (auf Augenhöhe wäre sie nur ein Strich) und setzt alle 600 m ein Tor genau auf den Flugweg. Menü „Flugweg der Platzrunde zeigen“, Taste R (`E.weg`, zuerst an) |
| Windanzeige | `maleWind` in `js/instrumente.js`: oben links in jeder Ansicht, Pfeil = woher der Wind kommt (vom Flugzeug aus gesehen), dazu Anteil von vorn/hinten und von der Seite (gelb ab 8 kn Seitenwind) |

## Bekannte Grenzen (Stand 22.11.2026)

- **Nicht auf iPad oder iPhone geprüft.** Die Flugphysik ist mit `tools/flugtest.mjs` nachgemessen (künstlicher Pilot), das Spiel im Test-Browser ohne Grafikkarte vorgespult und als Standbilder angesehen: Menü, alle vier Starts, Cockpit, Blick von hinten, Turm, Start mit der Tastatur, Kurve, Anflug, harte Landung mit Note und Bruch, Finger-Steuerung (nur das Bild), Handy-Seite über `?lokal` (Neigen mit nachgemachtem Sensor, Gas, Klappen).
- Kristian ist am 22.11.2026 mit Hilfe `leicht` und `mittel` eine Platzrunde mit Landung geflogen („fühlt sich ganz gut an“), ohne Handy-Steuerung. Danach dazugekommen und nur als Standbilder im Test-Browser angesehen: Blick drehen, Flugweg der Platzrunde, Windanzeige. Die Straße passt nur zur Linksrunde auf Bahn 36 und rechnet den Wind nicht ein.
- Nicht geprüft: flüssige Bewegung, Ton (Motor, Warnton, Ansagen hat niemand gehört), echtes Neigen, PeerJS über das Internet und der QR-Code, Rütteln, Tempo auf dem iPad. Die Richtung beim Neigen stimmt nach der Rechnung (aus Frontline übernommen), ist aber an keinem Gerät probiert.
- Alle Zahlen der Hilfen, der Neigung und der Landenote sind geschätzt. Mit Hilfe `leicht` fliegt das Flugzeug losgelassen geradeaus; bei `mittel` und `echt` dreht es im Steigflug ohne Zutun langsam nach links weg (Propeller) – das ist gewollt.
- Messwerte der Lerche (1040 kg): Abriss etwa 45 kn (mit vollen Klappen 37), Startlauf 330 m, Steigen gut 700 ft/min, Reise 108 kn, Gleiten 10:1. Das liegt nah an einem echten Flugzeug dieser Art, ist aber nicht mit einem Handbuch Punkt für Punkt abgeglichen.
- Es fehlt noch (spätere Stufen im Konzept): Checklisten, Funk, Navigation, Autopilot, ILS, Schäden, Karriere, App-Hülle für iPad und iPhone (Handy als Knüppel ohne Internet). Das Gelände ist erfunden und klein; nach dem Bruch bleibt das Flugzeug einfach stehen.
- Das Handy als Knüppel braucht Internet auf beiden Geräten (PeerJS), und die Seite muss über https laufen (GitHub Pages), weil Bewegungssensoren sonst gesperrt sind.
