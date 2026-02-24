import { IntegrityPattern, IntegrityResult } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitSentences(text: string): string[] {
  return text
    .replace(/\b(?:Dr|Mr|Mrs|Ms|Prof|Sr|Jr|vs|e\.g|i\.e|etc|al)\./g, m => m.slice(0, -1) + '<DOT>')
    .replace(/\b([A-Z])\./g, '$1<DOT>')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/<DOT>/g, '.').trim())
    .filter(s => s.length > 0);
}

// ---------------------------------------------------------------------------
// Check 1: Citation year anomalies
// ---------------------------------------------------------------------------

/**
 * Extracts 4-digit years that look like publication years (1700–current+1).
 */
function extractCitationYears(text: string): number[] {
  const matches = text.match(/\b(1[7-9]\d{2}|20\d{2})\b/g) ?? [];
  return matches.map(Number);
}

function checkCitationAnomalies(text: string): IntegrityPattern[] {
  const patterns: IntegrityPattern[] = [];
  const years = extractCitationYears(text);

  if (years.length === 0) return patterns;

  // Future years
  const futureYears = [...new Set(years.filter(y => y > CURRENT_YEAR))];
  if (futureYears.length > 0) {
    patterns.push({
      type: 'citation_future_date',
      description: `Reference(s) cite future years: ${futureYears.join(', ')}`,
      severity: 'high',
      evidence: futureYears.join(', '),
    });
  }

  // Suspicious year clusters: if a single unusual year appears ≥3 times
  const yearCounts = new Map<number, number>();
  for (const y of years) yearCounts.set(y, (yearCounts.get(y) ?? 0) + 1);

  yearCounts.forEach((count, year) => {
    // Flag years that are far from the expected recent range and appear clustered
    const isUnusual = year < 1900 || year > CURRENT_YEAR - 1;
    if (count >= 3 && isUnusual && year <= CURRENT_YEAR) {
      patterns.push({
        type: 'citation_year_cluster',
        description: `Year ${year} appears ${count} times — unusual cluster`,
        severity: 'medium',
        evidence: `${year} (×${count})`,
      });
    }
  });

  return patterns;
}

// ---------------------------------------------------------------------------
// Check 2: Mixed citation styles
// ---------------------------------------------------------------------------

// APA in-text: (Author, 2020) or (Author & Author, 2020)
const APA_INTEXT_RE = /\([A-Z][a-z]+(?:\s+et\s+al\.)?(?:\s*[&,]\s*[A-Z][a-z]+)*,\s*\d{4}(?:,\s*p+\.\s*\d+)?\)/g;
// MLA in-text: (Author 45) — author + page number, no year
const MLA_INTEXT_RE = /\([A-Z][a-z]+(?:\s+et\s+al\.)?\s+\d+\)/g;
// Numeric citation: [1], [2,3], [1-4]
const NUMERIC_CITE_RE = /\[\d+(?:[,\-]\d+)*\]/g;

function checkMixedCitationStyles(text: string): IntegrityPattern[] {
  const patterns: IntegrityPattern[] = [];

  const apaMatches = text.match(APA_INTEXT_RE) ?? [];
  const mlaMatches = text.match(MLA_INTEXT_RE) ?? [];
  const numericMatches = text.match(NUMERIC_CITE_RE) ?? [];

  const stylesDetected: string[] = [];
  if (apaMatches.length > 0) stylesDetected.push('APA');
  if (mlaMatches.length > 0) stylesDetected.push('MLA');
  if (numericMatches.length > 0) stylesDetected.push('Numeric');

  if (stylesDetected.length >= 2) {
    patterns.push({
      type: 'mixed_citation_styles',
      description: `Multiple citation styles detected within the same document: ${stylesDetected.join(', ')}`,
      severity: 'medium',
      evidence: stylesDetected.join(', '),
    });
  }

  return patterns;
}

// ---------------------------------------------------------------------------
// Check 3: AI-typical patterns
// ---------------------------------------------------------------------------

const AI_FORMULAIC_TRANSITIONS = [
  /\bfurthermore,/gi,
  /\bmoreover,/gi,
  /\badditionally,/gi,
  /\bin conclusion,/gi,
  /\bit is worth noting/gi,
  /\bit is important to note/gi,
  /\bit should be noted/gi,
  /\bnotably,/gi,
  /\bin summary,/gi,
  /\bto summarize,/gi,
  /\bin essence,/gi,
];

const AI_COMPLEX_VOCAB = [
  'delve', 'intricate', 'multifaceted', 'nuanced', 'paramount',
  'comprehensive', 'underscore', 'robust', 'leverage', 'synergy',
  'holistic', 'pivotal', 'seamless', 'streamline', 'foster',
  'endeavor', 'facilitate', 'navigate', 'realm', 'tapestry',
];

