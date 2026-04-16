# 推荐注意力页面 — 设计方案

> 版本：v1.0 | 日期：2026-04-17 | 状态：待评审

## 1. 背景

My Attention 扩展当前的推荐（Recommend）Tab 仅有 UI 骨架（`public/html/popup.html` 中的 `#recommend-content`、`#explore-directions`、`#recommend-list`），`switchTab('recommend')` 已连通但没有任何数据逻辑。

本方案实现该功能的 v1.0，后续 v2.0 在此基础上扩展。

### 1.1 需求

- **v1.0（本方案）** — 推荐**源头信息**：针对用户深入关注的话题，推荐原始论文、官方文档、原作者、参考实现等一手资料
- **v2.0（未来）** — 推荐"用户不知道但需要的"内容：通过相邻扩展 / 正交视角 / 反面观点等策略，帮助突破信息茧房

### 1.2 产品循环

v1 功能闭合了项目核心理念中的第三环：

```
Record → Summarize → Recommend → Record Again
                        ↑           ↓
                        └───────────┘
                  （用户保存的推荐成为新的 Snippet）
```

---

## 2. 核心决策

| # | 决策 | 选择 | 理由 |
|---|------|------|------|
| 1 | 推荐内容源 | LLM + Web Search API（Exa） | Exa 的语义搜索与源头过滤（paper/github/company）契合 v1 的"源头回溯"策略 |
| 2 | 触发入口 | 双入口：独立 + 从总结页跳转 | 推荐要能独立用，同时让总结产出的洞察能被复用 |
| 3 | v1 策略 | 仅 Source Upstream | 聚焦实现、建立信任；v2 再扩展 adjacent/orthogonal/contrarian |
| 4 | 话题提取 | 单次 LLM 调用 → 结构化 JSON | 从总结文本或原始注意力数据提取 topics，两路径共用 prompt |
| 5 | 持久化 | chrome.storage.local（紧凑元数据） | 不动 IndexedDB schema；受 ~5MB 配额约束，只存展示所需字段 |
| 6 | 保存为 Snippet 的时机 | 仅"保存到注意力"按钮触发 | "点击打开"不自动转存（避免领域概念混淆） |
| 7 | 进度更新 | 2 秒轮询 | 与现有 SummaryTask 一致；任务预期 5-15 秒 |
| 8 | 交付节奏 | 垂直切片先行 | M1 端到端最小可用，再横向扩展 |

---

## 3. 架构

### 3.1 模块图

```
┌────────────────────────────────────────────────────────┐
│  Popup (推荐 Tab)                                       │
│  - src/popup/recommendation-controller.ts  ← 新增       │
│    · 订阅 tab 切换，驱动 UI 状态机                      │
│    · 2s 轮询 session status                            │
│    · 卡片交互（打开 / 保存 / 不感兴趣）                 │
└───────────────┬────────────────────────────────────────┘
                │ chrome.runtime.sendMessage
                ▼
┌────────────────────────────────────────────────────────┐
│  Background Service Worker                             │
│                                                        │
│  - src/background/recommendation-engine.ts  ← 新增     │
│    · extractTopics()  LLM 提取                         │
│    · searchSources()  Exa 批量搜索 + 去重              │
│    · buildSession()   写 chrome.storage.local          │
│    · sweepInterrupted() Worker 启动时清理挂起任务      │
│                                                        │
│  - src/background/exa-client.ts  ← 新增                │
│    · search() / findSimilar()                          │
│    · 错误分类（401/429/timeout/network）               │
│                                                        │
│  - src/background/llm-client.ts  （复用）              │
│  - src/background/handlers.ts  （新增 3 个 handler）    │
│  - src/background/message-dispatcher.ts （新增路由）    │
└────────────────────────────────────────────────────────┘
                │
                ▼
  chrome.storage.local:
    · recommendationSessions[]  最多 5 条，紧凑元数据
  IndexedDB:
    · snippet_groups  仅"保存到注意力"时创建（type=page_save）
  chrome.storage.sync:
    · settings.recommend = { enabled, exaApiKey, dataWindowDays, cacheTtlHours }
```

### 3.2 新增消息类型

加入 `src/types/index.ts` 的 `KnownChromeMessageType`：

```ts
| 'createRecommendationSession'     // { triggerSource, summaryTaskId? }
| 'getRecommendationSession'        // { sessionId? } 不传返回最新一条
| 'markRecommendationInteracted'    // { sessionId, cardId, action: 'opened' | 'saved' | 'dismissed' }
```

