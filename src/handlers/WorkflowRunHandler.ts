import { SREAgent } from "../agent/index.js";
import { GitHubService } from "../services/GitHubService.js";
import { NoteStore } from "../services/NoteStore.js";
import { createChildLogger } from "../services/logger.js";
import type { WorkflowRunEvent, RepoConfig } from "../types/index.js";

const logger = createChildLogger("WorkflowRunHandler");

export class WorkflowRunHandler {
  private agent: SREAgent;
  private github: GitHubService;
  private noteStore: NoteStore;

  constructor() {
    this.agent = new SREAgent();
    this.github = GitHubService.getInstance();
    this.noteStore = NoteStore.getInstance();
  }

  /**
   * Handle a workflow run event
   */
  async handle(event: WorkflowRunEvent): Promise<{ processed: boolean; response?: string }> {
    const { workflow_run, repository } = event;
    
    // Only process completed events
    if (event.action !== "completed") {
      logger.debug({ action: event.action }, "Ignoring non-completed event");
      return { processed: false };
    }

    // Get repository configuration
    const repoConfig = await this.github.getRepoConfig(
      repository.owner.login,
      repository.name
    );

    // Check if agent is enabled for this repo
    if (!repoConfig.enabled) {
      logger.info({ repo: repository.full_name }, "SRE agent disabled for repository");
      return { processed: false };
    }

    // Check if this workflow should be ignored
    if (this.shouldIgnore(event, repoConfig)) {
      logger.debug(
        { 
          repo: repository.full_name,
          workflow: workflow_run.name,
          conclusion: workflow_run.conclusion,
          branch: workflow_run.head_branch,
        },
        "Workflow run ignored by configuration"
      );
      return { processed: false };
    }

    // Only process failures and timeouts by default
    if (!this.shouldProcess(workflow_run.conclusion)) {
      logger.debug(
        { conclusion: workflow_run.conclusion },
        "Workflow conclusion does not require action"
      );
      return { processed: false };
    }

    // Initialize note store
    await this.noteStore.init();

    // Process with the SRE agent
    try {
      const response = await this.agent.handleWorkflowRun(event, repoConfig);
      
      logger.info(
        {
          repo: repository.full_name,
          runId: workflow_run.id,
          conclusion: workflow_run.conclusion,
        },
        "Workflow run processed successfully"
      );

      return { processed: true, response };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(
        { 
          error: message, 
          repo: repository.full_name,
          runId: workflow_run.id,
        },
        "Failed to process workflow run"
      );
      
      throw error;
    }
  }

  /**
   * Check if a workflow run should be processed
   */
  private shouldProcess(conclusion: string | null): boolean {
    const processableConclusions = ["failure", "timed_out", "startup_failure"];
    return conclusion !== null && processableConclusions.includes(conclusion);
  }

  /**
   * Check if a workflow run should be ignored based on config
   */
  private shouldIgnore(event: WorkflowRunEvent, config: RepoConfig): boolean {
    const { workflow_run } = event;

    // Check conclusion ignore list
    if (
      workflow_run.conclusion &&
      config.ignore.conclusions.includes(workflow_run.conclusion)
    ) {
      return true;
    }

    // Check branch ignore patterns
    if (workflow_run.head_branch) {
      for (const pattern of config.ignore.branches) {
        if (this.matchGlob(workflow_run.head_branch, pattern)) {
          return true;
        }
      }
    }

    // Check workflow filter (if specified, only process listed workflows)
    if (config.workflows.length > 0) {
      const workflowName = workflow_run.name?.toLowerCase() || "";
      const matchesFilter = config.workflows.some(
        w => w.toLowerCase() === workflowName
      );
      if (!matchesFilter) {
        return true;
      }
    }

    return false;
  }

  /**
   * Simple glob matching for branch patterns
   */
  private matchGlob(str: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    
    return new RegExp(`^${regexPattern}$`).test(str);
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    await this.agent.stop();
  }
}