function checkAiTypicalPatterns(text: string, sentences: string[]): IntegrityPattern[] {
  const patterns: IntegrityPattern[] = [];

  // Repetitive sentence starters: first word of each sentence
  const starters = sentences.map(s => {
    const first = s.match(/^\b\w+\b/);
    return first ? first[0].toLowerCase() : '';
  }).filter(Boolean);

  if (starters.length >= 5) {
    const starterCounts = new Map<string, number>();
    for (const w of starters) starterCounts.set(w, (starterCounts.get(w) ?? 0) + 1);
    starterCounts.forEach((count, word) => {
      const ratio = count / starters.length;
      if (ratio > 0.30 && count >= 3) {
        patterns.push({
          type: 'repetitive_sentence_starters',
          description: `"${word}" starts ${Math.round(ratio * 100)}% of sentences (${count}/${starters.length})`,
          severity: 'medium',
          evidence: `"${word}" ×${count}`,
        });
      }
    });
  }

  // Formulaic transitions overuse
  let formulaicCount = 0;
  const formulaicFound: string[] = [];
  for (const re of AI_FORMULAIC_TRANSITIONS) {
    const m = text.match(re);
    if (m) {
      formulaicCount += m.length;
      formulaicFound.push(m[0]);
    }
  }
  if (formulaicCount >= 4) {
    patterns.push({
      type: 'formulaic_transitions',
      description: `Overuse of AI-typical formulaic transitions (${formulaicCount} occurrences)`,
      severity: 'medium',
      evidence: formulaicFound.slice(0, 5).join('; '),
    });
  }

  // Unusual vocabulary consistency
  const vocabHits: string[] = [];
  for (const word of AI_COMPLEX_VOCAB) {
    const re = new RegExp(`\\b${word}\\b`, 'gi');
    const m = text.match(re);
    if (m && m.length >= 2) {
      vocabHits.push(`${word} (×${m.length})`);
    }
  }
  if (vocabHits.length >= 3) {
    patterns.push({
      type: 'ai_vocabulary_signature',
      description: `Repeated use of AI-characteristic vocabulary: ${vocabHits.join(', ')}`,
      severity: 'low',
      evidence: vocabHits.join(', '),
    });
  }

  return patterns;
}

// ---------------------------------------------------------------------------
// Check 4: Self-referencing issues
// ---------------------------------------------------------------------------

const SELF_REFERENCE_PATTERNS = [
  /\bas i mentioned\b/gi,
  /\bas mentioned earlier\b/gi,
  /\bas i discussed\b/gi,
  /\bin my previous work\b/gi,
  /\bin my earlier work\b/gi,
  /\bas i noted\b/gi,
  /\bI have previously shown\b/gi,
  /\bmy research shows\b/gi,
  /\bmy study found\b/gi,
  /\bmy findings\b/gi,
];

function checkSelfReferencing(text: string): IntegrityPattern[] {
  const patterns: IntegrityPattern[] = [];
  const found: string[] = [];

  for (const re of SELF_REFERENCE_PATTERNS) {
    const m = text.match(re);
    if (m) found.push(...m.map(s => s.toLowerCase()));
  }

  if (found.length > 0) {
    const unique = [...new Set(found)];
    patterns.push({
      type: 'self_referencing',
      description: `Self-referencing language detected (may be inappropriate in student papers)`,
      severity: 'low',
      evidence: unique.slice(0, 5).join('; '),
    });
  }

  return patterns;
}

// ---------------------------------------------------------------------------
// Check 5: Placeholder text
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /lorem ipsum/gi, label: 'Lorem ipsum' },
  { pattern: /\[citation needed\]/gi, label: '[citation needed]' },
  { pattern: /\[insert reference\]/gi, label: '[insert reference]' },
  { pattern: /\[insert citation\]/gi, label: '[insert citation]' },
  { pattern: /\[author,?\s*\d{4}\]/gi, label: '[author, year]' },
  { pattern: /\[source\]/gi, label: '[source]' },
  { pattern: /\[reference\]/gi, label: '[reference]' },
  { pattern: /\bTODO\b/g, label: 'TODO' },
  { pattern: /\bTBD\b/g, label: 'TBD' },
  { pattern: /\[PLACEHOLDER\]/gi, label: '[PLACEHOLDER]' },
  { pattern: /\bXXX\b/g, label: 'XXX placeholder' },
  { pattern: /\[your name\]/gi, label: '[your name]' },
  { pattern: /\[date\]/gi, label: '[date]' },
];

function checkPlaceholderText(text: string): IntegrityPattern[] {
  const patterns: IntegrityPattern[] = [];
  const found: string[] = [];

  for (const { pattern, label } of PLACEHOLDER_PATTERNS) {
    const m = text.match(pattern);
    if (m) found.push(label);
  }

  if (found.length > 0) {
    patterns.push({
      type: 'placeholder_text',
      description: `Placeholder or template text found: ${found.join(', ')}`,
      severity: 'high',
      evidence: found.join(', '),
    });
  }

  return patterns;
}

// ---------------------------------------------------------------------------
// Risk score calculation
// ---------------------------------------------------------------------------

const SEVERITY_WEIGHTS: Record<IntegrityPattern['severity'], number> = {
  high: 25,
  medium: 12,
  low: 5,
};

function calculateRiskScore(detectedPatterns: IntegrityPattern[]): number {
  const raw = detectedPatterns.reduce(
    (sum, p) => sum + SEVERITY_WEIGHTS[p.severity],
    0
  );
  return Math.min(100, raw);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function analyzeIntegrity(text: string): IntegrityResult {
  const sentences = splitSentences(text);

  const allPatterns: IntegrityPattern[] = [
    ...checkCitationAnomalies(text),
    ...checkMixedCitationStyles(text),
    ...checkAiTypicalPatterns(text, sentences),
    ...checkSelfReferencing(text),
    ...checkPlaceholderText(text),
  ];

  const riskScore = calculateRiskScore(allPatterns);

  return {
    patterns: allPatterns,
    riskScore,
  };
}
