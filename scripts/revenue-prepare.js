'use strict';
// 収益発表ショートの投稿準備：queue.json の次の1本を out/video.mp4 に配置し、
// content.json（title/description）を書き出す。既存の upload-* スクリプトがこれを読む。
//   - revenue/state.json の nextIndex を参照（投稿成功後にワークフローが +1 する）
//   - キューを使い切ったら exit code 3 を返し、ワークフロー側で「投稿なし」として正常終了する
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const QUEUE = JSON.parse(fs.readFileSync(path.join(ROOT, 'revenue/queue.json'), 'utf8'));
const STATE_PATH = path.join(ROOT, 'revenue/state.json');
const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
const i = state.nextIndex ?? 0;

if (i >= QUEUE.length) {
  console.log(`キューを使い切りました（${QUEUE.length}本すべて投稿済み）。今回は投稿しません。`);
  process.exit(3); // ワークフロー側で「投稿スキップ」扱い
}

const item = QUEUE[i];
const src = path.join(ROOT, item.file);
if (!fs.existsSync(src)) { console.error(`動画が見つかりません: ${src}`); process.exit(1); }

fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
fs.copyFileSync(src, path.join(ROOT, 'out/video.mp4'));

const content = {
  title: item.title,
  description: item.description,
  tags: ['AI副業', '副業', '収益公開', 'SEO', 'AIコンテンツ', 'VTuber', '綾城マキ', 'Shorts'],
  categoryId: '27',
};
fs.writeFileSync(path.join(ROOT, 'content.json'), JSON.stringify(content, null, 2));

console.log(`準備完了 [index ${i}] No.${item.no} (${item.day}日目): ${item.title}`);
