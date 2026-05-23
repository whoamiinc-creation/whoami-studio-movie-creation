'use strict';
// Instagram Reels 自動投稿
// 動画は GitHub Releases (public repo) にアップロードして公開URLを取得してから投稿
const fs    = require('fs');
const https = require('https');
const path  = require('path');

const ENV_PATH     = path.join(__dirname, '../.env');
const VIDEO_PATH   = path.join(__dirname, '../out/video.mp4');
const CONTENT_PATH = path.join(__dirname, '../content.json');

const GH_REPO    = 'whoamiinc-creation/video-archive'; // public リポジトリ
const GRAPH_VER  = 'v19.0';

// Load .env
if (fs.existsSync(ENV_PATH)) {
  fs.readFileSync(ENV_PATH, 'utf-8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
}

const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const IG_USER_ID   = process.env.INSTAGRAM_USER_ID;
const GH_TOKEN     = process.env.GH_TOKEN || process.env.GH_PAT;

if (!ACCESS_TOKEN || !IG_USER_ID) {
  console.error('Error: INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_USER_ID が環境変数に見つかりません');
  process.exit(1);
}
if (!GH_TOKEN) {
  console.error('Error: GH_TOKEN が環境変数に見つかりません');
  process.exit(1);
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const data = body
      ? (Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)))
      : null;
    if (data) options.headers = { ...options.headers, 'Content-Length': data.length };

    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        try { resolve({ status: res.statusCode, body: JSON.parse(raw), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, body: raw, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── GitHub Releases: 動画を public リポジトリにアップロード ──────────
async function uploadToGitHubReleases(dateStr) {
  const tag  = `video-${dateStr}`;
  const name = `video-${dateStr}`;

  // リリースを作成（既存の場合はスキップ）
  let releaseId;
  const createRes = await httpsRequest({
    method: 'POST', hostname: 'api.github.com',
    path:   `/repos/${GH_REPO}/releases`,
    headers: {
      'Authorization': `Bearer ${GH_TOKEN}`,
      'Accept':        'application/vnd.github+json',
      'User-Agent':    'whoami-movie-bot',
      'Content-Type':  'application/json',
    },
  }, JSON.stringify({ tag_name: tag, name, body: `Daily video ${dateStr}` }));

  if (createRes.status === 201) {
    releaseId = createRes.body.id;
    console.log(`GitHub Release 作成: ${tag} (id: ${releaseId})`);
  } else if (createRes.status === 422) {
    // Already exists — get it
    const getRes = await httpsRequest({
      method: 'GET', hostname: 'api.github.com',
      path:   `/repos/${GH_REPO}/releases/tags/${tag}`,
      headers: {
        'Authorization': `Bearer ${GH_TOKEN}`,
        'Accept':        'application/vnd.github+json',
        'User-Agent':    'whoami-movie-bot',
      },
    });
    releaseId = getRes.body.id;
    console.log(`GitHub Release 既存: ${tag} (id: ${releaseId})`);
  } else {
    throw new Error(`GitHub Release 作成失敗: ${JSON.stringify(createRes.body)}`);
  }

  // 動画ファイルをアップロード
  const filename  = `video-${dateStr}.mp4`;
  const fileData  = fs.readFileSync(VIDEO_PATH);
  const fileSize  = fileData.length;

  console.log(`アップロード中: ${(fileSize / 1024 / 1024).toFixed(1)} MB → ${GH_REPO}`);

  const uploadRes = await httpsRequest({
    method: 'POST', hostname: 'uploads.github.com',
    path:   `/repos/${GH_REPO}/releases/${releaseId}/assets?name=${filename}`,
    headers: {
      'Authorization': `Bearer ${GH_TOKEN}`,
      'Accept':        'application/vnd.github+json',
      'User-Agent':    'whoami-movie-bot',
      'Content-Type':  'video/mp4',
    },
  }, fileData);

  if (uploadRes.status !== 201) {
    // Asset may already exist — get the existing URL
    const assetsRes = await httpsRequest({
      method: 'GET', hostname: 'api.github.com',
      path:   `/repos/${GH_REPO}/releases/${releaseId}/assets`,
      headers: {
        'Authorization': `Bearer ${GH_TOKEN}`,
        'Accept':        'application/vnd.github+json',
        'User-Agent':    'whoami-movie-bot',
      },
    });
    const existing = assetsRes.body.find?.(a => a.name === filename);
    if (existing) {
      console.log('既存アセットの URL を使用');
      return `https://github.com/${GH_REPO}/releases/download/${tag}/${filename}`;
    }
    throw new Error(`GitHub asset upload 失敗: ${JSON.stringify(uploadRes.body)}`);
  }

  const videoUrl = `https://github.com/${GH_REPO}/releases/download/${tag}/${filename}`;
  console.log(`✓ GitHub Release URL: ${videoUrl}`);
  return videoUrl;
}

// ── Instagram Reels 投稿 ──────────────────────────────────────────
async function createReelsContainer(videoUrl, caption) {
  const params = new URLSearchParams({
    media_type:    'REELS',
    video_url:     videoUrl,
    caption,
    share_to_feed: 'true',
    access_token:  ACCESS_TOKEN,
  });

  const res = await httpsRequest({
    method: 'POST', hostname: 'graph.facebook.com',
    path:   `/${GRAPH_VER}/${IG_USER_ID}/media?${params.toString()}`,
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.body?.id) throw new Error('Instagram container 作成失敗: ' + JSON.stringify(res.body));
  return res.body.id;
}

async function pollContainerStatus(containerId, maxWait = 300000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const params = new URLSearchParams({
      fields:       'status_code,status',
      access_token: ACCESS_TOKEN,
    });
    const res = await httpsRequest({
      method: 'GET', hostname: 'graph.facebook.com',
      path:   `/${GRAPH_VER}/${containerId}?${params.toString()}`,
      headers: {},
    });
    const status = res.body?.status_code;
    console.log(`  Container status: ${status}`);
    if (status === 'FINISHED') return true;
    if (status === 'ERROR') throw new Error('Instagram container エラー: ' + JSON.stringify(res.body));
    await new Promise(r => setTimeout(r, 8000));
  }
  throw new Error('Instagram container タイムアウト');
}

async function publishContainer(containerId) {
  const params = new URLSearchParams({
    creation_id:  containerId,
    access_token: ACCESS_TOKEN,
  });
  const res = await httpsRequest({
    method: 'POST', hostname: 'graph.facebook.com',
    path:   `/${GRAPH_VER}/${IG_USER_ID}/media_publish?${params.toString()}`,
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.body?.id) throw new Error('Instagram publish 失敗: ' + JSON.stringify(res.body));
  return res.body.id;
}

async function main() {
  console.log('Instagram Reels アップロード開始\n');

  if (!fs.existsSync(VIDEO_PATH)) {
    throw new Error(`動画が見つかりません: ${VIDEO_PATH}`);
  }

  const content  = fs.existsSync(CONTENT_PATH) ? JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf-8')) : null;
  const dateStr  = content?.props?.seed ?? new Date().toISOString().slice(0, 10);
  const caption  = (content?.description ?? 'AIが加速する時代に"自分"が見出せない方はこちら⤵︎⤵︎\nhttps://whoami-studio.com\n\n#Reels #ai #geometric #abstract #shorts')
                    .slice(0, 2200);

  // 1. GitHub Releases に動画をアップロードして公開 URL を取得
  const videoUrl = await uploadToGitHubReleases(dateStr);

  // 2. Instagram Reels コンテナを作成
  console.log('\nInstagram Reels コンテナ作成中...');
  const containerId = await createReelsContainer(videoUrl, caption);
  console.log(`  container_id: ${containerId}`);

  // 3. 処理完了まで待機
  console.log('処理待ち...');
  await pollContainerStatus(containerId);

  // 4. 公開
  console.log('公開中...');
  const mediaId = await publishContainer(containerId);
  console.log(`\n✓ Instagram Reels 公開完了! media_id: ${mediaId}`);
}

main().catch(err => {
  console.error('\nInstagram エラー:', err.message);
  process.exit(1);
});
