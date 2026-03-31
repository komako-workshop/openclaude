# OpenClaude 项目交接文档

## 项目目标

基于泄露的 Claude Code 源码和开源 open-agent-sdk，构建一个 **Mac 桌面 GUI 客户端**，通过 OpenRouter API 使用 Claude Code 的完整 agent 引擎。

---

## 当前目录结构

```
/Users/lijianren/workspace/openclaude/
├── claude-code/                    # Anthropic Claude Code 泄露源码（只读参考）
│   ├── src/                        # ~1,900 文件，512K+ 行 TypeScript
│   └── README.md                   # 泄露说明
├── open-agent-sdk/                 # ShipAny 的开源 SDK（可直接使用）
│   ├── src/                        # ~2,097 文件（泄露源码的 Node.js 移植版）
│   ├── examples/                   # 10 个使用示例
│   ├── scripts/                    # 构建辅助脚本
│   ├── build.mjs                   # esbuild CLI 构建
│   ├── package.json                # 依赖清单（已补齐）
│   └── tsconfig.json
├── claude-code-deep-dive.html      # Claude Code 架构深度解析（14 章节）
└── claude-code-vs-clawloop.html    # Claude Code vs ClawLoop 对比分析
```

---

## 关键结论（前序研究成果）

### Claude Code 泄露源码

- **泄露日期**：2026-03-31，通过 npm registry 的 .map 文件暴露
- **技术栈**：Bun + TypeScript strict + React + Ink（终端 UI）
- **只有终端 TUI，没有桌面 GUI**。VS Code 扩展代码在 `packages/claude-vscode/`，未被泄露
- **核心架构**：Commander CLI → QueryEngine（会话管理）→ query.ts（agentic loop）→ Tools/Commands
- **与 Anthropic API 深度绑定**：beta headers、prompt caching、thinking mode、tool search 等专有特性
- 详细架构分析见 `claude-code-deep-dive.html`

### open-agent-sdk

- **本质**：泄露源码的 Node.js 移植 + 薄 SDK 封装，不是独立重写
- **改动**：Bun→Node 适配（bun-shim.ts）、Anthropic 内部依赖 stub、新增 `createAgent()`/`query()` API
- **OpenRouter 支持**：设三个环境变量即可
  ```
  ANTHROPIC_BASE_URL=https://openrouter.ai/api
  ANTHROPIC_API_KEY=<your-key>
  ANTHROPIC_MODEL=anthropic/claude-sonnet-4-6
  ```
- **风险**：代码主体来自泄露源码，MIT 许可但 Anthropic 可能 DMCA；仅 2 个 contributor，长期维护不确定
- **可直接 `npm install @shipany/open-agent-sdk` 使用**

### 桌面 GUI 方案

讨论确定的技术路线：

| 决策 | 选择 | 理由 |
|------|------|------|
| 桌面框架 | **Electron** | 用户有 ClawLoop（Electron）经验；SDK 是 Node.js，主进程可直接 import |
| UI 框架 | **React + Tailwind CSS** | 与 ClawLoop 一致 |
| 构建 | **Vite** | 与 ClawLoop 一致 |
| Agent 引擎 | **open-agent-sdk** | 包含完整 Claude Code 引擎，npm install 即用 |
| API 提供商 | **OpenRouter**（可切换） | 支持多模型，Anthropic 兼容格式 |

### 架构设计

```
Electron Renderer (React + Tailwind)
  对话界面 · 工具执行卡片 · 权限弹窗 · 设置面板
       │ IPC
Electron Main Process
  import { createAgent } from '@shipany/open-agent-sdk'
  ├─ agent.query(prompt) → 流式 AsyncGenerator
  ├─ 工具执行（文件读写/Shell/搜索/Web）
  └─ 权限审批回调 → IPC 发到 Renderer
       │ HTTP
  OpenRouter / Anthropic API
```

### 功能规划

**最小版（第一步）**：
- 单个对话窗口，流式 Markdown 渲染
- 工具执行结果展示
- 权限审批弹窗（允许/拒绝）
- 设置面板（API key、模型选择、工作目录）

**完整版（后续）**：
- 多会话管理 + 历史记录
- 侧栏文件树
- 工具执行可视化卡片（diff 视图、Shell 输出、搜索结果）
- 多模型切换
- MCP 服务器管理

---

## open-agent-sdk 核心 API

```typescript
import { createAgent, query } from '@shipany/open-agent-sdk'

// 方式一：createAgent — 多轮会话
const agent = createAgent({
  model: 'anthropic/claude-sonnet-4-6',
  baseURL: 'https://openrouter.ai/api',
  apiKey: 'your-key',
  cwd: '/path/to/project',
  systemPrompt: '...',
  permissionMode: 'default',       // default | acceptEdits | bypassPermissions | plan
  maxTurns: 100,
})

// 流式
for await (const msg of agent.query('Fix the bug in auth.py')) {
  // msg.type: 'assistant' | 'result' | 'tool_use' | ...
}

// 阻塞式
const result = await agent.prompt('Read package.json')
console.log(result.text)

// 方式二：query — 一次性（兼容官方 SDK）
for await (const msg of query({
  prompt: '...',
  options: { allowedTools: ['Read', 'Edit', 'Bash'] }
})) { ... }
```

---

## 参考资源

- **Claude Code 架构详解**：打开 `claude-code-deep-dive.html`（14 章节，涵盖引擎、工具、权限、提示词等）
- **对比分析**：打开 `claude-code-vs-clawloop.html`
- **open-agent-sdk 示例**：`open-agent-sdk/examples/` 下 10 个 TypeScript 示例
- **open-agent-sdk README**：`open-agent-sdk/README.md`（完整 API 文档）
- **ClawLoop 参考**：`/Users/lijianren/workspace/clawloop/`（Electron + React + Tailwind + Vite 的现成脚手架）
