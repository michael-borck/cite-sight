// The CSV report itself now lives in @michaelborck/cite-sight-ui so web,
// desktop and standalone produce byte-identical files, with one formula-
// injection guard applied to every column.
export { downloadCsvReport } from '@michaelborck/cite-sight-ui';