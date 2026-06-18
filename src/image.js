const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const GENERATED_DIR = path.join(process.cwd(), 'generated');

// Bundled Chromium needs a few system libs that may not be installed on WSL2.
// We extract them into .chromium-libs/ (via `apt-get download` + `dpkg-deb -x`)
// and prepend that path to LD_LIBRARY_PATH so Chromium finds them.
const LOCAL_LIBS = path.join(process.cwd(), '.chromium-libs', 'extracted', 'usr', 'lib', 'x86_64-linux-gnu');
if (fs.existsSync(LOCAL_LIBS)) {
  process.env.LD_LIBRARY_PATH = [LOCAL_LIBS, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
}


function ensureGeneratedDir() {
  if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildQuoteHtml(quote, highlightPhrase, template) {
  const escaped = escapeHtml(quote);

  if (!highlightPhrase || !quote.includes(highlightPhrase)) return escaped;

  const escapedPhrase = escapeHtml(highlightPhrase);

  if (template === 'T2') {
    return escaped.replace(escapedPhrase, `<span class="hot">${escapedPhrase}</span>`);
  }
  if (template === 'T1') {
    return escaped.replace(escapedPhrase, `<em>${escapedPhrase}</em>`);
  }
  return escaped;
}

// CSS is identical to fire-within-templates.html; the card is 360×360 and we
// capture it with deviceScaleFactor:3 to produce a 1080×1080 PNG.
function buildRenderHtml(template, quoteHtml) {
  const cardMarkup = {
    T1: `<div class="card t1">
      <span class="brand">The Fire Within</span>
      <p class="quote">${quoteHtml}</p>
      <div class="foot">
        <span class="handle">@thefirewithin</span>
      </div>
    </div>`,

    T2: `<div class="card t2">
      <span class="brand">The Fire Within</span>
      <p class="quote">${quoteHtml}</p>
      <span class="handle">@thefirewithin</span>
    </div>`,

    T3: `<div class="card t3">
      <div class="spark"></div>
      <p class="quote">${quoteHtml}</p>
      <div class="foot">
        <span class="brand">The Fire Within</span>
      </div>
    </div>`,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..125,400..900&family=Fraunces:opsz,wght@9..144,300..700&display=swap" rel="stylesheet">
<style>
  :root{
    --coal:#0E0B09;
    --ash:#1C1714;
    --ember:#E84B1C;
    --flame:#F59E2D;
    --bone:#F2EAE0;
    --smoke:#8A7C70;
  }
  *{margin:0;padding:0;box-sizing:border-box;}
  body{margin:0;padding:0;background:var(--coal);width:360px;height:360px;overflow:hidden;}

  .brand{font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:var(--flame);font-weight:600;}
  .handle{font-size:11px;letter-spacing:0.08em;color:var(--smoke);}
  .card{
    position:relative;overflow:hidden;border-radius:0;background:var(--coal);
    display:flex;flex-direction:column;color:var(--bone);font-family:'Archivo',sans-serif;
    width:360px;height:360px;
  }

  /* T1 — Ember Floor: glow rising from below */
  .t1{padding:36px;justify-content:space-between;}
  .t1::after{
    content:'';position:absolute;left:0;right:0;bottom:-30%;height:75%;
    background:radial-gradient(ellipse at 50% 100%,rgba(232,75,28,0.55) 0%,rgba(245,158,45,0.18) 45%,transparent 72%);
    pointer-events:none;
  }
  .t1 .quote{font-family:'Fraunces',serif;font-weight:340;font-size:27px;line-height:1.28;letter-spacing:-0.3px;position:relative;z-index:1;}
  .t1 .quote em{font-style:italic;color:var(--flame);}
  .t1 .foot{display:flex;justify-content:space-between;align-items:flex-end;position:relative;z-index:1;}

  /* T2 — Bold Statement: heavy condensed type, ember keyword */
  .t2{padding:34px;justify-content:center;gap:0;}
  .t2 .brand{position:absolute;top:30px;left:34px;}
  .t2 .quote{font-weight:850;font-stretch:80%;text-transform:uppercase;font-size:42px;line-height:1.08;letter-spacing:0.04em;word-spacing:0.1em;}
  .t2 .quote .hot{color:transparent;background:linear-gradient(180deg,var(--flame),var(--ember));-webkit-background-clip:text;background-clip:text;}
  .t2 .handle{position:absolute;bottom:28px;left:34px;}

  /* T3 — Single Spark: minimal, one glowing dot, lots of dark space */
  .t3{padding:40px;justify-content:flex-end;gap:18px;}
  .t3 .spark{
    position:absolute;top:26%;left:50%;transform:translateX(-50%);
    width:7px;height:7px;border-radius:50%;background:var(--flame);
    box-shadow:0 0 22px 8px rgba(245,158,45,0.45),0 0 60px 24px rgba(232,75,28,0.18);
  }
  .t3 .quote{font-family:'Fraunces',serif;font-weight:340;font-style:italic;font-size:23px;line-height:1.35;text-align:center;}
  .t3 .foot{display:flex;justify-content:center;gap:14px;align-items:baseline;}
</style>
</head>
<body>
${cardMarkup[template]}
</body>
</html>`;
}

// Morning → T2 (bold). Evening alternates T1 / T3 by how many evening posts exist.
function selectTemplate(type, eveningCount) {
  if (type === 'morning') return 'T2';
  return eveningCount % 2 === 0 ? 'T1' : 'T3';
}

async function renderImage(quote, highlightPhrase, template) {
  ensureGeneratedDir();

  const quoteHtml = buildQuoteHtml(quote, highlightPhrase, template);
  const html = buildRenderHtml(template, quoteHtml);

  const htmlPath = path.join(GENERATED_DIR, 'render.html');
  fs.writeFileSync(htmlPath, html);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
    ],
  });

  try {
    const page = await browser.newPage();
    // 360×360 logical px at 3× device pixel ratio = 1080×1080 physical pixels
    await page.setViewport({ width: 360, height: 360, deviceScaleFactor: 3 });
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0', timeout: 30000 });

    // Shrink quote font-size until every rendered text line sits inside the
    // safe zone (8% inset on all sides). getClientRects() returns one rect per
    // visual line, so it catches horizontal overflow that scrollHeight misses.
    await page.evaluate(async () => {
      await document.fonts.ready;
      const card = document.querySelector('.card');
      const quote = card && card.querySelector('.quote');
      if (!quote) return;
      let size = parseFloat(getComputedStyle(quote).fontSize);
      const minSize = 13;

      function overflows() {
        const cr = card.getBoundingClientRect();
        const m = cr.width * 0.08;
        const safeLeft   = cr.left   + m;
        const safeRight  = cr.right  - m;
        const safeTop    = cr.top    + m;
        const safeBottom = cr.bottom - m;
        if (card.scrollHeight > card.clientHeight) return true;
        const range = document.createRange();
        range.selectNodeContents(quote);
        for (const r of range.getClientRects()) {
          if (!r.width || !r.height) continue;
          if (r.right > safeRight || r.left < safeLeft) return true;
          if (r.bottom > safeBottom || r.top < safeTop) return true;
        }
        return false;
      }

      while (overflows() && size > minSize) {
        size -= 0.5;
        quote.style.fontSize = size + 'px';
      }
    });

    const card = await page.$('.card');
    if (!card) throw new Error('Card element not found in rendered HTML');

    const imagePath = path.join(GENERATED_DIR, 'latest-image.png');
    await card.screenshot({ path: imagePath, type: 'png' });
    return imagePath;
  } finally {
    await browser.close();
  }
}

module.exports = { renderImage, selectTemplate };
