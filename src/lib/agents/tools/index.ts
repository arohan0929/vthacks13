export { BaseTool, DefaultToolRegistry, getToolRegistry } from './base-tool';
export { VectorRetrievalTool } from './vector-retrieval-tool';
export { WebSearchTool } from './web-search-tool';
export { DocumentAnalysisTool } from './document-analysis-tool';
export { InterAgentCommunicationTool, getCommunicationService } from './communication-tool';

import { BaseTool, getToolRegistry } from './base-tool';
import { VectorRetrievalTool } from './vector-retrieval-tool';
import { WebSearchTool } from './web-search-tool';
import { DocumentAnalysisTool } from './document-analysis-tool';
import { InterAgentCommunicationTool } from './communication-tool';

/**
 * Initialize and register all available tools for agents
 */
export function initializeToolRegistry(): void {
  const registry = getToolRegistry();

  // Register core tools
  registry.register(new VectorRetrievalTool());
  registry.register(new WebSearchTool());
  registry.register(new DocumentAnalysisTool());

  console.log('Tool registry initialized with core tools');
}

/**
 * Get tools for a specific agent by providing an agent ID
 * This allows for agent-specific tool instances (like communication tools)
 */
export function getAgentTools(agentId: string): BaseTool[] {
  const registry = getToolRegistry();
  const tools = registry.list();

  // Add agent-specific communication tool
  const communicationTool = new InterAgentCommunicationTool(agentId);
  registry.register(communicationTool);

  return [...tools, communicationTool];
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: string): BaseTool[] {
  const registry = getToolRegistry();
  return registry.getByCategory(category);
}

/**
 * Check health of all tools
 */
export async function checkToolsHealth(): Promise<Record<string, { status: string; issues: string[] }>> {
  const registry = getToolRegistry();
  return await registry.healthCheck();
}

// Tool categories
export const TOOL_CATEGORIES = {
  RETRIEVAL: 'retrieval',
  SEARCH: 'search',
  ANALYSIS: 'analysis',
  COMMUNICATION: 'communication',
  PROCESSING: 'processing'
} as const;