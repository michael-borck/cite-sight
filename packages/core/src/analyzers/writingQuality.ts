import { WritingQualityResult } from '../types.js';

// ---------------------------------------------------------------------------
// Shared sentence splitter (same lightweight logic as readability module)
// ---------------------------------------------------------------------------

const ABBR_PATTERN = /\b(?:Dr|Mr|Mrs|Ms|Prof|Sr|Jr|vs|e\.g|i\.e|etc|al|Fig|No|Vol|pp|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec|St|Ave|Blvd|Dept|Govt|Inc|Ltd|Corp)\./g;

function splitSentences(text: string): string[] {
  const masked = text
    .replace(ABBR_PATTERN, m => m.slice(0, -1) + '<DOT>')
    .replace(/\b([A-Z])\./g, '$1<DOT>');

  return masked
    .split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/<DOT>/g, '.').trim())
    .filter(s => s.length > 0);
}

// ---------------------------------------------------------------------------
// Passive voice detection
// ---------------------------------------------------------------------------

/**
 * Matches patterns like:
 *   "was written", "were given", "is known", "are seen",
 *   "has been studied", "will be examined", "could be found",
 *   "being reviewed", "been completed"
 *
 * Past-participle heuristic: word ending in -ed | -en | -wn | -t | -ng
 * preceded by a form of "be".
 */
const BE_FORMS =
  'am|is|are|was|were|be|been|being|' +
  'has been|have been|had been|' +
  'will be|would be|shall be|' +
  'can be|could be|may be|might be|should be|must be|' +
  'will have been|would have been|shall have been';

const PASSIVE_REGEX = new RegExp(
  `\\b(?:${BE_FORMS})\\b\\s+(?:\\w+ly\\s+)?(?:\\w+\\s+)?\\b(\\w+(?:ed|en|wn|t|ng))\\b`,
  'gi'
);

function detectPassiveVoice(sentences: string[]): {
  passiveSentences: string[];
  percentage: number;
} {
  const passiveSentences: string[] = [];

  for (const sentence of sentences) {
    PASSIVE_REGEX.lastIndex = 0;
    if (PASSIVE_REGEX.test(sentence)) {
      passiveSentences.push(sentence);
    }
  }

  const percentage =
    sentences.length > 0
      ? (passiveSentences.length / sentences.length) * 100
      : 0;

  return { passiveSentences, percentage };
}

// ---------------------------------------------------------------------------
// Hedging phrases
// ---------------------------------------------------------------------------

interface HedgingEntry {
  phrase: string;
  pattern: RegExp;
}

const HEDGING_ENTRIES: HedgingEntry[] = [
  { phrase: 'it seems', pattern: /\bit seems\b/gi },
  { phrase: 'it appears', pattern: /\bit appears\b/gi },
  { phrase: 'it would seem', pattern: /\bit would seem\b/gi },
  { phrase: 'might be', pattern: /\bmight be\b/gi },
  { phrase: 'may be', pattern: /\bmay be\b/gi },
  { phrase: 'could be', pattern: /\bcould be\b/gi },
  { phrase: 'could potentially', pattern: /\bcould potentially\b/gi },
  { phrase: 'somewhat', pattern: /\bsomewhat\b/gi },
  { phrase: 'relatively', pattern: /\brelatively\b/gi },
  { phrase: 'arguably', pattern: /\barguably\b/gi },
  { phrase: 'to some extent', pattern: /\bto some extent\b/gi },
  { phrase: 'to a certain extent', pattern: /\bto a certain extent\b/gi },
  { phrase: 'it is possible that', pattern: /\bit is possible that\b/gi },
  { phrase: 'it is likely that', pattern: /\bit is likely that\b/gi },
  { phrase: 'tends to', pattern: /\btends to\b/gi },
  { phrase: 'in some cases', pattern: /\bin some cases\b/gi },
  { phrase: 'in many cases', pattern: /\bin many cases\b/gi },
  { phrase: 'generally speaking', pattern: /\bgenerally speaking\b/gi },
  { phrase: 'generally', pattern: /\bgenerally\b/gi },
  { phrase: 'often', pattern: /\boften\b/gi },
  { phrase: 'frequently', pattern: /\bfrequently\b/gi },
  { phrase: 'typically', pattern: /\btypically\b/gi },
  { phrase: 'usually', pattern: /\busually\b/gi },
  { phrase: 'perhaps', pattern: /\bperhaps\b/gi },
  { phrase: 'possibly', pattern: /\bpossibly\b/gi },
  { phrase: 'apparently', pattern: /\bapparently\b/gi },
  { phrase: 'presumably', pattern: /\bpresumably\b/gi },
  { phrase: 'approximately', pattern: /\bapproximately\b/gi },
  { phrase: 'suggest', pattern: /\bsuggest(?:s|ed|ing)?\b/gi },
  { phrase: 'indicate', pattern: /\bindicate(?:s|d|ing)?\b/gi },
];

