import { ReadabilityResult } from '../types';

// ---------------------------------------------------------------------------
// Syllable counting
// ---------------------------------------------------------------------------

/**
 * Count syllables in a single word using vowel-group heuristics.
 * Rules:
 *   1. Count contiguous vowel groups (a e i o u y).
 *   2. Subtract silent trailing -e  (e.g. "make" → 2 vowel groups → -1 = 1).
 *   3. Ensure a minimum of 1 syllable.
 */
function countSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (cleaned.length === 0) return 0;

  const vowelGroups = cleaned.match(/[aeiouy]+/g);
  let count = vowelGroups ? vowelGroups.length : 0;

  // Subtract silent trailing -e (but not -le, -ee, -oe, -ye endings where the
  // vowel group is part of a real syllable)
  if (
    cleaned.length > 2 &&
    cleaned.endsWith('e') &&
    !/[aeiouy]e$/.test(cleaned.slice(0, -1)) // preceding char is consonant
  ) {
    count -= 1;
  }

  return Math.max(1, count);
}

// ---------------------------------------------------------------------------
// Sentence splitting
// ---------------------------------------------------------------------------

/**
 * Split text into sentences.
 *
 * Strategy:
 *   - Replace known abbreviation periods with a placeholder so they don't
 *     trigger a sentence split.
 *   - Split on sentence-ending punctuation (. ! ?) followed by whitespace or
 *     end-of-string.
 *   - Filter out empty strings.
 */
const ABBREVIATIONS = [
  'Dr', 'Mr', 'Mrs', 'Ms', 'Prof', 'Sr', 'Jr', 'vs',
  'e\\.g', 'i\\.e', 'etc', 'al', 'Fig', 'No', 'Vol', 'pp',
  'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  'St', 'Ave', 'Blvd', 'Dept', 'Govt', 'Inc', 'Ltd', 'Corp',
];

function splitSentences(text: string): string[] {
  let processed = text;

  // Mask abbreviation periods
  for (const abbr of ABBREVIATIONS) {
    const re = new RegExp(`\\b(${abbr})\\.`, 'g');
    processed = processed.replace(re, '$1<ABBR_DOT>');
  }

  // Also mask initials like "J. K. Rowling"
  processed = processed.replace(/\b([A-Z])\./g, '$1<ABBR_DOT>');

  // Split on sentence-ending punctuation
  const parts = processed.split(/(?<=[.!?])\s+/);

  return parts
    .map(s => s.replace(/<ABBR_DOT>/g, '.').trim())
    .filter(s => s.length > 0);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function analyzeReadability(text: string): ReadabilityResult {
  // --- Paragraphs ---
  const paragraphs = text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
  const paragraphCount = Math.max(1, paragraphs.length);

  // --- Words ---
  const words = text
    .split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z'-]/g, ''))
    .filter(w => w.length > 0);
  const wordCount = words.length;

  // --- Sentences ---
  const sentences = splitSentences(text);
  const sentenceCount = Math.max(1, sentences.length);

  // --- Syllables ---
  let syllableCount = 0;
  for (const word of words) {
    syllableCount += countSyllables(word);
  }

  // --- Derived averages ---
  const avgWordsPerSentence = wordCount / sentenceCount;
  const avgSyllablesPerWord = wordCount > 0 ? syllableCount / wordCount : 0;

  // --- Flesch Reading Ease ---
  // 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)
  const fleschReadingEase =
    206.835 -
    1.015 * avgWordsPerSentence -
    84.6 * avgSyllablesPerWord;

  // --- Flesch-Kincaid Grade Level ---
  // 0.39*(words/sentences) + 11.8*(syllables/words) - 15.59
  const fleschKincaidGrade =
    0.39 * avgWordsPerSentence +
    11.8 * avgSyllablesPerWord -
    15.59;

  // --- Coleman-Liau Index ---
  // L = avg letters per 100 words
  // S = avg sentences per 100 words
  // CLI = 0.0588*L - 0.296*S - 15.8
  const letterCount = words.reduce((sum, w) => sum + w.replace(/[^a-zA-Z]/g, '').length, 0);
  const L = wordCount > 0 ? (letterCount / wordCount) * 100 : 0;
  const S = wordCount > 0 ? (sentenceCount / wordCount) * 100 : 0;
  const colemanLiauIndex = 0.0588 * L - 0.296 * S - 15.8;

  // --- Automated Readability Index ---
  // 4.71*(characters/words) + 0.5*(words/sentences) - 21.43
  // "characters" here means letters only (no spaces/punctuation)
  const automatedReadabilityIndex =
    4.71 * (wordCount > 0 ? letterCount / wordCount : 0) +
    0.5 * avgWordsPerSentence -
    21.43;

  return {
    wordCount,
    sentenceCount,
    paragraphCount,
    syllableCount,
    avgWordsPerSentence: parseFloat(avgWordsPerSentence.toFixed(2)),
    avgSyllablesPerWord: parseFloat(avgSyllablesPerWord.toFixed(2)),
    fleschReadingEase: parseFloat(fleschReadingEase.toFixed(2)),
    fleschKincaidGrade: parseFloat(fleschKincaidGrade.toFixed(2)),
    colemanLiauIndex: parseFloat(colemanLiauIndex.toFixed(2)),
    automatedReadabilityIndex: parseFloat(automatedReadabilityIndex.toFixed(2)),
  };
}
