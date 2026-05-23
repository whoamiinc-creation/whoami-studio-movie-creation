'use strict';
// TikTok OAuth2 初回認証スクリプト（ローカルで1回だけ実行）
const fs      = require('fs');
const http    = require('http');
const https   = require('https');
const path    = require('path');
const url     = require('url');
const qs      = require('querystring');
const crypto  = require('crypto');

const ENV_PATH   = path.join(__dirname, '../.env');
const TOKEN_PATH = path.join(__dirname, '../.tiktok-token.json');
const PORT = 3001;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

// Load .env
if (fs.existsSync(ENV_PATH)) {
  fs.readFileSync(ENV_PATH, 'utf-8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
}

const CLIENT_KEY    = process.env.TIKTOK_CLIENT_KEY;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;

if (!CLIENT_KEY || !CLIENT_SECRET) {
  console.error('Error: TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET が .env に見つかりません');
  process.exit(1);
}

// PKCE
const code_verifier  = crypto.randomBytes(32).toString('base64url');
const code_challenge = crypto.createHash('sha256').update(code_verifier).digest('base64url');

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

async function main() {
  const authUrl = 'https://www.tiktok.com/v2/auth/authorize/?' + qs.stringify({
    client_key:             CLIENT_KEY,
    redirect_uri:           REDIRECT_URI,
    response_type:          'code',
    scope:                  'video.upload,video.publish',
    state:                  crypto.randomBytes(8).toString('hex'),
    code_challenge,
    code_challenge_method:  'S256',
  });

  console.log('\n以下のURLをブラウザで開いてください:\n');
  console.log(authUrl);
  console.log(`\nhttp://localhost:${PORT} でコールバック待機中...\n`);

  try {
    const { execSync } = require('child_process');
    execSync(`open "${authUrl}"`, { stdio: 'ignore' });
  } catch { /* ignore */ }

  await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url || '', true);
      const code = parsed.query.code;
      if (!code) { res.end('No code.'); return; }

      res.end('<html><body><h2>TikTok認証完了！このタブを閉じてください。</h2></body></html>');
      server.close();

      const body = qs.stringify({
        client_key:    CLIENT_KEY,
        client_secret: CLIENT_SECRET,
        code,
        grant_type:    'authorization_code',
        redirect_uri:  REDIRECT_URI,
        code_verifier,
      });

      try {
        const r = await httpsPost('open.tiktokapis.com', '/v2/oauth/token/',
          { 'Content-Type': 'application/x-www-form-urlencoded' }, body);

        if (!r.body.access_token) throw new Error(JSON.stringify(r.body));

        const token = {
          access_token:  r.body.access_token,
          refresh_token: r.body.refresh_token,
          open_id:       r.body.open_id,
          scope:         r.body.scope,
          expiry_date:   Date.now() + r.body.expires_in * 1000,
        };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
        console.log('✓ Token saved:', TOKEN_PATH);
        console.log('  open_id:', token.open_id);
        resolve(undefined);
      } catch (e) { reject(e); }
    });
    server.listen(PORT);
  });
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
