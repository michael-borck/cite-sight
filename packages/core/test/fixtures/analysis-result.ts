import type { AnalysisResult, VerificationStatus } from '../../src/types.js';

export function sampleResult(status: VerificationStatus = 'unverified'): AnalysisResult {
  const reference = { raw: 'Smith, J. (2020). A study of learning.', title: 'A study of learning', authors: ['Smith, J.'], year: 2020, detectedStyle: 'apa' as const };
  return { fileName: 'paper.txt', extractedText: 'Private assignment text.', processingTime: 100,
    references: {
      references: [reference], inTextCitations: [],
      verifications: [{ reference, status, confidenceScore: status === 'verified' ? .95 : 0,
        flags: [], formatIssues: [], matchCategory: status === 'verified' ? 'exact' : 'none',
      }],
      crossReference: { unmatchedBibliography: [], unmatchedInText: [] }, detectedStyle: 'apa', totalReferences: 1,
      verifiedCount: status === 'verified' ? 1 : 0, suspiciousCount: status === 'suspicious' ? 1 : 0,
      notFoundCount: status === 'not_found' ? 1 : 0, unverifiedCount: status === 'unverified' ? 1 : 0,
      brokenUrlCount: 0, sourceListLikely: false,
    },
  };
}