function detectHedging(text: string): {
  total: number;
  phrases: Array<{ phrase: string; count: number }>;
} {
  let total = 0;
  const phrases: Array<{ phrase: string; count: number }> = [];

  for (const entry of HEDGING_ENTRIES) {
    const matches = text.match(entry.pattern);
    const count = matches ? matches.length : 0;
    if (count > 0) {
      total += count;
      phrases.push({ phrase: entry.phrase, count });
    }
  }

  return { total, phrases };
}

// ---------------------------------------------------------------------------
// Transition words
// ---------------------------------------------------------------------------

const TRANSITION_PATTERNS = [
  /\bhowever\b/gi,
  /\btherefore\b/gi,
  /\bmoreover\b/gi,
  /\bfurthermore\b/gi,
  /\bnevertheless\b/gi,
  /\bconsequently\b/gi,
  /\badditionally\b/gi,
  /\bsimilarly\b/gi,
  /\bin contrast\b/gi,
  /\bon the other hand\b/gi,
  /\bas a result\b/gi,
  /\bin conclusion\b/gi,
  /\bin summary\b/gi,
  /\bthus\b/gi,
  /\bhence\b/gi,
  /\bthereby\b/gi,
  /\baccordingly\b/gi,
  /\bsubsequently\b/gi,
  /\bconversely\b/gi,
  /\bnotwithstanding\b/gi,
  /\bin addition\b/gi,
  /\bby contrast\b/gi,
  /\bfor instance\b/gi,
  /\bfor example\b/gi,
  /\bspecifically\b/gi,
  /\bnamely\b/gi,
  /\bthat is\b/gi,
  /\bin other words\b/gi,
  /\bon the contrary\b/gi,
  /\bin spite of\b/gi,
  /\bdespite this\b/gi,
  /\bat the same time\b/gi,
];

