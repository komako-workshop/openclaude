# OpenClaude

不依赖 Claude 官方账号，用自己的 API Key 跑 Claude Code 完整 agent 能力的 Mac 桌面客户端。

## 为什么做这个

Claude Code 在国内疯狂封号，很多人用不了。这个客户端接 OpenRouter 或任何 Anthropic 兼容的 API，绕过官方登录，直接获得 Claude Code 的完整能力：读文件、改代码、跑命令、搜索、MCP —— 都能用。

底层使用 Claude Code SDK 作为 agent 引擎，在 Electron 主进程内直接运行，不需要安装官方 Claude Code CLI。

## 安装

### 下载安装包（Mac）

从 [GitHub Releases](https://github.com/komako-workshop/openclaude/releases) 下载最新的 `.dmg` 文件，拖入 Applications 即可。

目前仅支持 macOS Apple Silicon (arm64)。安装包未签名，首次打开需要在「系统设置 → 隐私与安全性」中手动允许。

### 从源码运行

```bash
git clone https://github.com/komako-workshop/openclaude.git
cd openclaude/app
bash scripts/setup.sh        # 安装依赖 + 下载匹配的 Electron 二进制
npm run dev                  # 开发模式
# 或
npm run package:mac          # 打包 .app + .dmg（ad-hoc 签名）
```

需要 Node.js 18+。

> 注意：请使用 `bash scripts/setup.sh` 而不是直接 `npm install`。上游
> `@shipany/open-agent-sdk@0.1.7` 的 postinstall 在 npm 发布包里漏带
> 了一个脚本文件，`npm install` 会在那步失败。`setup.sh` 会跳过那个有
> 问题的 postinstall，并把 Electron 二进制正确装好。

## 使用

1. 打开 OpenClaude，点击「Set up API key to get started」
2. 选择 API 提供商，填入 API Key
3. 选择工作目录
4. 开始对话

## 支持的 API 提供商

| 提供商 | Base URL | 状态 |
|--------|----------|------|
| Anthropic 官方 | `https://api.anthropic.com` | 已验证 |
| OpenRouter | `https://openrouter.ai/api` | 已验证 |
| 自定义 Anthropic 兼容端点 | 用户自填 | 理论支持 |

任何兼容 Anthropic Messages API 格式的中转站 / relay 都可以接，在设置中选「Custom」填入 Base URL 和 API Key 即可。

## 主要能力

- 完整的 Claude Code agent 引擎（读文件、编辑、Shell、搜索、Web）
- 多会话管理、会话恢复
- 流式输出 + thinking 展示
- 图片输入（粘贴、拖拽）
- MCP 支持（从 `~/.claude.json` 自动加载）
- 亮色 / 暗色主题

## 技术栈

- Electron + React + Tailwind CSS + Vite
- 使用 Claude Code SDK 作为 agent 引擎
- Zustand 状态管理
- Streamdown Markdown 渲染

## License

MIT
