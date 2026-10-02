#!/usr/bin/env python3
"""Desktop dev server with caching disabled. Usage: python3 dev-server.py [port]
Open http://localhost:8765/index.html (add ?mock to use fake data without a TMDB key)."""
import http.server, os, sys

import json

# Dev-only Stremio-style addon for testing the built-in player with public test streams:
#   Settings -> Stream addons -> http://localhost:8765/dev-addon
DEV_STREAMS = [
    {"name": "Broken (fallback test)", "description": "should fail and auto-skip", "url": "https://example.invalid/none.m3u8"},
    {"name": "Mux test", "description": "HLS · 5 qualities", "url": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"},
    {"name": "Apple bipbop", "description": "HLS · alt audio + subtitles",
     "url": "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8"},
]

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith("/dev-addon/"):
            if self.path.endswith("/manifest.json"):
                body = {"id": "dev.reeltv.test", "version": "1.0.0", "name": "ReelTV dev streams",
                        "resources": ["stream"], "types": ["movie", "series"], "catalogs": []}
            elif "/stream/" in self.path:
                body = {"streams": DEV_STREAMS}
            else:
                body = {}
            data = json.dumps(body).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

os.chdir(os.path.dirname(os.path.abspath(__file__)))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
http.server.ThreadingHTTPServer(("", port), NoCache).serve_forever()
