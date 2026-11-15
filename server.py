import http.server
import socketserver
import os
import sys
import socket

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return 'localhost'

PORT = int(os.environ.get('PORT', 3000))
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class DualStackServer(socketserver.TCPServer):
    allow_reuse_address = True

class FireboyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def guess_type(self, path):
        mime = super().guess_type(path)
        if path.endswith('.mp3'):
            return 'audio/mpeg'
        elif path.endswith('.json'):
            return 'application/json'
        elif path.endswith('.wasm'):
            return 'application/wasm'
        return mime

if __name__ == '__main__':
    local_ip = get_local_ip()
    with DualStackServer(('0.0.0.0', PORT), FireboyHandler) as httpd:
        print(f"=======================================================")
        print(f"🔥 Fireboy & Watergirl: Kuil Hutan (The Forest Temple)")
        print(f"🎮 P2P Multiplayer Edition Server running via Python!")
        print(f"🌐 Local URL:   http://localhost:{PORT}")
        print(f"📱 Network URL: http://{local_ip}:{PORT}")
        print(f"=======================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer dihentikan.")
            sys.exit(0)
