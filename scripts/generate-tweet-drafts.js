/**
 * 綾城マキ（@maki_ayashiro）向け 朝のツイート下書き自動生成
 *
 * 仕組み（コスト¥0運用）:
 *   1. 挨拶・締め・絵文字・伸ばしタグなどの「定型」はこのファイル内のテンプレ辞書から選ぶ（API不使用）
 *   2. 「何気ない一言」本文と「内容に合うハッシュタグ」だけ Gemini 無料API で生成（ニッチ×日常のミックス）
 *   3. 各ツイートは「語尾は必ず絵文字」＋「適切なタグ」＋「フォロワーを増やすタグ」で仕上げる
 *   4. 下書きをメールで自分宛に送る → 気に入ったものを手動でコピペ投稿（X API不要）
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
// 朝の挨拶ツイート本文（案1は必ずここから。APIコスト0）。語尾の絵文字は後で必ず付与する。
const GREETING_TEMPLATES = [
  "おはようございます。今日も一歩ずつ、いきましょう。",
  "おはよ〜。今日はどんな一日になるかな。マキはぼちぼち頑張ります。",
  "おはようございます。朝のコーヒーが一番おいしい時間ですね。",
  "おはよう。今日のタスクは、まず一番小さいやつから片付けるのがコツなんだって。",
  "おはようございます！今日も誰かの『わからない』を減らせたらいいな。",
  "おは。今日も無理せず、でもちょっとだけ前に。",
];

// 曜日ごとのちょい足しフレーバー（挨拶テンプレに混ぜる用・任意）
const WEEKDAY_FLAVOR = {
  0: "日曜は少しゆっくりめで。",
  1: "月曜、エンジンあたためていきましょう。",
  2: "火曜、調子出てくる頃ですね。",
  3: "水曜、折り返し。えらい。",
  4: "木曜、あと少しで週末。",
  5: "花金、今日を乗り切ればお休み。",
  6: "土曜、ちょっと自分を甘やかしても良い日。",
};

// 語尾に付ける絵文字（Geminiが絵文字で終えなかった時の保険にも使う）
const EMOJIS = ["☀️", "🌱", "✨", "☕", "🤖", "📝", "😊", "🍀", "💭", "🌙", "🌼", "🫧"];

// 挨拶ツイート用の「適切なタグ」候補（内容連動が不要な定型なのでローカル選択）
const GREETING_HASHTAGS = ["#おはよう", "#朝活", "#今日のひとこと"];

// フォロワーを増やすための定番タグ（VTuber向け・ローカル選択＝APIコスト0）
const GROWTH_HASHTAGS = [
  "#VTuberさんと繋がりたい",
  "#新人VTuber",
  "#個人勢VTuber",
  "#VTuber好きさんと繋がりたい",
  "#駆け出しVTuber",
];

function pick(arr) {
  // Math.random は環境により制限されるため、時刻由来の簡易乱数でブレを出す
  const seed = BigInt(Date.now()) + (process.hrtime.bigint() % 100000n);
  return arr[Number(seed % BigInt(arr.length))];
}

// 末尾が絵文字かどうか（絵文字本体 or 異体字セレクタFE0Fで終わればOK）
function endsWithEmoji(s) {
  return /[\p{Extended_Pictographic}\u{FE0F}]$/u.test(s.trim());
}

// 「語尾は必ず絵文字」を保証する。すでに絵文字で終わっていればそのまま。
function ensureEmojiEnding(s) {
  const t = s.trim();
  return endsWithEmoji(t) ? t : `${t}${pick(EMOJIS)}`;
}

// ハッシュタグを正規化（先頭#付与・内部スペース除去）
function normalizeHashtag(h) {
  if (!h) return "";
  let t = String(h).trim().replace(/\s+/g, "");
  if (!t.startsWith("#")) t = `#${t}`;
  return t;
}

// 適切タグと伸ばしタグが被らないように伸ばしタグを選ぶ
function pickGrowthHashtag(avoid) {
  for (let i = 0; i < 5; i++) {
    const g = pick(GROWTH_HASHTAGS);
    if (g !== avoid) return g;
  }
  return pick(GROWTH_HASHTAGS);
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

【本文(text)の条件】
- 日本語で、40〜110文字程度。X向けの自然な長さ。
- ★語尾は必ず絵文字1つで終える（文章の最後が絵文字になるように）。
- 本文の中にハッシュタグやURL、宣伝は入れない。
- ${count}件は方向性をバラけさせる（ミックス）:
  ・AI/システム/キャリアに関する「ふとした気づき・小ネタ」1〜2件
  ・天気/気分/食べ物/日常のちょっとした一言 1〜2件
- 「おはよう」だけの挨拶ツイートは入れない（それは別途用意済み）。
- 絵文字は語尾の1つを含めて本文全体で1〜2個まで。多用しない。

【ハッシュタグ(hashtag)の条件】
- そのツイートの内容に最も合う、適切なハッシュタグを1つだけ（先頭に#、日本語可）。
- 内容と関係ない集客タグ（#拡散希望 等）は入れない。内容連動のものにする。

各ツイートを text と hashtag を持つオブジェクトの配列で返してください。
`.trim();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 1.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            text: { type: "STRING" },
            hashtag: { type: "STRING" },
          },
          required: ["text", "hashtag"],
        },
      },
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
  let items = [];
  try {
    items = JSON.parse(text);
  } catch {
    // JSONで返らなかった場合の保険: 改行分割し、タグは空に
    items = text
      .split("\n")
      .map((s) => s.replace(/^[\d.\-・\s]+/, "").trim())
      .filter(Boolean)
      .map((t) => ({ text: t, hashtag: "" }));
  }
  return items
    .filter((it) => it && typeof it.text === "string" && it.text.trim())
    .slice(0, count)
    .map((it) => ({ text: it.text.trim(), hashtag: normalizeHashtag(it.hashtag) }));
}

function buildGreetingText(weekdayIdx) {
  const base = pick(GREETING_TEMPLATES);
  const flavor = WEEKDAY_FLAVOR[weekdayIdx] || "";
  // 50%くらいの確率で曜日フレーバーを足す
  return flavor && Date.now() % 2 === 0 ? `${base} ${flavor}` : base;
}

// 1ツイート分を仕上げる: 「本文(語尾絵文字) 適切タグ 伸ばしタグ」
function finalizeTweet({ text, hashtag }) {
  const body = ensureEmojiEnding(text);
  const properTag = hashtag || "#つぶやき";
  const growthTag = pickGrowthHashtag(properTag);
  return `${body} ${properTag} ${growthTag}`;
}

async function main() {
  const { label, weekdayIdx } = jstNow();

  // 案1: 挨拶（テンプレのみ・API不使用）。適切タグもローカルから。
  const greeting = {
    text: buildGreetingText(weekdayIdx),
    hashtag: pick(GREETING_HASHTAGS),
  };

  // 案2〜: 本文＋適切タグ（Gemini）。失敗しても挨拶だけは届くようにする。
  let bodies = [];
  let geminiError = null;
  try {
    bodies = await generateBodies(GEMINI_BODY_COUNT);
  } catch (e) {
    geminiError = e.message;
    console.error("本文生成に失敗:", e.message);
  }

  const drafts = [greeting, ...bodies].map(finalizeTweet);

  // ---- メール本文を組み立て ----
  const lines = [];
  lines.push(`綾城マキ 今朝のツイート下書き（${label}）`);
  lines.push("気に入ったものをコピペしてXに投稿してください。動画紹介は手動でどうぞ。");
  lines.push("※各ツイート＝本文(語尾は絵文字)＋適切タグ＋フォロワー獲得タグ");
  lines.push("");
  drafts.forEach((d, i) => {
    lines.push(`━━━ 案${i + 1}（${[...d].length}文字）━━━`);
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
