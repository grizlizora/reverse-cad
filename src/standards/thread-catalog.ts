// ==============================================================================
// src/standards/thread-catalog.ts — Dynamic Thread Standards Database & Matcher Façade
// ==============================================================================

export {
  ISOThreadSpec,
  ThreadCatalogFile,
  loadThreadCatalog,
  STATIC_ISO_METRIC_THREADS
} from './thread/iso-thread-data.js';

export {
  ISO_SERIES_1_NOMINALS,
  ISO_SERIES_2_NOMINALS,
  findCandidateThreads
} from './thread/thread-indexer.js';

export { matchMetricThread } from './thread/thread-matcher.js';
export { matchTappedHolePair } from './thread/concentric-hole-matcher.js';
