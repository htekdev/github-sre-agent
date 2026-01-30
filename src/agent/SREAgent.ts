import { CopilotClient, defineTool } from "@github/copilot-sdk";
import type { SessionEvent, MCPServerConfig } from "@github/copilot-sdk";
import { z } from "zod";
import { config } from "../config/index.js";
import { createChildLogger } from "../services/logger.js";
import { StatusService } from "../services/StatusService.js";
import { NoteStore } from "../services/NoteStore.js";
import { WorkflowTracker } from "../services/WorkflowTracker.js";
import type { WorkflowRunEvent, RepoConfig } from "../types/index.js";

const logger = createChildLogger("SREAgent");

export class SREAgent {
  private client: CopilotClient;
  private initialized = false;

  constructor() {
    this.client = new CopilotClient({
      autoStart:true,
      autoRestart: true,
    });
  }

  /**
   * Create tool definitions for the Copilot SDK
   * Note: GitHub operations (issues, workflows, repos) are handled by GitHub MCP tools
   */
  private createTools() {
    const statusService = StatusService.getInstance();
    const noteStore = NoteStore.getInstance();
    const workflowTracker = WorkflowTracker.getInstance();

    return [
      // Check GitHub Status Tool
      defineTool("check_github_status", {
        description: `Check GitHub system status for outages or incidents.
Use before retrying workflows to determine if failures are due to GitHub issues.`,
        parameters: z.object({
          checkActionsOnly: z.boolean().optional().default(false).describe("Only check Actions status"),
        }),
        handler: async ({ checkActionsOnly }) => {
          try {
            const actionsHealth = await statusService.isActionsHealthy();
            if (checkActionsOnly) {
              return { success: true, actionsHealthy: actionsHealth.healthy, details: actionsHealth.details };
            }
            const summary = await statusService.getStatusSummary();
            return { success: true, actionsHealthy: actionsHealth.healthy, summary };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
      }),

      // Manage Notes Tool
      defineTool("manage_notes", {
        description: `Manage SRE notes for tracking debugging context and ongoing issues.
Actions: create, query, get_summary, resolve. Use to track patterns and remember context.`,
        parameters: z.object({
          action: z.enum(["create", "query", "get_summary", "resolve"]).describe("Action to perform"),
          repoFullName: z.string().optional().describe("Repository full name (owner/repo)"),
          title: z.string().optional().describe("Note title (for create)"),
          content: z.string().optional().describe("Note content (for create)"),
          tags: z.array(z.string()).optional().describe("Tags for categorization"),
          noteId: z.string().optional().describe("Note ID (for resolve)"),
          limit: z.number().optional().default(10).describe("Max notes to return (for query)"),
        }),
        handler: async ({ action, repoFullName, title, content, tags, noteId, limit }) => {
          try {
            await noteStore.init();
            
            switch (action) {
              case "create": {
                if (!repoFullName || !title || !content) {
                  return { success: false, error: "repoFullName, title, and content required" };
                }
                const note = await noteStore.create({
                  repoFullName, title, content, tags: tags || [], resolved: false
                });
                return { success: true, noteId: note.id, message: `Created note: ${title}` };
              }
              case "query": {
                const notes = await noteStore.query({ repoFullName, limit });
                return { success: true, notes };
              }
              case "get_summary": {
                if (!repoFullName) {
                  return { success: false, error: "repoFullName required" };
                }
                const summary = await noteStore.getRepoSummary(repoFullName);
                return { success: true, summary };
              }
              case "resolve": {
                if (!noteId) {
                  return { success: false, error: "noteId required" };
                }
                const note = await noteStore.resolve(noteId);
                return note 
                  ? { success: true, message: `Resolved note: ${note.title}` }
                  : { success: false, error: "Note not found" };
              }
              default:
                return { success: false, error: "Unknown action" };
            }
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
      }),

      // Track Workflow Tool
      defineTool("track_workflow", {
        description: `Track a workflow that has a related GitHub issue. When you create an issue for a failed workflow,
use this tool to track it. When the workflow later succeeds, you can close the issue automatically.
Actions: track (start tracking), untrack (stop tracking), check (check if tracked), list (list all tracked).`,
        parameters: z.object({
          action: z.enum(["track", "untrack", "check", "list"]).describe("Action to perform"),
          owner: z.string().optional().describe("Repository owner"),
          repo: z.string().optional().describe("Repository name"),
          workflowId: z.number().optional().describe("Workflow ID"),
          workflowName: z.string().optional().describe("Workflow name (for track)"),
          issueNumber: z.number().optional().describe("Issue number (for track)"),
          failedRunId: z.number().optional().describe("Failed run ID (for track)"),
        }),
        handler: async ({ action, owner, repo, workflowId, workflowName, issueNumber, failedRunId }) => {
          try {
            await workflowTracker.init();
            
            switch (action) {
              case "track": {
                if (!owner || !repo || !workflowId || !workflowName || !issueNumber || !failedRunId) {
                  return { success: false, error: "owner, repo, workflowId, workflowName, issueNumber, and failedRunId required" };
                }
                const tracked = await workflowTracker.track({
                  owner, repo, workflowId, workflowName, issueNumber, failedRunId
                });
                return { success: true, message: `Now tracking workflow "${workflowName}" with issue #${issueNumber}`, tracked };
              }
              case "untrack": {
                if (!owner || !repo || !workflowId) {
                  return { success: false, error: "owner, repo, and workflowId required" };
                }
                const untracked = await workflowTracker.untrack(owner, repo, workflowId);
                return untracked
                  ? { success: true, message: "Stopped tracking workflow" }
                  : { success: false, error: "Workflow was not being tracked" };
              }
              case "check": {
                if (!owner || !repo || !workflowId) {
                  return { success: false, error: "owner, repo, and workflowId required" };
                }
                const tracked = await workflowTracker.get(owner, repo, workflowId);
                return tracked
                  ? { success: true, isTracked: true, tracked }
                  : { success: true, isTracked: false };
              }
              case "list": {
                const all = owner && repo
                  ? await workflowTracker.getForRepo(owner, repo)
                  : await workflowTracker.getAll();
                return { success: true, trackedWorkflows: all };
              }
              default:
                return { success: false, error: "Unknown action" };
            }
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
      }),
    ];
  }

  /**
   * Initialize the agent
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    
    await this.client.start();
    this.initialized = true;
    logger.info("SRE Agent initialized");
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    if (!this.initialized) return;
    
    await this.client.stop();
    this.initialized = false;
    logger.info("SRE Agent stopped");
  }

  /**
   * Handle a workflow run event
   */
  async handleWorkflowRun(
    event: WorkflowRunEvent,
    repoConfig: RepoConfig
  ): Promise<string> {
    const { workflow_run, repository } = event;

    // Build the context prompt
    const contextPrompt = this.buildContextPrompt(event, repoConfig);

    logger.info(
      { 
        repo: repository.full_name, 
        workflow: workflow_run.name,
        runId: workflow_run.id,
        conclusion: workflow_run.conclusion,
      },
      "Processing workflow run event"
    );

    try {
      logger.debug("Initializing Copilot client...");
      await this.init();
      logger.debug("Copilot client initialized");

      const sessionId = `sre-${workflow_run.id}-${Date.now()}`;
      logger.debug({ model: config.COPILOT_MODEL, sessionId }, "Creating session with model...");
      
      // Build MCP servers config
      const mcpServers: Record<string, MCPServerConfig> = {
        // GitHub MCP server for Actions, Issues, Repos, etc.
        github: {
          type: "http",
          url: "https://api.githubcopilot.com/mcp/",
          tools: ["*"],
        },
      };

      // Add Exa MCP server if API key is configured
      if (config.EXA_API_KEY) {
        mcpServers.exa = {
          type: "http",
          url: `https://mcp.exa.ai/mcp?exaApiKey=${config.EXA_API_KEY}&tools=web_search_exa,company_research_exa,crawling_exa,deep_researcher_start,deep_researcher_check`,
          tools: ["*"],
        };
        logger.debug("Exa MCP server enabled");
      }

      const session = await this.client.createSession({
        sessionId,
        model: config.COPILOT_MODEL,
        streaming: true,
        tools: this.createTools(),
        mcpServers,
        systemMessage: {
          content: this.buildSystemMessage(repoConfig),
        },
      });
      logger.debug({ sessionId: session.sessionId }, "Session created");

      let response = "";
      
      session.on((evt: SessionEvent) => {
        // logger.debug({ type: evt.type }, "Session event received");
        
        if (evt.type === "assistant.message_delta") {
          response += evt.data.deltaContent;
          process.stdout.write(evt.data.deltaContent);
        }
        if (evt.type === "assistant.reasoning_delta") {
          // Output reasoning in a distinct style
          process.stdout.write(`\x1b[2m${evt.data.deltaContent}\x1b[0m`);
        }
        if (evt.type === "assistant.message") {
          logger.info("Assistant message complete");
        }
        if (evt.type === "tool.execution_start") {
          logger.info({ tool: evt.data.toolName }, "Tool executing");
        }
        if (evt.type === "session.error") {
          logger.error({ error: evt.data }, "Session error");
        }
        if (evt.type === "session.idle") {
          logger.debug("Session idle");
        }
      });

      logger.debug("Sending prompt to agent...");
      const result = await session.sendAndWait({ prompt: contextPrompt }, 120000); // 2 min timeout
      console.log("\n");
      
      await session.destroy();

      const finalResponse = result?.data?.content || response;
      logger.info({ repo: repository.full_name, runId: workflow_run.id }, "Agent completed analysis");
      
      return finalResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error({ error: message, stack: error instanceof Error ? error.stack : undefined, repo: repository.full_name }, "Agent failed to process event");
      throw error;
    }
  }

  /**
   * Build the system message for the agent
   */
  private buildSystemMessage(repoConfig: RepoConfig): string {
    const customInstructions = repoConfig.instructions 
      ? `\n\n## Repository-Specific Instructions\n${repoConfig.instructions}`
      : "";

    const exaCapabilities = config.EXA_API_KEY 
      ? `
You also have access to Exa AI tools for web research:
- **web_search_exa**: Search the web for error messages, solutions, or documentation
- **company_research_exa**: Research companies or services related to failures
- **crawling_exa**: Extract content from specific URLs (docs, Stack Overflow, etc.)
- **deep_researcher_start/check**: Conduct deep research on complex issues
`
      : "";

    return `You are an expert Site Reliability Engineer (SRE) agent for GitHub Actions.

## Your Role
You analyze GitHub Actions workflow failures and take appropriate actions to resolve issues or escalate them properly.

## IMPORTANT: Repository-Specific Instructions
**BEFORE** analyzing any workflow failure, you MUST:
1. Use GitHub MCP tools to fetch the file \`.github/copilot-instructions.md\` from the repository
2. Read and follow any SRE-specific instructions, conventions, or requirements defined in that file
3. If the file doesn't exist, proceed with the default guidelines below

The Copilot instructions file may contain critical information about:
- Repository-specific build/test commands
- Known issues or patterns to watch for
- Special retry or escalation procedures
- Custom labels or assignees for issues
- Technologies, tools, or frameworks in use

## Your Capabilities
You have access to GitHub MCP tools for:
- **Actions**: Get workflow runs, jobs, logs, re-run workflows
- **Issues**: Create issues, search issues, add comments
- **Repository**: Get file contents, commits, branches
${exaCapabilities}
You also have custom tools for:
- **check_github_status**: Check GitHub system status for outages
- **manage_notes**: Track debugging context and ongoing issues

## Decision Guidelines
1. **First, read \`.github/copilot-instructions.md\`** - Get repository-specific SRE guidance
2. **Check GitHub status** - If there's an outage, note it and avoid unnecessary retries
3. **Analyze logs** - Use GitHub MCP tools to fetch workflow logs and understand the root cause
4. **Search for solutions** - If you have Exa tools, search for error messages or known issues
5. **Check for patterns** - Use notes to track if this is a recurring issue
6. **Be conservative with retries** - Don't retry more than the configured max attempts
7. **Create issues thoughtfully** - Include relevant context, avoid duplicates
8. **Document your reasoning** - Keep notes for future reference

## Configuration Limits
- Max retry attempts: ${repoConfig.actions.retry.maxAttempts}
- Auto-retry enabled: ${repoConfig.actions.retry.enabled}
- Auto-issue creation enabled: ${repoConfig.actions.createIssue.enabled}
- Issue labels: ${repoConfig.actions.createIssue.labels.join(", ")}
${customInstructions}

## Workflow Tracking
When you create an issue for a failed workflow, use the **track_workflow** tool to track it.
This allows the system to automatically notify you when the workflow succeeds, so you can close the issue.

## Response Format
Provide a brief summary of your analysis and actions taken. Be concise but informative.`;
  }

  /**
   * Build the context prompt for a workflow run event
   */
  private buildContextPrompt(event: WorkflowRunEvent, _repoConfig: RepoConfig): string {
    const { workflow_run, repository } = event;

    return `## Workflow Run Event

**Repository:** ${repository.full_name}
**Workflow:** ${workflow_run.name || "Unknown"}
**Workflow ID:** ${workflow_run.workflow_id}
**Run ID:** ${workflow_run.id}
**Run Number:** ${workflow_run.run_number}
**Attempt:** ${workflow_run.run_attempt}
**Branch:** ${workflow_run.head_branch || "Unknown"}
**Conclusion:** ${workflow_run.conclusion}
**Triggered by:** ${workflow_run.triggering_actor?.login || workflow_run.actor?.login || "Unknown"}
**URL:** ${workflow_run.html_url}

## Task
Analyze this workflow run and determine the appropriate action:
1. **FIRST**: Fetch and read \`.github/copilot-instructions.md\` from the repository for any SRE-specific instructions
2. If the conclusion is "failure" or "timed_out", investigate and decide whether to retry or create an issue
3. If this appears to be a transient failure (infrastructure, flaky test, etc.), consider retrying
4. If this appears to be a legitimate code issue, create an issue with your analysis
5. **IMPORTANT**: If you create an issue, use track_workflow to track this workflow so we can close the issue when it's fixed
6. Check for any existing notes about this workflow or similar failures
7. Update or create notes to track your findings

Begin your analysis.`;
  }

  /**
   * Handle a workflow that succeeded after previously failing
   */
  async handleWorkflowSuccess(
    event: WorkflowRunEvent,
    repoConfig: RepoConfig,
    tracked: { issueNumber: number; workflowName: string; failedRunId: number }
  ): Promise<string> {
    const { workflow_run, repository } = event;

    logger.info(
      { 
        repo: repository.full_name, 
        workflow: workflow_run.name,
        runId: workflow_run.id,
        issueNumber: tracked.issueNumber,
      },
      "Processing workflow success for tracked issue"
    );

    const successPrompt = `## Workflow Success Event

**Repository:** ${repository.full_name}
**Workflow:** ${workflow_run.name || "Unknown"}
**Workflow ID:** ${workflow_run.workflow_id}
**Run ID:** ${workflow_run.id}
**Run Number:** ${workflow_run.run_number}
**Branch:** ${workflow_run.head_branch || "Unknown"}
**Conclusion:** ${workflow_run.conclusion}
**URL:** ${workflow_run.html_url}

## Context
This workflow was previously failing and we created issue #${tracked.issueNumber} to track it.
The original failure was run ID: ${tracked.failedRunId}

## Task
The workflow is now passing! Please:
1. Add a comment to issue #${tracked.issueNumber} explaining that the workflow is now passing
2. Close issue #${tracked.issueNumber}
3. Use track_workflow with action "untrack" to stop tracking this workflow
4. Create a note documenting that this issue was auto-resolved

Be concise in your comment.`;

    try {
      await this.init();

      const sessionId = `sre-success-${workflow_run.id}-${Date.now()}`;
      
      const mcpServers: Record<string, MCPServerConfig> = {
        github: {
          type: "http",
          url: "https://api.githubcopilot.com/mcp/",
          tools: ["*"],
        },
      };

      const session = await this.client.createSession({
        sessionId,
        model: config.COPILOT_MODEL,
        streaming: true,
        tools: this.createTools(),
        mcpServers,
        systemMessage: {
          content: this.buildSystemMessage(repoConfig),
        },
      });

      let response = "";
      
      session.on((evt: SessionEvent) => {
        if (evt.type === "assistant.message_delta") {
          response += evt.data.deltaContent;
          process.stdout.write(evt.data.deltaContent);
        }
        if (evt.type === "assistant.reasoning_delta") {
          process.stdout.write(`\x1b[2m${evt.data.deltaContent}\x1b[0m`);
        }
        if (evt.type === "tool.execution_start") {
          logger.info({ tool: evt.data.toolName }, "Tool executing");
        }
        if (evt.type === "session.error") {
          logger.error({ error: evt.data }, "Session error");
        }
      });

      const result = await session.sendAndWait({ prompt: successPrompt }, 120000);
      console.log("\n");
      
      await session.destroy();

      const finalResponse = result?.data?.content || response;
      logger.info({ repo: repository.full_name, runId: workflow_run.id }, "Agent completed success handling");
      
      return finalResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error({ error: message, repo: repository.full_name }, "Agent failed to handle workflow success");
      throw error;
    }
  }
}
