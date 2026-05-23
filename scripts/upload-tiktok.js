'use strict';
const fs    = require('fs');
const https = require('https');
const path  = require('path');
const qs    = require('querystring');

const ENV_PATH    = path.join(__dirname, '../.env');
const TOKEN_PATH  = path.join(__dirname, '../.tiktok-token.json');
const VIDEO_PATH  = path.join(__dirname, '../out/video.mp4');
const CONTENT_PATH = path.join(__dirname, '../content.json');

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

function loadToken() {
  if (fs.existsSync(TOKEN_PATH)) return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
  return null;
}
function saveToken(t) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(t, null, 2));
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const data = body
      ? (typeof body === 'string' ? body : JSON.stringify(body))
      : null;
    if (data) options.headers = { ...options.headers, 'Content-Length': Buffer.byteLength(data) };

    const req = https.request(options, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function refreshToken(token) {
  const body = qs.stringify({
    client_key:    CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    grant_type:    'refresh_token',
    refresh_token: token.refresh_token,
  });
  const res = await httpsRequest({
    method: 'POST', hostname: 'open.tiktokapis.com', path: '/v2/oauth/token/',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }, body);
  if (!res.body.access_token) throw new Error('TikTok token refresh failed: ' + JSON.stringify(res.body));
  const updated = {
    ...token,
    access_token: res.body.access_token,
    refresh_token: res.body.refresh_token || token.refresh_token,
    expiry_date:   Date.now() + res.body.expires_in * 1000,
  };
  saveToken(updated);
  return updated;
}

// Upload video file in a single chunk (< 64 MB)
function uploadChunk(uploadUrl, filePath) {
  return new Promise((resolve, reject) => {
    const fileSize = fs.statSync(filePath).size;
    const parsedUrl = new URL(uploadUrl);

    const options = {
      method: 'PUT',
      hostname: parsedUrl.hostname,
      path:     parsedUrl.pathname + parsedUrl.search,
      headers: {
        'Content-Type':   'video/mp4',
        'Content-Length': fileSize,
        'Content-Range':  `bytes 0-${fileSize - 1}/${fileSize}`,
      },
    };

    const req = https.request(options, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        console.log(`  Upload response: ${res.statusCode}`);
        resolve(res.statusCode);
      });
    });
    req.on('error', reject);

    const stream = fs.createReadStream(filePath);
    let uploaded = 0;
    stream.on('data', chunk => {
      uploaded += chunk.length;
      process.stdout.write(`\r  ${(uploaded / fileSize * 100).toFixed(1)}%`);
      req.write(chunk);
    });
    stream.on('end', () => { req.end(); process.stdout.write('\n'); });
    stream.on('error', reject);
  });
}

async function pollStatus(accessToken, publishId, maxWait = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const res = await httpsRequest({
      method: 'POST', hostname: 'open.tiktokapis.com',
      path:   '/v2/post/publish/status/fetch/',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json; charset=UTF-8',
      },
    }, { publish_id: publishId });

    const status = res.body?.data?.status;
    console.log(`  Status: ${status}`);
    if (status === 'PUBLISH_COMPLETE') return true;
    if (status === 'FAILED') throw new Error('TikTok publish failed: ' + JSON.stringify(res.body));
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('TikTok publish timeout');
}

async function main() {
  console.log('TikTok アップロード開始\n');

  if (!fs.existsSync(VIDEO_PATH)) {
    throw new Error(`動画が見つかりません: ${VIDEO_PATH}`);
  }

  let token = loadToken();
  if (!token) {
    throw new Error('.tiktok-token.json が見つかりません。先に node scripts/auth-tiktok.js を実行してください');
  }

  // Refresh if needed
  if (!token.expiry_date || token.expiry_date - Date.now() < 60000) {
    console.log('トークンを更新中...');
    token = await refreshToken(token);
  }

  const content = fs.existsSync(CONTENT_PATH) ? JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf-8')) : null;
  const title = (content?.title ?? 'Abstract geometric animation #ai #shorts').slice(0, 150);

  const fileSize = fs.statSync(VIDEO_PATH).size;
  console.log(`動画サイズ: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);

  // Init upload
  const initRes = await httpsRequest({
    method: 'POST', hostname: 'open.tiktokapis.com',
    path:   '/v2/post/publish/video/init/',
    headers: {
      'Authorization': `Bearer ${token.access_token}`,
      'Content-Type':  'application/json; charset=UTF-8',
    },
  }, {
    post_info: {
      title,
      privacy_level:            'PUBLIC_TO_EVERYONE',
      disable_duet:             false,
      disable_comment:          false,
      disable_stitch:           false,
      video_cover_timestamp_ms: 1000,
    },
    source_info: {
      source:             'FILE_UPLOAD',
      video_size:         fileSize,
      chunk_size:         fileSize,
      total_chunk_count:  1,
    },
  });

  if (!initRes.body?.data?.upload_url) {
    throw new Error('TikTok init failed: ' + JSON.stringify(initRes.body));
  }

  const { upload_url, publish_id } = initRes.body.data;
  console.log(`publish_id: ${publish_id}`);
  console.log('アップロード中...');

  await uploadChunk(upload_url, VIDEO_PATH);
  console.log('処理待ち...');
  await pollStatus(token.access_token, publish_id);

  console.log(`\n✓ TikTok アップロード完了! publish_id: ${publish_id}`);
}

main().catch(err => {
  console.error('\nTikTok エラー:', err.message);
  process.exit(1);
});
