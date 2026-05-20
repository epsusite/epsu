const naughtyWords = require('naughty-words');

const CUSTOM_FLAGGED_PHRASES = [
  'nazi',
  'neo nazi',
  'neo nazis',
  'heil hitler',
  'kill yourself',
  'kys',
  'go die',
  'should die',
  'gas the jews',
  'jew killer',
  'jew killers',
  'white power',
  'ethnic cleansing',
];

const ESTONIAN_CASE_ENDINGS = [
  '',
  'd',
  'de',
  'des',
  'del',
  'dele',
  'dest',
  'dega',
  'ga',
  's',
  'st',
  'le',
  'lt',
  'l',
  'ni',
  'na',
  'ta',
  'ks',
];

const ESTONIAN_FLAGGED_KEYWORDS = [
  { keyword: 'türa', forms: ['türa'] },
  { keyword: 'munn', forms: ['munn', 'munni'] },
  { keyword: 'vitt', forms: ['vitt', 'vitu', 'vittu'] },
  { keyword: 'perse', forms: ['perse', 'persse'] },
  { keyword: 'sitt', forms: ['sitt', 'sita'] },
  { keyword: 'lits', forms: ['lits', 'litsu'] },
  { keyword: 'hoor', forms: ['hoor', 'hoora'] },
  { keyword: 'pede', forms: ['pede', 'pedekas', 'pedeka'] },
  { keyword: 'neeger', forms: ['neeger', 'neegr'] },
  { keyword: 'jobu', forms: ['jobu'] },
  { keyword: 'värdjas', forms: ['värdjas', 'värdja'] },
  { keyword: 'debiilik', forms: ['debiilik'] },
  { keyword: 'idioot', forms: ['idioot', 'idioodi'] },
  { keyword: 'nahhui', forms: ['nahhui', 'nahhuj'] },
  { keyword: 'pohhui', forms: ['pohhui', 'pohhuj'] },
  { keyword: 'hui', forms: ['hui'] },
  { keyword: 'blyad', forms: ['blyad', 'bljääd', 'bljad'] },
];

const ESTONIAN_FLAGGED_PHRASE_MATCHERS = [
  {
    keyword: 'tapa end ära',
    pattern: /(^|[^\p{L}\p{N}])tap[\p{L}]{0,6}\s+end\s+ära(?=$|[^\p{L}\p{N}])/u,
  },
  {
    keyword: 'poo end üles',
    pattern: /(^|[^\p{L}\p{N}])poo\s+end\s+üles(?=$|[^\p{L}\p{N}])/u,
  },
  {
    keyword: 'mine persse',
    pattern: /(^|[^\p{L}\p{N}])mine\s+persse[\p{L}]*(?=$|[^\p{L}\p{N}])/u,
  },
  {
    keyword: 'käi persse',
    pattern: /(^|[^\p{L}\p{N}])käi\s+persse[\p{L}]*(?=$|[^\p{L}\p{N}])/u,
  },
  {
    keyword: 'mine vittu',
    pattern: /(^|[^\p{L}\p{N}])mine\s+vittu[\p{L}]*(?=$|[^\p{L}\p{N}])/u,
  },
  {
    keyword: 'käi vittu',
    pattern: /(^|[^\p{L}\p{N}])käi\s+vittu[\p{L}]*(?=$|[^\p{L}\p{N}])/u,
  },
];

function normalizeKeyword(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPluralVariant(word) {
  if (!word || word.length < 2) {
    return null;
  }

  if (/[sxz]$/i.test(word) || /(ch|sh)$/i.test(word)) {
    return `${word}es`;
  }

  if (/[^aeiou]y$/i.test(word)) {
    return `${word.slice(0, -1)}ies`;
  }

  return `${word}s`;
}

function buildKeywordVariants(keyword) {
  const variants = new Set([keyword]);
  const words = keyword.split(' ');

  if (words.length === 1) {
    const pluralVariant = getPluralVariant(keyword);
    if (pluralVariant) {
      variants.add(pluralVariant);
    }
    return Array.from(variants);
  }

  const lastWord = words[words.length - 1];
  const pluralLastWord = getPluralVariant(lastWord);
  if (pluralLastWord) {
    variants.add([...words.slice(0, -1), pluralLastWord].join(' '));
  }

  return Array.from(variants);
}

function buildEstonianKeywordVariants(forms) {
  const variants = new Set();

  for (const form of forms) {
    const normalizedForm = normalizeKeyword(form);
    if (!normalizedForm) {
      continue;
    }

    variants.add(normalizedForm);

    for (const ending of ESTONIAN_CASE_ENDINGS) {
      variants.add(`${normalizedForm}${ending}`);
    }
  }

  return Array.from(variants);
}

const FLAGGED_KEYWORDS = Array.from(
  new Set(
    [
      ...(naughtyWords.en ?? []),
      ...(naughtyWords.ru ?? []),
      ...CUSTOM_FLAGGED_PHRASES,
      ...ESTONIAN_FLAGGED_KEYWORDS.map((entry) => entry.keyword),
      ...ESTONIAN_FLAGGED_PHRASE_MATCHERS.map((entry) => entry.keyword),
    ]
      .map(normalizeKeyword)
      .filter((value) => value.length >= 2)
  )
).sort((left, right) => right.length - left.length);

const BASE_FLAGGED_KEYWORD_MATCHERS = FLAGGED_KEYWORDS
  .filter((keyword) => !ESTONIAN_FLAGGED_PHRASE_MATCHERS.some((entry) => entry.keyword === keyword))
  .filter((keyword) => !ESTONIAN_FLAGGED_KEYWORDS.some((entry) => entry.keyword === keyword))
  .map((keyword) => ({
    keyword,
    pattern: new RegExp(
      `(^|[^\\p{L}\\p{N}])(?:${buildKeywordVariants(keyword).map(escapeRegex).join('|')})(?=$|[^\\p{L}\\p{N}])`,
      'u'
    ),
  }));

const ESTONIAN_FLAGGED_KEYWORD_MATCHERS = ESTONIAN_FLAGGED_KEYWORDS.map((entry) => ({
  keyword: entry.keyword,
  pattern: new RegExp(
    `(^|[^\\p{L}\\p{N}])(?:${buildEstonianKeywordVariants(entry.forms).map(escapeRegex).join('|')})(?=$|[^\\p{L}\\p{N}])`,
    'u'
  ),
}));

const FLAGGED_KEYWORD_MATCHERS = [
  ...BASE_FLAGGED_KEYWORD_MATCHERS,
  ...ESTONIAN_FLAGGED_KEYWORD_MATCHERS,
  ...ESTONIAN_FLAGGED_PHRASE_MATCHERS,
].sort((left, right) => right.keyword.length - left.keyword.length);

export const FLAGGED_KEYWORD_COUNT = FLAGGED_KEYWORDS.length;

export function detectFlaggedKeywords(title, body) {
  const haystack = normalizeKeyword(`${title}\n${body}`);
  const matches = [];

  for (const { keyword, pattern } of FLAGGED_KEYWORD_MATCHERS) {
    if (!pattern.test(haystack)) {
      continue;
    }

    matches.push(keyword);
    if (matches.length >= 12) {
      break;
    }
  }

  return matches;
}
