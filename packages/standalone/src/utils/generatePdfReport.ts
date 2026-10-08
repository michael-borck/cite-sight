// The PDF report itself now lives in @michaelborck/cite-sight-ui. This build
// keeps the screenshot loading it had, because standalone writes screenshot
// data URLs into its results and could embed them; the layout, colours and
// wording are now shared with the other two surfaces.
import type { AnalysisResult } from '@michaelborck/cite-sight-core';
import { buildPdfReport, pdfReportFileName } from '@michaelborck/cite-sight-ui';

async function loadScreenshots(results: AnalysisResult[]): Promise<Map<string, string>> {
  const screenshots = new Map<string, string>();
  const paths = new Set<string>();
  for (const result of results) {
    for (const v of result.references.verifications) {
      if (v.urlCheck?.screenshotPath) paths.add(v.urlCheck.screenshotPath);
    }
  }
  for (const [index, path] of [...paths].entries()) {
    // Standalone stores screenshots as data URLs on disk; fetch them as blobs.
    try {
      const response = await fetch(path);
      if (!response.ok) continue;
      const blob = await response.blob();
      screenshots.set(path, await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      }));
    } catch {
      // A missing or unreadable screenshot must not fail the whole export.
      void index;
    }
  }
  return screenshots;
}

export async function downloadPdfReport(results: AnalysisResult[]): Promise<void> {
  const doc = buildPdfReport(results, { screenshots: await loadScreenshots(results) });
  doc.save(pdfReportFileName(results));
}