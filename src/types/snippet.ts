import type { PlatformName } from './conversation';

export type SnippetType = 'highlight' | 'dwell' | 'page_save' | 'media_save';

export type SnippetSourceKind = 'web_page' | 'ai_conversation';

export type SnippetCaptureMethod =
  | 'auto_selection'
  | 'auto_dwell'
  | 'context_menu_selection'
  | 'context_menu_page'
  | 'hover_media_save';

export type SnippetEnrichmentStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type SnippetBlockKind =
  | 'paragraph'
  | 'list'
  | 'table'
  | 'code'
  | 'quote'
  | 'section'
  | 'ai_message'
  | 'media';

export type SnippetAnchorStatus = 'resolved' | 'unresolved';

export type SnippetMediaKind = 'image' | 'video' | 'audio';

export type SnippetMediaDownloadStatus = 'pending' | 'ready' | 'url_only' | 'failed';

export type SnippetMediaSavedFrom = 'url_pull' | 'browser_upload' | 'url_only';

export interface TextQuoteSelector {
  type: 'TextQuoteSelector';
  exact: string;
  prefix?: string;
  suffix?: string;
}

export interface TextPositionSelector {
  type: 'TextPositionSelector';
  start: number;
  end: number;
}

export interface DomRangeSelector {
  type: 'RangeSelector';
  rootSelector: string;
  startContainer: string;
  endContainer: string;
  startOffset: number;
  endOffset: number;
}

export type SnippetSelector =
  | TextQuoteSelector
  | TextPositionSelector
  | DomRangeSelector;

export interface SnippetItem {
  id: string;
  snippetId: string;
  selectionText: string;
  selectors: SnippetSelector[];
  quoteHash: string;
  anchorStatus: SnippetAnchorStatus;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface SnippetMedia {
  kind: SnippetMediaKind;
  sourceUrl: string;
  previewUrl: string;
  localFileUrl?: string;
  localFileRelativePath?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  width?: number;
  height?: number;
  durationSec?: number;
  posterUrl?: string;
  altText?: string;
  downloadStatus: SnippetMediaDownloadStatus;
  downloadError?: string;
  savedFrom: SnippetMediaSavedFrom;
}

export interface SnippetGroup {
  id: string;
  groupKey: string;
  dedupeKey: string;
  type: SnippetType;
  captureMethod: SnippetCaptureMethod;
  url: string;
  title: string;
  domain: string;
  sourceKind: SnippetSourceKind;
  platform?: PlatformName;
  conversationId?: string;
  messageIndex?: number;
  semanticBlockKey?: string;
  headingPath: string[];
  blockKind?: SnippetBlockKind;
  selectionCount: number;
  rawContextText: string;
  rawContextMarkdown: string;
  structuredContextMarkdown: string;
  summaryText: string;
  enrichmentStatus: SnippetEnrichmentStatus;
  enrichmentModel?: string;
  createdAt: string;
  updatedAt: string;
  // Compatibility fields for existing list/detail rendering paths.
  selectionText: string;
  contextText: string;
  selectors: SnippetSelector[];
  dwellMs: number;
  media?: SnippetMedia;
}

export type Snippet = SnippetGroup;

export interface SnippetGroupDetail {
  group: SnippetGroup;
  items: SnippetItem[];
}

export interface SnippetInput {
  dedupeKey: string;
  type: SnippetType;
  captureMethod: SnippetCaptureMethod;
  selectionText: string;
  contextText: string;
  selectors: SnippetSelector[];
  dwellMs?: number;
  url: string;
  title: string;
  domain?: string;
  sourceKind: SnippetSourceKind;
  platform?: PlatformName;
  conversationId?: string;
  messageIndex?: number;
  semanticBlockKey?: string;
  headingPath?: string[];
  blockKind?: SnippetBlockKind;
  rawContextText?: string;
  rawContextMarkdown?: string;
  summaryText?: string;
  createdAt?: string;
  updatedAt?: string;
  media?: SnippetMediaInput;
}

export interface SnippetSelectionInput {
  groupKey?: string;
  captureMethod: 'auto_selection' | 'context_menu_selection';
  selectionText: string;
  selectors: SnippetSelector[];
  url: string;
  title: string;
  domain?: string;
  sourceKind: SnippetSourceKind;
  platform?: PlatformName;
  conversationId?: string;
  messageIndex?: number;
  semanticBlockKey: string;
  headingPath: string[];
  blockKind?: SnippetBlockKind;
  rawContextText: string;
  rawContextMarkdown: string;
  summaryText?: string;
  quoteHash: string;
  itemOrderIndex?: number;
  semanticMergeEnabled?: boolean;
  llmStructuringEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SnippetMediaInput {
  kind: SnippetMediaKind;
  sourceUrl: string;
  previewUrl?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  width?: number;
  height?: number;
  durationSec?: number;
  posterUrl?: string;
  altText?: string;
  downloadStatus?: SnippetMediaDownloadStatus;
  downloadError?: string;
  savedFrom?: SnippetMediaSavedFrom;
  localFileRelativePath?: string;
  localFileUrl?: string;
}

export interface SnippetSelectionUpsertResult {
  group: SnippetGroup;
  item: SnippetItem;
}

export interface SnippetMergeInput {
  targetId: string;
  sourceIds: string[];
}

export interface SnippetStatus {
  url: string;
  hasSnippet: boolean;
  snippetCount: number;
  latestSnippetAt?: string;
}

export interface SaveMediaSnippetUpload {
  dataBase64: string;
  mimeType?: string;
  fileName?: string;
  byteLength: number;
}

export interface SaveMediaSnippetInput {
  snippet: SnippetInput;
  upload?: SaveMediaSnippetUpload;
}