### 3.3 manifest 变更

`public/manifest.json`：
- `host_permissions` 新增 `"https://api.exa.ai/*"`

---

## 4. 数据模型

### 4.1 新增类型（`src/types/recommendation.ts`）

```ts
export type RecommendationStrategy =
  | 'source_upstream'         // v1
  | 'adjacent_expansion'      // v2 预留
  | 'orthogonal_perspective'  // v2 预留
  | 'contrarian';             // v2 预留

export type SourceIntent =
  | 'foundational_paper'
  | 'official_doc'
  | 'original_author'
  | 'reference_impl'
  | 'primary_reference';

export type SourceKind =
  | 'paper' | 'official_doc' | 'original_author' | 'repo' | 'other';

export type RecommendationStatus =
  | 'pending' | 'extracting' | 'searching' | 'done' | 'error';

export interface ExtractedTopic {
  topicKey: string;               // 稳定标识，后续 card 关联
  topic: string;                  // 展示用话题名（跟随用户语言，中英皆可）
  userEngagement: string;         // 用户在此话题上的关注角度（展示用）
  sourceIntent: SourceIntent;
  searchQueries: string[];        // v1 每 topic 1-2 条，英文为主
  exaType?: 'research paper' | 'github' | 'company';
}

export interface RecommendationCard {
  id: string;
  topicKey: string;
  sourceKind: SourceKind;
  title: string;                  // Exa 返回，截断到 200 字符
  url: string;
  snippet: string;                // 截断到 400 字符
  rationale: string;              // LLM 给的 "为什么推荐给你"，截断到 200 字符
  publishedAt?: string;
  domain: string;
  // 交互状态（持久化在 session 里）
  opened: boolean;
  saved: boolean;
  dismissed: boolean;
  savedSnippetId?: string;        // 保存后回填
}

export interface RecommendationSession {
  id: string;                                   // `rec_${timestamp}`
  triggerSource: 'standalone' | 'from_summary';
  summaryTaskId?: string;
  strategies: RecommendationStrategy[];         // v1 固定 ['source_upstream']
  status: RecommendationStatus;
  progress?: string;
  error?: string;
  extractedTopics: ExtractedTopic[];
  cards: RecommendationCard[];
  createdAt: string;
  completedAt?: string;
  dataWindowDays: number;                       // 记录生成时的配置，便于调试
}
```

### 4.2 Settings 扩展（`src/types/index.ts` 的 `AppSettings`）

```ts
recommend?: {
  enabled: boolean;
  exaApiKey: string;
  dataWindowDays: number;   // 默认 14，范围 1-30
  cacheTtlHours: number;    // 默认 24
}
```

`DEFAULT_SETTINGS.recommend`：
```ts
{
  enabled: false,            // 默认关闭，用户配完 Key 手动打开
  exaApiKey: '',
  dataWindowDays: 14,
  cacheTtlHours: 24,
}
```

### 4.3 存储约束

`chrome.storage.local` 默认配额约 5MB。为避免触顶：
- `recommendationSessions` 最多保留 **5 条**
- 每条 session 中 cards 数量硬上限 **15 条**（3-5 topics × 3 results）
- 每个字符串字段按上述长度截断
- 预估单条 session < 30KB；5 条总计 < 150KB，远低于配额

---

## 5. 数据流

### 5.1 入口 A：独立打开推荐 Tab

```
用户切换到推荐 Tab
    ↓
recommendation-controller.onActivate()
    ↓
getRecommendationSession() → 最新一条
    ├── 存在且 (now - createdAt) < cacheTtlHours → 渲染 ready
    │   └── 若 stale → 顶部黄色条 "数据已生成 X 小时前，刷新？"
    └── 无 → empty 状态，展示 "生成推荐" 按钮
            ↓ 用户点
    createRecommendationSession({ triggerSource: 'standalone' })
            ↓（后台）
    1. 读近 N 天数据（dataWindowDays）的 conversations + snippets + history
    2. formatAttentionDataForLlm(maxChars=20000)  — 复用 summarizer 的函数
       · 注：summarizer 用 60k 上限（输出长文本），推荐用 20k（为 JSON 输出留 token 预算）
    3. status=extracting → callLlm(TOPIC_EXTRACTION_PROMPT)
    4. 解析 JSON，失败重试 1 次；仍失败 → error
    5. status=searching → 并发对每个 topic 的每个 query 调 Exa
       · 并发上限 5
       · 每 query numResults=3
       · URL 去重
       · 按 Exa score 排序，每 topic 保留前 3
    6. 组装 cards，写入 chrome.storage.local
    7. status=done, completedAt=now
            ↓
    UI 轮询读到 done → 渲染 directions pills + cards
```

