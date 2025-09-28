import { BaseAgent } from '../base/base-agent';
import { AgentMetadata, AgentHealth } from '../base/types';
import PQueue from 'p-queue';

export interface AgentInstance {
  agent: BaseAgent;
  metadata: AgentMetadata;
  status: 'initializing' | 'ready' | 'busy' | 'error' | 'stopped';
  lastHealthCheck: Date;
  healthStatus: AgentHealth | null;
  createdAt: Date;
  usageStats: {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
    lastExecution?: Date;
  };
}

export interface AgentDiscoveryQuery {
  capabilities?: string[];
  tags?: string[];
  status?: AgentInstance['status'][];
  minConfidence?: number;
}

export class AgentRegistry {
  private agents = new Map<string, AgentInstance>();
  private queue = new PQueue({ concurrency: 10 });
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private healthCheckIntervalMs = 60000; // 1 minute

  constructor() {
    // Clear any test agents from previous sessions
    this.clearTestAgents();
    this.startHealthChecking();
  }

  private clearTestAgents(): void {
    // Remove agents with test- prefixed project IDs that are more than 1 hour old
    const oneHourAgo = Date.now() - (60 * 60 * 1000);

    for (const [agentId, instance] of this.agents.entries()) {
      const isTestAgent = agentId.includes('test-') ||
                         agentId.includes('sample-') ||
                         agentId.includes('debug-') ||
                         agentId.includes('frontend-');

      if (isTestAgent && instance.registeredAt.getTime() < oneHourAgo) {
        this.agents.delete(agentId);
        console.log(`Cleared old test agent: ${agentId}`);
      }
    }
  }

  async register(agent: BaseAgent): Promise<void> {
    const agentId = agent.metadata.id;

    if (this.agents.has(agentId)) {
      throw new Error(`Agent with ID ${agentId} is already registered`);
    }

    const instance: AgentInstance = {
      agent,
      metadata: agent.metadata,
      status: 'initializing',
      lastHealthCheck: new Date(),
      healthStatus: null,
      createdAt: new Date(),
      usageStats: {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0
      }
    };

    this.agents.set(agentId, instance);

    try {
      await agent.initialize();
      instance.status = 'ready';
      console.log(`Agent ${agentId} registered and initialized successfully`);
    } catch (error) {
      instance.status = 'error';
      console.error(`Failed to initialize agent ${agentId}:`, error);
      throw error;
    }
  }

