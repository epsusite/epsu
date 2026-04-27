const naughtyWords = require('naughty-words');

const CUSTOM_FLAGGED_PHRASES = [
  'nazi',
  'neo nazi',
  'heil hitler',
  'kill yourself',
  'kys',
  'go die',
  'should die',
  'gas the jews',
  'jew killer',
  'white power',
  'ethnic cleansing',
];

function normalizeKeyword(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

const FLAGGED_KEYWORDS = Array.from(
  new Set(
    [...(naughtyWords.en ?? []), ...(naughtyWords.ru ?? []), ...CUSTOM_FLAGGED_PHRASES]
      .map(normalizeKeyword)
      .filter((value) => value.length >= 2)
  )
).sort((left, right) => right.length - left.length);

export const FLAGGED_KEYWORD_COUNT = FLAGGED_KEYWORDS.length;

export function detectFlaggedKeywords(title, body) {
  const haystack = normalizeKeyword(`${title}\n${body}`);
  const matches = [];

  for (const keyword of FLAGGED_KEYWORDS) {
    if (!haystack.includes(keyword)) {
      continue;
    }

    matches.push(keyword);
    if (matches.length >= 12) {
      break;
    }
  }

  return matches;
}
