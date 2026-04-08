/**
 * 注意力总结引擎 — 异步任务模式
 * 任务在后台执行，结果持久化到 chrome.storage.local
 */

import { Logger } from '@/core/errors';
import { callLlm, type LlmMessage } from './llm-client';
import type { AppSettings, Conversation, Snippet, BrowsingHistoryItem } from '@/types';

// ============================================================================
// 类型定义
// ============================================================================

export type SummaryMode = 'weekly' | 'topic' | 'psychology';

export interface SummaryTask {
  id: string;
  mode: SummaryMode;
  topic?: string;
  status: 'pending' | 'running' | 'done' | 'error';
  progress?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
  /** 结果不包含在列表查询中，需单独获取 */
  hasResult?: boolean;
}

interface StoredTask extends SummaryTask {
  result?: string;
}

// ============================================================================
// 提示词模板
// ============================================================================

const PROMPT_WEEKLY = `# 背景
你擅长从我与 AI 的海量、零散对话信息中，关注我的提问与回应，识别我的核心模式、提炼关键洞见，并提供富有远见的行动建议。请严格、客观、深刻地履行你的职责。
这是我过去一周与 AI 的完整对话记录文件，它们是原始的、未经加工的"思想矿石"。

# 任务
你的核心任务是，基于我提供的对话记录，为我生成一份最近 7 天的周报。这份周报的目标不是简单罗列我做了什么，而是要揭示我的智力焦点、思维模式，并为我下一周的行动提供高价值的导航。

请参考以下格式输出报告，确保每一部分都言之有物、直击要点（如果你认为某部分特别值得展开，请详细讲讲）：

---

### 个人周报
周期： [请根据对话记录填写起始日期]

#### 🧠 本周智力焦点
- 高度概括本周我投入最多心力的核心议题是什么，并简要复盘主要成果？

#### ✨ 关键洞见与突破
- "啊哈"时刻：列出用户本周最重要的 1-3 个"啊哈时刻"，直接引用对话中的关键结论。

#### 🤔 难题与挑战
- 反复出现的问题：我本周是否反复问及某个相似的问题，或在某个主题上停滞不前？这些问题不仅是"事"的问题，也有"人"的内在问题：这通常意味着我的深层的困惑/知识盲区/行为模式/心理动力问题，请犀利的挖掘出来。
- 被忽略的线索：在对话中是否出现了一些极有潜力但被我忽略或没有追问的"线索"或"新想法"？

#### 🚀 下周导航
综合以上所有分析，给予用户简洁、温暖的鼓励，并提出 1-2 个富有启发性的问题或讨论，可作为我下周可选的深度思考，帮助我获得最大的认知突破或项目进展。

---

# 规则与约束
1. 拒绝流水账：不要复述对话内容，要提炼和分析。
2. 深刻而非表面：你的价值在于揭示我可能没有意识到的模式和联系。
3. 言简意赅：整份报告应简洁有力，避免空话和不必要的修饰。
4. 绝对客观：基于数据和事实进行分析，不要主观臆测。
5. 批判性伙伴：不要只做总结者，更要做挑战者。
6. 承认局限，谨慎措辞：在指出任何潜在的"缺失"或"盲区"时，你必须明确这是一个基于对话记录的观察，建议使用类似"在本次提供的对话中，似乎较少探讨……"的建言，严禁使用"你忽略了XX"或"你没有做XX"这类武断的判断。

请开始你的分析。`;

const PROMPT_TOPIC = `# 背景
你擅长从我与 AI 的海量、零散对话信息中，找到与目标主题相关的信息，帮助用户复盘对话、巩固记忆。

# 任务
分析聊天记录中，关于 [TOPIC] 的对话记录，进行主题洞察。

请按以下结构输出：

## 🎯 主题概述
[简要描述这个主题/项目的核心内容]

## 🔍 核心记忆点
（简要呈现对话中，用户了解的关键信息点，按照重要性排序。必要时可直接引用对话中的用户原句）
……

## 📈 认知演进路径
（结合对话的时间信息）
- 早期： [最初的思考起点和关注点]
- 中期： [思考的转变或关注点的转移]
- 近期： [当前阶段的深入思考或核心议题]

## ⚠️ 关联、风险与盲点
- 隐藏的关联： [指出不同讨论点之间被忽略的内在联系]
- 潜在的矛盾/张力： [指出对话中存在的观点张力或决策权衡]
- 风险与盲点： [指出讨论中可能被忽略的风险、未考虑到的方面]

## 🚀 待议问题
[从讨论中浮现出的、需要进一步思考的开放性问题]

## 🔗 相关资源推荐
[基于讨论内容推荐的学习资源、工具或进一步阅读材料，必须推荐真实存在的信息，如无把握，不要推荐]`;

