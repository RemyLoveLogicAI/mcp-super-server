/**
 * @mss/voice-command - MCP Tool Router
 * Maps intents to appropriate MCP tools
 */

import {
  RoutingResultSchema,
  ToolMatchSchema,
  type RoutingResult,
  type ToolMatch,
} from "./types";
import type { VoiceCommandIntent } from "./types";

// ============================================================================
// Tool Registry
// ============================================================================

export interface ToolCapability {
  tool_id: string;
  tool_name: string;
  description: string;
  supported_actions: string[];
  supported_targets: string[];
  required_params: string[];
  optional_params: string[];
  side_effect_class: "read_only" | "idempotent_write" | "non_idempotent_write" | "destructive";
}

export class ToolRegistry {
  private tools: Map<string, ToolCapability> = new Map();

  register(tool: ToolCapability): void {
    this.tools.set(tool.tool_id, tool);
  }

  unregister(toolId: string): void {
    this.tools.delete(toolId);
  }

  get(toolId: string): ToolCapability | undefined {
    return this.tools.get(toolId);
  }

  getAll(): ToolCapability[] {
    return Array.from(this.tools.values());
  }

  findByAction(action: string): ToolCapability[] {
    return this.getAll().filter((tool) =>
      tool.supported_actions.includes(action)
    );
  }

  findByTarget(target: string): ToolCapability[] {
    const normalizedTarget = target.toLowerCase();
    return this.getAll().filter((tool) =>
      tool.supported_targets.some((t) =>
        normalizedTarget.includes(t) || t.includes(normalizedTarget)
      )
    );
  }
}

// ============================================================================
// Default Tool Mappings
// ============================================================================

const DEFAULT_TOOLS: ToolCapability[] = [
  {
    tool_id: "mss:deploy",
    tool_name: "deploy_project",
    description: "Deploy a project to the target environment",
    supported_actions: ["deploy"],
    supported_targets: ["project", "application", "service"],
    required_params: ["project_name"],
    optional_params: ["environment", "branch"],
    side_effect_class: "non_idempotent_write",
  },
  {
    tool_id: "mss:diagnose",
    tool_name: "diagnose_errors",
    description: "Diagnose errors and fetch logs",
    supported_actions: ["diagnose"],
    supported_targets: ["errors", "logs", "issues", "problems"],
    required_params: [],
    optional_params: ["scope", "time_range"],
    side_effect_class: "read_only",
  },
  {
    tool_id: "mss:fetch",
    tool_name: "fetch_resource",
    description: "Fetch resources like roadmaps, status, documentation",
    supported_actions: ["fetch"],
    supported_targets: ["roadmap", "status", "docs", "documentation", "plans"],
    required_params: ["resource"],
    optional_params: ["format"],
    side_effect_class: "read_only",
  },
  {
    tool_id: "mss:list",
    tool_name: "list_resources",
    description: "List projects, files, or other resources",
    supported_actions: ["list"],
    supported_targets: ["projects", "files", "resources", "services", "deployments"],
    required_params: [],
    optional_params: ["type", "filter"],
    side_effect_class: "read_only",
  },
  {
    tool_id: "mss:execute",
    tool_name: "execute_script",
    description: "Execute a script or command",
    supported_actions: ["execute", "run"],
    supported_targets: ["script", "command", "backup", "test", "build"],
    required_params: ["script_name"],
    optional_params: ["args", "timeout"],
    side_effect_class: "idempotent_write",
  },
  {
    tool_id: "mss:build",
    tool_name: "build_project",
    description: "Build a project",
    supported_actions: ["build"],
    supported_targets: ["project", "application", "service"],
    required_params: ["project_name"],
    optional_params: ["environment", "clean"],
    side_effect_class: "idempotent_write",
  },
  {
    tool_id: "mss:test",
    tool_name: "run_tests",
    description: "Run tests for a project",
    supported_actions: ["test"],
    supported_targets: ["project", "tests", "suite"],
    required_params: [],
    optional_params: ["project_name", "test_filter"],
    side_effect_class: "idempotent_write",
  },
  {
    tool_id: "mss:open",
    tool_name: "open_file",
    description: "Open a file in the editor",
    supported_actions: ["open"],
    supported_targets: ["file", "document", "config"],
    required_params: ["file_path"],
    optional_params: [],
    side_effect_class: "read_only",
  },
  {
    tool_id: "mss:create",
    tool_name: "create_resource",
    description: "Create a new resource",
    supported_actions: ["create"],
    supported_targets: ["project", "file", "resource", "service"],
    required_params: ["resource_type"],
    optional_params: ["name", "template"],
    side_effect_class: "non_idempotent_write",
  },
  {
    tool_id: "mss:delete",
    tool_name: "delete_resource",
    description: "Delete a resource (USE WITH CAUTION)",
    supported_actions: ["delete"],
    supported_targets: ["file", "project", "resource", "service", "deployment"],
    required_params: ["resource_path"],
    optional_params: ["force"],
    side_effect_class: "destructive",
  },
  {
    tool_id: "mss:stop",
    tool_name: "stop_service",
    description: "Stop a running service or process",
    supported_actions: ["stop"],
    supported_targets: ["service", "server", "process", "deployment"],
    required_params: ["service_name"],
    optional_params: [],
    side_effect_class: "non_idempotent_write",
  },
  {
    tool_id: "mss:start",
    tool_name: "start_service",
    description: "Start a service or process",
    supported_actions: ["start"],
    supported_targets: ["service", "server", "process", "deployment"],
    required_params: ["service_name"],
    optional_params: [],
    side_effect_class: "non_idempotent_write",
  },
  {
    tool_id: "mss:restart",
    tool_name: "restart_service",
    description: "Restart a service or process",
    supported_actions: ["restart"],
    supported_targets: ["service", "server", "process", "deployment"],
    required_params: ["service_name"],
    optional_params: [],
    side_effect_class: "non_idempotent_write",
  },
  {
    tool_id: "mss:help",
    tool_name: "show_help",
    description: "Show available commands and help",
    supported_actions: ["help"],
    supported_targets: [],
    required_params: [],
    optional_params: ["topic"],
    side_effect_class: "read_only",
  },
  {
    tool_id: "mss:status",
    tool_name: "show_status",
    description: "Show system or project status",
    supported_actions: ["status"],
    supported_targets: [],
    required_params: [],
    optional_params: ["detail"],
    side_effect_class: "read_only",
  },
];

