#!/usr/bin/env python3
# Kleiner Server zum Ausprobieren: http://localhost:8765 – ohne Zwischenspeicher, damit Änderungen sofort ankommen.
import http.server, os, sys

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

class OhneSpeicher(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
print(f'Flugsimulator läuft auf http://localhost:{port}')
http.server.ThreadingHTTPServer(('', port), OhneSpeicher).serve_forever()