const PROMPT_PSYCHOLOGY = `你是专业的认知心理与心理动力学咨询师，帮我分析以下我和 AI 的对话中的表现，关注我的发言、消息时间等任何可能的信息。

保持高度专注，完整阅读，洞察潜在的思维认知/行为模式/内心张力，甚至是创伤信号（如果有，但不要称其为创伤），识别与我值得探讨的主题，像一位直言不讳的老友的来信风格，自然、温柔但犀利地写出一份详略得当、力出一孔、直击灵魂的分析。

接下来，直接开始写出分析内容`;

// ============================================================================
// 数据准备
// ============================================================================

interface AttentionData {
  conversations: Conversation[];
  snippets?: Snippet[];
  history?: BrowsingHistoryItem[];
}

function formatAttentionDataForLlm(data: AttentionData, maxChars: number = 60000): string {
  const parts: string[] = [];
  let totalLen = 0;

  function append(text: string): boolean {
    if (totalLen + text.length > maxChars) return false;
    parts.push(text);
    totalLen += text.length;
    return true;
  }

  // --- AI 对话 ---
  if (data.conversations.length) {
    append('\n# 一、AI 对话记录\n');
    for (const conv of data.conversations) {
      if (!append(`\n---\n## ${conv.title} (${conv.platform}, ${conv.updatedAt})\n`)) break;
      for (const msg of conv.messages) {
        const role = msg.sender === 'user' ? '我' : 'AI';
        if (!append(`**${role}**: ${msg.content}\n`)) break;
      }
    }
  }

  // --- 划词/停留片段 ---
  const snippets = data.snippets || [];
  const highlights = snippets.filter((s) => s.type === 'highlight');
  const dwells = snippets.filter((s) => s.type === 'dwell');

  if (highlights.length) {
    append('\n# 二、划词记录（用户主动选中的文本）\n');
    for (const s of highlights) {
      if (!append(`- **${s.title || s.domain}** (${s.updatedAt}): ${s.selectionText || s.summaryText || s.rawContextText}\n`)) break;
    }
  }

  if (dwells.length) {
    append('\n# 三、停留记录（用户长时间阅读的内容）\n');
    for (const s of dwells) {
      const dwellSec = Math.round((s.dwellMs || 0) / 1000);
      if (!append(`- **${s.title || s.domain}** (停留 ${dwellSec}s, ${s.updatedAt}): ${s.summaryText || s.rawContextText}\n`)) break;
    }
  }

  // --- 浏览历史 ---
  const history = data.history || [];
  if (history.length) {
    append('\n# 四、浏览历史（近期访问的网页）\n');
    for (const h of history) {
      if (!append(`- ${h.title} (${h.domain}, ${h.visitCount}次访问, ${h.lastVisitTime})\n`)) break;
    }
  }

  // --- 统计摘要 ---
  append(`\n---\n数据统计: ${data.conversations.length} 条对话, ${highlights.length} 条划词, ${dwells.length} 条停留, ${history.length} 条浏览记录\n`);

  return parts.join('');
}

// ============================================================================
// 持久化
// ============================================================================

const STORAGE_KEY = 'summaryTasks';
const MAX_STORED_TASKS = 20;

async function loadTasks(): Promise<StoredTask[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      resolve(Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : []);
    });
  });
}

async function saveTasks(tasks: StoredTask[]): Promise<void> {
  // 只保留最近 N 条
  const trimmed = tasks.slice(0, MAX_STORED_TASKS);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: trimmed }, resolve);
  });
}

// ============================================================================
// 任务管理 API
// ============================================================================

const MODE_LABELS: Record<SummaryMode, string> = {
  weekly: 'AI 互动周报',
  topic: '主题复盘',
  psychology: '心理洞察',
};

/**
 * 创建异步总结任务，立即返回 taskId
 */
