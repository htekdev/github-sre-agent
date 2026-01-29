<div align="center">

# 🤖 GitHub SRE Agent

**AI-powered Site Reliability Engineering for GitHub Actions**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![GitHub Copilot](https://img.shields.io/badge/Copilot_SDK-0.1.x-000000?logo=github&logoColor=white)](https://github.com/github/copilot-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

*An intelligent agent that monitors GitHub Actions workflows, analyzes failures, and takes automated remediation actions using the GitHub Copilot SDK.*

[Features](#-features) • [Quick Start](#-quick-start) • [How It Works](#-how-it-works) • [Configuration](#-configuration) • [Architecture](#-architecture)

</div>

---

## 🎯 What This Does

The GitHub SRE Agent is an **autonomous AI agent** that acts as your on-call Site Reliability Engineer for GitHub Actions. When a workflow fails, the agent:

1. **Analyzes the failure** - Fetches logs, checks GitHub status, searches for known issues
2. **Makes intelligent decisions** - Determines if it's a transient failure (retry) or a code bug (create issue)
3. **Takes action automatically** - Retries workflows, creates detailed issues, or skips if appropriate
4. **Tracks resolution** - When a tracked workflow succeeds, automatically closes the related issue

### Key Capabilities

| Capability | Description |
|------------|-------------|
| **GitHub MCP Integration** | Uses GitHub's Model Context Protocol for Actions, Issues, and Repository operations |
| **Exa AI Web Search** | Searches the web for error messages, Stack Overflow solutions, and documentation |
| **Workflow Tracking** | Tracks failed workflows and auto-closes issues when they're fixed |
| **Persistent Memory** | Maintains notes and context across workflow runs |

## ✨ Features

<table>
<tr>
<td width="50%">

### 🔍 Intelligent Analysis
- Fetches and analyzes workflow logs via GitHub MCP
- Searches web for error solutions using Exa AI
- Identifies transient vs. persistent failures
- Recognizes patterns across runs

</td>
<td width="50%">

### 🔄 Automated Remediation
- Retries failed workflows intelligently
- Creates detailed issues with root cause analysis
- **Auto-closes issues when workflows are fixed**
- Avoids duplicate actions

</td>
</tr>
<tr>
<td width="50%">

### 📊 GitHub Status Awareness
- Checks GitHub system status before actions
- Considers outages before retrying
- Provides context-aware decisions

</td>
<td width="50%">

### 📝 Persistent Memory
- Tracks workflows with open issues
- Maintains debugging notes
- Remembers context between runs

</td>
</tr>
</table>

## 🔄 How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Workflow Failure Flow                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Workflow Fails ──▶ 2. Agent Analyzes ──▶ 3. Decision                   │
│         │                     │                    │                        │
│         │              ┌──────┴──────┐      ┌──────┴──────┐                │
│         │              │ • Fetch logs│      │ • RETRY     │                │
│         │              │ • Check GH  │      │ • CREATE    │                │
│         │              │   status    │      │   ISSUE     │                │
│         │              │ • Search web│      │ • SKIP      │                │
│         │              └─────────────┘      └──────┬──────┘                │
│         │                                          │                        │
│         │                              ┌───────────┴───────────┐           │
│         │                              ▼                       ▼           │
│         │                      [Create Issue]          [Retry Workflow]    │
│         │                              │                       │           │
│         │                              ▼                       │           │
│         │                    [Track Workflow] ◀────────────────┘           │
│         │                              │                                    │
└─────────┼──────────────────────────────┼────────────────────────────────────┘
          │                              │
          ▼                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Workflow Success Flow                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Workflow Succeeds ──▶ Check if Tracked ──▶ Yes ──▶ Close Issue            │
│                              │                         │                    │
│                              ▼                         ▼                    │
│                             No                   Untrack Workflow           │
│                              │                         │                    │
│                              ▼                         ▼                    │
│                           [Skip]               [Add Comment & Close]        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           GitHub SRE Agent                                    │
│                                                                              │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────┐     │
│  │  Webhook Server │────▶│  Event Handler  │────▶│    SRE Agent Core   │     │
│  │     (Hono)      │     │                 │     │   (Copilot SDK)     │     │
│  └─────────────────┘     └─────────────────┘     └─────────┬───────────┘     │
│                                                            │                  │
│                          ┌─────────────────────────────────┼─────────────┐   │
│                          │            MCP Servers          │             │   │
│                          │  ┌──────────────┐  ┌──────────────┐          │   │
│                          │  │  GitHub MCP  │  │   Exa AI MCP │          │   │
│                          │  │  • Actions   │  │  • Web Search│          │   │
│                          │  │  • Issues    │  │  • Research  │          │   │
│                          │  │  • Repos     │  │  • Crawling  │          │   │
│                          │  └──────────────┘  └──────────────┘          │   │
│                          └──────────────────────────────────────────────┘   │
│                                                            │                  │
│  ┌──────────────────────────┬──────────────────────────────┼─────────────┐   │
│  │     Custom Tools         │                              │             │   │
│  ▼                          ▼                              ▼             ▼   │
│  ┌──────────────┐    ┌──────────────┐           ┌────────────┐ ┌─────────┐  │
│  │ check_github │    │ manage_notes │           │  track_    │ │Workflow │  │
│  │    _status   │    │              │           │  workflow  │ │ Tracker │  │
│  └──────────────┘    └──────────────┘           └────────────┘ └─────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18.0.0 or higher
- **GitHub Copilot CLI** installed and authenticated (`gh copilot`)
- **ngrok** (for local development)

### Installation

```bash
# Clone the repository
git clone https://github.com/htekdev/github-sre-agent.git
cd github-sre-agent

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### Configuration

Edit `.env` with your credentials:

```env
# Server
PORT=3000
NODE_ENV=development

# GitHub (webhook secret only - auth handled by Copilot SDK)
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# Exa AI (optional - enables web search)
EXA_API_KEY=your_exa_api_key

# Copilot SDK
COPILOT_MODEL=Claude Sonnet 4

# Logging
LOG_LEVEL=info
```

> **Note:** No `GITHUB_TOKEN` needed! The Copilot SDK handles authentication automatically via GitHub MCP.

### Running Locally

```bash
# Start the development server
npm run dev

# In another terminal, start ngrok tunnel
npx ngrok http 3000
```

Then configure your GitHub repository webhook:
1. Go to **Settings** → **Webhooks** → **Add webhook**
2. Set **Payload URL** to your ngrok URL + `/webhook`
3. Set **Content type** to `application/json`
4. Enter your **Secret**
5. Select **Let me select individual events** → ✅ **Workflow runs**
6. Click **Add webhook**

## ⚙️ Configuration

### Repository Configuration

Create `.github/sre-agent.yml` in your repository to customize the agent's behavior:

```yaml
version: 1
enabled: true

# Custom instructions for the AI agent
instructions: |
  - This repo uses pnpm, not npm
  - Always check if tests pass before suggesting retry
  - Create issues with label "ci-failure" for tracking

# Action-specific settings
actions:
  retry:
    enabled: true
    maxAttempts: 3
    
  createIssue:
    enabled: true
    labels:
      - sre-agent
      - automated
      - ci-failure
    assignees: []

# Only monitor specific workflows (empty = all)
workflows: []

# Ignore patterns
ignore:
  conclusions:
    - cancelled  # Don't process cancelled workflows
  branches:
    - "dependabot/*"  # Ignore dependabot branches
```

## 🛠️ Development

### Project Structure

```
github-sre-agent/
├── src/
│   ├── index.ts              # Entry point
│   ├── config/               # Configuration management
│   ├── server/               # Hono web server
│   │   └── routes/           # API routes
│   ├── agent/                # SRE Agent implementation
│   │   ├── SREAgent.ts       # Main agent with MCP config
│   │   └── tools/            # Custom tools (status, notes, tracking)
│   ├── services/             # Service integrations
│   │   ├── StatusService.ts  # GitHub status checker
│   │   ├── NoteStore.ts      # Notes persistence
│   │   └── WorkflowTracker.ts # Workflow tracking for auto-close
│   ├── handlers/             # Event handlers
│   └── types/                # TypeScript types
├── data/                     # Local storage (notes, tracked workflows)
├── prompts/                  # Prompt files for agent operations
└── package.json
```

### Available Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build for production
npm run start        # Start production server
```

### Testing the Agent

Use the included test workflows:

- **CI Build** (`.github/workflows/test.yml`) - Simulates a failing/passing CI
- **Flaky Test** (`.github/workflows/flaky-test.yml`) - Succeeds on 3rd attempt

Reset experiment state:
```bash
# Use the reset prompt with Copilot
# Or manually delete issues and clear data/
```

## 🔒 Security

- **No Token Storage**: GitHub authentication handled by Copilot SDK OAuth
- **Webhook Signature Verification**: All webhooks verified using HMAC-SHA256
- **MCP Security**: GitHub MCP uses Copilot's authenticated session

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ using [GitHub Copilot SDK](https://github.com/github/copilot-sdk) and [GitHub MCP](https://github.com/github/github-mcp-server)**

</div>
