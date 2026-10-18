/**
 * 綾城マキ（@maki_ayashiro）向け 朝のツイート下書き自動生成
 *
 * 仕組み（コスト¥0運用）:
 *   1. 挨拶・締め・絵文字などの「定型」はこのファイル内のテンプレ辞書から選ぶ（API不使用）
 *   2. 「何気ない一言」本文だけ Gemini 無料API で3件生成（ニッチ×日常のミックス）
 *   3. 下書きをメールで自分宛に送る → 気に入ったものを手動でコピペ投稿（X API不要）
 *
 * 必要な環境変数（ローカルは .env / 本番は GitHub Secrets）:
 *   GEMINI_API_KEY    … Google AI Studio の無料APIキー
 *   MAIL_USERNAME     … 送信元Gmail（例 whoami.inc.inside@gmail.com）
 *   MAIL_APP_PASSWORD … Gmailのアプリパスワード（16桁・スペース無し）
 *   MAIL_TO           … 受信先（未指定なら MAIL_USERNAME と同じ）
 *
 * 実行: node scripts/generate-tweet-drafts.js
 */

require("dotenv").config();
const nodemailer = require("nodemailer");

// ---- 設定 ----------------------------------------------------------------
const GEMINI_MODEL = "gemini-3.8-flash"; // 無料枠で使える最新のflashモデル
const GEMINI_BODY_COUNT = 3; // Geminiに作らせる本文の数（挨拶テンプレと合わせて計4案）

// ---- テンプレ辞書（ここはAPIを使わない）---------------------------------
// 朝の挨拶ツイート（案1は必ずここから。APIコスト0）
const GREETING_TEMPLATES = [
  "おはようございます☀️ 今日も一歩ずつ、いきましょう。",
  "おはよ〜。今日はどんな一日になるかな。マキはぼちぼち頑張ります🌱",
  "おはようございます。朝のコーヒーが一番おいしい時間ですね☕",
  "おはよう。今日のタスク、まずは一番小さいやつから片付けるのがコツ…なんだって📝",
  "おはようございます！今日も誰かの『わからない』を減らせたらいいな。",
  "おは☀️ 今日も無理せず、でもちょっとだけ前に。",
];

// 文末に添える締め/絵文字（Gemini本文にも軽く彩りを足せるよう用意。使わなくてもOK）
const CLOSERS = ["🌱", "☕", "✨", "📝", "🤖", "", "", ""];

// 曜日ごとのちょい足しフレーバー（挨拶テンプレに混ぜる用・任意）
const WEEKDAY_FLAVOR = {
  0: "日曜は少しゆっくりめで。",
  1: "月曜、エンジンあたためていきましょう。",
  2: "火曜、調子出てくる頃ですね。",
  3: "水曜、折り返し。えらい。",
  4: "木曜、あと少しで週末。",
  5: "花金🎉 今日を乗り切ればお休み。",
  6: "土曜、ちょっと自分を甘やかしても良い日。",
};

function pick(arr) {
  // Math.random は環境により制限されるため、時刻由来の簡易乱数でブレを出す
  const seed = BigInt(Date.now()) + (process.hrtime.bigint() % 100000n);
  return arr[Number(seed % BigInt(arr.length))];
}

function jstNow() {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const weekdayIdx = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  ).getDay();
  return { label: `${parts.month}/${parts.day}(${parts.weekday})`, weekdayIdx };
}

// ---- 綾城マキのキャラ設定（プロンプト用）---------------------------------
// ※詳細なキャラ設定は外付けSSD /Volumes/Extreme SSD/Vtuber/CLAUDE.md にあります。
//   より精度を上げたい場合はそこから設定を転記してこの説明文を差し替えてください。
const MAKI_PERSONA = `
あなたは「綾城マキ（あやしろ まき / Maki Ayashiro）」というVTuberです。
- 知的系VTuber。AI・システム・キャリアを分かりやすく解説するのが本業。
- 口調は親しみやすく、でも芯があって少し知的。丁寧すぎずフランク。一人称は「マキ」または「わたし」。
- 上から目線にはならず、読んだ人がふっと肩の力を抜けるような温度感。
- 中の人の話や内輪ネタ、宣伝臭はNG。あくまでマキ個人のつぶやき。
`.trim();