### 5.2 入口 B：从总结页跳转

```
Summary 详情页底部点击 [基于此报告推荐源头]
    ↓
switchTab('recommend', { triggerSource: 'from_summary', summaryTaskId })
    ↓
controller: 查找是否已有 summaryTaskId 对应的 session
    ├── 有 → 直接渲染
    └── 无 → createRecommendationSession({ triggerSource, summaryTaskId })
            ↓（后台）
    1. 读 summary 的 result 文本（< 3k 字符，不截断）
    2. status=extracting → callLlm(TOPIC_EXTRACTION_PROMPT_FROM_SUMMARY)
       · 与入口 A 用同一个 Prompt 模板，仅输入不同
    3. 后续步骤同入口 A 的 4-6
```

**两条路径共用一个 LLM Prompt**，区别只在 user message 里传入 `attentionDataText` 还是 `summaryText`。

### 5.3 卡片交互

| 用户动作 | 即时 UI 反馈 | 持久化 |
|---------|------------|--------|
| 点击 **打开** | 新标签页打开 URL | markRecommendationInteracted(action='opened')；`card.opened = true`；**不创建 Snippet** |
| 点击 **保存到注意力** | 卡片显示"已保存"；"打开"按钮保留 | markRecommendationInteracted(action='saved')；`card.saved = true`；创建 Snippet（type=`page_save`, headingPath=[topic], summaryText=rationale, url, title），回填 `savedSnippetId` |
| 点击 **不感兴趣** | 卡片在本次 session 中淡出隐藏 | markRecommendationInteracted(action='dismissed')；`card.dismissed = true`；v2 时 dismissed 话题会纳入 prompt 做过滤 |

---

## 6. LLM Prompt（v1）

### 6.1 主 Prompt（system）

```
你是信息检索专家，擅长为用户找到信息的"一手源头"——原始论文、官方文档、
原作者作品、参考实现等一手资料，而不是二手评论或博客转载。

任务：从输入中识别用户正在深入关注的 3-5 个话题，为每个话题生成能找到
其"源头信息"的搜索意图。

规则：
1. 只选用户**真正投入心力**的话题（反复提问 / 深度讨论 / 长时间阅读），
   忽略一次性的碎片信息。
2. 话题名跟随用户语言（中文对话就用中文话题名）；但 searchQueries
   必须是**英文**（Exa 对英文召回质量更高）。
3. sourceIntent 严格从枚举中选：
   - foundational_paper  （有原始论文的技术/算法）
   - official_doc        （有官方文档的工具/框架）
   - original_author     （有明确原作者/首创者的思想/方法）
   - reference_impl      （需要看源码的实现细节）
   - primary_reference   （其他一手资料，如原著、标准规范）
4. searchQueries 要精准可搜：包含关键名词 + 源头类型提示词
   （如 "HNSW original paper Malkov"、"React official docs hooks"）。
5. 严格输出 JSON，不要任何解释文字。

输出 schema:
{
  "topics": [
    {
      "topic": "中文或英文话题名",
      "userEngagement": "用户关注的角度/深度 (1-2 句)",
      "sourceIntent": "foundational_paper | official_doc | ...",
      "searchQueries": ["英文 query 1", "英文 query 2"],
      "exaType": "research paper | github | company | null"
    }
  ]
}

exaType 映射建议：
  foundational_paper → "research paper"
  reference_impl     → "github"
  official_doc       → "company"
  其他               → null
```

### 6.2 User message

```
以下是我最近 {N} 天的{注意力数据|总结报告}：

{attentionDataText 或 summaryText}
```

### 6.3 LLM 调用参数

- `temperature: 0.3`（比 summary 的 0.7 更低，JSON 稳定性优先）
- `response_format: { type: "json_object" }`（llm-client 需确认是否已支持，否则 prompt 里加"Output must be valid JSON only"）
- `maxTokens: 1500`
- 解析失败重试 1 次

---

## 7. Exa API 集成

### 7.1 Endpoints 使用

v1 只用 `POST https://api.exa.ai/search`：

```ts
{
  "query": "HNSW original paper Malkov",
  "type": "research paper",   // 可选
  "numResults": 3,
  "useAutoprompt": false,      // 我们已精心构造 query
  "contents": {
    "text": { "maxCharacters": 500 }  // 只取摘要
  }
}
```