// ============================================================================
// MCP Tool Router
// ============================================================================

export class MCPToolRouter {
  private registry: ToolRegistry;
  private defaultTools: ToolCapability[];

  constructor(registry?: ToolRegistry) {
    this.registry = registry ?? new ToolRegistry();
    this.defaultTools = DEFAULT_TOOLS;
  }

  /**
   * Initialize the router with default tools
   */
  initialize(): void {
    for (const tool of this.defaultTools) {
      this.registry.register(tool);
    }
  }

  /**
   * Register a custom tool
   */
  registerTool(tool: ToolCapability): void {
    this.registry.register(tool);
  }

  /**
   * Route an intent to appropriate tools
   */
  route(intent: VoiceCommandIntent): RoutingResult {
    // Find tools that support this action
    const actionMatches = this.registry.findByAction(intent.action);

    if (actionMatches.length === 0) {
      return RoutingResultSchema.parse({
        success: false,
        matches: [],
        error: `No tools found for action: ${intent.action}`,
      });
    }

    // Score and rank matches
    const scoredMatches = actionMatches.map((tool) => ({
      tool,
      score: this.calculateMatchScore(tool, intent),
    }));

    // Sort by score descending
    scoredMatches.sort((a, b) => b.score - a.score);

    // Build matches array
    const matches: ToolMatch[] = scoredMatches
      .filter((m) => m.score > 0.3) // Only include reasonable matches
      .map((m) => ToolMatchSchema.parse({
        tool_id: m.tool.tool_id,
        tool_name: m.tool.tool_name,
        capability_score: m.score,
        parameters: this.extractParameters(m.tool, intent),
      }));

    if (matches.length === 0) {
      return RoutingResultSchema.parse({
        success: false,
        matches: [],
        error: `No suitable tools found for: ${intent.action} ${intent.target || ""}`,
      });
    }

    // Check if top match requires approval
    const topMatch = scoredMatches[0];
    const requiresApproval = topMatch ? this.requiresApproval(topMatch.tool) : false;

    return RoutingResultSchema.parse({
      success: true,
      matches,
      requires_approval: requiresApproval,
    });
  }

