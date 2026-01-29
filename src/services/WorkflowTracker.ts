import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { createChildLogger } from "./logger.js";

const logger = createChildLogger("WorkflowTracker");

const DATA_DIR = path.join(process.cwd(), "data");
const TRACKER_FILE = path.join(DATA_DIR, "tracked-workflows.json");

export interface TrackedWorkflow {
  /** Unique key: {owner}/{repo}/{workflow_id} */
  key: string;
  owner: string;
  repo: string;
  workflowId: number;
  workflowName: string;
  /** The GitHub issue number created for this workflow failure */
  issueNumber: number;
  /** The run ID that caused the issue to be created */
  failedRunId: number;
  /** When we started tracking this workflow */
  createdAt: string;
}

export class WorkflowTracker {
  private static instance: WorkflowTracker;
  private tracked: Map<string, TrackedWorkflow> = new Map();
  private initialized = false;

  private constructor() {}

  static getInstance(): WorkflowTracker {
    if (!WorkflowTracker.instance) {
      WorkflowTracker.instance = new WorkflowTracker();
    }
    return WorkflowTracker.instance;
  }

  /**
   * Initialize the tracker
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      if (!existsSync(DATA_DIR)) {
        await mkdir(DATA_DIR, { recursive: true });
      }

      if (existsSync(TRACKER_FILE)) {
        const data = await readFile(TRACKER_FILE, "utf-8");
        const parsed = JSON.parse(data) as TrackedWorkflow[];
        for (const item of parsed) {
          this.tracked.set(item.key, item);
        }
        logger.info({ count: this.tracked.size }, "Tracked workflows loaded from disk");
      }

      this.initialized = true;
    } catch (error) {
      logger.error({ error }, "Failed to initialize workflow tracker");
      this.initialized = true; // Continue with empty store
    }
  }

  /**
   * Save tracked workflows to disk
   */
  private async persist(): Promise<void> {
    try {
      const data = JSON.stringify(Array.from(this.tracked.values()), null, 2);
      await writeFile(TRACKER_FILE, data, "utf-8");
    } catch (error) {
      logger.error({ error }, "Failed to persist tracked workflows");
    }
  }

  /**
   * Generate a unique key for a workflow
   */
  private makeKey(owner: string, repo: string, workflowId: number): string {
    return `${owner}/${repo}/${workflowId}`;
  }

  /**
   * Track a workflow that has an open issue
   */
  async track(params: {
    owner: string;
    repo: string;
    workflowId: number;
    workflowName: string;
    issueNumber: number;
    failedRunId: number;
  }): Promise<TrackedWorkflow> {
    await this.init();

    const key = this.makeKey(params.owner, params.repo, params.workflowId);
    const tracked: TrackedWorkflow = {
      key,
      owner: params.owner,
      repo: params.repo,
      workflowId: params.workflowId,
      workflowName: params.workflowName,
      issueNumber: params.issueNumber,
      failedRunId: params.failedRunId,
      createdAt: new Date().toISOString(),
    };

    this.tracked.set(key, tracked);
    await this.persist();

    logger.info({ key, issueNumber: params.issueNumber }, "Now tracking workflow");
    return tracked;
  }

  /**
   * Check if a workflow is being tracked
   */
  async get(owner: string, repo: string, workflowId: number): Promise<TrackedWorkflow | null> {
    await this.init();
    const key = this.makeKey(owner, repo, workflowId);
    return this.tracked.get(key) || null;
  }

  /**
   * Stop tracking a workflow (after issue is closed)
   */
  async untrack(owner: string, repo: string, workflowId: number): Promise<boolean> {
    await this.init();
    const key = this.makeKey(owner, repo, workflowId);
    const deleted = this.tracked.delete(key);
    if (deleted) {
      await this.persist();
      logger.info({ key }, "Stopped tracking workflow");
    }
    return deleted;
  }

  /**
   * Get all tracked workflows for a repo
   */
  async getForRepo(owner: string, repo: string): Promise<TrackedWorkflow[]> {
    await this.init();
    const prefix = `${owner}/${repo}/`;
    return Array.from(this.tracked.values()).filter(t => t.key.startsWith(prefix));
  }

  /**
   * Get all tracked workflows
   */
  async getAll(): Promise<TrackedWorkflow[]> {
    await this.init();
    return Array.from(this.tracked.values());
  }
}
