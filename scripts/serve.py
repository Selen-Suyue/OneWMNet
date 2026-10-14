#!/usr/bin/env python3
"""Dependency-free loopback preview, with byte ranges for native video seeking."""
import argparse
import functools
import http.server
from pathlib import Path
import re
import socketserver

ROOT = Path(__file__).resolve().parents[1]

class PreviewHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.svg': 'image/svg+xml',
                      '.mp4': 'video/mp4', '.json': 'application/json'}

    def send_head(self):
        self.byte_range = None
        path = Path(self.translate_path(self.path))
        # The server exposes the website, never repository metadata or scripts.
        try:
            relative = path.resolve().relative_to(ROOT)
        except ValueError:
            self.send_error(403); return None
        if any(part.startswith('.') for part in relative.parts) or relative.parts[:1] == ('scripts',):
            self.send_error(404); return None
        if path.is_dir():
            if not (path / 'index.html').is_file():
                self.send_error(404); return None
            return super().send_head()
        if not path.is_file():
            self.send_error(404); return None
        size = path.stat().st_size
        header = self.headers.get('Range')
        if header:
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', header.strip())
            if not match or not any(match.groups()):
                self.send_error(416); return None
            first, last = match.groups()
            if first:
                start = int(first)
                end = min(int(last), size - 1) if last else size - 1
            else:
                start, end = max(0, size - int(last)), size - 1
            if start > end or start >= size:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{size}')
                self.send_header('Content-Length', '0')
                self.end_headers(); return None
            stream = path.open('rb'); stream.seek(start)
            self.byte_range = end - start + 1
            self.send_response(206)
            self.send_header('Content-Type', self.guess_type(str(path)))
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
            self.send_header('Content-Length', str(self.byte_range))
            self.end_headers()
            return stream
        return super().send_head()

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Robots-Tag', 'noindex, nofollow')
        super().end_headers()

    def copyfile(self, source, outputfile):
        if self.byte_range is None:
            return super().copyfile(source, outputfile)
        remaining = self.byte_range
        while remaining > 0:
            chunk = source.read(min(65536, remaining))
            if not chunk: break
            outputfile.write(chunk); remaining -= len(chunk)

class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=4173)
    args = parser.parse_args()
    handler = functools.partial(PreviewHandler, directory=str(ROOT))
    with Server(('127.0.0.1', args.port), handler) as server:
        print(f'OneWM local preview: http://127.0.0.1:{args.port}', flush=True)
        print('Private, loopback only. Ctrl-C to stop.', flush=True)
        try: server.serve_forever()
        except KeyboardInterrupt: pass
