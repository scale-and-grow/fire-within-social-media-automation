const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(process.cwd(), '.env');
const GRAPH_API = 'https://graph.facebook.com/v19.0';

async function checkAndRefreshToken() {
  const { META_APP_ID, META_APP_SECRET, META_LONG_LIVED_TOKEN } = process.env;

  if (!META_APP_ID || !META_APP_SECRET || !META_LONG_LIVED_TOKEN) {
    console.warn('[token] Missing META credentials — skipping token check.');
    return;
  }

  let debugData;
  try {
    const res = await fetch(
      `https://graph.facebook.com/debug_token` +
      `?input_token=${META_LONG_LIVED_TOKEN}` +
      `&access_token=${META_APP_ID}|${META_APP_SECRET}`
    );
    const body = await res.json();

    if (body.error) {
      console.warn(`[token] Could not verify token: ${body.error.message}`);
      return;
    }
    debugData = body.data;
  } catch (err) {
    console.warn(`[token] Token check request failed: ${err.message}`);
    return;
  }

  // A value of 0 means the token never expires (e.g. Page or System User tokens)
  if (!debugData.expires_at || debugData.expires_at === 0) {
    console.log('[token] Token does not expire.');
    return;
  }

  const expiresAt = new Date(debugData.expires_at * 1000);
  const daysLeft = (expiresAt - Date.now()) / (1000 * 60 * 60 * 24);
  console.log(`[token] Expires ${expiresAt.toISOString()} (${daysLeft.toFixed(1)} days left)`);

  if (daysLeft > 10) return;

  console.log('[token] Within 10-day window — refreshing long-lived token...');

  try {
    const res = await fetch(
      `${GRAPH_API}/oauth/access_token` +
      `?grant_type=fb_exchange_token` +
      `&client_id=${META_APP_ID}` +
      `&client_secret=${META_APP_SECRET}` +
      `&fb_exchange_token=${META_LONG_LIVED_TOKEN}`
    );
    const data = await res.json();

    if (data.error) throw new Error(data.error.message);

    const newToken = data.access_token;

    // Auto-patch .env in place
    if (fs.existsSync(ENV_FILE)) {
      const content = fs.readFileSync(ENV_FILE, 'utf8');
      const updated = content.replace(
        /^META_LONG_LIVED_TOKEN=.*/m,
        `META_LONG_LIVED_TOKEN=${newToken}`
      );
      fs.writeFileSync(ENV_FILE, updated);
      process.env.META_LONG_LIVED_TOKEN = newToken;
      console.log('[token] .env updated with refreshed token.');
    } else {
      console.log(`[token] New token (update .env manually):\nMETA_LONG_LIVED_TOKEN=${newToken}`);
    }

    return newToken;
  } catch (err) {
    console.warn(`[token] Refresh failed: ${err.message}. Proceeding with existing token.`);
  }
}

module.exports = { checkAndRefreshToken };
