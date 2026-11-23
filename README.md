# Flugsimulator

Ein eigener Flugsimulator für den Browser (PC, iPad, iPhone). Ziel: das Leben eines Verkehrspiloten nachspielen,
vom Flugschüler bis zum Kapitän. Familien-Lernprojekt wie Powershot, Frontline, Rennspiel, Reitturnier und Police Quest.

**Stand: Stufe 4** – fliegen lernen mit dem kleinen Schulflugzeug „Lerche 172“ am Flugplatz Lerchenfeld:
rollen, starten, Platzrunde, landen. Mit Wind, Landeklappen, Trimmung, Seitenruder und einer Note für jede Landung.
Dazu die Flugschule: acht Lektionen mit Fluglehrerin Jule vom Rollen bis zum Alleinflug, mit Sternen, Anflug-Tunnel und Nachbesprechung.
Und „Der ganze Flug“: Außencheck zu Fuß, Schalterbrett, Checklisten, Motor anlassen, tanken, abstellen und ein Flugbuch.
Neu in Stufe 4 der Überlandflug: das Alpenvorland mit sechs Flugplätzen, eine Karte, ein Flugplaner (Kurs, Zeit, Sprit),
Wegpunkte, Funkfeuer, Funk am kleinen Flugplatz und ein Zeitraffer für lange Strecken.

## Ausprobieren

```bash
python3 tools/server.py     # dann http://localhost:8765 öffnen
```

Steuern kann man mit der Tastatur, mit dem Finger auf dem iPad, durch Neigen des iPads oder mit dem Handy als
Steuerknüppel (im Menü „Handy als Steuerknüppel verbinden“, QR-Code mit dem Handy öffnen).

| Taste | Wirkung |
|---|---|
| Pfeil hoch / runter | drücken / ziehen (Nase runter / hoch) |
| Pfeil links / rechts | Querruder |
| Q / E | Seitenruder links / rechts |
| W / S, Ziffern 1–9, 0 | Gas mehr / weniger, Gas in Zehnteln, 0 = Vollgas |
| F / V | Klappen eine Stufe aus / ein |
| T / G | Trimmung Nase runter / hoch |
| Gamepad / Joystick | linker Knüppel = Höhe und Quer, rechter Knüppel = Seitenruder, Abzüge = Gas, A = Bremse, LB / RB = Klappen, Steuerkreuz = Trimmung |
| B oder Leertaste | Bremse |
| C | Ansicht wechseln |
| J / L / I / K, U | Blick drehen, U = wieder geradeaus (oder mit der Maus über das Bild ziehen) |
| R | Flugweg der Platzrunde an / aus |
| H | Hilfen wechseln |
| P, N | Pause, Menü |
| M, O, 1 2 3 | Überlandflug: Karte, Zeitraffer, Funkspruch wählen |
| X, Y, Enter | Der ganze Flug: Schalterbrett, Checkliste auf und zu, nächsten Handgriff erledigen |

Wie das Spiel aufgebaut ist und was noch nicht geprüft wurde, steht in `CLAUDE.md`.
