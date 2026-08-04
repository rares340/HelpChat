export type DocumentStatus = 'active' | 'indexing' | 'failed' | 'deleted';
export type ChunkSource = 'text' | 'ocr';
export type MessageRole = 'user' | 'assistant';

export interface DocumentSummary {
  id: number;
  relPath: string;
  title: string;
  status: DocumentStatus;
  pageCount: number | null;
  chunkCount: number;
  ocrChunkCount: number;
  indexedAt: string | null;
  error: string | null;
  updatedAt: string;
}

export interface Citation {
  /** Eticheta din răspuns, ex. "S1" */
  label: string;
  chunkId: number;
  documentId: number;
  relPath: string;
  title: string;
  pageStart: number;
  pageEnd: number;
  /** Fragmentul de text care susține răspunsul */
  snippet: string;
  source: ChunkSource;
  /** Capturi de ecran atașate fragmentului (URL-uri servite de backend) */
  media: Array<{ id: number; url: string }>;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  role: MessageRole;
  content: string;
  citations: Citation[];
  createdAt: string;
}

export interface Conversation {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface IngestionEvent {
  id: number;
  level: 'info' | 'warn' | 'error';
  stage: string;
  relPath: string | null;
  message: string;
  createdAt: string;
}

export interface IndexStatus {
  running: boolean;
  documents: { active: number; indexing: number; failed: number; deleted: number };
  chunks: number;
  lastScanAt: string | null;
}

/** Tool apelat de model în timpul unei întrebări (vizibil în UI ca „Am consultat: …"). */
export interface ToolInvocation {
  name: string;
  args: unknown;
  output: unknown;
}

// === Statistici (consumate de Admin.tsx) ===

export interface DocumentStats {
  active: number;
  indexing: number;
  failed: number;
  deleted: number;
  total: number;
}

export interface UsageDaily {
  day: string;
  conversations: number;
  messages: number;
}

export interface UsageStats {
  days: number;
  daily: UsageDaily[];
}

export interface RecentError {
  id: number;
  level: 'info' | 'warn' | 'error';
  stage: string;
  relPath: string | null;
  message: string;
  createdAt: string;
}

export interface RecentErrors {
  count: number;
  errors: RecentError[];
}

export interface TopCitedDocument {
  document_id: number;
  rel_path: string;
  title: string;
  citation_count: number;
}

export interface TopCited {
  count: number;
  documents: TopCitedDocument[];
}

/** Evenimente SSE trimise de /api/chat */
export type ChatStreamEvent =
  | { type: 'conversation'; conversationId: number }
  | { type: 'sources'; citations: Citation[] }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'tool_result'; name: string; output: unknown }
  | { type: 'token'; content: string }
  | { type: 'done'; messageId: number; citations: Citation[] }
  | { type: 'error'; message: string };
