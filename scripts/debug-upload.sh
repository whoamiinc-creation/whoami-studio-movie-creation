#!/bin/bash
# 各ステップを個別に実行して問題箇所を特定する

PROJECT="/Users/sonobekenta/Desktop/whoami-inc/movie-project"
cd "$PROJECT"

echo "=== Step 1: Node.js 動作確認 ==="
node -e "console.log('Node OK:', process.version)"

echo ""
echo "=== Step 2: googleapis 読み込み ==="
node -e "const {google} = require('./node_modules/googleapis'); console.log('googleapis OK:', typeof google.auth.OAuth2)"

echo ""
echo "=== Step 3: .env 読み込み確認 ==="
node -e "
require('./node_modules/dotenv').config({path:'.env'});
const id = process.env.YOUTUBE_CLIENT_ID;
console.log('CLIENT_ID:', id ? id.substring(0,20)+'...' : 'NOT FOUND');
console.log('CLIENT_SECRET:', process.env.YOUTUBE_CLIENT_SECRET ? 'SET' : 'NOT FOUND');
"

echo ""
echo "=== Step 4: OAuth2 クライアント生成 ==="
node -e "
require('./node_modules/dotenv').config({path:'.env'});
const {google} = require('./node_modules/googleapis');
const c = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  'http://localhost:3000/oauth2callback'
);
const u = c.generateAuthUrl({access_type:'offline', scope:['https://www.googleapis.com/auth/youtube.upload']});
console.log('Auth URL generated OK');
console.log('URL:', u.substring(0,80)+'...');
"

echo ""
echo "=== Step 5: open パッケージ確認 ==="
node -e "const open = require('./node_modules/open'); console.log('open OK:', typeof open)"

echo ""
echo "=== Step 6: ポート 3000 確認 ==="
lsof -i :3000 2>/dev/null && echo "WARNING: port 3000 already in use" || echo "Port 3000 free OK"

echo ""
echo "=== 診断完了 ==="
