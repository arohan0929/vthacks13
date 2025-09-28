import { BaseAgent } from '../base/base-agent';
import { AgentMetadata } from '../base/types';
import { getAgentRegistry } from './agent-registry';
import { initializeToolRegistry } from '../tools';

export interface AgentConfig {
  type: string;
  name?: string;
  description?: string;
  tags?: string[];
  capabilities?: string[];
  customConfig?: Record<string, any>;
}

export interface AgentTemplate {
  type: string;
  defaultMetadata: Partial<AgentMetadata>;
  factory: (config: AgentConfig) => Promise<BaseAgent>;
  requiredCapabilities: string[];
  supportedTags: string[];
}

export class AgentFactory {
  private templates = new Map<string, AgentTemplate>();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize tool registry first
    initializeToolRegistry();

    // Register agent templates - we'll add these as we create the specific agents
    console.log('Agent factory initialized');
    this.initialized = true;
  }

  registerTemplate(template: AgentTemplate): void {
    this.templates.set(template.type, template);
    console.log(`Registered agent template: ${template.type}`);
  }

  async createAgent(config: AgentConfig): Promise<BaseAgent> {
    await this.ensureInitialized();

    const template = this.templates.get(config.type);
    if (!template) {
      throw new Error(`Unknown agent type: ${config.type}`);
    }

    // Validate required capabilities
    const missingCapabilities = template.requiredCapabilities.filter(
      capability => !config.capabilities?.includes(capability)
    );

    if (missingCapabilities.length > 0 && config.capabilities) {
      console.warn(`Agent ${config.type} missing capabilities: ${missingCapabilities.join(', ')}`);
    }

    try {
      const agent = await template.factory(config);
      console.log(`Created agent: ${agent.metadata.id} (${config.type})`);
      return agent;
    } catch (error) {
      console.error(`Failed to create agent ${config.type}:`, error);
      throw error;
    }
  }

  async createAndRegisterAgent(config: AgentConfig): Promise<string> {
    const agent = await this.createAgent(config);
    const registry = getAgentRegistry();
    await registry.register(agent);
    return agent.metadata.id;
  }

  listTemplates(): AgentTemplate[] {
    return Array.from(this.templates.values());
  }

  getTemplate(type: string): AgentTemplate | undefined {
    return this.templates.get(type);
  }

  getSupportedTypes(): string[] {
    return Array.from(this.templates.keys());
  }

  validateConfig(config: AgentConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.type) {
      errors.push('Agent type is required');
    }

    if (config.type && !this.templates.has(config.type)) {
      errors.push(`Unknown agent type: ${config.type}`);
    }

    if (config.capabilities) {
      const template = this.templates.get(config.type);
      if (template) {
        const unsupportedCapabilities = config.capabilities.filter(
          cap => !template.requiredCapabilities.includes(cap)
        );
        if (unsupportedCapabilities.length > 0) {
          errors.push(`Unsupported capabilities: ${unsupportedCapabilities.join(', ')}`);
        }
      }
    }

    if (config.tags) {
      const template = this.templates.get(config.type);
      if (template) {
        const unsupportedTags = config.tags.filter(
          tag => !template.supportedTags.includes(tag)
        );
        if (unsupportedTags.length > 0) {
          errors.push(`Unsupported tags: ${unsupportedTags.join(', ')}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Utility methods for creating common agent configurations
  createClassificationAgentConfig(projectId: string): AgentConfig {
    return {
      type: 'classification',
      name: `Classification Agent - ${projectId}`,
      description: 'Determines applicable compliance frameworks using vector similarity',
      tags: ['classification', 'compliance', 'framework-detection'],
      capabilities: ['vector_search', 'framework_analysis', 'confidence_scoring'],
      customConfig: { projectId }
    };
  }

  createIdeationAgentConfig(projectId: string): AgentConfig {
    return {
      type: 'ideation',
      name: `Ideation Agent - ${projectId}`,
      description: 'Generates clarifying questions and provides knowledge chat',
      tags: ['ideation', 'questions', 'knowledge', 'interactive'],
      capabilities: ['question_generation', 'knowledge_retrieval', 'conversation'],
      customConfig: { projectId }
    };
  }

  createGraderAgentConfig(projectId: string): AgentConfig {
    return {
      type: 'grader',
      name: `Grader Agent - ${projectId}`,
      description: 'Analyzes compliance gaps and assigns scores',
      tags: ['grading', 'compliance', 'scoring', 'analysis'],
      capabilities: ['compliance_analysis', 'gap_detection', 'scoring'],
      customConfig: { projectId }
    };
  }

  createImprovementAgentConfig(projectId: string): AgentConfig {
    return {
      type: 'improvement',
      name: `Improvement Agent - ${projectId}`,
      description: 'Generates actionable improvement recommendations',
      tags: ['improvement', 'recommendations', 'remediation'],
      capabilities: ['remediation_planning', 'best_practices', 'prioritization'],
      customConfig: { projectId }
    };
  }

  // Batch creation for project-specific agent teams
  async createProjectAgentTeam(projectId: string): Promise<string[]> {
    const configs = [
      this.createClassificationAgentConfig(projectId),
      this.createIdeationAgentConfig(projectId),
      this.createGraderAgentConfig(projectId),
      this.createImprovementAgentConfig(projectId)
    ];

    const agentIds: string[] = [];

    for (const config of configs) {
      try {
        const agentId = await this.createAndRegisterAgent(config);
        agentIds.push(agentId);
      } catch (error) {
        console.error(`Failed to create agent ${config.type} for project ${projectId}:`, error);
        // Continue with other agents even if one fails
      }
    }

    console.log(`Created agent team for project ${projectId}: ${agentIds.length} agents`);
    return agentIds;
  }

  async destroyProjectAgentTeam(projectId: string): Promise<void> {
    const registry = getAgentRegistry();
    const agents = registry.list();

    // Find agents associated with this project
    const projectAgents = agents.filter(instance =>
      instance.metadata.tags.includes(projectId) ||
      instance.metadata.description.includes(projectId)
    );

    for (const instance of projectAgents) {
      try {
        await registry.unregister(instance.metadata.id);
        console.log(`Removed agent ${instance.metadata.id} for project ${projectId}`);
      } catch (error) {
        console.error(`Failed to remove agent ${instance.metadata.id}:`, error);
      }
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Singleton instance
let agentFactoryInstance: AgentFactory | null = null;

export function getAgentFactory(): AgentFactory {
  if (!agentFactoryInstance) {
    agentFactoryInstance = new AgentFactory();
  }
  return agentFactoryInstance;
}