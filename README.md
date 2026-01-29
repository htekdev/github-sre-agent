<div align="center">

# 🤖 GitHub SRE Agent

**AI-powered Site Reliability Engineering for GitHub Actions**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![GitHub Copilot](https://img.shields.io/badge/Copilot_SDK-0.1.x-000000?logo=github&logoColor=white)](https://github.com/github/copilot-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

*An intelligent agent that monitors GitHub Actions workflows, analyzes failures, and takes automated remediation actions using the GitHub Copilot SDK.*

[Features](#-features) • [Quick Start](#-quick-start) • [Configuration](#-configuration) • [Architecture](#-architecture) • [Development](#-development)

</div>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🔍 Intelligent Analysis
- Fetches and analyzes workflow logs
- Identifies transient vs. persistent failures
- Recognizes patterns across runs

</td>
<td width="50%">

### 🔄 Automated Remediation
- Retries failed workflows intelligently
- Creates issues for tracking problems
- Avoids duplicate actions

</td>
</tr>
<tr>
<td width="50%">

### 📊 GitHub Status Awareness
- Checks GitHub system status
- Considers outages before retrying
- Provides context-aware decisions

</td>
<td width="50%">

### 📝 Persistent Memory
- Maintains debugging notes
- Tracks ongoing issues
- Remembers context between runs

</td>
</tr>
</table>

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GitHub                                          │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────────────┐    │
│  │  Workflow   │────▶│    Webhooks     │────▶│   workflow_run Event    │    │
│  │  Completes  │     │  (workflow_run) │     │                         │    │
│  └─────────────┘     └─────────────────┘     └───────────┬─────────────┘    │
└──────────────────────────────────────────────────────────┼──────────────────┘
                                                           │
                                                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           GitHub SRE Agent                                    │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────┐     │
│  │  Webhook Server │────▶│  Event Handler  │────▶│    SRE Agent Core   │     │
│  │     (Hono)      │     │                 │     │   (Copilot SDK)     │     │
│  └─────────────────┘     └─────────────────┘     └─────────┬───────────┘     │
│                                                            │                  │
│  ┌──────────────────────────────┬──────────────────────────┼─────────────┐   │
│  │                              │                          │             │   │
│  ▼                              ▼                          ▼             ▼   │
│  ┌──────────┐           ┌──────────────┐          ┌────────────┐ ┌─────────┐│
│  │  Retry   │           │ Create Issue │          │  Get Logs  │ │ Notes   ││
│  │ Workflow │           │              │          │            │ │ Store   ││
│  └──────────┘           └──────────────┘          └────────────┘ └─────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18.0.0 or higher
- **GitHub Copilot CLI** installed and authenticated
- **GitHub Personal Access Token** with `repo` and `workflow` permissions
- **ngrok** (for local development)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/github-sre-agent.git
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

# GitHub
GITHUB_TOKEN=ghp_your_personal_access_token
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# Copilot SDK
COPILOT_MODEL=gpt-4.1

# Logging
LOG_LEVEL=info
```

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

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `version` | number | `1` | Configuration schema version |
| `enabled` | boolean | `true` | Enable/disable the agent for this repo |
| `instructions` | string | - | Custom AI instructions |
| `actions.retry.enabled` | boolean | `true` | Allow automatic retries |
| `actions.retry.maxAttempts` | number | `3` | Maximum retry attempts |
| `actions.createIssue.enabled` | boolean | `true` | Allow issue creation |
| `actions.createIssue.labels` | string[] | `["sre-agent", "automated"]` | Default labels |
| `workflows` | string[] | `[]` | Workflows to monitor (empty = all) |
| `ignore.conclusions` | string[] | `[]` | Conclusions to ignore |
| `ignore.branches` | string[] | `[]` | Branch patterns to ignore |

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
│   │   └── tools/            # Tool abstractions
│   ├── services/             # External service integrations
│   │   ├── GitHubService.ts  # GitHub API wrapper
│   │   ├── StatusService.ts  # GitHub status checker
│   │   └── NoteStore.ts      # Notes persistence
│   ├── handlers/             # Event handlers
│   └── types/                # TypeScript types
├── data/                     # Local storage
├── docs/                     # Documentation
└── package.json
```

### Available Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build for production
npm run start        # Start production server
npm run tunnel       # Start ngrok tunnel
npm run dev:tunnel   # Start dev server + ngrok together
npm run lint         # Run ESLint
npm run typecheck    # Run TypeScript type checking
```

### Adding New Tools

The agent uses the GitHub Copilot SDK's `defineTool` function. Add new tools in `src/agent/SREAgent.ts`:

```typescript
defineTool("my_new_tool", {
  description: "Description for the AI to understand when to use this tool",
  parameters: z.object({
    param1: z.string().describe("Parameter description"),
    param2: z.number().optional().describe("Optional parameter"),
  }),
  handler: async ({ param1, param2 }) => {
    // Tool implementation
    return { success: true, data: "result" };
  },
}),
```

## 📊 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/webhook` | GitHub webhook receiver |
| `GET` | `/health` | Health check |
| `GET` | `/status` | Detailed status info |
| `GET` | `/` | API information |

## 🔒 Security

- **Webhook Signature Verification**: All incoming webhooks are verified using HMAC-SHA256
- **Token Security**: GitHub tokens are stored in environment variables, never committed
- **Rate Limiting**: The agent respects GitHub API rate limits

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ using [GitHub Copilot SDK](https://github.com/github/copilot-sdk)**

</div>
