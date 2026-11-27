#!/usr/bin/env python3
# Flugsimulator – macht aus den Roh-Aufnahmen (3D AI Studio, generate_speech) die kleinen Dateien für das Spiel.
#   python3 tools/sprache_bau.py <Ordner mit roh/jule/…, roh/info/…, roh/ansage/…>
# Je Datei: Stille vorn und hinten abschneiden, alle gleich laut machen, als kleine MP3 (Mono, 32 kHz) nach sprache/<wer>/<name>.mp3.
# Braucht ffmpeg. Danach: node tools/sprache.mjs neu
import re, subprocess, sys
from pathlib import Path

LAUT = -19.0      # so laut soll jede Aufnahme im Mittel sein (dB)
SPITZE = -1.5     # lauter als das darf keine Stelle werden (dB)
STILL = '-45dB'   # leiser als das gilt als Stille
ziel = Path(__file__).resolve().parent.parent / 'sprache'
roh = Path(sys.argv[1])
schnitt = f'silenceremove=start_periods=1:start_threshold={STILL}:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold={STILL}:start_silence=0.06,areverse'
n = 0
for f in sorted(roh.glob('*/*.mp3')):
    mess = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(f), '-af', schnitt + ',volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    mittel = float(re.search(r'mean_volume: ([-\d.]+)', mess).group(1)); spitze = float(re.search(r'max_volume: ([-\d.]+)', mess).group(1))
    mehr = min(LAUT - mittel, SPITZE - spitze)
    aus = ziel / f.parent.name / f.name; aus.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(f), '-af', f'{schnitt},volume={mehr:.2f}dB', '-ac', '1', '-ar', '32000', '-c:a', 'libmp3lame', '-b:a', '56k',
                    '-map_metadata', '-1', '-id3v2_version', '0', str(aus)], check=True)
    n += 1
print(n, 'Aufnahmen gebaut')
