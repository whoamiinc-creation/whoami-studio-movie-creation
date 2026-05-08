'use strict';
// Node.js built-ins only — no googleapis dependency
const fs   = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const url  = require('url');
const qs   = require('querystring');

// ── Config ────────────────────────────────────────────────
const ENV_PATH      = path.join(__dirname, '../.env');
const TOKEN_PATH    = path.join(__dirname, '../.youtube-token.json');
const VIDEO_PATH    = path.join(__dirname, '../out/video.mp4');
const CONTENT_PATH  = path.join(__dirname, '../content.json');

// Load content.json if present
const content = fs.existsSync(CONTENT_PATH) ? JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf-8')) : null;
const PORT = 3000;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const SCOPES = 'https://www.googleapis.com/auth/youtube.upload';

// Load .env manually (no dotenv needed)
if (fs.existsSync(ENV_PATH)) {
  fs.readFileSync(ENV_PATH, 'utf-8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
}

const CLIENT_ID     = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET が .env に見つかりません');
  process.exit(1);
}

// ── Token helpers ─────────────────────────────────────────
function loadToken() {
  if (fs.existsSync(TOKEN_PATH)) return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
  return null;
}
function saveToken(t) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(t, null, 2));
  console.log('Token saved:', TOKEN_PATH);
}

// ── HTTPS POST helper ─────────────────────────────────────
function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request(
      { method: 'POST', hostname, path, headers: { 'Content-Length': Buffer.byteLength(data), ...headers } },
      res => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Refresh access token ──────────────────────────────────
async function refreshAccessToken(token) {
  const body = qs.stringify({
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: token.refresh_token,
    grant_type:    'refresh_token',
  });
  const res = await httpsPost('oauth2.googleapis.com', '/token',
    { 'Content-Type': 'application/x-www-form-urlencoded' }, body);
  if (!res.body.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(res.body));
  const updated = { ...token, access_token: res.body.access_token,
    expiry_date: Date.now() + res.body.expires_in * 1000 };
  saveToken(updated);
  return updated;
}

// ── OAuth2 browser flow ───────────────────────────────────
function runAuthFlow() {
  return new Promise((resolve, reject) => {
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + qs.stringify({
      client_id:     CLIENT_ID,
      redirect_uri:  REDIRECT_URI,
      response_type: 'code',
      scope:         SCOPES,
      access_type:   'offline',
      prompt:        'consent',
      login_hint:    'sonokenno25@gmail.com',
    });

    console.log('\n以下のURLをブラウザで開いてください:\n');
    console.log(authUrl);
    console.log('\nhttp://localhost:3000 でコールバック待機中...\n');

    // Try to open browser (non-blocking)
    try {
      const { execSync } = require('child_process');
      execSync(`open "${authUrl}"`, { stdio: 'ignore' });
      console.log('ブラウザを開きました。');
    } catch {
      console.log('ブラウザを自動で開けませんでした。上のURLを手動でブラウザに貼り付けてください。');
    }

    const server = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url || '', true);
      const code = parsed.query.code;
      if (!code) { res.end('No code.'); return; }

      res.end('<html><body><h2>認証完了！このタブを閉じてください。</h2></body></html>');
      server.close();

      const body = qs.stringify({
        code,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      });

      try {
        const r = await httpsPost('oauth2.googleapis.com', '/token',
          { 'Content-Type': 'application/x-www-form-urlencoded' }, body);
        if (!r.body.access_token) throw new Error(JSON.stringify(r.body));
        const token = { ...r.body, expiry_date: Date.now() + r.body.expires_in * 1000 };
        saveToken(token);
        resolve(token);
      } catch (e) { reject(e); }
    });

    server.listen(PORT);
  });
}

// ── Upload video (multipart) ──────────────────────────────
function uploadVideo(accessToken) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(VIDEO_PATH)) {
      return reject(new Error(`動画が見つかりません: ${VIDEO_PATH}`));
    }

    const fileSize = fs.statSync(VIDEO_PATH).size;
    console.log(`\nアップロード中: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);

    const title = content?.title
      ?? 'AIが加速する時代に"自分"が見出せない方へ #geometric #animation #abstract  #ai';
    const description = content?.description
      ?? 'AIが加速する時代に"自分"が見出せない方はこちら⤵︎⤵︎\nhttps://whoami-studio.com\n\nAbstract geometric animation. #Shorts #geometric #animation #abstract  #ai';

    const metadata = JSON.stringify({
      snippet: {
        title,
        description,
        tags: ['Shorts', 'ai', '自己発見', 'whoami', '幾何学', 'animation', 'abstract', 'geometric', '癒し', 'ambient'],
        categoryId: '22',
      },
      status: { privacyStatus: 'public' },
    });

    const BOUNDARY = '-------314159265358979323846';
    const metaPart = [
      `--${BOUNDARY}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      '',
    ].join('\r\n');
    const videoPart = [
      `--${BOUNDARY}`,
      'Content-Type: video/mp4',
      '',
      '',
    ].join('\r\n');
    const closing = `\r\n--${BOUNDARY}--\r\n`;

    const metaBuf   = Buffer.from(metaPart, 'utf-8');
    const videoBuf  = Buffer.from(videoPart, 'utf-8');
    const closeBuf  = Buffer.from(closing, 'utf-8');
    const totalSize = metaBuf.length + videoBuf.length + fileSize + closeBuf.length;

    const req = https.request({
      method:   'POST',
      hostname: 'www.googleapis.com',
      path:     '/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status',
      headers: {
        'Authorization':  `Bearer ${accessToken}`,
        'Content-Type':   `multipart/related; boundary="${BOUNDARY}"`,
        'Content-Length': totalSize,
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const body = JSON.parse(raw);
          if (body.id) {
            console.log(`\n✓ アップロード完了! Video ID: ${body.id}`);
            console.log(`  確認: https://studio.youtube.com/video/${body.id}/edit`);
            resolve(body);
          } else {
            reject(new Error('Upload failed: ' + JSON.stringify(body, null, 2)));
          }
        } catch { reject(new Error('Response parse error: ' + raw)); }
      });
    });

    req.on('error', reject);
    req.write(metaBuf);
    req.write(videoBuf);

    const stream = fs.createReadStream(VIDEO_PATH);
    let uploaded = 0;
    stream.on('data', chunk => {
      uploaded += chunk.length;
      process.stdout.write(`\r  ${(uploaded / fileSize * 100).toFixed(1)}% (${(uploaded/1024/1024).toFixed(1)}MB / ${(fileSize/1024/1024).toFixed(1)}MB)`);
      req.write(chunk);
    });
    stream.on('end', () => {
      req.write(closeBuf);
      req.end();
      process.stdout.write('\n');
    });
    stream.on('error', reject);
  });
}

// ── Main ──────────────────────────────────────────────────
async function main() {
  console.log('YouTube アップロード開始\n');

  let token = loadToken();

  if (token) {
    console.log('キャッシュ済みトークンを使用します。');
    // Refresh if expired (or within 60s of expiry)
    if (!token.expiry_date || token.expiry_date - Date.now() < 60000) {
      console.log('トークンを更新中...');
      token = await refreshAccessToken(token);
    }
  } else {
    console.log('初回認証を開始します...');
    token = await runAuthFlow();
  }

  await uploadVideo(token.access_token);
}

main().catch(err => {
  console.error('\nエラー:', err.message);
  process.exit(1);
});