`findSimilar` v2 再用。

### 7.2 URL 去重与排序

- Hash 键：URL 去掉 query string 和 hash 后小写
- 同 URL 多话题命中 → 保留 Exa score 最高的，合并 topicKey 到数组（v1 先不合并，简单保留首次命中）
- 每 topic 取前 3，session 总 cards 上限 15

### 7.3 `sourceKind` 映射（从 Exa 返回推导）

按优先级判定（命中即止）：

1. Exa `type=research paper` 或 URL 匹配 `arxiv.org` / `*.nature.com` / `*.acm.org` / `ieee.org` / `semanticscholar.org` → `paper`
2. Exa `type=github` 或 URL 匹配 `github.com` / `gitlab.com` → `repo`
3. URL 路径匹配 `/docs/` / `/documentation/` / `docs.*` 或 domain 匹配 `*.readthedocs.io` → `official_doc`
4. `sourceIntent=original_author` 且 domain 是个人域名（启发式：非 top 100 站点） → `original_author`
5. 其他 → `other`

`*.org` 本身不作为 `official_doc` 判定依据（很多非官方站点也用 .org）。

### 7.4 并发控制

- 单 session 最多 5 个并发 Exa 请求
- 实现用简单的 `Promise.all` + 分批（`batches of 5`）
- 单请求超时 10 秒，session 总超时 60 秒

---

## 8. UI 设计

### 8.1 Tab 状态

| 状态 | 条件 | 展示 |
|------|------|------|
| `empty` | 无 session | 空插图 + "生成推荐"按钮 + 简短说明 |
| `loading` | extracting \| searching | 骨架屏 + 阶段文案（"正在分析注意力..." / "正在搜索源头..."） |
| `ready` | done，且 (now - createdAt) ≤ TTL | 探索方向 pills + 卡片列表 + 右上角"刷新"按钮 |
| `stale` | done，且超过 TTL | ready 基础上 + 顶部黄条 "数据已生成 {X} 小时前，[刷新]" |
| `error` | error | 错误图标 + 错误原因 + "重试"按钮；若是 API Key 问题 → 跳转 Settings |

### 8.2 探索方向 pills（`#explore-directions` → `#directions-list`）

- 每个 pill = 一个 topic
- 展示文案 = `topic`
- hover 显示 `userEngagement` 作为 tooltip
- 点击筛选：只显示该 topic 的 cards；再次点击取消筛选
- 默认 "全部" 高亮

### 8.3 卡片（`#recommend-list`）

```
┌────────────────────────────────────────────┐
│  [📄 论文]  ← sourceKind 徽章              │
│  ──────────────────────────────────────    │
│  **{title}** (最多 2 行)                    │
│  ──────────────────────────────────────    │
│  {snippet} (最多 3 行)                      │
│  ──────────────────────────────────────    │
│  💡 {rationale}                             │
│  ──────────────────────────────────────    │
│  📍 {domain} · {publishedAt}                │
│  [打开] [保存到注意力] [不感兴趣]           │
└────────────────────────────────────────────┘
```

徽章配色参考现有 Snippet 标签风格（brand color #5e6ad2 为主 + 灰阶区分）。

### 8.4 总结页跳转按钮

在 `src/popup/conversation-detail.ts` 或 summary 结果渲染入口（取决于现有代码结构）处，在 summary result 文本底部追加：

```html
<button class="btn-primary summary-to-recommend">
  <i class="fas fa-compass"></i> 基于此报告推荐源头内容
</button>
```

点击 → `switchTab('recommend', { triggerSource: 'from_summary', summaryTaskId })`。

### 8.5 Settings 页新区块

位置：在现有 LLM 配置下方，新增卡片：

```
┌ 推荐 —————————————————————————————————┐
│  启用推荐                  [○——]         │
│                                          │
│  Exa API Key  [________________________] │
│    获取 API Key：https://exa.ai           │
│                                          │
│  数据窗口天数     [14]  范围 1-30         │
│  结果缓存时长     [24]  小时              │
│                                          │
│  [测试连接]  [保存]                       │
└──────────────────────────────────────────┘
```

"测试连接"发一个最小 Exa 查询（如 `{query: "test", numResults: 1}`）验证 Key 有效性。

---

## 9. 错误处理与边界

### 9.1 错误分类表

