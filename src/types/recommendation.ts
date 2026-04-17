/**
 * 推荐注意力功能的类型定义
 */

export type RecommendationStrategy =
  | 'source_upstream'
  | 'adjacent_expansion'
  | 'orthogonal_perspective'
  | 'contrarian';

export type SourceIntent =
  | 'foundational_paper'
  | 'official_doc'
  | 'original_author'
  | 'reference_impl'
  | 'primary_reference';

export type SourceKind =
  | 'paper'
  | 'official_doc'
  | 'original_author'
  | 'repo'
  | 'other';

export type RecommendationStatus =
  | 'pending'
  | 'extracting'
  | 'searching'
  | 'done'
  | 'error';

export interface ExtractedTopic {
  topicKey: string;
  topic: string;
  userEngagement: string;
  sourceIntent: SourceIntent;
  searchQueries: string[];
  exaType?: 'research paper' | 'github' | 'company';
}

export interface RecommendationCard {
  id: string;
  topicKey: string;
  sourceKind: SourceKind;
  title: string;
  url: string;
  snippet: string;
  rationale: string;
  publishedAt?: string;
  domain: string;
  opened: boolean;
  saved: boolean;
  dismissed: boolean;
  savedSnippetId?: string;
}

export interface RecommendationSession {
  id: string;
  triggerSource: 'standalone' | 'from_summary';
  summaryTaskId?: string;
  strategies: RecommendationStrategy[];
  status: RecommendationStatus;
  progress?: string;
  error?: string;
  extractedTopics: ExtractedTopic[];
  cards: RecommendationCard[];
  createdAt: string;
  completedAt?: string;
  dataWindowDays: number;
}

export interface CreateRecommendationSessionParams {
  triggerSource: 'standalone' | 'from_summary';
  summaryTaskId?: string;
}

export interface MarkRecommendationInteractedParams {
  sessionId: string;
  cardId: string;
  action: 'opened' | 'saved' | 'dismissed';
}
