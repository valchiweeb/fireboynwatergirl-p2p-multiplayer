const { spawn, exec } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const PUBLIC_FILE = path.join(__dirname, 'public_url.json');

// Check if local server is already running
function ensureServerRunning(callback) {
  const req = http.get(`http://127.0.0.1:${PORT}`, (res) => {
    callback(null);
  });
  req.on('error', () => {
    console.log('[INFO] Menjalankan server lokal (local_server.js)...');
    const srv = spawn('node', ['local_server.js'], { stdio: 'ignore', detached: true });
    srv.unref();
    setTimeout(() => callback(null), 1500);
  });
}

function startNgrokTunnel(onUrl, onError) {
  console.log('[TUNNEL] Membuka jalur Ngrok Tunnel (Bebas blokir ISP)...');
  const p = spawn('ngrok', ['http', PORT.toString()]);
  let found = false;

  let attempts = 0;
  const poll = () => {
    http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          const pub = json.tunnels && json.tunnels[0] ? json.tunnels[0].public_url : null;
          if (pub && !found) {
            found = true;
            onUrl(pub, p);
            return;
          }
        } catch (e) {}
        if (++attempts < 20 && !found) setTimeout(poll, 800);
      });
    }).on('error', () => {
      if (++attempts < 20 && !found) setTimeout(poll, 800);
      else if (!found) onError(new Error('Ngrok tidak merespons'));
    });
  };

  setTimeout(poll, 1200);
}

function startCloudflareTunnel(cfPath, onUrl, onError) {
  console.log('[TUNNEL] Membuka jalur Cloudflare Tunnel...');
  const p = spawn(cfPath, ['tunnel', '--url', `http://127.0.0.1:${PORT}`]);
  let found = false;

  const handleOutput = (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !found) {
      found = true;
      onUrl(match[0], p);
    }
  };

  p.stdout.on('data', handleOutput);
  p.stderr.on('data', handleOutput);

  p.on('error', (err) => {
    if (!found) onError(err);
  });

  setTimeout(() => {
    if (!found) {
      p.kill();
      onError(new Error('Cloudflare tunnel timeout'));
    }
  }, 10000);
}

function main() {
  ensureServerRunning(() => {
    const onTunnelReady = (publicUrl, tunnelProcess) => {
      // Save for game UI
      fs.writeFileSync(PUBLIC_FILE, JSON.stringify({ url: publicUrl }), 'utf8');

      console.log('\n================================================================');
      console.log(' 🔥 FIREBOY & WATERGIRL: ONLINE P2P MULTIPLAYER SIAP! 💧');
      console.log('================================================================');
      console.log(' Link Publik Untuk Teman Jauh Anda:');
      console.log(` 👉 ${publicUrl}`);
      console.log('----------------------------------------------------------------');
      console.log(' Cara Main Bareng Teman Jauh:');
      console.log(' 1. Kirim link di atas ke teman Anda (WhatsApp/Discord/Telegram).');
      console.log(' 2. Buka link tersebut di browser Anda.');
      console.log('    (Jika muncul halaman perkenalan ngrok, klik tombol "Visit Site")');
      console.log(' 3. Pilih "Buat Room" (Host), lalu bagikan kode room ke teman Anda!');
      console.log(' 4. Teman Anda langsung terhubung dan siap bermain bersama.');
      console.log('================================================================\n');
      console.log('[INFO] Membuka game di browser Anda...');

      // Open in browser
      const openCmd = process.platform === 'win32' ? `start ${publicUrl}` : `open ${publicUrl}`;
      exec(openCmd);

      // Handle shutdown
      const cleanup = () => {
        console.log('\n[INFO] Menutup tunnel...');
        try { if (fs.existsSync(PUBLIC_FILE)) fs.unlinkSync(PUBLIC_FILE); } catch(e){}
        try { tunnelProcess.kill(); } catch(e){}
        process.exit(0);
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
    };

    // Prioritize Ngrok because trycloudflare is blocked / NXDOMAIN on Indonesian ISPs
    startNgrokTunnel(onTunnelReady, (errNgrok) => {
      console.warn('[WARN] Ngrok gagal, mencoba Cloudflare Tunnel...', errNgrok.message);
      const cfPossiblePaths = [
        'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
        'C:\\Program Files\\cloudflared\\cloudflared.exe',
        'cloudflared'
      ];
      let cfPath = cfPossiblePaths.find(p => p === 'cloudflared' || fs.existsSync(p));
      if (cfPath) {
        startCloudflareTunnel(cfPath, onTunnelReady, (errCf) => {
          console.error('[ERROR] Semua jalur tunnel gagal:', errCf.message);
        });
      } else {
        console.error('[ERROR] Tidak ada tunnel yang berhasil.');
      }
    });
  });
}

main();
