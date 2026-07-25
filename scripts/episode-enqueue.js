'use strict';
// 【ローカル実行専用】指定エピソードのショートを投稿キューに追加する。
//   使い方: node scripts/episode-enqueue.js 7
//   前提: 外付けSSD（/Volumes/Extreme SSD/Vtuber）がマウントされていること。
//
// やること:
//   1) movies/EP<話数>_*/short/ の *_hook.mp4 を名前順(a,b,c,d)で episode-shorts/videos/ にコピー
//   2) 同フォルダの各 .md からタイトル/説明/ハッシュタグを読み取り queue.json に追記
//
// ※「本編を投稿した後」に流す運用。撮り溜め回が先走らないよう、enqueueは本編公開後に手動で行う。
//   実行後、episode-shorts/videos と queue.json をコミット＆プッシュすると、
//   次の 日/月/火/水 17:00 JST から1本ずつ自動投稿される。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VIDEOS = path.join(ROOT, 'episode-shorts/videos');
const QUEUE = path.join(ROOT, 'episode-shorts/queue.json');
const MOVIES = '/Volumes/Extreme SSD/Vtuber/movies';

const ep = process.argv[2];
if (!ep) { console.error('使い方: node scripts/episode-enqueue.js <話数>'); process.exit(1); }

const dirs = fs.existsSync(MOVIES)
  ? fs.readdirSync(MOVIES).filter(d => new RegExp(`^EP${ep}_`).test(d))
  : [];
if (!dirs.length) { console.error(`❌ EP${ep}_* が見つかりません（SSDはマウント済み？）: ${MOVIES}`); process.exit(1); }
const shortDir = path.join(MOVIES, dirs[0], 'short');

const hooks = fs.readdirSync(shortDir)
  .filter(f => /_hook\.mp4$/.test(f) && !f.startsWith('._'))
  .sort();
if (!hooks.length) { console.error(`❌ _hook.mp4 が見つかりません: ${shortDir}`); process.exit(1); }

// 投稿用 .md からメタ情報を抽出
function parseMd(mdPath) {
  const t = fs.readFileSync(mdPath, 'utf8');
  const title = (t.match(/\*\*タイトル（YouTube）：\*\*\s*\n(.+)/) || [])[1];
  const desc = (t.match(/\*\*説明文[^\n]*\*\*\s*\n([\s\S]*?)\n\n\*\*ハッシュタグ/) || [])[1];
  const tagLine = (t.match(/\*\*ハッシュタグ：\*\*\s*\n(.+)/) || [])[1] || '';
  const tags = (tagLine.match(/#[^\s#]+/g) || [])
    .map(s => s.slice(1))
    .filter(x => x.toLowerCase() !== 'shorts');
  return { title: (title || '').trim(), description: (desc || '').trim(), tags };
}

fs.mkdirSync(VIDEOS, { recursive: true });
const queue = fs.existsSync(QUEUE) ? JSON.parse(fs.readFileSync(QUEUE, 'utf8')) : [];

for (const h of hooks) {
  const base = h.replace(/_hook\.mp4$/, '');   // 例: ep7-a-kata
  const md = path.join(shortDir, base + '.md');
  const meta = fs.existsSync(md) ? parseMd(md) : { title: base, description: '', tags: [] };
  fs.copyFileSync(path.join(shortDir, h), path.join(VIDEOS, h));
  const description = `${meta.description}\n\n本編はチャンネルから！ 綾城マキ / Maki Ayashiro\n#Shorts`;
  queue.push({
    id: base,
    video: h,
    title: meta.title,
    description,
    tags: [...new Set([...meta.tags, '綾城マキ', 'VTuber'])],
    categoryId: '27',
    privacyStatus: 'public',
  });
  console.log(`＋ ${h}  «${meta.title}»`);
}

fs.writeFileSync(QUEUE, JSON.stringify(queue, null, 2) + '\n');
console.log(`\n✅ queue.json に ${hooks.length} 本追加（合計 ${queue.length} 本）。`);
console.log('→ 確認後、`episode-shorts/videos` と `episode-shorts/queue.json` をコミット＆プッシュしてください。');
