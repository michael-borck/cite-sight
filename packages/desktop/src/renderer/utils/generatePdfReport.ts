// The PDF report itself now lives in @michaelborck/cite-sight-ui. This copy
// keeps the Electron screenshot bridge, because only the desktop build captures
// and stores page screenshots.
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
  for (const path of paths) {
    const dataUrl = await window.citeSight.readScreenshot(path);
    if (dataUrl) screenshots.set(path, dataUrl);
  }
  return screenshots;
}

export async function downloadPdfReport(results: AnalysisResult[], dismissedKeys?: ReadonlySet<string>): Promise<void> {
  const doc = buildPdfReport(results, { screenshots: await loadScreenshots(results), dismissedKeys });
  doc.save(pdfReportFileName(results));
}