| 场景 | status | UI 表现 | 后续 |
|------|--------|---------|------|
| Exa Key 未配置 | error | "请先配置 Exa API Key" + 跳设置 | 前置校验，不发起 LLM |
| Exa 401/403 | error | "API Key 无效" + 跳设置 | 不重试 |
| Exa 429 | error | "请求过于频繁，请稍后" | 不自动重试，手动 |
| Exa 网络错误 / timeout | error | 原因 + "重试"按钮 | extractedTopics 保留便于调试 |
| LLM Key 未配置 | error | 复用 summary 错误文案 | 跳设置 |
| LLM 返回非 JSON | 重试 1 次 → 仍失败 error | "解析失败，请重试" | 保留 rawResponse 到 error.detail |
| 0 topic 提取出 | done（cards 空） | "注意力数据不足，多使用几天再试" | 不算错误 |
| 注意力数据 < 500 字符 | 前置拦截 | "先积累一些对话或划词再来" | 不发起任务 |
| Service Worker 在 extracting/searching 中被休眠 | 启动扫描时标记 error 'interrupted' | "任务中断，请刷新" | sweepInterrupted() 在 background 初始化时跑 |
| 并发双击"刷新" | `inFlightSessionId` 互斥 | 第二次点击返回第一个 taskId | 不启新 session |

### 9.2 Service Worker 启动清理（`sweepInterrupted`）

在 `src/background/index.ts` 的 `initialize()` 中调用：

```ts
// 伪代码
for (const session of loadRecommendationSessions()) {
  if (
    (session.status === 'extracting' || session.status === 'searching') &&
    (now - session.createdAt > 5分钟)
  ) {
    session.status = 'error';
    session.error = '任务被中断（Service Worker 重启）';
  }
}
saveRecommendationSessions(sessions);
```

与现有 `syncExistingTasksToMyIsland()` 相同位置调用。

### 9.3 预算硬限制

- 单 session 最多 1 次 LLM 调用（只做 topic extraction，v1 不做结果再排序）
- 单 session 最多 5 topics × 2 queries = 10 次 Exa 调用
- 并发 Exa 上限 5
- 单 Exa 请求 10 秒超时，整个 session 60 秒超时

---

## 10. v2 扩展点（本方案预留）

1. **策略多选**：`RecommendationStrategy[]` 已在类型中预留，v2 只需加 3 个 prompt 子模板 + 组合器
2. **Dismissed 信号**：已在 card 上持久化 `dismissed: boolean`；v2 prompt 可以读"用户不感兴趣的话题列表"做反向过滤
3. **Exa findSimilar**：v2 可以对"用户保存过的推荐"调 findSimilar，做"更多类似源头"
4. **自动触发**：v2 可以在新 summary 生成后自动预热一次推荐 session（写入但不通知，用户打开即秒看）
5. **推送到 MyIsland**：预留 `notifyRecommendationReady` 接口（v1 先不实现）

---

## 11. 里程碑（垂直切片）

### M1 — 垂直切片 MVP（核心验证）

**目标**：从 summary 详情页跳转，单 topic 单 query 跑通 LLM → Exa → 展示 → 保存全链路。

- [ ] `src/types/recommendation.ts`（完整类型）
- [ ] `AppSettings.recommend` 扩展 + Settings UI
- [ ] `manifest.json` host_permissions 新增 `api.exa.ai`
- [ ] `src/background/exa-client.ts`（search + 错误分类）
- [ ] `src/background/recommendation-engine.ts` 最简版：
  - [ ] extractTopics 仅取 LLM 结果中**第一个** topic
  - [ ] 仅 1 个 query，numResults=3
  - [ ] status 状态机
- [ ] 3 个 message handlers + dispatcher 路由
- [ ] `sweepInterrupted` 在 background 初始化时调用
- [ ] summary 详情页添加"基于此报告推荐源头"按钮
- [ ] `src/popup/recommendation-controller.ts`：
  - [ ] empty/loading/ready/error 4 态
  - [ ] 2s 轮询
  - [ ] 仅渲染卡片列表（不做 pills）
  - [ ] [打开] [保存到注意力] 两个按钮（暂不做"不感兴趣"）
- [ ] Vitest 单测：exa-client（mock fetch）、recommendation-engine（mock llm + exa）

**验收**：从某份真实 summary 点按钮 → 看到 3 张源头卡片 → 保存一张 → Snippets Tab 能看到新条目。

### M2 — 话题扩展 + 并发

