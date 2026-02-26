import { jsPDF } from 'jspdf';
import type {
  AnalysisResult,
  ReferenceVerification,
  VerificationStatus,
} from '../types';

// ── Colours ──────────────────────────────────────────────────────────────────

const BRAND = [102, 126, 234] as const; // #667eea
const GREY = [100, 100, 100] as const;
const BLACK = [33, 33, 33] as const;
const WHITE = [255, 255, 255] as const;

const STATUS_COLOURS: Record<VerificationStatus, readonly [number, number, number]> = {
  verified: [56, 142, 60],      // green
  likely_valid: [30, 136, 229], // blue
  suspicious: [245, 124, 0],    // orange
  not_found: [211, 47, 47],     // red
  format_only: [158, 158, 158], // grey
};

const STATUS_LABELS: Record<VerificationStatus, string> = {
  verified: 'Verified',
  likely_valid: 'Likely Valid',
  suspicious: 'Suspicious',
  not_found: 'Not Found',
  format_only: 'Format Only',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function setColour(doc: jsPDF, rgb: readonly [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function setFillColour(doc: jsPDF, rgb: readonly [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

/** Ensure there is enough room on the page; add a new page if not. Returns current y. */
function ensureSpace(doc: jsPDF, y: number, needed: number, margin: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - margin) {
    doc.addPage();
    return margin;
  }
  return y;
}

/** Word-wrap text to fit a given width and print it. Returns new y position. */
function printWrapped(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  margin: number,
): number {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  for (const line of lines) {
    y = ensureSpace(doc, y, lineHeight, margin);
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ── Section renderers ────────────────────────────────────────────────────────

function drawHeader(doc: jsPDF, result: AnalysisResult, _y: number, margin: number, pageW: number): number {
  // Brand bar
  setFillColour(doc, BRAND);
  doc.rect(0, 0, pageW, 36, 'F');

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  setColour(doc, WHITE);
  doc.text('CiteSight Analysis Report', margin, 16);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(result.fileName, margin, 26);
  doc.text(`${formatDate()}  •  ${(result.processingTime / 1000).toFixed(1)}s processing`, margin, 32);

  return 46;
}

function drawSectionTitle(doc: jsPDF, title: string, y: number, margin: number): number {
  y = ensureSpace(doc, y, 14, margin);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  setColour(doc, BRAND);
  doc.text(title, margin, y);
  y += 2;
  doc.setDrawColor(BRAND[0], BRAND[1], BRAND[2]);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + doc.getTextWidth(title), y);
  return y + 6;
}

function drawOverview(doc: jsPDF, result: AnalysisResult, y: number, margin: number, contentW: number): number {
  y = drawSectionTitle(doc, 'Overview', y, margin);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  setColour(doc, BLACK);

  const ref = result.references;
  const read = result.readability;

  const rows = [
    ['Words', String(read.wordCount), 'Sentences', String(read.sentenceCount)],
    ['Total References', String(ref.totalReferences), 'Verified', String(ref.verifiedCount)],
    ['Suspicious', String(ref.suspiciousCount), 'Not Found', String(ref.notFoundCount)],
    ['Broken URLs', String(ref.brokenUrlCount), 'Citation Style', ref.detectedStyle.toUpperCase()],
    ['Flesch Reading Ease', read.fleschReadingEase.toFixed(1), 'Flesch-Kincaid Grade', read.fleschKincaidGrade.toFixed(1)],
    ['Coleman-Liau Index', read.colemanLiauIndex.toFixed(1), 'ARI', read.automatedReadabilityIndex.toFixed(1)],
  ];

  const colW = contentW / 4;
  const rowH = 7;
  for (let r = 0; r < rows.length; r++) {
    y = ensureSpace(doc, y, rowH, margin);
    if (r % 2 === 0) {
      setFillColour(doc, [245, 245, 250]);
      doc.rect(margin, y - 4.5, contentW, rowH, 'F');
    }
    for (let c = 0; c < 4; c++) {
      const x = margin + c * colW;
      if (c % 2 === 0) {
        doc.setFont('helvetica', 'bold');
        setColour(doc, GREY);
      } else {
        doc.setFont('helvetica', 'normal');
        setColour(doc, BLACK);
      }
      doc.text(rows[r][c], x + 2, y);
    }
    y += rowH;
  }
  return y + 4;
}

function drawReferencesTable(
  doc: jsPDF,
  verifications: ReferenceVerification[],
  y: number,
  margin: number,
  contentW: number,
): number {
  y = drawSectionTitle(doc, 'References', y, margin);

  if (verifications.length === 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    setColour(doc, GREY);
    doc.text('No references found.', margin, y);
    return y + 8;
  }

  // Table header
  const cols = [
    { label: '#', w: 10 },
    { label: 'Title', w: contentW - 100 },
    { label: 'Status', w: 28 },
    { label: 'DOI', w: 36 },
    { label: 'Conf.', w: 14 },
    { label: 'URL', w: 12 },
  ];

  const headerH = 7;
  y = ensureSpace(doc, y, headerH + 6, margin);
  setFillColour(doc, BRAND);
  doc.rect(margin, y - 4.5, contentW, headerH, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  setColour(doc, WHITE);
  let hx = margin;
  for (const col of cols) {
    doc.text(col.label, hx + 1.5, y);
    hx += col.w;
  }
  y += headerH;

  // Rows
  doc.setFontSize(7.5);
  for (let i = 0; i < verifications.length; i++) {
    const v = verifications[i];
    const ref = v.reference;
    const rowH = 6;

    y = ensureSpace(doc, y, rowH + (v.flags.length > 0 ? 10 : 0), margin);

    // Alternating background
    if (i % 2 === 0) {
      setFillColour(doc, [248, 248, 252]);
      doc.rect(margin, y - 4, contentW, rowH, 'F');
    }

    let cx = margin;

    // #
    doc.setFont('helvetica', 'normal');
    setColour(doc, GREY);
    doc.text(String(i + 1), cx + 1.5, y);
    cx += cols[0].w;

    // Title
    setColour(doc, BLACK);
    doc.text(truncate(ref.title || ref.raw, 70), cx + 1.5, y);
    cx += cols[1].w;

    // Status badge
    const statusCol = STATUS_COLOURS[v.status];
    setFillColour(doc, statusCol);
    doc.roundedRect(cx + 1, y - 3.2, 26, 4.5, 1, 1, 'F');
    setColour(doc, WHITE);
    doc.setFont('helvetica', 'bold');
    doc.text(STATUS_LABELS[v.status], cx + 2.5, y);
    cx += cols[2].w;

    // DOI
    doc.setFont('helvetica', 'normal');
    setColour(doc, GREY);
    doc.text(truncate(ref.doi || '—', 22), cx + 1.5, y);
    cx += cols[3].w;

    // Confidence
    setColour(doc, BLACK);
    doc.text((v.confidenceScore * 100).toFixed(0) + '%', cx + 1.5, y);
    cx += cols[4].w;

    // URL status
    const urlStatus = v.urlCheck?.status ?? 'no_url';
    setColour(doc, urlStatus === 'live' ? [56, 142, 60] : urlStatus === 'no_url' ? GREY : [211, 47, 47]);
    doc.text(urlStatus === 'no_url' ? '—' : urlStatus, cx + 1.5, y);

    y += rowH;

    // Flags row (if any)
    if (v.flags.length > 0) {
      y = ensureSpace(doc, y, 5, margin);
      doc.setFontSize(7);
      setColour(doc, [245, 124, 0]);
      doc.setFont('helvetica', 'italic');
      doc.text('Flags: ' + v.flags.join(', '), margin + cols[0].w + 1.5, y);
      doc.setFontSize(7.5);
      y += 5;
    }
  }

  return y + 4;
}

function drawCrossReferences(doc: jsPDF, result: AnalysisResult, y: number, margin: number, contentW: number): number {
  const cr = result.references.crossReference;
  const hasUnmatchedBib = cr.unmatchedBibliography.length > 0;
  const hasOrphaned = cr.unmatchedInText.length > 0;
  if (!hasUnmatchedBib && !hasOrphaned) return y;

  y = drawSectionTitle(doc, 'Cross-References', y, margin);
  doc.setFontSize(8);

  if (hasUnmatchedBib) {
    y = ensureSpace(doc, y, 8, margin);
    doc.setFont('helvetica', 'bold');
    setColour(doc, BLACK);
    doc.text(`Unmatched bibliography entries (${cr.unmatchedBibliography.length}):`, margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    setColour(doc, GREY);
    for (const ref of cr.unmatchedBibliography) {
      y = printWrapped(doc, `• ${truncate(ref.raw, 120)}`, margin + 2, y, contentW - 4, 4, margin);
    }
    y += 3;
  }

  if (hasOrphaned) {
    y = ensureSpace(doc, y, 8, margin);
    doc.setFont('helvetica', 'bold');
    setColour(doc, BLACK);
    doc.text(`Orphaned in-text citations (${cr.unmatchedInText.length}):`, margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    setColour(doc, GREY);
    for (const cite of cr.unmatchedInText) {
      y = printWrapped(doc, `• ${cite.raw}`, margin + 2, y, contentW - 4, 4, margin);
    }
    y += 3;
  }

  return y + 2;
}

function drawWritingQuality(doc: jsPDF, result: AnalysisResult, y: number, margin: number, contentW: number): number {
  y = drawSectionTitle(doc, 'Writing Quality', y, margin);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  setColour(doc, BLACK);

  const wq = result.writingQuality;
  const rows = [
    ['Passive Voice', `${wq.passiveVoicePercentage.toFixed(1)}%`],
    ['Academic Tone', `${(wq.academicToneScore * 100).toFixed(0)}%`],
    ['Sentence Variety', `${(wq.sentenceVarietyScore * 100).toFixed(0)}%`],
    ['Hedging Phrases', String(wq.hedgingPhraseCount)],
    ['Transition Words', String(wq.transitionWordCount)],
    ['Avg Sentence Length', `${wq.avgSentenceLength.toFixed(1)} words`],
  ];

  for (let i = 0; i < rows.length; i++) {
    y = ensureSpace(doc, y, 7, margin);
    if (i % 2 === 0) {
      setFillColour(doc, [245, 245, 250]);
      doc.rect(margin, y - 4.5, contentW, 7, 'F');
    }
    doc.setFont('helvetica', 'bold');
    setColour(doc, GREY);
    doc.text(rows[i][0], margin + 2, y);
    doc.setFont('helvetica', 'normal');
    setColour(doc, BLACK);
    doc.text(rows[i][1], margin + 60, y);
    y += 7;
  }
  return y + 4;
}

function drawWritingPatterns(doc: jsPDF, result: AnalysisResult, y: number, margin: number, contentW: number): number {
  const patterns = result.writingPatterns.patterns;
  if (patterns.length === 0) return y;

  y = drawSectionTitle(doc, 'Writing Patterns', y, margin);
  doc.setFontSize(8);

  const severityColour: Record<string, readonly [number, number, number]> = {
    high: [211, 47, 47],
    medium: [245, 124, 0],
    low: [158, 158, 158],
  };

  for (const p of patterns) {
    y = ensureSpace(doc, y, 10, margin);
    const col = severityColour[p.severity] ?? GREY;
    setColour(doc, col);
    doc.setFont('helvetica', 'bold');
    doc.text(`[${p.severity.toUpperCase()}]`, margin, y);
    setColour(doc, BLACK);
    doc.setFont('helvetica', 'normal');
    y = printWrapped(doc, p.description, margin + 22, y, contentW - 24, 4, margin);
    y += 1;
  }
  return y + 2;
}

function drawFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    setColour(doc, GREY);
    doc.text(`Generated by CiteSight  •  ${formatDate()}`, 14, pageH - 8);
    doc.text(`Page ${i} of ${pageCount}`, pageW - 14, pageH - 8, { align: 'right' });
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function downloadPdfReport(result: AnalysisResult): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 14;
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - margin * 2;

  let y = drawHeader(doc, result, 0, margin, pageW);
  y = drawOverview(doc, result, y, margin, contentW);
  y = drawReferencesTable(doc, result.references.verifications, y, margin, contentW);
  y = drawCrossReferences(doc, result, y, margin, contentW);
  y = drawWritingQuality(doc, result, y, margin, contentW);
  y = drawWritingPatterns(doc, result, y, margin, contentW);
  drawFooter(doc);

  const safeName = result.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  doc.save(`citesight-report-${safeName}.pdf`);
}
