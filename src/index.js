require('dotenv').config();

const fs = require('fs');
const path = require('path');

const { generateCaption } = require('./caption');
const { renderImage, selectTemplate } = require('./image');
const { publishToInstagram } = require('./publish');
const { checkAndRefreshToken } = require('./token');
const { appendLog } = require('./logger');

const POSTS_LOG = path.join(process.cwd(), 'posts-log.json');
const GENERATED_DIR = path.join(process.cwd(), 'generated');

// ── CLI arg parsing ───────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
The Fire Within — Instagram Automation

Commands:
  generate   Create caption + image (does NOT post)
  publish    Post the most recently generated content

Flags:
  --type=morning|evening   Post type (default: morning)
  --dry-run                Run without posting or mutating posts-log

Examples:
  node src/index.js generate --type=morning
  node src/index.js generate --type=evening --dry-run
  node src/index.js publish
  node src/index.js publish --dry-run
`);
    process.exit(0);
  }

  const dryRun = args.includes('--dry-run');
  const typeArg = args.find(a => a.startsWith('--type='));
  const type = typeArg ? typeArg.replace('--type=', '') : 'morning';

  if (!['morning', 'evening'].includes(type)) {
    console.error(`Error: --type must be "morning" or "evening", got "${type}"`);
    process.exit(1);
  }

  return { command, dryRun, type };
}

// ── posts-log helpers ─────────────────────────────────────────────────────────

function readPostsLog() {
  if (!fs.existsSync(POSTS_LOG)) return { posts: [] };
  try {
    return JSON.parse(fs.readFileSync(POSTS_LOG, 'utf8'));
  } catch {
    return { posts: [] };
  }
}

function writePostsLog(log) {
  fs.writeFileSync(POSTS_LOG, JSON.stringify(log, null, 2));
}

// ── generate command ──────────────────────────────────────────────────────────

async function commandGenerate({ type, dryRun }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set in .env');
  }

  console.log(`\nGenerating ${type} post${dryRun ? ' [DRY RUN]' : ''}...`);

  const log = readPostsLog();
  const eveningCount = log.posts.filter(p => p.type === 'evening').length;

  // 1. Generate caption via Claude
  console.log('Calling Claude API...');
  const content = await generateCaption(type);
  console.log(`  Theme   : ${content.theme}`);
  console.log(`  Quote   : ${content.quote}`);

  // 2. Select template and render image
  const template = selectTemplate(type, eveningCount);
  console.log(`  Template: ${template}`);
  console.log('Rendering image with Puppeteer...');
  const imagePath = await renderImage(content.quote, content.highlight_phrase, template);
  console.log(`  Saved   : ${imagePath}`);

  // 3. Build the full Instagram caption string
  const fullCaption = `${content.caption}\n\n${content.hashtags.map(h => `#${h}`).join(' ')}`;

  // 4. Persist generated content
  if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });

  const generatedAt = new Date().toISOString();
  const captionData = {
    type,
    template,
    quote: content.quote,
    highlight_phrase: content.highlight_phrase,
    caption: fullCaption,
    hashtags: content.hashtags,
    theme: content.theme,
    generatedAt,
    imagePath,
  };
  fs.writeFileSync(
    path.join(GENERATED_DIR, 'latest-caption.json'),
    JSON.stringify(captionData, null, 2)
  );

  // 5. Build preview HTML with embedded image (works offline, no CORS issues)
  const imgBase64 = fs.readFileSync(imagePath).toString('base64');
  const previewHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Preview — ${type}</title>
<style>
  body{background:#111;color:#eee;font-family:sans-serif;padding:40px;max-width:680px;margin:0 auto;line-height:1.6;}
  h2{color:#F59E2D;margin-bottom:4px;}
  .meta{color:#777;font-size:13px;margin-bottom:28px;}
  img{display:block;width:400px;height:400px;border:1px solid #2a2a2a;margin-bottom:28px;}
  h3{color:#ccc;margin-bottom:8px;font-size:14px;text-transform:uppercase;letter-spacing:0.1em;}
  pre{white-space:pre-wrap;background:#1a1a1a;padding:18px;border-radius:6px;font-size:14px;border:1px solid #2a2a2a;color:#eee;}
</style></head>
<body>
  <h2>The Fire Within — ${type.toUpperCase()} POST</h2>
  <div class="meta">Template: ${template} &nbsp;|&nbsp; Theme: ${content.theme} &nbsp;|&nbsp; ${generatedAt}</div>
  <img src="data:image/png;base64,${imgBase64}" alt="Post image">
  <h3>Instagram Caption</h3>
  <pre>${fullCaption}</pre>
</body></html>`;
  fs.writeFileSync(path.join(GENERATED_DIR, 'preview.html'), previewHtml);

  // 6. Log to posts-log (skipped on dry-run — no state mutation)
  if (!dryRun) {
    log.posts.push({
      date: generatedAt.split('T')[0],
      type,
      theme: content.theme,
      quote: content.quote,
      template,
      published: false,
      generatedAt,
    });
    writePostsLog(log);
  }

  appendLog({ event: 'generate', type, template, theme: content.theme, dryRun, success: true });

  console.log('\nDone.');
  console.log('  Preview  : open generated/preview.html in a browser');
  console.log('  Image    : generated/latest-image.png');
  console.log('  Caption  : generated/latest-caption.json');
  if (!dryRun) {
    console.log('\nReview the preview, then run: node src/index.js publish');
  }
}

