'use strict';
// エピソードショート自動投稿：キューから「次の1本」を out/video.mp4 + content.json に用意する。
//   - episode-shorts/queue.json … 投稿待ちの配列（a,b,c,d順）
//   - episode-shorts/state.json … { nextIndex } 進行ポインタ
// 投稿対象が無ければ pending=false を GITHUB_OUTPUT に出して、後続の投稿ステップをスキップさせる。
// state の +1 は「投稿成功後」にワークフロー側で行う（ここでは進めない）。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const QUEUE = path.join(ROOT, 'episode-shorts/queue.json');
const STATE = path.join(ROOT, 'episode-shorts/state.json');
const VIDEOS = path.join(ROOT, 'episode-shorts/videos');
const OUT_DIR = path.join(ROOT, 'out');
const OUT_VIDEO = path.join(OUT_DIR, 'video.mp4');
const CONTENT = path.join(ROOT, 'content.json');

function setOutput(k, v) {
  const f = process.env.GITHUB_OUTPUT;
  if (f) fs.appendFileSync(f, `${k}=${v}\n`);
}

const queue = fs.existsSync(QUEUE) ? JSON.parse(fs.readFileSync(QUEUE, 'utf8')) : [];
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { nextIndex: 0 };
const i = state.nextIndex || 0;

if (!Array.isArray(queue) || i >= queue.length) {
  console.log(`投稿対象なし（queue=${Array.isArray(queue) ? queue.length : 0}本 / nextIndex=${i}）。スキップします。`);
  setOutput('pending', 'false');
  process.exit(0);
}

const item = queue[i];
const src = path.join(VIDEOS, item.video);
if (!fs.existsSync(src)) {
  console.error(`❌ 動画が見つかりません: ${src}`);
  setOutput('pending', 'false');
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.copyFileSync(src, OUT_VIDEO);

const content = {
  title: item.title,
  description: item.description,
  tags: item.tags || [],
  categoryId: item.categoryId || '27',
  privacyStatus: item.privacyStatus || 'public',
};
fs.writeFileSync(CONTENT, JSON.stringify(content, null, 2));

console.log(`▶ [${i + 1}/${queue.length}] ${item.video}`);
console.log(`  title: ${item.title}`);
setOutput('pending', 'true');
setOutput('index', String(i));
setOutput('video', item.video);