  async unregister(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Agent ${agentId} not found`);
    }

    instance.status = 'stopped';
    this.agents.delete(agentId);
    console.log(`Agent ${agentId} unregistered`);
  }

  get(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  list(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  listByStatus(status: AgentInstance['status']): AgentInstance[] {
    return this.list().filter(instance => instance.status === status);
  }

  discover(query: AgentDiscoveryQuery): AgentInstance[] {
    let instances = this.list();

    // Filter by status
    if (query.status && query.status.length > 0) {
      instances = instances.filter(instance => query.status!.includes(instance.status));
    }

    // Filter by capabilities
    if (query.capabilities && query.capabilities.length > 0) {
      instances = instances.filter(instance =>
        query.capabilities!.some(capability =>
          instance.metadata.capabilities.some(cap => cap.name === capability)
        )
      );
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      instances = instances.filter(instance =>
        query.tags!.some(tag => instance.metadata.tags.includes(tag))
      );
    }

    // Sort by health and usage statistics
    return instances.sort((a, b) => {
      // Prioritize healthy agents
      if (a.status === 'ready' && b.status !== 'ready') return -1;
      if (b.status === 'ready' && a.status !== 'ready') return 1;

      // Then by success rate
      const aSuccessRate = a.usageStats.totalExecutions > 0 ?
        a.usageStats.successfulExecutions / a.usageStats.totalExecutions : 0;
      const bSuccessRate = b.usageStats.totalExecutions > 0 ?
        b.usageStats.successfulExecutions / b.usageStats.totalExecutions : 0;

      return bSuccessRate - aSuccessRate;
    });
  }

  async executeAgent<TInput, TOutput>(
    agentId: string,
    input: TInput,
    context: any
  ): Promise<TOutput> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (instance.status !== 'ready') {
      throw new Error(`Agent ${agentId} is not ready (status: ${instance.status})`);
    }

    return this.queue.add(async () => {
      const startTime = Date.now();
      instance.status = 'busy';

      try {
        const result = await instance.agent.execute({ data: input, context });
        const executionTime = Date.now() - startTime;

        // Update usage statistics
        this.updateUsageStats(instance, executionTime, true);
        instance.status = 'ready';

        return result.data;
      } catch (error) {
        const executionTime = Date.now() - startTime;
        this.updateUsageStats(instance, executionTime, false);
        instance.status = 'ready';
        throw error;
      }
    });
  }

  async healthCheck(agentId?: string): Promise<Record<string, AgentHealth>> {
    const instancesToCheck = agentId ?
      [this.agents.get(agentId)].filter(Boolean) :
      this.list();

    const results: Record<string, AgentHealth> = {};

    await Promise.all(
      instancesToCheck.map(async (instance) => {
        if (!instance) return;

        try {
          const health = await instance.agent.healthCheck();
          instance.healthStatus = health;
          instance.lastHealthCheck = new Date();
          results[instance.metadata.id] = health;
        } catch (error) {
          const errorHealth: AgentHealth = {
            status: 'unhealthy',
            lastCheck: new Date(),
            issues: [error instanceof Error ? error.message : 'Health check failed'],
            uptime: 0,
            toolsAvailable: [],
            toolsUnavailable: []
          };
          instance.healthStatus = errorHealth;
          instance.lastHealthCheck = new Date();
          results[instance.metadata.id] = errorHealth;
        }
      })
    );

    return results;
  }

  getSystemStatus(): {
    totalAgents: number;
    readyAgents: number;
    busyAgents: number;
    errorAgents: number;
    averageExecutionTime: number;
    totalExecutions: number;
    successRate: number;
  } {
    const instances = this.list();
    const readyAgents = instances.filter(i => i.status === 'ready').length;
    const busyAgents = instances.filter(i => i.status === 'busy').length;
    const errorAgents = instances.filter(i => i.status === 'error').length;

    const totalExecutions = instances.reduce((sum, i) => sum + i.usageStats.totalExecutions, 0);
    const successfulExecutions = instances.reduce((sum, i) => sum + i.usageStats.successfulExecutions, 0);
    const totalExecutionTime = instances.reduce((sum, i) =>
      sum + (i.usageStats.averageExecutionTime * i.usageStats.totalExecutions), 0);

    return {
      totalAgents: instances.length,
      readyAgents,
      busyAgents,
      errorAgents,
      averageExecutionTime: totalExecutions > 0 ? totalExecutionTime / totalExecutions : 0,
      totalExecutions,
      successRate: totalExecutions > 0 ? successfulExecutions / totalExecutions : 0
    };
  }

  private updateUsageStats(instance: AgentInstance, executionTime: number, success: boolean): void {
    const stats = instance.usageStats;
    stats.totalExecutions++;
    if (success) {
      stats.successfulExecutions++;
    } else {
      stats.failedExecutions++;
    }

    // Calculate running average execution time
    const totalTime = stats.averageExecutionTime * (stats.totalExecutions - 1) + executionTime;
    stats.averageExecutionTime = totalTime / stats.totalExecutions;
    stats.lastExecution = new Date();
  }

  private startHealthChecking(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.healthCheck();
      } catch (error) {
        console.error('Health check failed:', error);
      }
    }, this.healthCheckIntervalMs);
  }

  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Stop all agents
    for (const [agentId] of this.agents) {
      await this.unregister(agentId);
    }

    console.log('Agent registry shut down');
  }

  // Agent lifecycle management
  async restartAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Agent ${agentId} not found`);
    }

    instance.status = 'initializing';
    try {
      await instance.agent.initialize();
      instance.status = 'ready';
      console.log(`Agent ${agentId} restarted successfully`);
    } catch (error) {
      instance.status = 'error';
      console.error(`Failed to restart agent ${agentId}:`, error);
      throw error;
    }
  }

  async pauseAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (instance.status === 'busy') {
      throw new Error(`Cannot pause agent ${agentId} while busy`);
    }

    instance.status = 'stopped';
    console.log(`Agent ${agentId} paused`);
  }

  async resumeAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (instance.status === 'stopped') {
      instance.status = 'ready';
      console.log(`Agent ${agentId} resumed`);
    }
  }

  // Public method to clear all test agents immediately
  clearAllTestAgents(): number {
    let clearedCount = 0;
    const agentsToRemove: string[] = [];

    for (const [agentId, instance] of this.agents.entries()) {
      const isTestAgent = agentId.includes('test-') ||
                         agentId.includes('sample-') ||
                         agentId.includes('debug-') ||
                         agentId.includes('frontend-');

      if (isTestAgent) {
        agentsToRemove.push(agentId);
      }
    }

    for (const agentId of agentsToRemove) {
      this.agents.delete(agentId);
      clearedCount++;
      console.log(`Cleared test agent: ${agentId}`);
    }

    return clearedCount;
  }
}

// Singleton instance
let agentRegistryInstance: AgentRegistry | null = null;

export function getAgentRegistry(): AgentRegistry {
  if (!agentRegistryInstance) {
    agentRegistryInstance = new AgentRegistry();
  }
  return agentRegistryInstance;
}