# My Attention

> **Record** what you pay attention to. **Summarize** what you know. **Discover** what you don't.

My Attention is a Chrome extension that captures your attention signals across AI conversations, web browsing, and reading behavior, then uses LLM to generate insights and break information bubbles.

## Core Loop

```
Record -> Summarize Keywords -> Recommend New Content -> Trigger New Attention -> Record Again
```

## Features

### Capture Attention (采集注意力)

Unified page with tab filters to browse all captured attention data:

| Filter | Source | How It Works |
|--------|--------|-------------|
| **AIChat** | AI conversation platforms | Auto-extracts messages from ChatGPT, Claude, DeepSeek, Gemini, Qwen, Yuanbao, Doubao, Kimi |
| **Highlight** | Web page text selection | Captures selected text with semantic context and heading hierarchy |
| **Dwell** | Reading behavior | Tracks elements you read for extended periods |
| **Unread** | Browser history | Shows visited pages not yet captured as attention (via `chrome.history`) |

Additional features:
- **Save Current Page** - Quick capture entire page content
- **Merge Selections** - Combine multiple highlights from the same page

### Summarize Attention (总结注意力)

Three LLM-powered analysis modes using all captured data (conversations + highlights + dwell + history):

| Mode | Purpose |
|------|---------|
| **AI Weekly Report** | Intellectual focus, key insights, challenges, next-week navigation |
| **Topic Review** | Deep dive into a specific topic across all conversations |
| **Psychology Insight** | Cognitive patterns, behavioral analysis, inner tensions |

- Async task system - create task, check progress, view results anytime
- Results persisted in `chrome.storage.local`
- Supports Alibaba Bailian (DashScope) / OpenAI / custom OpenAI-compatible endpoints

### Recommend Attention (推荐注意力)

*Coming soon* - Break information bubbles by recommending content you don't know but need to know.

### Background Tab Monitor

- Detects AI chat completion in background tabs via `chrome.alarms` + `MutationObserver`
- Desktop notification (MyIsland) when AI finishes responding

## Supported AI Platforms

| Platform | URL |
|----------|-----|
| ChatGPT | chatgpt.com |
| Claude | claude.ai |
| DeepSeek | chat.deepseek.com |
| Gemini | gemini.google.com |
| Qwen | chat.qwen.ai |
| Yuanbao | yuanbao.tencent.com |
| Doubao | doubao.com |
| Kimi | kimi.moonshot.cn |

## Tech Stack

- Chrome Manifest V3 (Service Worker)
- TypeScript + Vite
- IndexedDB (SaySoDB v2)
- Tailwind CSS (precompiled)
- LLM API (OpenAI-compatible format)

## Setup

```bash
# Install dependencies
npm install

# Development (watch mode)
npm run dev

# Production build
npm run build

# Type check
npm run type-check
```

### Load Extension

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist/` folder

### Configure LLM API

1. Open extension popup -> Settings tab
2. Select provider (Bailian / OpenAI / Custom)
3. Enter API Key
4. Set model name (default: `qwen-plus`)
5. Click "Save LLM Config"

## Architecture

```
src/
├── background/          # Service worker
│   ├── index.ts         # Message routing, lifecycle
│   ├── handlers.ts      # CRUD operations
│   ├── attention-summarizer.ts  # Async LLM task engine
│   ├── llm-client.ts    # OpenAI-compatible API client
│   ├── history-tracker.ts      # chrome.history integration
│   └── tab-monitor.ts   # Background tab detection
├── content/             # Content scripts
│   ├── index.ts         # Platform detection, auto-save
│   ├── snippets/        # Highlight/dwell capture
│   └── media/           # Image/video/audio capture
├── popup/               # Extension popup UI
│   ├── index.ts         # Main orchestrator (4-tab navigation)
│   ├── memories-list.ts # Conversation card rendering
│   ├── snippets-list.ts # Snippet card rendering
│   └── settings.ts      # Settings management
├── types/               # TypeScript interfaces
└── core/                # Shared utilities
```

## Design

UI inspired by [Linear's design system](https://linear.app) adapted for light mode:
- Brand color: `#5e6ad2` (indigo-violet)
- Inter font with `font-feature-settings: "cv01", "ss03"`
- Semi-transparent borders and luminance-based elevation
- Compact sidebar navigation

## License

MIT
