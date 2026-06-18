const fs = require('fs');

async function getPublicUrl(imagePath) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;

  if (!token || !repo) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPO must be set in .env');
  }

  const base64Content = fs.readFileSync(imagePath).toString('base64');

  // Unique filename per upload avoids raw.githubusercontent.com CDN cache collisions.
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const remotePath = `images/${timestamp}.png`;

  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${remotePath}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      message: `Add post image ${timestamp}`,
      content: base64Content,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`GitHub upload failed (${response.status}): ${body.message || response.statusText}`);
  }

  return `https://raw.githubusercontent.com/${repo}/main/${remotePath}`;
}

module.exports = { getPublicUrl };
