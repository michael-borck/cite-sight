// The CSV report itself now lives in @michaelborck/cite-sight-ui so web,
// desktop and standalone produce byte-identical files. This copy previously had
// no formula-injection guard, so a citation beginning with = or + would execute
// when the exported file was opened in a spreadsheet.
export { downloadCsvReport } from '@michaelborck/cite-sight-ui';