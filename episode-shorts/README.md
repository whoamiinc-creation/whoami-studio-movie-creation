# episode-shorts — 本編エピソードのショート自動投稿

綾城マキの本編エピソード（EP7以降）のショートを、キューから1本ずつ
YouTube / TikTok / Instagram に自動投稿する仕組みです。
従来の抽象動画（幾何学模様など）の `daily-upload.yml` の定期実行は停止し、これに置き換えました。

## ペース
- **土・日・水・金 の 18:30 JST** に1本ずつ（`.github/workflows/episode-shorts-upload.yml`）。
- 本編は土曜に投稿 → その**土曜から Sat→Sun→Wed→Fri の4回で、その回のショート a/b/c/d を消化**する想定。
- キューが空 or 消化済みなら**何も投稿しない**（撮り溜め回が先走らない安全設計）。

## 使い方（本編を投稿した"後"に）
1. 外付けSSDをマウントした状態で、ローカルで：
   ```
   node scripts/episode-enqueue.js 7    # ← 投稿した話数
   ```
   → `movies/EP7_*/short/*_hook.mp4` を `episode-shorts/videos/` にコピーし、
     各 `.md`（タイトル/説明/ハッシュタグ）から `queue.json` に a,b,c,d 順で追記します。
2. 差分を確認して commit & push：
   ```
   git add episode-shorts/videos episode-shorts/queue.json && git commit -m "shorts: enqueue EP7" && git push
   ```
3. 次の 日/月/火/水 から自動で1本ずつ上がります。

## ファイル
- `queue.json` … 投稿待ちの配列（`{id, video, title, description, tags, categoryId, privacyStatus}`）。
- `state.json` … `{ nextIndex }` 進行ポインタ。投稿成功のたびにワークフローが +1 してコミット。
- `videos/` … 投稿する `*_hook.mp4` の実体（enqueue時にコピー）。

## 手動実行 / 一時停止
- 手動で1本流す：GitHub Actions の *Episode Shorts Upload* を **Run workflow**（workflow_dispatch）。
- 止めたい：`queue.json` を消化済みにする、または該当ワークフローを Actions 画面で disable。
