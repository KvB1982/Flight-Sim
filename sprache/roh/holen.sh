#!/bin/bash
# Lädt die Roh-Aufnahmen aus urls.txt in diesen Ordner (nur vorübergehend, wird vor dem Mergen gelöscht).
cd "$(dirname "$0")"
fehler=0
while read -r name url; do
  [ -z "$name" ] && continue
  mkdir -p "$(dirname "$name")"
  if ! curl -fsS -m 60 -o "$name.mp3" "$url"; then echo "FEHLT $name"; rm -f "$name.mp3"; fehler=$((fehler+1)); fi
done < urls.txt
echo "fertig, $(find . -name '*.mp3' | wc -l) Dateien, $fehler Fehler"