- [ ] extractTopics 返回 3-5 topics，每个 1-2 queries
- [ ] Exa 并发批次（5 并发）
- [ ] URL 去重与每 topic 前 3 保留
- [ ] 总超时 60 秒
- [ ] 预算硬限制落实

### M3 — 独立入口

- [ ] empty 状态的"生成推荐"按钮
- [ ] createRecommendationSession 支持 `triggerSource: 'standalone'`
- [ ] 数据窗口 dataWindowDays 读取与应用
- [ ] 前置校验：数据不足时提示

### M4 — 探索方向 pills

- [ ] 渲染 pills（topic + tooltip）
- [ ] 点击筛选 cards
- [ ] "全部" 高亮态

### M5 — 缓存与刷新

- [ ] cacheTtlHours 读取
- [ ] stale 顶部黄条
- [ ] 手动"刷新"按钮
- [ ] inFlightSessionId 互斥

### M6 — 完整错误处理与边界

- [ ] [不感兴趣] 按钮
- [ ] 所有错误场景覆盖（见 §9.1）
- [ ] extension context invalidated 处理
- [ ] Settings "测试连接" 按钮

### v2.0（后续迭代）

- [ ] adjacent_expansion / orthogonal_perspective / contrarian 三种策略
- [ ] 策略多选开关
- [ ] dismissed 信号融入 prompt
- [ ] findSimilar 端点集成
- [ ] 新 summary 完成后自动预热
- [ ] MyIsland 推送集成

---

## 12. 测试策略

| 模块 | 测试类型 | 重点 |
|------|---------|------|
| `exa-client.ts` | Vitest 单测 + mock fetch | 参数拼接、错误码分类（401/429/timeout）、response 解析 |
| `recommendation-engine.ts` | Vitest 单测 + mock llm/exa | JSON 解析容错、去重与排序、状态机流转、sweepInterrupted |
| message handlers | Vitest 单测 + mock chrome.storage | session CRUD、markInteracted 对 action 的分支处理 |
| popup controller | 手工 E2E | 四种 UI 状态渲染、按钮行为、轮询启停 |

**LLM prompt 质量验证**：不做自动化单测。M1 完成后准备 3-5 个典型的 summary 样本，人工跑一遍对照输出 topics 是否合理。

---

## 13. 风险与未知

| 风险 | 影响 | 缓解 |
|------|------|------|
| Exa 对中文 query 召回质量差 | 中文话题搜不到源头 | prompt 强制 searchQueries 输出英文；话题名可保留中文用于展示 |
| LLM 输出非 JSON | session 容易 error | temperature=0.3 + response_format=json_object + 1 次重试；rawResponse 保留用于调试 |
| Exa 对中国用户网络可达性 | 连不上 api.exa.ai | v1 接受；Settings "测试连接"提前暴露；v2 可加代理配置 |
| chrome.storage.local 5MB 配额 | 超限写入失败 | 紧凑元数据 + 5 session 上限 + 字段截断，预估 <150KB |
| 推荐质量主观 | 用户觉得推荐没用 | M1 做真实样本人工验证；dismissed 信号为 v2 的反馈学习打基础 |
| 幻觉 URL | 推荐的 URL 打不开 | Exa 返回的是真实搜索结果 URL，不是 LLM 生成，根除幻觉问题 |

---

## 14. 文件变更摘要

**新增**：
- `src/types/recommendation.ts`
- `src/background/exa-client.ts`
- `src/background/recommendation-engine.ts`
- `src/popup/recommendation-controller.ts`
- 测试：`tests/background/exa-client.test.ts`、`tests/background/recommendation-engine.test.ts`

**修改**：
- `src/types/index.ts`（新增 3 个 KnownChromeMessageType；AppSettings.recommend；DEFAULT_SETTINGS.recommend）
- `public/manifest.json`（host_permissions + api.exa.ai）
- `src/background/index.ts`（initialize 调用 sweepInterrupted）
- `src/background/message-dispatcher.ts`（新增 3 条路由）
- `src/background/handlers.ts`（新增 3 个 handler）
- `src/popup/index.ts`（switchTab 支持带参跳转；summary 页按钮；tab 切换时调 recommendation-controller）
- `src/popup/settings.ts`（新增推荐配置区块）
- `public/html/popup.html`（Settings 推荐区块；summary 页跳转按钮）
- i18n 文案（`_locales/*/messages.json`）

---

*本文档为设计方案，非实施计划。实施计划由 writing-plans skill 基于本文档生成。*
