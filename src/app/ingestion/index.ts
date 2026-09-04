/**
 * Ingestion (ADR-0008, ADR-0035, ADR-0036).
 *
 * The application-layer pipeline that turns bytes someone uploaded into staged, validated,
 * quarantined, versioned, receipted material — and the registry that knows what has been ingested,
 * what it is entitled to be believed about, and what has actually been used in an answer.
 */
export {
  type MappingSuggestion, type ApprovedMapping, type StructuredIngestionRequest,
  type StructuredIngestionResult, UnreadableUpload, ingestStructured, ingestConnectorRecords, suggestMappings,
} from './structured.js';

export {
  type DocumentIngestionRequest, type DocumentIngestionResult, UnreadableDocument, ingestDocument,
} from './document.js';

export {
  type RegisteredSource, type KnowledgeVerification, SourceRegistry,
} from './registry.js';
