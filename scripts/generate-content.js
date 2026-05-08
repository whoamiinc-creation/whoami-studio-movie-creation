'use strict';
const fs   = require('fs');
const path = require('path');
const https = require('https');

const CONTENT_PATH = path.join(__dirname, '../content.json');

// ── Fallback quote pool (used when no OpenAI key) ──────────
const FALLBACK_QUOTES = [
  "AIは道具。自分という軸がなければ、ただ流されるだけ。",
  "テクノロジーが加速するほど、「自分とは何か」という問いが深くなる。",
  "AIに仕事を奪われるのではなく、AIと共に自分を再発明する時代。",
  "答えはAIが出す。問いを立てるのは、あなただ。",
  "自分を知ることが、最大のスキルになる。",
  "変化の速さに流されず、自分の核心を見つめ直す時間を持つ。",
  "AIが「何でも知っている」時代に、自分だけが知っていることは何か。",
  "テクノロジーは地図。でも、どこへ向かうかを決めるのは自分。",
  "情報があふれるほど、静かに内側を見る力が問われる。",
  "AIの時代に必要なのは、知識ではなく自己認識。",
  "自分の「なぜ」を持つ者が、AIを最も賢く使える。",
  "加速する世界の中で、「立ち止まる勇気」を持つ。",
];

// ── PRNG (same as Composition.tsx) ────────────────────────
function makePRNG(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return ((z ^ (z >>> 16)) >>> 0) / 0xffffffff;
  };
}
function dateSeed(str) {
  return Array.from(str).reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 0x811c9dc5);
}

// ── OpenAI quote generation ────────────────────────────────
function generateQuoteWithAI() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: 'AIが加速する時代における自己発見・アイデンティティ・人間らしさについての短い名言を日本語で1つ生成してください。25〜45文字程度で、シンプルかつ深みのある一文にしてください。かぎかっこ不要。',
      }],
      max_tokens: 120,
      temperature: 0.9,
    });

    const req = https.request({
      method: 'POST',
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (data.choices?.[0]?.message?.content) {
            resolve(data.choices[0].message.content.trim().replace(/^「|」$/g, ''));
          } else {
            reject(new Error('OpenAI response invalid: ' + raw));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Day-of-year helper ─────────────────────────────────────
function getDayOfYear(dateStr) {
  const d = new Date(dateStr);
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}

// ── Main ──────────────────────────────────────────────────
async function main() {
  const dateStr = process.argv[2] || new Date().toISOString().slice(0, 10);
  const rng = makePRNG(dateSeed(dateStr));
  const dayOfYear = getDayOfYear(dateStr);

  // Alternate: even=Geometric, odd=Quote
  const isQuoteDay = dayOfYear % 2 !== 0;

  const DESCRIPTION = 'AIが加速する時代に“自分”が見出せない方はこちら⬇︎︎\nhttps://whoami-studio.com\n\nAbstract geometric animation. #Shorts #geometric #animation #abstract  #ai';

  let content;

  if (!isQuoteDay) {
    console.log(`[${dateStr}] Type: Geometric`);
    content = {
      compositionId: 'GeometricComp',
      title: 'AIが加速する時代に“自分”が見出せない方へ #geometric #animation #abstract  #ai',
      description: DESCRIPTION,
      props: { seed: dateStr },
    };
  } else {
    console.log(`[${dateStr}] Type: Quote`);

    let quote;
    if (process.env.OPENAI_API_KEY) {
      try {
        console.log('Generating quote with OpenAI...');
        quote = await generateQuoteWithAI();
        console.log('Quote:', quote);
      } catch (e) {
        console.warn('OpenAI failed, using fallback:', e.message);
        quote = FALLBACK_QUOTES[Math.floor(rng() * FALLBACK_QUOTES.length)];
      }
    } else {
      quote = FALLBACK_QUOTES[Math.floor(rng() * FALLBACK_QUOTES.length)];
      console.log('Quote (fallback):', quote);
    }

    // Title: quote shortened to 60 chars max
    const titleQuote = quote.length > 40 ? quote.slice(0, 40) + '…' : quote;
    content = {
      compositionId: 'QuoteComp',
      title: `${titleQuote} #ai #shorts #自己発見`,
      description: DESCRIPTION,
      props: { seed: dateStr, quote, attribution: 'whoami studio' },
    };
  }

  fs.writeFileSync(CONTENT_PATH, JSON.stringify(content, null, 2));
  console.log('content.json written:', CONTENT_PATH);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
