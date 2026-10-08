// The PDF report itself now lives in @michaelborck/cite-sight-ui so web,
// desktop and standalone produce identical documents. Three copies had drifted
// (362 / 392 / 446 lines); the differences — screenshots, review decisions, the
// attribution block — are options on one builder.
import { downloadPdfReport } from '@michaelborck/cite-sight-ui';

export { downloadPdfReport };