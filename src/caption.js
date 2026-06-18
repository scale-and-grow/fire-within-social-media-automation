const Anthropic = require('@anthropic-ai/sdk');
const { readPostedQuotes } = require('./quotesLog');

const THEME_POOL = [
  'rest', 'discipline', 'rebuilding', 'ownership',
  'comfort zone', 'momentum', 'identity', 'fear',
  'consistency', 'self-trust', 'small wins', 'purpose',
];

const SYSTEM_PROMPT = `You are the content voice for "The Fire Within" — a brand for ambitious people navigating burnout and rebuilding toward a life they're proud of.

VOICE (non-negotiable):
- Warm but honest. A steady friend who's been through it, not a guru on a stage.
- Talk like a real person who has actually struggled and rebuilt.
- Be direct. Name the hard thing plainly.
- Honor effort and small wins over hustle and grind.
- Leave room for faith naturally where it fits — never preachy, never forced.
- Respect the reader's intelligence. Short, clean sentences. Let a line land.

BANNED PHRASES — never use any of these:
"rise and grind," "no excuses," "good vibes only," "your only limit is you," "manifest it," "level up," "trust the process," "built different," "that's on you," "grind never stops," "hustle harder," "blessed," "crush it," "you got this" (as filler)

PROHIBITED BEHAVIORS:
- Guru voice, talking down, or fake authority ("most people will never understand this")
- Toxic positivity or sugarcoating — don't bypass the hard part to rush to inspiration
- Glorifying overwork, sleeplessness, or self-neglect
- Empty hype, exclamation-point spam, emoji-stuffing

CONTENT TERRITORY TO DRAW FROM:
- Recovering from burnout without quitting your ambition
- Small wins and momentum over motivation
- Rebuilding identity after unfulfilling work
- The slow, unglamorous middle of building something
- Discipline that's sustainable, not self-punishing
- Faith and purpose as steadying forces (woven in naturally, not every post)
- Ownership: building a life and work you actually own`;

function pickTheme(postedQuotes) {
  const lastTheme = postedQuotes.length > 0
    ? postedQuotes[postedQuotes.length - 1].theme
    : null;
  const pool = THEME_POOL.filter(t => t !== lastTheme);
  return pool[Math.floor(Math.random() * pool.length)];
}

async function generateCaption(type) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const postedQuotes = readPostedQuotes();
  const theme       = pickTheme(postedQuotes);
  const recentQuotes = postedQuotes.slice(-15).map(q => q.quote);

  const timeContext = type === 'morning'
    ? 'This is the 10 AM "Set the tone" post. Forward-looking. A truth to carry into the day, a reframe, a small challenge. Energy without hype — not loud, just grounded.'
    : 'This is the 4 PM "Honest check-in" post. Reflective. Meets people mid-grind when the day\'s been long. Acknowledges the weight, offers a steadying thought or permission to reset. Quieter in energy than the morning post.';

  const avoidQuotesBlock = recentQuotes.length > 0
    ? `\n\nRECENTLY PUBLISHED QUOTES — do NOT repeat or closely echo any of these:\n${recentQuotes.map(q => `- "${q}"`).join('\n')}`
    : '';

  const userPrompt = `Generate a ${type} Instagram post for The Fire Within.

${timeContext}

THEME FOR THIS POST: ${theme}
Ground your quote and caption in this specific theme.${avoidQuotesBlock}

Return ONLY a valid JSON object — no markdown fences, no preamble, no extra text. Exact structure:
{
  "quote": "Short punchy quote for the image card. 1-2 sentences max. No surrounding quote marks.",
  "highlight_phrase": "The punchy closing pivot — 2-4 words max, verbatim substring of the quote. Should be the emotional kicker at the end, not the whole second half.",
  "caption": "2-5 short sentences expanding on the quote honestly. End with a light close — a question, small nudge, or clean ending. NOT a hard CTA every time.",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"],
  "theme": "2-4 word label for this post used for anti-repetition tracking"
}

Hashtag rules: exactly 5, all lowercase, no # prefix, mix of reach + niche (burnout recovery, rebuilding, etc.) — no filler like blessed or grateful.`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = message.content[0].text.trim();
  const jsonText = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error(`Claude returned invalid JSON:\n${text.substring(0, 300)}`);
  }

  if (!data.quote || !data.caption || !Array.isArray(data.hashtags) || data.hashtags.length !== 5) {
    throw new Error(`Claude response missing required fields: ${JSON.stringify(data)}`);
  }

  // Validate highlight_phrase is actually in the quote
  if (data.highlight_phrase && !data.quote.includes(data.highlight_phrase)) {
    data.highlight_phrase = null;
  }

  // Strip any # prefixes from hashtags if Claude added them
  data.hashtags = data.hashtags.map(h => h.replace(/^#/, '').toLowerCase());

  // Always use our pool-picked theme so tracking stays consistent
  data.theme = theme;

  return data;
}

module.exports = { generateCaption };
