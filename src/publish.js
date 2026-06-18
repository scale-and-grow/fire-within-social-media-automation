const { getPublicUrl } = require('./imageProvider');

const GRAPH_API = 'https://graph.facebook.com/v19.0';

async function publishToInstagram(imagePath, caption, dryRun = false, imageUrl = null) {
  if (dryRun) {
    let resolvedUrl = imageUrl || '(not resolved — image hosting not configured)';
    if (!imageUrl) {
      try { resolvedUrl = await getPublicUrl(imagePath); } catch { /* ok in dry-run */ }
    }
    console.log('\n[DRY RUN] Would publish to Instagram:');
    console.log(`  Image file : ${imagePath}`);
    console.log(`  Image URL  : ${resolvedUrl}`);
    console.log(`\n  Caption:\n${caption}`);
    return { dryRun: true, imageUrl: resolvedUrl };
  }

  const { META_LONG_LIVED_TOKEN, IG_USER_ID } = process.env;
  if (!META_LONG_LIVED_TOKEN || !IG_USER_ID) {
    throw new Error('META_LONG_LIVED_TOKEN and IG_USER_ID must be set in .env');
  }

  // Use the pre-uploaded URL when available (CI flow), otherwise upload now.
  const resolvedUrl = imageUrl || await getPublicUrl(imagePath);
  console.log(`  Image URL: ${resolvedUrl}`);

  // Step 1: Create the media container
  const containerRes = await fetch(`${GRAPH_API}/${IG_USER_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: resolvedUrl,
      caption,
      access_token: META_LONG_LIVED_TOKEN,
    }),
  });
  const containerData = await containerRes.json();

  if (containerData.error) {
    throw new Error(`Container creation failed: ${JSON.stringify(containerData.error)}`);
  }

  const containerId = containerData.id;
  console.log(`  Container created: ${containerId}`);

  // Step 2: Brief pause for Meta to process the image
  await new Promise(resolve => setTimeout(resolve, 4000));

  // Step 3: Publish the container
  const publishRes = await fetch(`${GRAPH_API}/${IG_USER_ID}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: META_LONG_LIVED_TOKEN,
    }),
  });
  const publishData = await publishRes.json();

  if (publishData.error) {
    throw new Error(`Publish failed: ${JSON.stringify(publishData.error)}`);
  }

  return { postId: publishData.id, containerId, imageUrl: resolvedUrl };
}

module.exports = { publishToInstagram };
