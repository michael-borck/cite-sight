// The CSV report itself now lives in @michaelborck/cite-sight-ui so web,
// desktop and standalone produce byte-identical files. It previously existed in
// three copies that had drifted: different column sets, and the standalone copy
// had no formula-injection guard on cells a student controls.
export { downloadCsvReport } from '@michaelborck/cite-sight-ui';