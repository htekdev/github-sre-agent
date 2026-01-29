import { Octokit } from "octokit";
import { config } from "../config/index.js";
import { createChildLogger } from "./logger.js";
import type { RepoConfig } from "../types/index.js";
import { repoConfigSchema } from "../types/index.js";
import YAML from "yaml";

const logger = createChildLogger("GitHubService");

export class GitHubService {
  private octokit: Octokit;
  private static instance: GitHubService;

  private constructor() {
    this.octokit = new Octokit({ auth: config.GITHUB_TOKEN });
  }

  static getInstance(): GitHubService {
    if (!GitHubService.instance) {
      GitHubService.instance = new GitHubService();
    }
    return GitHubService.instance;
  }

  /**
   * Fetch repository configuration from .github/sre-agent.yml
   */
  async getRepoConfig(owner: string, repo: string): Promise<RepoConfig> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path: ".github/sre-agent.yml",
      });

      if ("content" in data && data.type === "file") {
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        const parsed = YAML.parse(content);
        return repoConfigSchema.parse(parsed);
      }
    } catch (error: unknown) {
      if (error instanceof Error && "status" in error && error.status === 404) {
        logger.debug({ owner, repo }, "No sre-agent.yml found, using defaults");
      } else {
        logger.warn({ owner, repo, error }, "Failed to fetch repo config");
      }
    }
    
    return repoConfigSchema.parse({});
  }

  /**
   * Get workflow run details
   */
  async getWorkflowRun(owner: string, repo: string, runId: number) {
    const { data } = await this.octokit.rest.actions.getWorkflowRun({
      owner,
      repo,
      run_id: runId,
    });
    return data;
  }

  /**
   * Get workflow run logs URL
   */
  async getWorkflowRunLogsUrl(owner: string, repo: string, runId: number): Promise<string> {
    const { url } = await this.octokit.rest.actions.downloadWorkflowRunLogs({
      owner,
      repo,
      run_id: runId,
    });
    return url;
  }

  /**
   * Get failed job logs from a workflow run
   */
  async getFailedJobLogs(owner: string, repo: string, runId: number): Promise<string> {
    try {
      const { data: jobs } = await this.octokit.rest.actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: runId,
        filter: "latest",
      });

      const failedJobs = jobs.jobs.filter(job => job.conclusion === "failure");
      
      if (failedJobs.length === 0) {
        return "No failed jobs found.";
      }

      const logs: string[] = [];
      
      for (const job of failedJobs.slice(0, 3)) { // Limit to 3 jobs
        try {
          const { data: logData } = await this.octokit.rest.actions.downloadJobLogsForWorkflowRun({
            owner,
            repo,
            job_id: job.id,
          });
          
          // Get last 200 lines to keep context manageable
          const logLines = String(logData).split("\n");
          const truncatedLog = logLines.slice(-200).join("\n");
          
          logs.push(`\n=== Job: ${job.name} ===\n${truncatedLog}`);
        } catch {
          logs.push(`\n=== Job: ${job.name} ===\n[Failed to fetch logs]`);
        }
      }

      return logs.join("\n\n");
    } catch (error) {
      logger.error({ error, owner, repo, runId }, "Failed to get job logs");
      return "Failed to retrieve logs.";
    }
  }

  /**
   * Re-run a workflow
   */
  async rerunWorkflow(owner: string, repo: string, runId: number): Promise<void> {
    await this.octokit.rest.actions.reRunWorkflow({
      owner,
      repo,
      run_id: runId,
    });
    logger.info({ owner, repo, runId }, "Workflow re-run triggered");
  }

  /**
   * Re-run only failed jobs in a workflow
   */
  async rerunFailedJobs(owner: string, repo: string, runId: number): Promise<void> {
    await this.octokit.rest.actions.reRunWorkflowFailedJobs({
      owner,
      repo,
      run_id: runId,
    });
    logger.info({ owner, repo, runId }, "Failed jobs re-run triggered");
  }

  /**
   * Create an issue
   */
  async createIssue(
    owner: string,
    repo: string,
    title: string,
    body: string,
    labels: string[] = [],
    assignees: string[] = []
  ): Promise<number> {
    const { data } = await this.octokit.rest.issues.create({
      owner,
      repo,
      title,
      body,
      labels,
      assignees,
    });
    logger.info({ owner, repo, issueNumber: data.number }, "Issue created");
    return data.number;
  }

  /**
   * Search for existing issues
   */
  async searchIssues(owner: string, repo: string, query: string): Promise<Array<{ number: number; title: string; state: string }>> {
    const { data } = await this.octokit.rest.search.issuesAndPullRequests({
      q: `repo:${owner}/${repo} is:issue ${query}`,
      per_page: 10,
    });
    
    return data.items.map(item => ({
      number: item.number,
      title: item.title,
      state: item.state,
    }));
  }

  /**
   * Add a comment to an issue
   */
  async addIssueComment(owner: string, repo: string, issueNumber: number, body: string): Promise<void> {
    await this.octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
    logger.info({ owner, repo, issueNumber }, "Comment added to issue");
  }

  /**
   * Get workflow run attempts
   */
  async getWorkflowRunAttempts(owner: string, repo: string, runId: number): Promise<number> {
    const { data } = await this.octokit.rest.actions.getWorkflowRun({
      owner,
      repo,
      run_id: runId,
    });
    return data.run_attempt ?? 1;
  }
}
