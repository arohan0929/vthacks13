import { NextRequest, NextResponse } from 'next/server';
import {
  initializeAgentSystem,
  getAgentRegistry,
  IdeationInput
} from '@/lib/agents';

// Initialize the agent system on first load
let systemInitialized = false;

async function ensureSystemInitialized() {
  if (!systemInitialized) {
    await initializeAgentSystem();
    systemInitialized = true;
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureSystemInitialized();

    const body = await request.json();
    const {
      projectId,
      userQuery,
      conversationHistory = [],
      context = {}
    } = body;

    if (!projectId || !userQuery) {
      return NextResponse.json(
        { error: 'Project ID and user query are required' },
        { status: 400 }
      );
    }

    const registry = getAgentRegistry();

    // Find the ideation agent for this project
    const projectAgents = registry.discover({
      tags: [projectId],
      capabilities: ['knowledge_chat']
    });

    const ideationAgent = projectAgents.find(agent =>
      agent.metadata.id.includes('ideation')
    );

    if (!ideationAgent) {
      return NextResponse.json(
        { error: 'Ideation agent not found for this project' },
        { status: 404 }
      );
    }

    // Create chat context
    const chatContext = {
      projectId,
      userId: 'user-1', // Would come from auth in production
      sessionId: context.sessionId || `session-${Date.now()}`,
      conversationHistory: conversationHistory || [],
      sharedState: context.sharedState || {},
      preferences: context.preferences || {}
    };

    // Prepare ideation input for chat mode
    const ideationInput: IdeationInput = {
      mode: 'chat',
      context: {
        projectDescription: context.projectDescription || '',
        detectedFrameworks: context.detectedFrameworks || [],
        complianceGaps: context.complianceGaps || [],
        userQuery
      },
      conversationHistory: conversationHistory.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp || Date.now())
      }))
    };

    try {
      // Execute the ideation agent in chat mode
      const chatResult = await registry.executeAgent(
        ideationAgent.metadata.id,
        ideationInput,
        chatContext
      );

      // Update conversation history
      const updatedHistory = [
        ...conversationHistory,
        {
          role: 'user',
          content: userQuery,
          timestamp: new Date().toISOString()
        },
        {
          role: 'assistant',
          content: chatResult.response,
          timestamp: new Date().toISOString(),
          metadata: {
            sources: chatResult.sources,
            suggestedActions: chatResult.suggestedActions,
            relatedTopics: chatResult.relatedTopics
          }
        }
      ];

      return NextResponse.json({
        success: true,
        projectId,
        response: chatResult.response,
        sources: chatResult.sources || [],
        suggestedActions: chatResult.suggestedActions || [],
        relatedTopics: chatResult.relatedTopics || [],
        conversationHistory: updatedHistory,
        metadata: {
          agentId: ideationAgent.metadata.id,
          timestamp: new Date().toISOString(),
          sessionId: chatContext.sessionId
        }
      });

    } catch (agentError) {
      console.error('Chat agent execution error:', agentError);
      return NextResponse.json(
        {
          error: 'Chat processing failed',
          details: agentError instanceof Error ? agentError.message : 'Unknown error'
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Chat endpoint error:', error);
    return NextResponse.json(
      {
        error: 'Chat request failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureSystemInitialized();

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const sessionId = searchParams.get('sessionId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const registry = getAgentRegistry();

    // Find the ideation agent for this project
    const projectAgents = registry.discover({
      tags: [projectId],
      capabilities: ['knowledge_chat']
    });

    const ideationAgent = projectAgents.find(agent =>
      agent.metadata.id.includes('ideation')
    );

    if (!ideationAgent) {
      return NextResponse.json(
        { error: 'Ideation agent not found for this project' },
        { status: 404 }
      );
    }

    // Get agent status and conversation context
    const agentStatus = await registry.healthCheck(ideationAgent.metadata.id);

    return NextResponse.json({
      success: true,
      projectId,
      sessionId,
      agent: {
        id: ideationAgent.metadata.id,
        name: ideationAgent.metadata.name,
        status: ideationAgent.status,
        health: agentStatus[ideationAgent.metadata.id],
        capabilities: ideationAgent.metadata.capabilities
          .filter(cap => cap.name.includes('chat') || cap.name.includes('knowledge'))
          .map(cap => cap.name)
      },
      chatFeatures: {
        knowledgeRetrieval: true,
        contextAwareness: true,
        sourceAttribution: true,
        suggestedActions: true,
        relatedTopics: true
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat status endpoint error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get chat status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}