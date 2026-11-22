// Flugsimulator – die Zahlen der Flugzeuge.
// Alles in Metern, Kilogramm, Sekunden und Bogenmaß. Die Namen sind ausgedacht.
// Die Werte der Lerche 172 sind einem kleinen viersitzigen Schulflugzeug nachempfunden und geschätzt:
// Abgestimmt wurde so lange, bis im Rechen-Test (tools/flugtest.mjs) die bekannten Zahlen herauskamen.

export const KN = 0.514444;        // 1 Knoten in Metern pro Sekunde
export const FT = 0.3048;          // 1 Fuß in Metern
export const GRAD = Math.PI / 180;

export const FLUGZEUGE = {
  lerche: {
    name: 'Lerche 172',
    // ---- Gewicht
    leer: 800,            // Flugzeug ohne Sprit, mit Pilot (kg)
    zuladung: 150,        // Mitflieger und Gepäck (kg)
    tank: 150,            // voller Tank (kg)
    traeg: [1825, 2667, 1285],   // Trägheit beim Nicken, Gieren, Rollen: je größer, desto träger dreht es sich
    // ---- Flügel
    flaeche: 16.2,        // Flügelfläche (m²)
    spann: 11.0,          // Spannweite (m)
    tiefe: 1.49,          // Flügeltiefe (m)
    // ---- Auftrieb: steigt mit dem Anstellwinkel, bis die Strömung abreißt
    ca0: 0.31, caAnstieg: 5.14, caMax: 1.75,
    caKlappe: 0.55, caMaxKlappe: 0.62,       // so viel bringen voll ausgefahrene Klappen
    // ---- Widerstand
    cw0: 0.028, cwK: 0.062, cwKlappe: 0.04,
    // ---- Stabilität und Ruder (wie stark das Flugzeug auf Schräganströmung, Drehen und Ruder antwortet)
    cm0: -0.015, cmAnstell: -0.89, cmDreh: -12.4, cmRuder: 1.28, cmKlappe: 0.02,
    clSchiebe: -0.089, clRoll: -0.47, clGier: 0.096, clQuer: 0.178, clSeite: 0.0147,
    cnSchiebe: 0.065, cnRoll: -0.03, cnGier: -0.099, cnQuer: -0.053, cnSeite: 0.0657,
    cySchiebe: -0.31, cySeite: 0.187,
    ruderMax: { hoehe: 0.44, quer: 0.30, seite: 0.40 },   // größter Ausschlag der Ruder
    trimmMax: 0.22,
    // ---- Motor und Propeller
    leistung: 120000,     // Watt bei Vollgas am Boden (etwa 160 PS)
    propGut: 0.83, propV0: 28,     // Der Propeller zieht im Stand am stärksten und bei Tempo schwächer
    propDreh: 0.25,       // Bei Vollgas und wenig Tempo zieht die Nase nach links (Hebelarm in m)
    leerlauf: 600, vollDreh: 2700,
    verbrauch: 0.011,     // kg Sprit pro Sekunde bei Vollgas
    // ---- Klappen: vier Stufen
    klappen: [0, 10, 20, 30], klappenTempo: 0.2,     // 0.2 = fünf Sekunden für den ganzen Weg
    // ---- Fahrwerk: wo die Räder sitzen [links, oben, vorn] vom Schwerpunkt aus
    raeder: [
      { ort: [0, -1.1, 1.45], feder: 38000, daempf: 3200, lenkt: true },
      { ort: [1.3, -1.1, -0.35], feder: 52000, daempf: 4600, bremst: true },
      { ort: [-1.3, -1.1, -0.35], feder: 52000, daempf: 4600, bremst: true }
    ],
    // Stellen, die den Boden nicht berühren dürfen
    huelle: [['Flügel', 5.5, 0.75, 0], ['Flügel', -5.5, 0.75, 0], ['Heck', 0, 0.1, -5.0], ['Propeller', 0, -0.75, 1.95], ['Rumpf', 0, -0.6, 0]],
    // ---- Zahlen für den Piloten (in Knoten), stehen auch auf dem Fahrtmesser
    v: { abriss0: 41, abriss: 48, abheben: 55, steigen: 74, gleiten: 68, anflug: 65, klappenMax: 85, normalMax: 129, nie: 163 },
    auge: [0.25, 0.42, 0.05]     // wo der Kopf des Piloten ist
  }
};
