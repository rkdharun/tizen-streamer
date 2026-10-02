#!/usr/bin/env python3
"""Desktop dev server with caching disabled. Usage: python3 dev-server.py [port]
Open http://localhost:8765/index.html (add ?mock to use fake data without a TMDB key)."""
import http.server, os, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

os.chdir(os.path.dirname(os.path.abspath(__file__)))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
http.server.ThreadingHTTPServer(("", port), NoCache).serve_forever()