  /**
   * Calculate match score between tool and intent
   */
  private calculateMatchScore(
    tool: ToolCapability,
    intent: VoiceCommandIntent
  ): number {
    let score = 0.5; // Base score for action match

    // Boost for target match
    if (intent.target) {
      const normalizedTarget = intent.target.toLowerCase();
      const targetMatch = tool.supported_targets.some(
        (t) => normalizedTarget.includes(t) || t.includes(normalizedTarget)
      );
      if (targetMatch) {
        score += 0.3;
      }
    }

    // Boost for resource match
    if (intent.resource) {
      const normalizedResource = intent.resource.toLowerCase();
      const resourceMatch = tool.supported_targets.some(
        (t) => normalizedResource.includes(t) || t.includes(normalizedResource)
      );
      if (resourceMatch) {
        score += 0.3;
      }
    }

    // Boost for exact action match
    if (tool.supported_actions.includes(intent.action)) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Extract parameters for the tool from intent
   */
  private extractParameters(
    tool: ToolCapability,
    intent: VoiceCommandIntent
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    // Map intent properties to tool parameters
    if (intent.target && (tool.required_params.includes("target") || tool.optional_params.includes("target"))) {
      params.target = intent.target;
    }

    if (intent.resource && (tool.required_params.includes("resource") || tool.optional_params.includes("resource"))) {
      params.resource = intent.resource;
    }

    if (intent.action && (tool.required_params.includes("action") || tool.optional_params.includes("action"))) {
      params.action = intent.action;
    }

    // Handle specific parameter mappings
    if (intent.target) {
      if (tool.required_params.includes("project_name") || tool.optional_params.includes("project_name")) {
        params.project_name = intent.target;
      }
      if (tool.required_params.includes("script_name") || tool.optional_params.includes("script_name")) {
        params.script_name = intent.target;
      }
      if (tool.required_params.includes("service_name") || tool.optional_params.includes("service_name")) {
        params.service_name = intent.target;
      }
      if (tool.required_params.includes("file_path") || tool.optional_params.includes("file_path")) {
        params.file_path = intent.target;
      }
      if (tool.required_params.includes("resource_path") || tool.optional_params.includes("resource_path")) {
        params.resource_path = intent.target;
      }
      if (tool.required_params.includes("resource_type") || tool.optional_params.includes("resource_type")) {
        params.resource_type = intent.target;
      }
    }

    if (intent.scope && (tool.required_params.includes("scope") || tool.optional_params.includes("scope"))) {
      params.scope = intent.scope;
    }

    if (intent.modifiers) {
      params.modifiers = intent.modifiers;
    }

    return params;
  }

  /**
   * Check if a tool requires human approval
   */
  private requiresApproval(tool: ToolCapability): boolean {
    return (
      tool.side_effect_class === "destructive" ||
      tool.side_effect_class === "non_idempotent_write"
    );
  }

  /**
   * Chain multiple tools for complex commands
   */
  chainTools(intents: VoiceCommandIntent[]): RoutingResult {
    const allMatches: ToolMatch[] = [];

    for (const intent of intents) {
      const result = this.route(intent);
      if (result.success) {
        allMatches.push(...result.matches);
      } else {
        return RoutingResultSchema.parse({
          success: false,
          matches: allMatches,
          error: `Failed to route intent in chain: ${intent.action}`,
        });
      }
    }

    return RoutingResultSchema.parse({
      success: true,
      matches: allMatches,
    });
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createMCPToolRouter(registry?: ToolRegistry): MCPToolRouter {
  const router = new MCPToolRouter(registry);
  router.initialize();
  return router;
}
