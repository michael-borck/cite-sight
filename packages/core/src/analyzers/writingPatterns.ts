import { WritingPattern, WritingPatternsResult, PatternCategory } from '../types.js';

// Citation-related document patterns. (Prose/style signals — emojis,
// em-dashes, adverb ratio, hedging, hyperbole, verbosity — now live in the
// document-analyser tool; cite-sight focuses on citations.)

const CURRENT_YEAR = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Check 1: Citation year anomalies
// ---------------------------------------------------------------------------

/**
 * Extracts 4-digit years that look like CITATION years — years inside
 * parentheses ("(Author, 2021)" / "(2021)" / reference-list years). Bare years
 * in prose, tables, or date ranges ("Jan–Mar 2027", "Semester 2 2026") are
 * dates, not citations, and must not be treated as references.
 */
function extractCitationYears(text: string): number[] {
  const years: number[] = [];
  const parenGroups = text.match(/\([^)]*\)/g) ?? [];
  for (const group of parenGroups) {
    const inner = group.match(/\b(1[7-9]\d{2}|20\d{2})\b/g);
    if (inner) years.push(...inner.map(Number));
  }
  return years;
}

function checkCitationAnomalies(text: string): WritingPattern[] {
  const patterns: WritingPattern[] = [];
  const years = extractCitationYears(text);
  if (years.length === 0) return patterns;

  const futureYears = [...new Set(years.filter((y) => y > CURRENT_YEAR))];
  if (futureYears.length > 0) {
    patterns.push({
      type: 'citation_future_date',
      description: `Reference(s) cite future years: ${futureYears.join(', ')}`,
      severity: 'high',
      category: 'citation_issues',
      evidence: futureYears.join(', '),
    });
  }

  const yearCounts = new Map<number, number>();
  for (const y of years) yearCounts.set(y, (yearCounts.get(y) ?? 0) + 1);
  yearCounts.forEach((count, year) => {
    // A cluster is only suspicious when the repeated year is implausible (far
    // future or pre-1900). A burst of current/recent-year citations is normal.
    const isUnusual = year < 1900 || year > CURRENT_YEAR;
    if (count >= 3 && isUnusual) {
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

// Words that make "(Word 3)" look like an MLA "(Author Page)" cite but are
// really cross-references or dates: "(Table 1)", "(Study 2)", "(May 2024)".
const STRUCTURAL_WORDS = new Set([
  'table', 'figure', 'fig', 'section', 'sec', 'appendix', 'chapter', 'chap',
  'equation', 'eq', 'step', 'part', 'phase', 'item', 'note', 'box', 'panel',
  'volume', 'vol', 'version', 'row', 'column', 'col', 'slide', 'day', 'week',
  'level', 'page', 'line', 'footnote', 'question', 'grade', 'group', 'model',
  'study', 'studies', 'experiment', 'stage', 'round',
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept',
  'oct', 'nov', 'dec', 'january', 'february', 'march', 'april', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]);

function checkMixedCitationStyles(text: string): WritingPattern[] {
  const patterns: WritingPattern[] = [];

  const apaMatches = text.match(APA_INTEXT_RE) ?? [];
  const mlaMatches = (text.match(MLA_INTEXT_RE) ?? []).filter((m) => {
    const word = m.slice(1).match(/[A-Za-z]+/)?.[0]?.toLowerCase() ?? '';
    const num = Number(m.match(/\d+/)?.[0] ?? '0');
    // Real MLA in-text cites are "(Author Page)" — a page number, never a
    // 4-digit year; exclude year-like numbers and document cross-references.
    const looksLikeYear = num >= 1700 && num <= 2099;
    return !STRUCTURAL_WORDS.has(word) && !looksLikeYear;
  });
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
// Check 3: Placeholder / template citation text (completeness)
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /lorem ipsum/gi, label: 'Lorem ipsum' },
  { pattern: /\[citation needed\]/gi, label: '[citation needed]' },
  { pattern: /\[insert reference\]/gi, label: '[insert reference]' },
  { pattern: /\[insert citation\]/gi, label: '[insert citation]' },
  { pattern: /\[author,?\s*\d{4}\]/gi, label: '[author, year]' },
  { pattern: /\[source\]/gi, label: '[source]' },
  { pattern: /\[reference\]/gi, label: '[reference]' },
];

function checkPlaceholderText(text: string): WritingPattern[] {
  const patterns: WritingPattern[] = [];
  const found: string[] = [];
  for (const { pattern, label } of PLACEHOLDER_PATTERNS) {
    if (pattern.test(text)) found.push(label);
  }
  if (found.length > 0) {
    patterns.push({
      type: 'placeholder_text',
      description: `Placeholder or template citation text found: ${found.join(', ')}`,
      severity: 'high',
      category: 'completeness',
      evidence: found.join(', '),
    });
  }
  return patterns;
}

// ---------------------------------------------------------------------------
// Category counts + main export
// ---------------------------------------------------------------------------

function calculateCategoryCounts(detectedPatterns: WritingPattern[]): Record<PatternCategory, number> {
  const counts: Record<PatternCategory, number> = {
    citation_issues: 0,
    completeness: 0,
    style_observations: 0,
  };
  for (const p of detectedPatterns) counts[p.category]++;
  return counts;
}

export function analyzeWritingPatterns(text: string): WritingPatternsResult {
  const allPatterns: WritingPattern[] = [
    ...checkCitationAnomalies(text),
    ...checkMixedCitationStyles(text),
    ...checkPlaceholderText(text),
  ];

  return {
    patterns: allPatterns,
    categoryCounts: calculateCategoryCounts(allPatterns),
  };
}
