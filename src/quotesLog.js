const fs = require('fs');
const path = require('path');

const QUOTES_FILE = path.join(process.cwd(), 'posted-quotes.json');

function readPostedQuotes() {
  if (!fs.existsSync(QUOTES_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(QUOTES_FILE, 'utf8'));
    return Array.isArray(data.quotes) ? data.quotes : [];
  } catch {
    return [];
  }
}

async function appendPostedQuote({ quote, theme, publishedAt }) {
  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO;
  const entry = { quote, theme, publishedAt };

  if (token && repo) {
    // CI path: read current file via API, append, write back
    const apiUrl = `https://api.github.com/repos/${repo}/contents/posted-quotes.json`;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    let sha    = null;
    let quotes = [];

    const getRes = await fetch(apiUrl, { headers });
    if (getRes.ok) {
      const current = await getRes.json();
      sha = current.sha;
      try {
        const decoded = Buffer.from(current.content, 'base64').toString('utf8');
        quotes = JSON.parse(decoded).quotes || [];
      } catch { /* empty or malformed — start fresh */ }
    }

    quotes.push(entry);
    const body = {
      message: `Log published quote (${new Date(publishedAt).toISOString().split('T')[0]})`,
      content: Buffer.from(JSON.stringify({ quotes }, null, 2)).toString('base64'),
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      throw new Error(
        `posted-quotes.json update failed (${putRes.status}): ${err.message || putRes.statusText}`,
      );
    }
  } else {
    // Local path: write directly to disk
    const quotes = readPostedQuotes();
    quotes.push(entry);
    fs.writeFileSync(QUOTES_FILE, JSON.stringify({ quotes }, null, 2));
  }
}

module.exports = { readPostedQuotes, appendPostedQuote };