function countTransitionWords(text: string): number {
  let count = 0;
  for (const pattern of TRANSITION_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Academic tone score (0-100)
// ---------------------------------------------------------------------------

const CONTRACTION_REGEX =
  /\b\w+(?:'t|'re|'ve|'ll|'d|'m|'s)\b/gi;

const FIRST_PERSON_REGEX =
  /\b(?:I|me|my|mine|myself|we|us|our|ours|ourselves)\b/g;

const INFORMAL_WORDS_REGEX =
  /\b(?:stuff|things|lots|really|very|pretty|kind of|sort of|a lot|anyway|basically|actually|literally|honestly|totally|super|awesome|cool|okay|ok|yeah|nope|gonna|wanna|gotta)\b/gi;

const COMPLEX_VOCAB_REGEX =
  /\b(?:paradigm|methodology|theoretical|empirical|analytical|systematic|framework|conceptual|pedagogical|epistemological|ontological|phenomenological|hermeneutical|interdisciplinary|substantive|comprehensive|fundamental|significant|demonstrate|examine|investigate|analyze|evaluate|synthesize|utilize|implement|facilitate|constitute|incorporate|emphasize|illustrate|establish|determine|indicate|suggest|reveal|conclude)\b/gi;

function scoreAcademicTone(
  text: string,
  transitionCount: number,
  passivePercentage: number
): number {
  let score = 50; // start neutral

  // Penalize contractions (−3 each, cap −20)
  const contractions = text.match(CONTRACTION_REGEX) || [];
  score -= Math.min(20, contractions.length * 3);

  // Penalize first-person (−2 each, cap −20)
  const firstPerson = text.match(FIRST_PERSON_REGEX) || [];
  score -= Math.min(20, firstPerson.length * 2);

  // Penalize informal words (−4 each, cap −20)
  const informal = text.match(INFORMAL_WORDS_REGEX) || [];
  score -= Math.min(20, informal.length * 4);

  // Reward transition words (+2 each, cap +15)
  score += Math.min(15, transitionCount * 2);

  // Reward complex vocabulary (+1 each, cap +15)
  const complex = text.match(COMPLEX_VOCAB_REGEX) || [];
  score += Math.min(15, complex.length);

  // Reward passive voice usage (academic texts use passive more)
  // +0.1 per percentage point, cap +10
  score += Math.min(10, passivePercentage * 0.1);

  return Math.round(Math.max(0, Math.min(100, score)));
}

// ---------------------------------------------------------------------------
// Sentence variety score
// ---------------------------------------------------------------------------

function sentenceLengths(sentences: string[]): number[] {
  return sentences.map(s => s.split(/\s+/).filter(w => w.length > 0).length);
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Sentence variety score: coefficient of variation (std/mean) scaled to 0-100.
 * A CV of 0.5 or higher is considered high variety (score 100).
 */
function scoreSentenceVariety(sentences: string[]): number {
  const lengths = sentenceLengths(sentences);
  if (lengths.length === 0) return 0;
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (mean === 0) return 0;
  const cv = standardDeviation(lengths) / mean;
  return Math.round(Math.min(100, cv * 200)); // CV of 0.5 → 100
}

// ---------------------------------------------------------------------------
// Complex sentence ratio
// ---------------------------------------------------------------------------

const SUBORDINATING_CONJUNCTION_REGEX =
  /\b(?:although|because|since|while|whereas|unless|until|even though|even if|as long as|provided that|in order that|so that|whether|whenever|wherever|if|though|once|before|after|when|as)\b/gi;

const RELATIVE_PRONOUN_REGEX =
  /\b(?:which|that|who|whom|whose|whoever|whomever)\b/gi;

function complexSentenceRatio(sentences: string[]): number {
  if (sentences.length === 0) return 0;
  const complex = sentences.filter(s => {
    SUBORDINATING_CONJUNCTION_REGEX.lastIndex = 0;
    RELATIVE_PRONOUN_REGEX.lastIndex = 0;
    return (
      SUBORDINATING_CONJUNCTION_REGEX.test(s) ||
      RELATIVE_PRONOUN_REGEX.test(s)
    );
  });
  return parseFloat((complex.length / sentences.length).toFixed(3));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function analyzeWritingQuality(text: string): WritingQualityResult {
  const sentences = splitSentences(text);

  // Passive voice
  const { passiveSentences, percentage: passiveVoicePercentage } =
    detectPassiveVoice(sentences);

  // Hedging
  const { total: hedgingPhraseCount, phrases: hedgingPhrases } =
    detectHedging(text);

  // Transition words
  const transitionWordCount = countTransitionWords(text);

  // Academic tone
  const academicToneScore = scoreAcademicTone(
    text,
    transitionWordCount,
    passiveVoicePercentage
  );

  // Sentence variety
  const sentenceVarietyScore = scoreSentenceVariety(sentences);

  // Average sentence length
  const lengths = sentenceLengths(sentences);
  const avgSentenceLength =
    lengths.length > 0
      ? parseFloat(
          (lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(2)
        )
      : 0;

  // Complex sentence ratio
  const complexSentenceRatioValue = complexSentenceRatio(sentences);

  return {
    passiveVoicePercentage: parseFloat(passiveVoicePercentage.toFixed(2)),
    passiveVoiceSentences: passiveSentences,
    hedgingPhraseCount,
    hedgingPhrases,
    transitionWordCount,
    academicToneScore,
    sentenceVarietyScore,
    avgSentenceLength,
    complexSentenceRatio: complexSentenceRatioValue,
  };
}
