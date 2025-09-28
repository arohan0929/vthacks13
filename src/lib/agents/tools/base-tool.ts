import { Tool } from '@langchain/core/tools';
import { z } from 'zod';

export abstract class BaseTool extends Tool {
  public readonly category: string;
  public readonly version: string;
  public readonly dependencies: string[];

  constructor({
    name,
    description,
    schema,
    category,
    version = '1.0.0',
    dependencies = []
  }: {
    name: string;
    description: string;
    schema: z.ZodSchema;
    category: string;
    version?: string;
    dependencies?: string[];
  }) {
    super();
    this.name = name;
    this.description = description;
    this.schema = schema;
    this.category = category;
    this.version = version;
    this.dependencies = dependencies;
  }

  protected abstract _call(arg: any): Promise<string>;

  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    issues: string[];
  }> {
    try {
      // Basic health check - can be overridden by specific tools
      return {
        status: 'healthy',
        issues: []
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        issues: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }
}

export interface ToolRegistry {
  register(tool: BaseTool): void;
  unregister(name: string): void;
  get(name: string): BaseTool | undefined;
  getByCategory(category: string): BaseTool[];
  list(): BaseTool[];
  healthCheck(): Promise<Record<string, { status: string; issues: string[] }>>;
}

export class DefaultToolRegistry implements ToolRegistry {
  private tools = new Map<string, BaseTool>();

  register(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  getByCategory(category: string): BaseTool[] {
    return Array.from(this.tools.values()).filter(tool => tool.category === category);
  }

  list(): BaseTool[] {
    return Array.from(this.tools.values());
  }

  async healthCheck(): Promise<Record<string, { status: string; issues: string[] }>> {
    const results: Record<string, { status: string; issues: string[] }> = {};

    for (const [name, tool] of this.tools) {
      try {
        results[name] = await tool.healthCheck();
      } catch (error) {
        results[name] = {
          status: 'unhealthy',
          issues: [error instanceof Error ? error.message : 'Health check failed']
        };
      }
    }

    return results;
  }
}

// Singleton tool registry
let toolRegistryInstance: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!toolRegistryInstance) {
    toolRegistryInstance = new DefaultToolRegistry();
  }
  return toolRegistryInstance;
}