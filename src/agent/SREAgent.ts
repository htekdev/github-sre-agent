import { CopilotClient, defineTool } from "@github/copilot-sdk";
import type { SessionEvent } from "@github/copilot-sdk";
import { z } from "zod";
import { config } from "../config/index.js";
import { createChildLogger } from "../services/logger.js";
import { GitHubService } from "../services/GitHubService.js";
import { StatusService } from "../services/StatusService.js";
import { NoteStore } from "../services/NoteStore.js";
import type { WorkflowRunEvent, RepoConfig } from "../types/index.js";

const logger = createChildLogger("SREAgent");

export class SREAgent {
  private client: CopilotClient;
  private initialized = false;

  constructor() {
    this.client = new CopilotClient();
  }

  /**
   * Create tool definitions for the Copilot SDK
   */
  private createTools() {
    const github = GitHubService.getInstance();
    const statusService = StatusService.getInstance();
    const noteStore = NoteStore.getInstance();

    return [
      // Retry Workflow Tool
      defineTool("retry_workflow", {
        description: `Retry a failed GitHub Actions workflow run. By default, only retries failed jobs. 
Set failedOnly to false to retry the entire workflow.
Use this when you've determined a workflow failure is transient or a known issue has been resolved.`,
        parameters: z.object({
          owner: z.string().describe("Repository owner"),
          repo: z.string().describe("Repository name"),
          runId: z.number().describe("Workflow run ID to retry"),
          failedOnly: z.boolean().optional().default(true).describe("Only retry failed jobs"),
        }),
        handler: async ({ owner, repo, runId, failedOnly }) => {
          try {
            const attempts = await github.getWorkflowRunAttempts(owner, repo, runId);
            if (attempts >= 3) {
              return { success: false, error: `Already retried ${attempts} times` };
            }
            if (failedOnly) {
              await github.rerunFailedJobs(owner, repo, runId);
            } else {
              await github.rerunWorkflow(owner, repo, runId);
            }
            return { success: true, message: `Retry triggered for run ${runId}` };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
      }),

      // Create Issue Tool
      defineTool("create_issue", {
        description: `Create a GitHub issue to track a workflow problem or required action.
Include relevant context like workflow run links, error messages, and your analysis.`,
        parameters: z.object({
          owner: z.string().describe("Repository owner"),
          repo: z.string().describe("Repository name"),
          title: z.string().describe("Issue title"),
          body: z.string().describe("Issue body in markdown"),
          labels: z.array(z.string()).optional().default([]).describe("Labels to apply"),
          relatedRunId: z.number().optional().describe("Related workflow run ID"),
        }),
        handler: async ({ owner, repo, title, body, labels, relatedRunId }) => {
          try {
            let fullBody = body;
            if (relatedRunId) {
              fullBody += `\n\n---\n**Related Run:** https://github.com/${owner}/${repo}/actions/runs/${relatedRunId}`;
            }
            fullBody += `\n\n_Created by SRE Agent_`;
            
            const issueNumber = await github.createIssue(owner, repo, title, fullBody, labels, []);
            return { success: true, issueNumber, url: `https://github.com/${owner}/${repo}/issues/${issueNumber}` };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
      }),

      // Get Workflow Logs Tool
      defineTool("get_workflow_logs", {
        description: `Fetch logs from failed jobs in a GitHub Actions workflow run.
Returns the last 200 lines from up to 3 failed jobs. Use to understand why a workflow failed.`,
        parameters: z.object({
          owner: z.string().describe("Repository owner"),
          repo: z.string().describe("Repository name"),
          runId: z.number().describe("Workflow run ID"),
        }),
        handler: async ({ owner, repo, runId }) => {
          try {
            const logs = await github.getFailedJobLogs(owner, repo, runId);
            return { success: true, logs };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
      }),

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
    await this.init();

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
      const session = await this.client.createSession({
        model: config.COPILOT_MODEL,
        streaming: true,
        tools: this.createTools(),
        systemMessage: {
          content: this.buildSystemMessage(repoConfig),
        },
      });

      let response = "";
      
      session.on((evt: SessionEvent) => {
        if (evt.type === "assistant.message_delta") {
          response += evt.data.deltaContent;
        }
        if (evt.type === "tool.execution_start") {
          logger.debug({ tool: evt.data.toolName }, "Tool execution started");
        }
      });

      const result = await session.sendAndWait({ prompt: contextPrompt });
      
      await session.destroy();

      const finalResponse = result?.data?.content || response;
      logger.info({ repo: repository.full_name, runId: workflow_run.id }, "Agent completed analysis");
      
      return finalResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error({ error: message, repo: repository.full_name }, "Agent failed to process event");
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

    return `You are an expert Site Reliability Engineer (SRE) agent for GitHub Actions.

## Your Role
You analyze GitHub Actions workflow failures and take appropriate actions to resolve issues or escalate them properly.

## Your Capabilities
- Retry failed workflows (when appropriate)
- Create GitHub issues for tracking problems
- Fetch and analyze workflow logs
- Check GitHub's status for outages
- Maintain notes for tracking ongoing issues

## Decision Guidelines
1. **First, check GitHub status** - If there's an outage, note it and avoid unnecessary retries
2. **Analyze logs** - Understand the root cause before taking action
3. **Check for patterns** - Use notes to track if this is a recurring issue
4. **Be conservative with retries** - Don't retry more than the configured max attempts
5. **Create issues thoughtfully** - Include relevant context, avoid duplicates
6. **Document your reasoning** - Keep notes for future reference

## Configuration Limits
- Max retry attempts: ${repoConfig.actions.retry.maxAttempts}
- Auto-retry enabled: ${repoConfig.actions.retry.enabled}
- Auto-issue creation enabled: ${repoConfig.actions.createIssue.enabled}
- Issue labels: ${repoConfig.actions.createIssue.labels.join(", ")}
${customInstructions}

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
**Run ID:** ${workflow_run.id}
**Run Number:** ${workflow_run.run_number}
**Attempt:** ${workflow_run.run_attempt}
**Branch:** ${workflow_run.head_branch || "Unknown"}
**Conclusion:** ${workflow_run.conclusion}
**Triggered by:** ${workflow_run.triggering_actor?.login || workflow_run.actor?.login || "Unknown"}
**URL:** ${workflow_run.html_url}

## Task
Analyze this workflow run and determine the appropriate action:
1. If the conclusion is "failure" or "timed_out", investigate and decide whether to retry or create an issue
2. If this appears to be a transient failure (infrastructure, flaky test, etc.), consider retrying
3. If this appears to be a legitimate code issue, create an issue with your analysis
4. Check for any existing notes about this workflow or similar failures
5. Update or create notes to track your findings

Begin your analysis.`;
  }
}