async function generateBodies(count) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が未設定です");

  const prompt = `
${MAKI_PERSONA}

綾城マキとして、Xに投稿する「何気ない日常ツイート」を${count}件、考えてください。

【条件】
- 各ツイートは日本語で、40〜110文字程度。X向けの自然な長さ。
- URLやリンク、ハッシュタグ、宣伝は入れない。
- ${count}件は方向性をバラけさせる（ミックス）:
  ・AI/システム/キャリアに関する「ふとした気づき・小ネタ」1〜2件
  ・天気/気分/食べ物/日常のちょっとした一言 1〜2件
- 「おはよう」だけの挨拶ツイートは入れない（それは別途用意済み）。
- 絵文字は使っても1〜2個まで。多用しない。
- 説明文やナンバリングは付けず、ツイート本文そのものだけを返す。
`.trim();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 1.1,
      responseMimeType: "application/json",
      responseSchema: { type: "ARRAY", items: { type: "STRING" } },
    },
  };

  // 503(アクセス集中)/429(レート)/5xx は一時的なので指数バックオフで数回リトライ
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let res;
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) break;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      const txt = await res.text();
      throw new Error(`Gemini APIエラー ${res.status}: ${txt.slice(0, 300)}`);
    }
    const waitMs = 2000 * 2 ** (attempt - 1); // 2s, 4s, 8s
    console.error(`Gemini ${res.status} … ${waitMs}ms後にリトライ (${attempt}/${maxAttempts - 1})`);
    await sleep(waitMs);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
  let bodies = [];
  try {
    bodies = JSON.parse(text);
  } catch {
    // JSONで返らなかった場合の保険: 改行で分割
    bodies = text.split("\n").map((s) => s.replace(/^[\d.\-・\s]+/, "").trim()).filter(Boolean);
  }
  return bodies.filter((s) => typeof s === "string" && s.trim()).slice(0, count);
}

function buildGreetingTweet(weekdayIdx) {
  const base = pick(GREETING_TEMPLATES);
  const flavor = WEEKDAY_FLAVOR[weekdayIdx] || "";
  // 50%くらいの確率で曜日フレーバーを足す
  return flavor && Date.now() % 2 === 0 ? `${base} ${flavor}` : base;
}

async function main() {
  const { label, weekdayIdx } = jstNow();

  // 案1: 挨拶（テンプレのみ・API不使用）
  const greeting = buildGreetingTweet(weekdayIdx);

  // 案2〜: 本文（Gemini）。失敗しても挨拶だけは届くようにする。
  let bodies = [];
  let geminiError = null;
  try {
    bodies = await generateBodies(GEMINI_BODY_COUNT);
  } catch (e) {
    geminiError = e.message;
    console.error("本文生成に失敗:", e.message);
  }

  const drafts = [greeting, ...bodies];

  // ---- メール本文を組み立て ----
  const lines = [];
  lines.push(`綾城マキ 今朝のツイート下書き（${label}）`);
  lines.push("気に入ったものをコピペしてXに投稿してください。動画紹介は手動でどうぞ。");
  lines.push("");
  drafts.forEach((d, i) => {
    lines.push(`━━━ 案${i + 1}（${d.length}文字）━━━`);
    lines.push(d);
    lines.push("");
  });
  if (geminiError) {
    lines.push("※ 本文のAI生成に失敗したため挨拶のみ届けています。ログを確認してください。");
    lines.push(`  (${geminiError})`);
  }
  const body = lines.join("\n");

  // ---- 送信 ----
  const user = process.env.MAIL_USERNAME;
  const pass = (process.env.MAIL_APP_PASSWORD || "").replace(/\s/g, "");
  const to = process.env.MAIL_TO || user;
  if (!user || !pass) throw new Error("MAIL_USERNAME / MAIL_APP_PASSWORD が未設定です");

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `綾城マキBot <${user}>`,
    to,
    subject: `【綾城マキ】今朝のツイート下書き ${label}`,
    text: body,
  });

  console.log(`送信完了 → ${to}`);
  console.log(`\n--- 送った内容 ---\n${body}`);
}

main().catch((e) => {
  console.error("エラー:", e.message);
  process.exit(1);
});
