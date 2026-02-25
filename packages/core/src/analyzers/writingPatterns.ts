import { WritingPattern, WritingPatternsResult, PatternCategory } from '../types.js';

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

function checkCitationAnomalies(text: string): WritingPattern[] {
  const patterns: WritingPattern[] = [];
  const years = extractCitationYears(text);

  if (years.length === 0) return patterns;

  // Future years
  const futureYears = [...new Set(years.filter(y => y > CURRENT_YEAR))];
  if (futureYears.length > 0) {
    patterns.push({
      type: 'citation_future_date',
      description: `Reference(s) cite future years: ${futureYears.join(', ')}`,
      severity: 'high',
      category: 'citation_issues',
      evidence: futureYears.join(', '),
    });
  }

  // Suspicious year clusters: if a single unusual year appears >=3 times
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
        category: 'citation_issues',
        evidence: `${year} (x${count})`,
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

function checkMixedCitationStyles(text: string): WritingPattern[] {
  const patterns: WritingPattern[] = [];

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
      category: 'citation_issues',
      evidence: stylesDetected.join(', '),
    });
  }

  return patterns;
}

// ---------------------------------------------------------------------------
// Check 3: Style observations
// ---------------------------------------------------------------------------

const FORMULAIC_TRANSITIONS = [
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

const OVERUSED_VOCAB = [
  'delve', 'intricate', 'multifaceted', 'nuanced', 'paramount',
  'comprehensive', 'underscore', 'robust', 'leverage', 'synergy',
  'holistic', 'pivotal', 'seamless', 'streamline', 'foster',
  'endeavor', 'facilitate', 'navigate', 'realm', 'tapestry',
];

function checkStylePatterns(text: string, sentences: string[]): WritingPattern[] {
  const patterns: WritingPattern[] = [];

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
          category: 'style_observations',
          evidence: `"${word}" x${count}`,
        });
      }
    });
  }

  // Formulaic transitions overuse
  let formulaicCount = 0;
  const formulaicFound: string[] = [];
  for (const re of FORMULAIC_TRANSITIONS) {
    const m = text.match(re);
    if (m) {
      formulaicCount += m.length;
      formulaicFound.push(m[0]);
    }
  }
  if (formulaicCount >= 4) {
    patterns.push({
      type: 'formulaic_transitions',
      description: `Overuse of formulaic transitions (${formulaicCount} occurrences)`,
      severity: 'medium',
      category: 'style_observations',
      evidence: formulaicFound.slice(0, 5).join('; '),
    });
  }

  // Overused vocabulary
  const vocabHits: string[] = [];
  for (const word of OVERUSED_VOCAB) {
    const re = new RegExp(`\\b${word}\\b`, 'gi');
    const m = text.match(re);
    if (m && m.length >= 2) {
      vocabHits.push(`${word} (x${m.length})`);
    }
  }
  if (vocabHits.length >= 3) {
    patterns.push({
      type: 'overused_vocabulary',
      description: `Repeated use of uncommon vocabulary: ${vocabHits.join(', ')}`,
      severity: 'low',
      category: 'style_observations',
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

function checkSelfReferencing(text: string): WritingPattern[] {
  const patterns: WritingPattern[] = [];
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
      category: 'style_observations',
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

function checkPlaceholderText(text: string): WritingPattern[] {
  const patterns: WritingPattern[] = [];
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
      category: 'completeness',
      evidence: found.join(', '),
    });
  }

  return patterns;
}

// ---------------------------------------------------------------------------
// Check 6: Emojis
// ---------------------------------------------------------------------------

function checkEmojis(text: string): WritingPattern[] {
  const emojiRe = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{200D}\u{FE0F}]/gu;
  const matches = text.match(emojiRe);
  if (matches && matches.length > 0) {
    const unique = [...new Set(matches)];
    return [{
      type: 'emojis',
      description: `Emojis found in body text (${matches.length} occurrence${matches.length > 1 ? 's' : ''})`,
      severity: 'medium',
      category: 'style_observations',
      evidence: unique.slice(0, 10).join(' '),
    }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Check 7: Excessive em-dashes
// ---------------------------------------------------------------------------

function checkExcessiveEmDashes(text: string): WritingPattern[] {
  const emDashMatches = text.match(/\u2014/g) ?? [];
  const doubleDashMatches = text.match(/--/g) ?? [];
  const total = emDashMatches.length + doubleDashMatches.length;
  if (total >= 5) {
    return [{
      type: 'excessive_em_dashes',
      description: `Excessive use of em-dashes (${total} occurrences)`,
      severity: 'low',
      category: 'style_observations',
      evidence: `${total} em-dash/double-dash occurrences`,
    }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Check 8: Excessive adjectives (intensifier clusters)
// ---------------------------------------------------------------------------

function checkExcessiveAdjectives(text: string): WritingPattern[] {
  const intensifierRe = /\b(very|extremely|highly|incredibly)\s+\w+/gi;
  const matches = text.match(intensifierRe) ?? [];
  if (matches.length >= 5) {
    return [{
      type: 'excessive_adjectives',
      description: `Frequent use of intensifier phrases (${matches.length} occurrences)`,
      severity: 'low',
      category: 'style_observations',
      evidence: matches.slice(0, 5).join('; '),
    }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Check 9: Hyperbole
// ---------------------------------------------------------------------------

const HYPERBOLIC_TERMS = [
  'revolutionary', 'groundbreaking', 'unprecedented', 'game-changing',
  'cutting-edge', 'paradigm-shifting', 'transformative', 'disruptive',
  'world-class', 'best-in-class', 'state-of-the-art', 'trailblazing',
];

function checkHyperbole(text: string): WritingPattern[] {
  const found: string[] = [];
  for (const term of HYPERBOLIC_TERMS) {
    const re = new RegExp(`\\b${term.replace(/-/g, '[\\s-]')}\\b`, 'gi');
    if (re.test(text)) {
      found.push(term);
    }
  }
  if (found.length >= 3) {
    return [{
      type: 'hyperbole',
      description: `Multiple hyperbolic terms found (${found.length} different terms)`,
      severity: 'low',
      category: 'style_observations',
      evidence: found.join(', '),
    }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Check 10: Verbosity (wordy phrases)
// ---------------------------------------------------------------------------

const WORDY_PHRASES = [
  { pattern: /\bin order to\b/gi, label: 'in order to' },
  { pattern: /\bdue to the fact that\b/gi, label: 'due to the fact that' },
  { pattern: /\bit is important to note that\b/gi, label: 'it is important to note that' },
  { pattern: /\ba large number of\b/gi, label: 'a large number of' },
  { pattern: /\bat this point in time\b/gi, label: 'at this point in time' },
  { pattern: /\bin the event that\b/gi, label: 'in the event that' },
  { pattern: /\bfor the purpose of\b/gi, label: 'for the purpose of' },
  { pattern: /\bin spite of the fact that\b/gi, label: 'in spite of the fact that' },
  { pattern: /\bwith regard to\b/gi, label: 'with regard to' },
  { pattern: /\bin the process of\b/gi, label: 'in the process of' },
  { pattern: /\bon the basis of\b/gi, label: 'on the basis of' },
  { pattern: /\bhas the ability to\b/gi, label: 'has the ability to' },
];

function checkVerbosity(text: string): WritingPattern[] {
  const found: string[] = [];
  for (const { pattern, label } of WORDY_PHRASES) {
    if (pattern.test(text)) {
      found.push(label);
    }
  }
  if (found.length >= 4) {
    return [{
      type: 'verbosity',
      description: `Multiple wordy phrases found (${found.length} different phrases)`,
      severity: 'low',
      category: 'style_observations',
      evidence: found.slice(0, 5).join('; '),
    }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Check 11: Excessive bullet points
// ---------------------------------------------------------------------------

function checkExcessiveBulletPoints(text: string): WritingPattern[] {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  const listItemRe = /^\s*(?:[-*\u2022]|\d+\.)\s/;
  const listLines = lines.filter(l => listItemRe.test(l));
  const ratio = listLines.length / lines.length;

  if (ratio > 0.40) {
    return [{
      type: 'excessive_bullet_points',
      description: `${Math.round(ratio * 100)}% of lines are list items (${listLines.length}/${lines.length})`,
      severity: 'medium',
      category: 'style_observations',
      evidence: `${listLines.length} list items out of ${lines.length} non-empty lines`,
    }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Category counts
// ---------------------------------------------------------------------------

function calculateCategoryCounts(detectedPatterns: WritingPattern[]): Record<PatternCategory, number> {
  const counts: Record<PatternCategory, number> = {
    citation_issues: 0,
    completeness: 0,
    style_observations: 0,
  };
  for (const p of detectedPatterns) {
    counts[p.category]++;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function analyzeWritingPatterns(text: string): WritingPatternsResult {
  const sentences = splitSentences(text);

  const allPatterns: WritingPattern[] = [
    ...checkCitationAnomalies(text),
    ...checkMixedCitationStyles(text),
    ...checkStylePatterns(text, sentences),
    ...checkSelfReferencing(text),
    ...checkPlaceholderText(text),
    ...checkEmojis(text),
    ...checkExcessiveEmDashes(text),
    ...checkExcessiveAdjectives(text),
    ...checkHyperbole(text),
    ...checkVerbosity(text),
    ...checkExcessiveBulletPoints(text),
  ];

  const categoryCounts = calculateCategoryCounts(allPatterns);

  return {
    patterns: allPatterns,
    categoryCounts,
  };
}
