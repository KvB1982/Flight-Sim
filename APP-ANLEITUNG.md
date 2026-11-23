# Flugsimulator als iPad- und iPhone-App

Das Spiel bleibt, wie es ist. [Capacitor](https://capacitorjs.com) packt die vorhandenen Dateien in eine echte App, genau wie beim Rennspiel, bei Frontlinie 3 und beim Reitturnier. Das Xcode-Projekt liegt fertig im Ordner `ios`.

## Was die App anders macht als der Browser

- Echtes Vollbild ohne Statusleiste, fest im Querformat. Der Bildschirm bleibt an.
- **iPhone als Steuerknüppel ohne Internet:** iPad und iPhone finden sich direkt über WLAN oder Bluetooth (Apples „Multipeer“, wie der Steuerknüppel in Frontlinie 3 und das Lenkrad im Rennspiel). Kein QR-Code, kein Code eintippen.
- Das iPhone rüttelt kurz beim Aufsetzen und bei jedem Tipp auf einen Knopf.
- three.js, PeerJS und der QR-Code liegen in der App. Alles läuft ohne Internet (nur ein Handy ohne App über den QR-Code braucht weiter Internet).
- Der Spielstand der App (Flugschule, Flugbuch, Einstellungen) ist getrennt vom Browser.

## Einmal einrichten (auf dem Mac)

Du brauchst **Xcode** und **Node.js**. Beides ist von den anderen Spielen schon da.

```bash
cd ~/Documents
git clone https://github.com/KvB1982/Flight-Sim.git
cd Flight-Sim
npm install
npm run ios
```

`npm run ios` kopiert das Spiel nach `www`, packt es in die App und öffnet Xcode. Beim ersten Öffnen lädt Xcode ein paar Pakete nach.

Das Team (`AX2SZQVU9L`) und die Kennung `de.kvb1982.flugsimulator` sind schon eingetragen. In App Store Connect heißt die App „Flugsimulator vB“, auf dem Home-Bildschirm steht „Flugsimulator“.

## iPhone als Steuerknüppel

Das iPad zeigt den Flug, das iPhone ist der Knüppel.

1. Die App auf **beide** Geräte bringen (TestFlight oder aus Xcode).
2. Auf beiden Geräten WLAN oder Bluetooth einschalten. Internet ist nicht nötig.
3. Auf dem **iPad** die App öffnen. Das Menü reicht, es wartet schon auf ein iPhone.
4. Auf dem **iPhone** die App öffnen, oben im Menü auf **📱 Dieses Gerät ist der Steuerknüppel** tippen, dann **Los geht's**.
5. Beim ersten Mal fragen beide Geräte, ob die App Geräte im lokalen Netzwerk finden darf. Bitte **erlauben**.
6. Sobald oben links auf dem iPhone „✅ (Name des iPads)“ steht, auf dem iPad losfliegen.

Das iPhone quer halten. Drehen = Querruder, zu dir kippen = ziehen. Rechts der Gashebel, unten Seitenruder und Bremse, links Klappen und Trimmung. Oben: Mitte (jetzige Haltung = neutral), Empfindlichkeit, Kamera, Pause und **✕ Spiel** (dieses iPhone zeigt wieder selbst das Spiel).

Das iPhone merkt sich, dass es der Knüppel ist, und startet beim nächsten Mal gleich so. Geht die Verbindung mitten im Flug verloren, hält das Spiel an; weiter geht es mit einem Tipp auf den Bildschirm.

Ein Handy **ohne** App (zum Beispiel ein Android-Handy) geht weiter über „Handy als Steuerknüppel verbinden“ und den QR-Code. Das braucht Internet und GitHub Pages.

## TestFlight

Im Terminal im Ordner des Spiels:

```bash
npm run testflight
```

Das holt den neuesten Stand von `main`, baut die App und lädt sie hoch (`scripts/testflight.sh`). Die Build-Nummer ist die Uhrzeit und steigt so von selbst. Angemeldet wird über das Konto in Xcode oder über einen API-Schlüssel in `~/.appstoreconnect/flugsim.env` (steht oben im Skript).

## Nach Änderungen am Spiel

```bash
git pull
npm install
npm run sync
```

## Was wo liegt

| Datei oder Ordner | Zweck |
| --- | --- |
| `index.html`, `steuer.html`, `css`, `js`, `lib`, `icons` | Das Spiel. Dieselben Dateien laufen weiter im Browser. |
| `js/native.js` | Kleine Brücke für die App (Rütteln, Knüppel-Plugin, gemerkte Rolle). Im Browser macht sie nichts. |
| `js/verbindung.js` | `NahLink`: Verbindung iPad ↔ iPhone in der App; daneben weiter PeerJS (QR-Code) und BroadcastChannel (Test). |
| `capacitor.config.json` | Name, Kennung und Einstellungen der App. |
| `scripts/copy-web.mjs` | Kopiert das Spiel nach `www` und legt PeerJS und QR-Code nach `www/lib`. Neue Ordner mit Spieldateien müssen dort in die Liste `FILES`. |
| `www` | Kopie des Spiels für die App. Wird automatisch erzeugt, nicht von Hand ändern. |
| `ios` | Das Xcode-Projekt. `ios/App/App/AppDelegate.swift` enthält das Plugin `KnueppelLink` (Multipeer, Dienstname `flugsim`, muss zu `NSBonjourServices` in `Info.plist` passen). Symbol (`icons/icon.svg` ist die Vorlage) und Startbild in `ios/App/App/Assets.xcassets`. |
