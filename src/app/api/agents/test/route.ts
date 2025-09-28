import { NextRequest, NextResponse } from 'next/server';
import {
  initializeAgentSystem,
  getAgentRegistry,
  getAgentFactory,
  checkToolsHealth
} from '@/lib/agents';

// Initialize the agent system on first load
let systemInitialized = false;

async function ensureSystemInitialized() {
  if (!systemInitialized) {
    await initializeAgentSystem();
    systemInitialized = true;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Handle clear action without full system initialization to avoid health checks
    if (action === 'clear') {
      // Get registry directly without system initialization
      const { getAgentRegistry } = await import('@/lib/agents');
      const registry = getAgentRegistry();
      const clearedCount = registry.clearAllTestAgents();
      return NextResponse.json({
        success: true,
        message: `Cleared ${clearedCount} test agents`,
        clearedCount
      });
    }

    await ensureSystemInitialized();

    const registry = getAgentRegistry();

    const factory = getAgentFactory();

    // Get system status
    const systemStatus = registry.getSystemStatus();

    // Get health status
    const agentHealth = await registry.healthCheck();

    // Get tool health
    const toolHealth = await checkToolsHealth();

    // Get available agent templates
    const supportedTypes = factory.getSupportedTypes();
    const templates = factory.listTemplates();

    return NextResponse.json({
      success: true,
      message: 'Multi-agent system is operational',
      systemStatus: {
        initialized: systemInitialized,
        ...systemStatus
      },
      agentHealth: {
        totalAgents: Object.keys(agentHealth).length,
        healthyAgents: Object.values(agentHealth).filter(h => h.status === 'healthy').length,
        degradedAgents: Object.values(agentHealth).filter(h => h.status === 'degraded').length,
        unhealthyAgents: Object.values(agentHealth).filter(h => h.status === 'unhealthy').length,
        details: agentHealth
      },
      toolHealth: {
        totalTools: Object.keys(toolHealth).length,
        healthyTools: Object.values(toolHealth).filter(h => h.status === 'healthy').length,
        degradedTools: Object.values(toolHealth).filter(h => h.status === 'degraded').length,
        unhealthyTools: Object.values(toolHealth).filter(h => h.status === 'unhealthy').length,
        details: toolHealth
      },
      agentTemplates: {
        supportedTypes,
        templates: templates.map(template => ({
          type: template.type,
          requiredCapabilities: template.requiredCapabilities,
          supportedTags: template.supportedTags,
          metadata: template.defaultMetadata
        }))
      },
      features: {
        classification: 'Framework detection using vector similarity',
        ideation: 'Question generation and knowledge chat',
        grading: 'Compliance scoring and gap analysis',
        improvement: 'Remediation planning and recommendations'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Agent system test error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'System test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        initialized: systemInitialized
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { testType = 'quick', projectId = 'test-project' } = body;

    await ensureSystemInitialized();

    const registry = getAgentRegistry();
    const factory = getAgentFactory();

    switch (testType) {
      case 'quick':
        // Quick system test
        const quickTestResults = {
          systemInitialized: systemInitialized,
          registryOperational: registry ? true : false,
          factoryOperational: factory ? true : false,
          supportedAgentTypes: factory.getSupportedTypes(),
          timestamp: new Date().toISOString()
        };

        return NextResponse.json({
          success: true,
          testType: 'quick',
          results: quickTestResults
        });

      case 'agent_creation':
        // Test agent creation and basic functionality
        try {
          const testAgentId = await factory.createAndRegisterAgent({
            type: 'classification',
            name: 'Test Classification Agent',
            tags: ['test', projectId],
            customConfig: { projectId }
          });

          const testAgent = registry.get(testAgentId);
          const healthCheck = await registry.healthCheck(testAgentId);

          // Clean up test agent
          await registry.unregister(testAgentId);

          return NextResponse.json({
            success: true,
            testType: 'agent_creation',
            results: {
              agentCreated: true,
              agentId: testAgentId,
              agentName: testAgent?.metadata.name,
              agentStatus: testAgent?.status,
              healthStatus: healthCheck[testAgentId],
              cleanedUp: true
            }
          });

        } catch (agentError) {
          return NextResponse.json({
            success: false,
            testType: 'agent_creation',
            error: agentError instanceof Error ? agentError.message : 'Agent creation test failed'
          }, { status: 500 });
        }

      case 'full_team':
        // Test full agent team creation
        try {
          const agentIds = await factory.createProjectAgentTeam(projectId);
          const teamAgents = agentIds.map(id => registry.get(id)).filter(Boolean);
          const teamHealth = await registry.healthCheck();

          // Clean up test team
          await factory.destroyProjectAgentTeam(projectId);

          return NextResponse.json({
            success: true,
            testType: 'full_team',
            results: {
              teamCreated: true,
              agentCount: agentIds.length,
              agentTypes: teamAgents.map(agent => agent!.metadata.name),
              allAgentsHealthy: Object.values(teamHealth).every(h => h.status === 'healthy'),
              teamCleanedUp: true
            }
          });

        } catch (teamError) {
          return NextResponse.json({
            success: false,
            testType: 'full_team',
            error: teamError instanceof Error ? teamError.message : 'Team creation test failed'
          }, { status: 500 });
        }

      default:
        return NextResponse.json(
          { error: 'Invalid test type. Supported types: quick, agent_creation, full_team' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Agent system test error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Test execution failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}