export async function createSummaryTask(params: {
  mode: SummaryMode;
  topic?: string;
  conversations: Conversation[];
  snippets?: Snippet[];
  history?: BrowsingHistoryItem[];
}): Promise<{ taskId: string }> {
  const taskId = `task_${Date.now()}`;
  const now = new Date().toISOString();

  const task: StoredTask = {
    id: taskId,
    mode: params.mode,
    topic: params.topic,
    status: 'pending',
    progress: '准备中...',
    createdAt: now,
  };

  const tasks = await loadTasks();
  tasks.unshift(task);
  await saveTasks(tasks);

  // 异步执行，不等待
  void runTask(taskId, params);

  return { taskId };
}

/**
 * 后台执行任务
 */
async function runTask(taskId: string, params: {
  mode: SummaryMode;
  topic?: string;
  conversations: Conversation[];
  snippets?: Snippet[];
  history?: BrowsingHistoryItem[];
}): Promise<void> {
  try {
    await updateTaskStatus(taskId, 'running', '正在获取 LLM 配置...');

    const settings = await new Promise<any>((resolve) => {
      chrome.storage.sync.get(['settings'], (result) => resolve(result.settings || {}));
    });
    const llmConfig = settings.llmApi;

    if (!llmConfig?.apiKey) {
      await updateTaskStatus(taskId, 'error', undefined, '请先在设置页配置 LLM API Key');
      return;
    }

    const modeLabel = MODE_LABELS[params.mode] || params.mode;
    await updateTaskStatus(taskId, 'running', `正在生成${modeLabel}...`);

    const { mode, topic, conversations, snippets, history } = params;
    const hasAnyData = conversations.length || (snippets && snippets.length) || (history && history.length);

    if (!hasAnyData) {
      await completeTask(taskId, '暂无数据可供分析。请先使用 AI 聊天、划词或浏览网页积累注意力数据。');
      return;
    }

    let systemPrompt: string;
    switch (mode) {
      case 'weekly':
        systemPrompt = PROMPT_WEEKLY;
        break;
      case 'topic':
        systemPrompt = PROMPT_TOPIC.replace('[TOPIC]', topic || '（未指定主题）');
        break;
      case 'psychology':
        systemPrompt = PROMPT_PSYCHOLOGY;
        break;
      default:
        systemPrompt = PROMPT_WEEKLY;
    }

    const attentionText = formatAttentionDataForLlm({
      conversations,
      snippets,
      history,
    });

    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `以下是我的注意力数据（包括 AI 对话、划词、停留和浏览记录）：\n${attentionText}` },
    ];

    Logger.info(`[Summarizer] 任务 ${taskId}: ${mode}, ${conversations.length} 对话 + ${(snippets || []).length} 片段 + ${(history || []).length} 浏览, ${attentionText.length} 字符`);

    const result = await callLlm(llmConfig, { messages, temperature: 0.7, maxTokens: 4096 });
    await completeTask(taskId, result);

    Logger.info(`[Summarizer] 任务 ${taskId} 完成`);
  } catch (error) {
    Logger.error(`[Summarizer] 任务 ${taskId} 失败`, error);
    await updateTaskStatus(taskId, 'error', undefined, error instanceof Error ? error.message : String(error));
  }
}

async function updateTaskStatus(taskId: string, status: SummaryTask['status'], progress?: string, errorMsg?: string): Promise<void> {
  const tasks = await loadTasks();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;

  task.status = status;
  if (progress !== undefined) task.progress = progress;
  if (errorMsg !== undefined) task.error = errorMsg;
  if (status === 'error') task.completedAt = new Date().toISOString();

  await saveTasks(tasks);
}

async function completeTask(taskId: string, result: string): Promise<void> {
  const tasks = await loadTasks();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;

  task.status = 'done';
  task.result = result;
  task.hasResult = true;
  task.completedAt = new Date().toISOString();
  task.progress = undefined;

  await saveTasks(tasks);
}

/**
 * 获取任务列表（不含 result 内容，减小传输量）
 */
export async function getSummaryTasks(): Promise<SummaryTask[]> {
  const tasks = await loadTasks();
  return tasks.map(({ result: _result, ...rest }) => ({
    ...rest,
    hasResult: Boolean(_result),
  }));
}

/**
 * 获取单个任务的完整结果
 */
export async function getSummaryTaskResult(taskId: string): Promise<{ task: SummaryTask; result?: string } | null> {
  const tasks = await loadTasks();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return null;

  const { result, ...meta } = task;
  return { task: { ...meta, hasResult: Boolean(result) }, result };
}
