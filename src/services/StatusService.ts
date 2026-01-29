import { createChildLogger } from "./logger.js";
import type { GitHubStatus, GitHubStatusComponent, GitHubStatusIncident } from "../types/index.js";

const logger = createChildLogger("StatusService");

const GITHUB_STATUS_API = "https://www.githubstatus.com/api/v2";

export class StatusService {
  private static instance: StatusService;
  private cachedStatus: GitHubStatus | null = null;
  private lastFetch: number = 0;
  private readonly cacheTTL = 60_000; // 1 minute cache

  private constructor() {}

  static getInstance(): StatusService {
    if (!StatusService.instance) {
      StatusService.instance = new StatusService();
    }
    return StatusService.instance;
  }

  /**
   * Get current GitHub status
   */
  async getStatus(): Promise<GitHubStatus> {
    const now = Date.now();
    
    if (this.cachedStatus && now - this.lastFetch < this.cacheTTL) {
      return this.cachedStatus;
    }

    try {
      const [summaryRes, componentsRes, incidentsRes] = await Promise.all([
        fetch(`${GITHUB_STATUS_API}/status.json`),
        fetch(`${GITHUB_STATUS_API}/components.json`),
        fetch(`${GITHUB_STATUS_API}/incidents/unresolved.json`),
      ]);

      const summary = await summaryRes.json() as { status: { indicator: string; description: string } };
      const componentsData = await componentsRes.json() as { components: GitHubStatusComponent[] };
      const incidentsData = await incidentsRes.json() as { incidents: GitHubStatusIncident[] };

      this.cachedStatus = {
        status: {
          indicator: summary.status.indicator as GitHubStatus["status"]["indicator"],
          description: summary.status.description,
        },
        components: componentsData.components,
        incidents: incidentsData.incidents,
      };
      
      this.lastFetch = now;
      logger.debug({ status: this.cachedStatus.status }, "GitHub status fetched");
      
      return this.cachedStatus;
    } catch (error) {
      logger.error({ error }, "Failed to fetch GitHub status");
      
      // Return a default status if fetch fails
      return {
        status: { indicator: "none", description: "Unable to fetch status" },
        components: [],
        incidents: [],
      };
    }
  }

  /**
   * Check if GitHub Actions is experiencing issues
   */
  async isActionsHealthy(): Promise<{ healthy: boolean; details: string }> {
    const status = await this.getStatus();
    
    const actionsComponent = status.components.find(
      c => c.name.toLowerCase().includes("actions")
    );

    if (!actionsComponent) {
      return { healthy: true, details: "GitHub Actions status unknown" };
    }

    const healthy = actionsComponent.status === "operational";
    const details = healthy
      ? "GitHub Actions is operational"
      : `GitHub Actions status: ${actionsComponent.status}`;

    return { healthy, details };
  }

  /**
   * Get relevant incidents for debugging
   */
  async getRelevantIncidents(): Promise<string> {
    const status = await this.getStatus();
    
    if (status.incidents.length === 0) {
      return "No ongoing GitHub incidents.";
    }

    const incidentSummaries = status.incidents.map(incident => 
      `- [${incident.impact.toUpperCase()}] ${incident.name} (${incident.status})\n  Link: ${incident.shortlink}`
    );

    return `Current GitHub Incidents:\n${incidentSummaries.join("\n")}`;
  }

  /**
   * Get a summary suitable for the AI agent
   */
  async getStatusSummary(): Promise<string> {
    const status = await this.getStatus();
    const actionsHealth = await this.isActionsHealthy();
    
    const lines = [
      `## GitHub Status Summary`,
      `Overall: ${status.status.description}`,
      `Actions: ${actionsHealth.details}`,
    ];

    if (status.incidents.length > 0) {
      lines.push(`\n### Active Incidents (${status.incidents.length})`);
      for (const incident of status.incidents) {
        lines.push(`- **${incident.name}** [${incident.impact}]: ${incident.status}`);
      }
    }

    const degradedComponents = status.components.filter(
      c => c.status !== "operational"
    );

    if (degradedComponents.length > 0) {
      lines.push(`\n### Degraded Components`);
      for (const comp of degradedComponents) {
        lines.push(`- ${comp.name}: ${comp.status}`);
      }
    }

    return lines.join("\n");
  }
}
