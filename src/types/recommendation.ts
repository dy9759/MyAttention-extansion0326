/**
 * 推荐注意力功能的类型定义
 */

export type RecommendationStrategy =
  | 'source_upstream'
  | 'adjacent_expansion'
  | 'orthogonal_perspective'
  | 'contrarian';

/**
 * LLM 被要求寻找的目标类型（查询时的意图分类）。
 * 注意与 SourceKind 区分：SourceIntent 描述"我们想找什么"，而非"Exa 返回了什么"。
 */
export type SourceIntent =
  | 'foundational_paper'
  | 'official_doc'
  | 'original_author'
  | 'reference_impl'
  | 'primary_reference';

/**
 * Exa 返回结果的分类（结果时的 UI 展示标签）。
 * 注意与 SourceIntent 区分：SourceKind 描述"Exa 实际返回了什么"，用于 badge/颜色渲染。
 */
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
  /** 由话题派生的稳定 slug，作为推荐卡片的外键 */
  topicKey: string;
  topic: string;
  /** 用户关注该话题的角度与深度，由 LLM 从关注数据中提炼 */
  userEngagement: string;
  sourceIntent: SourceIntent;
  /** LLM 生成的英文搜索 query，通常 1-2 条，传给 Exa */
  searchQueries: string[];
  /** Exa API 的 type 参数；注意 'research paper' 含空格 */
  exaType?: 'research paper' | 'github' | 'company';
}

export interface RecommendationCard {
  /** 卡片唯一 ID，格式为 card_{topicKey}_{idx} */
  id: string;
  /** 关联的 ExtractedTopic.topicKey */
  topicKey: string;
  /** UI 展示分类，与 sourceIntent（查询意图）区分 */
  sourceKind: SourceKind;
  title: string;
  url: string;
  /** Exa 返回的摘要文本 */
  snippet: string;
  /** LLM 给出的"为什么推荐给你"说明 */
  rationale: string;
  publishedAt?: string;
  domain: string;
  /** 用户是否已打开该卡片 */
  opened: boolean;
  /** 用户是否已保存该卡片 */
  saved: boolean;
  /** 用户是否已忽略该卡片 */
  dismissed: boolean;
  /** 保存后回填的 Snippet ID */
  savedSnippetId?: string;
}

export interface RecommendationSession {
  /** 会话唯一 ID，格式为 rec_{timestamp} */
  id: string;
  triggerSource: 'standalone' | 'from_summary';
  /** 仅 triggerSource='from_summary' 时有效，关联的摘要任务 ID */
  summaryTaskId?: string;
  /** 使用的推荐策略；v1 固定为 ['source_upstream']，v2 可组合多个 */
  strategies: RecommendationStrategy[];
  status: RecommendationStatus;
  /** 运行时的阶段描述文案，用于 UI 进度展示 */
  progress?: string;
  error?: string;
  /** LLM 从关注数据中提取的话题结构 */
  extractedTopics: ExtractedTopic[];
  /** 最终展示给用户的推荐卡片列表 */
  cards: RecommendationCard[];
  createdAt: string;
  completedAt?: string;
  /** 生成时使用的数据窗口（天数），便于调试复现 */
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
