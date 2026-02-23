import { WordAnalysisResult, WordFrequency, PhraseFrequency } from '../types';

// ---------------------------------------------------------------------------
// Stop words
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'can', 'shall',
  'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'between', 'out', 'off', 'over', 'under', 'again',
  'further', 'then', 'once',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet',
  'both', 'either', 'neither', 'each', 'every', 'all', 'any',
  'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'only', 'own', 'same', 'than', 'too', 'very',
  'just', 'about', 'also',
  'this', 'that', 'these', 'those',
  'it', 'its', 'he', 'she', 'they', 'we', 'you', 'i',
  'me', 'my', 'his', 'her', 'their', 'our', 'your',
  'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why',
]);

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Lowercase and strip punctuation from a token.
 * Keeps internal hyphens (e.g. "well-known") as a single token.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    // Replace non-alphanumeric/hyphen characters with spaces
    .replace(/[^a-z0-9'-]+/g, ' ')
    // Remove leading/trailing hyphens/apostrophes from each position
    .split(/\s+/)
    .map(w => w.replace(/^['-]+|['-]+$/g, ''))
    .filter(w => w.length > 0 && /[a-z]/.test(w));
}

// ---------------------------------------------------------------------------
// Frequency map builder
// ---------------------------------------------------------------------------

function buildFrequencyMap(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const token of tokens) {
    map.set(token, (map.get(token) ?? 0) + 1);
  }
  return map;
}

function topN<T extends { count: number }>(items: T[], n: number): T[] {
  return [...items].sort((a, b) => b.count - a.count).slice(0, n);
}

// ---------------------------------------------------------------------------
// N-gram extraction
// ---------------------------------------------------------------------------

function buildNgrams(tokens: string[], n: number): PhraseFrequency[] {
  const map = new Map<string, number>();

  for (let i = 0; i <= tokens.length - n; i++) {
    const gram = tokens.slice(i, i + n).join(' ');
    map.set(gram, (map.get(gram) ?? 0) + 1);
  }

  const result: PhraseFrequency[] = [];
  map.forEach((count, phrase) => result.push({ phrase, count }));
  return result;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function analyzeWords(text: string): WordAnalysisResult {
  // All tokens (including stop words) for n-gram construction
  const allTokens = tokenize(text);

  // Filtered tokens (stop words removed) for word frequency
  const contentTokens = allTokens.filter(w => !STOP_WORDS.has(w));

  const totalWords = allTokens.length;
  const uniqueWords = new Set(allTokens).size;
  const vocabularyRichness =
    totalWords > 0
      ? parseFloat((uniqueWords / totalWords).toFixed(4))
      : 0;

  // Word frequency (content words only)
  const freqMap = buildFrequencyMap(contentTokens);
  const allWordFreqs: WordFrequency[] = [];
  freqMap.forEach((count, word) => allWordFreqs.push({ word, count }));
  const topWords = topN(allWordFreqs, 50);

  // Bigrams and trigrams from all tokens (stop words included so phrases read
  // naturally, but single-word stop-only grams are still meaningful in context)
  const bigramList = buildNgrams(allTokens, 2);
  const trigramList = buildNgrams(allTokens, 3);

  const bigrams = topN(bigramList, 30);
  const trigrams = topN(trigramList, 30);

  return {
    uniqueWords,
    totalWords,
    vocabularyRichness,
    topWords,
    bigrams,
    trigrams,
  };
}