// ── publish command ───────────────────────────────────────────────────────────

async function commandPublish({ dryRun }) {
  const captionPath = path.join(GENERATED_DIR, 'latest-caption.json');
  if (!fs.existsSync(captionPath)) {
    throw new Error('No generated content found. Run "node src/index.js generate" first.');
  }

  const captionData = JSON.parse(fs.readFileSync(captionPath, 'utf8'));
  console.log(`\nPublishing ${captionData.type} post${dryRun ? ' [DRY RUN]' : ''}...`);
  console.log(`  Theme    : ${captionData.theme}`);
  console.log(`  Template : ${captionData.template}`);
  console.log(`  Generated: ${captionData.generatedAt}`);

  if (!dryRun) {
    await checkAndRefreshToken();
  }

  const result = await publishToInstagram(
    captionData.imagePath,
    captionData.caption,
    dryRun,
    captionData.imageUrl || null,   // pre-uploaded URL set by CI; null triggers upload locally
  );

  if (!dryRun && result.postId) {
    // Mark the matching posts-log entry as published
    const log = readPostsLog();
    const entry = log.posts.find(
      p => p.generatedAt === captionData.generatedAt && !p.published
    );
    if (entry) {
      entry.published = true;
      entry.postId = result.postId;
      entry.publishedAt = new Date().toISOString();
      writePostsLog(log);
    }

    console.log(`\nPosted. Post ID: ${result.postId}`);
    appendLog({
      event: 'publish',
      postId: result.postId,
      containerId: result.containerId,
      theme: captionData.theme,
      imageUrl: result.imageUrl,
      success: true,
    });
  } else if (dryRun) {
    console.log('\n[DRY RUN] Complete — nothing was posted.');
    appendLog({ event: 'publish', dryRun: true, theme: captionData.theme, success: true });
  }
}

// ── entry point ───────────────────────────────────────────────────────────────

async function main() {
  const { command, dryRun, type } = parseArgs();

  try {
    if (command === 'generate') {
      await commandGenerate({ type, dryRun });
    } else if (command === 'publish') {
      await commandPublish({ dryRun });
    } else {
      console.error(`Unknown command "${command}". Use "generate" or "publish".`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`\nError: ${err.message}`);
    appendLog({ event: command, error: err.message, success: false });
    process.exit(1);
  }
}

main();
