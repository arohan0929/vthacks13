import { BaseAgent } from '../base/base-agent';
import { AgentMetadata, AgentInput, AgentContext } from '../base/types';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { Tool } from '@langchain/core/tools';
import { VectorRetrievalTool, WebSearchTool, getAgentTools } from '../tools';
import { z } from 'zod';

export interface IdeationInput {
  mode: 'questions' | 'chat';
  context: {
    projectDescription: string;
    detectedFrameworks?: string[];
    complianceGaps?: string[];
    userQuery?: string; // For chat mode
  };
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  maxQuestions?: number; // For questions mode
}

export interface QuestionOutput {
  questions: Array<{
    id: string;
    question: string;
    category: 'implementation' | 'gap_filling' | 'risk_clarification' | 'process';
    priority: 'high' | 'medium' | 'low';
    framework: string;
    reasoning: string;
    expectedAnswerType: 'text' | 'boolean' | 'choice' | 'numeric';
    followUpQuestions?: string[];
  }>;
  questioningStrategy: {
    overallGoal: string;
    progressiveDisclosure: boolean;
    adaptiveFollowUp: boolean;
  };
}

export interface ChatOutput {
  response: string;
  sources: Array<{
    type: 'knowledge_base' | 'web_search' | 'framework_guide';
    title: string;
    content: string;
    confidence: number;
  }>;
  suggestedActions: string[];
  relatedTopics: string[];
}

export type IdeationOutput = QuestionOutput | ChatOutput;

const IdeationInputSchema = z.object({
  mode: z.enum(['questions', 'chat']),
  context: z.object({
    projectDescription: z.string(),
    detectedFrameworks: z.array(z.string()).optional(),
    complianceGaps: z.array(z.string()).optional(),
    userQuery: z.string().optional()
  }),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    timestamp: z.date()
  })).optional(),
  maxQuestions: z.number().optional().default(5)
});

export class IdeationAgent extends BaseAgent<IdeationInput, IdeationOutput> {
  constructor(projectId: string) {
    const metadata: AgentMetadata = {
      id: `ideation-agent-${projectId}`,
      name: 'Compliance Ideation Agent',
      description: 'Generates clarifying questions and provides interactive compliance knowledge chat',
      version: '1.0.0',
      capabilities: [
        {
          name: 'question_generation',
          description: 'Generate targeted clarifying questions based on compliance gaps',
          inputSchema: IdeationInputSchema,
          outputSchema: z.object({
            questions: z.array(z.object({
              id: z.string(),
              question: z.string(),
              category: z.enum(['implementation', 'gap_filling', 'risk_clarification', 'process']),
              priority: z.enum(['high', 'medium', 'low']),
              framework: z.string(),
              reasoning: z.string(),
              expectedAnswerType: z.enum(['text', 'boolean', 'choice', 'numeric']),
              followUpQuestions: z.array(z.string()).optional()
            }))
          })
        },
        {
          name: 'knowledge_chat',
          description: 'Interactive Q&A based on compliance knowledge retrieval',
          inputSchema: IdeationInputSchema,
          outputSchema: z.object({
            response: z.string(),
            sources: z.array(z.object({
              type: z.enum(['knowledge_base', 'web_search', 'framework_guide']),
              title: z.string(),
              content: z.string(),
              confidence: z.number()
            })),
            suggestedActions: z.array(z.string()),
            relatedTopics: z.array(z.string())
          })
        }
      ],
      dependencies: ['chromadb', 'gemini-embeddings', 'web-search'],
      tags: ['ideation', 'questions', 'knowledge', 'interactive', projectId]
    };

    super(metadata);
  }

  protected async initializeTools(): Promise<Tool[]> {
    return getAgentTools(this.metadata.id);
  }

  protected createPrompt(): ChatPromptTemplate {
    return ChatPromptTemplate.fromMessages([
      ['system', `You are a compliance ideation specialist with two primary modes:

QUESTIONS MODE:
Generate smart, targeted questions to fill compliance gaps and clarify implementation details.

Question Categories:
- IMPLEMENTATION REALITY CHECKS: Verify actual vs. stated practices
- GAP FILLING: Identify missing compliance elements
- RISK CLARIFICATION: Understand specific risk scenarios
- PROCESS: Clarify workflows and procedures

Question Guidelines:
- Be specific and actionable
- Avoid yes/no questions when possible
- Include context about why the question matters
- Suggest what a good answer should include
- Prioritize based on risk and compliance impact

CHAT MODE:
Provide knowledgeable, helpful responses about compliance topics using knowledge retrieval and web search.

Chat Guidelines:
- Use vector search to find relevant compliance information
- Supplement with web search for current requirements
- Provide practical, actionable advice
- Include relevant sources and citations
- Suggest next steps and related topics

Always tailor responses to the specific project context and detected frameworks.`],
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad')
    ]);
  }

  protected async preprocessInput(input: AgentInput<IdeationInput>): Promise<AgentInput<IdeationInput>> {
    const validatedData = IdeationInputSchema.parse(input.data);
    return { ...input, data: validatedData };
  }

  protected async postprocessOutput(result: any, input: AgentInput<IdeationInput>): Promise<IdeationOutput> {
    try {
      if (input.data.mode === 'questions') {
        return await this.processQuestionModeOutput(result, input);
      } else {
        return await this.processChatModeOutput(result, input);
      }
    } catch (error) {
      console.error('Error in ideation postprocessing:', error);
      // Return fallback response
      if (input.data.mode === 'questions') {
        return this.createFallbackQuestionResponse(input.data);
      } else {
        return this.createFallbackChatResponse(input.data);
      }
    }
  }

  protected formatInputForAgent(input: AgentInput<IdeationInput>): string {
    const { mode, context, conversationHistory, maxQuestions } = input.data;

    if (mode === 'questions') {
      return this.formatQuestionModeInput(context, maxQuestions || 5);
    } else {
      return this.formatChatModeInput(context, conversationHistory || []);
    }
  }

  private formatQuestionModeInput(context: IdeationInput['context'], maxQuestions: number): string {
    return `QUESTION GENERATION REQUEST:

PROJECT DESCRIPTION:
${context.projectDescription}

DETECTED FRAMEWORKS: ${context.detectedFrameworks?.join(', ') || 'None'}
IDENTIFIED GAPS: ${context.complianceGaps?.join(', ') || 'None specified'}
REQUESTED QUESTIONS: ${maxQuestions}

Please generate targeted clarifying questions to help understand compliance requirements and implementation details. Use vector search to find relevant compliance scenarios and web search for current requirements.

For each question, provide:
1. Clear, specific question text
2. Category (implementation/gap_filling/risk_clarification/process)
3. Priority level (high/medium/low)
4. Associated framework
5. Reasoning for why this question is important
6. Expected answer type
7. Potential follow-up questions

Focus on questions that will provide the most valuable information for compliance assessment.`;
  }

  private formatChatModeInput(context: IdeationInput['context'], history: any[]): string {
    const conversationContext = history.length > 0 ?
      `\nCONVERSATION HISTORY:\n${history.map(msg => `${msg.role}: ${msg.content}`).join('\n')}` :
      '';

    return `KNOWLEDGE CHAT REQUEST:

PROJECT DESCRIPTION:
${context.projectDescription}

DETECTED FRAMEWORKS: ${context.detectedFrameworks?.join(', ') || 'None'}
USER QUERY: ${context.userQuery || 'General compliance guidance'}
${conversationContext}

Please provide a helpful, knowledgeable response about compliance topics. Use vector search to find relevant information and web search for current requirements.

Include:
1. Direct answer to the user's question
2. Relevant sources and citations
3. Practical next steps
4. Related topics they might want to explore

Make the response conversational but informative, tailored to their specific project context.`;
  }

  private async processQuestionModeOutput(result: any, input: AgentInput<IdeationInput>): Promise<QuestionOutput> {
    const context = input.data.context;
    const maxQuestions = input.data.maxQuestions || 5;
    const aiResponse = result.output || result.text || '';

    let questions: QuestionOutput['questions'] = [];

    // First try to parse questions from AI response
    if (aiResponse && aiResponse.trim()) {
      questions = await this.parseQuestionsFromAIResponse(aiResponse, context);
    }

    // If AI parsing failed or returned insufficient questions, supplement with generated ones
    if (questions.length < Math.min(3, maxQuestions)) {
      console.log('AI returned insufficient questions, supplementing with template-based questions');
      const templateQuestions = await this.generateQuestionsFromContext(context, maxQuestions - questions.length);
      questions = [...questions, ...templateQuestions].slice(0, maxQuestions);
    }

    return {
      questions: questions.slice(0, maxQuestions),
      questioningStrategy: {
        overallGoal: this.determineQuestioningGoal(context),
        progressiveDisclosure: true,
        adaptiveFollowUp: true
      }
    };
  }

  private async processChatModeOutput(result: any, input: AgentInput<IdeationInput>): Promise<ChatOutput> {
    const aiResponse = result.output || result.text || '';

    // Extract sources from intermediate steps
    const sources = this.extractSourcesFromSteps(result.intermediateSteps || []);

    // Generate suggested actions
    const suggestedActions = this.generateSuggestedActions(input.data.context, aiResponse);

    // Generate related topics
    const relatedTopics = this.generateRelatedTopics(input.data.context);

    return {
      response: aiResponse,
      sources,
      suggestedActions,
      relatedTopics
    };
  }

  private async generateQuestionsFromContext(
    context: IdeationInput['context'],
    maxQuestions: number
  ): Promise<QuestionOutput['questions']> {
    const questions: QuestionOutput['questions'] = [];
    const frameworks = context.detectedFrameworks || [];
    const gaps = context.complianceGaps || [];

    // Question templates by category
    const questionTemplates = this.getQuestionTemplates();

    // Generate questions for each framework
    for (const framework of frameworks.slice(0, 3)) { // Limit to top 3 frameworks
      const frameworkQuestions = this.generateFrameworkQuestions(framework, questionTemplates);
      questions.push(...frameworkQuestions);
    }

    // Generate questions for identified gaps
    for (const gap of gaps.slice(0, 2)) { // Limit to top 2 gaps
      const gapQuestions = this.generateGapQuestions(gap, questionTemplates);
      questions.push(...gapQuestions);
    }

    // Generate general project questions
    const generalQuestions = this.generateGeneralQuestions(context, questionTemplates);
    questions.push(...generalQuestions);

    // Sort by priority and return top questions
    return questions
      .sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      })
      .slice(0, maxQuestions);
  }

  private getQuestionTemplates(): Record<string, any> {
    return {
      implementation: {
        FERPA: [
          'What specific encryption standards do you use for storing student educational records?',
          'How do you obtain and document student consent for data sharing?',
          'Who is designated as your FERPA compliance officer?'
        ],
        HIPAA: [
          'What specific encryption standards do you use for health information?',
          'Do you have signed business associate agreements with all vendors?',
          'How do you handle patient consent for research participation?'
        ],
        GDPR: [
          'What is your lawful basis for processing personal data of EU residents?',
          'How do you handle data subject access requests?',
          'Do you have a Data Protection Officer appointed?'
        ]
      },
      gap_filling: [
        'What is your data retention and deletion schedule?',
        'How do you handle data breach notifications?',
        'What backup and recovery procedures do you have in place?',
        'How do you conduct regular compliance audits?'
      ],
      risk_clarification: [
        'Are any of your research participants under 18?',
        'Do you share data with international collaborators?',
        'Do you collect sensitive personal information?',
        'Are you planning to commercialize any research outcomes?'
      ],
      process: [
        'What is your process for onboarding new team members to compliance requirements?',
        'How do you train staff on data handling procedures?',
        'What is your incident response process for compliance violations?'
      ]
    };
  }

  private generateFrameworkQuestions(
    framework: string,
    templates: Record<string, any>
  ): QuestionOutput['questions'] {
    const frameworkTemplates = templates.implementation[framework] || [];
    return frameworkTemplates.slice(0, 2).map((template: string, index: number) => ({
      id: `${framework.toLowerCase()}-impl-${index}`,
      question: template,
      category: 'implementation' as const,
      priority: 'high' as const,
      framework,
      reasoning: `Critical for ${framework} compliance implementation`,
      expectedAnswerType: 'text' as const,
      followUpQuestions: this.generateFollowUpQuestions(template)
    }));
  }

  private generateGapQuestions(
    gap: string,
    templates: Record<string, any>
  ): QuestionOutput['questions'] {
    const gapTemplates = templates.gap_filling.filter((template: string) =>
      template.toLowerCase().includes(gap.toLowerCase().split(' ')[0])
    );

    return gapTemplates.slice(0, 1).map((template: string, index: number) => ({
      id: `gap-${gap.replace(/\s+/g, '-').toLowerCase()}-${index}`,
      question: template,
      category: 'gap_filling' as const,
      priority: 'medium' as const,
      framework: 'General',
      reasoning: `Addresses identified compliance gap: ${gap}`,
      expectedAnswerType: 'text' as const
    }));
  }

  private generateGeneralQuestions(
    context: IdeationInput['context'],
    templates: Record<string, any>
  ): QuestionOutput['questions'] {
    const riskQuestions = templates.risk_clarification.slice(0, 2);
    const processQuestions = templates.process.slice(0, 1);

    const questions = [
      ...riskQuestions.map((template: string, index: number) => ({
        id: `risk-${index}`,
        question: template,
        category: 'risk_clarification' as const,
        priority: 'medium' as const,
        framework: 'General',
        reasoning: 'Important for understanding overall compliance risk profile',
        expectedAnswerType: 'boolean' as const
      })),
      ...processQuestions.map((template: string, index: number) => ({
        id: `process-${index}`,
        question: template,
        category: 'process' as const,
        priority: 'low' as const,
        framework: 'General',
        reasoning: 'Helps understand organizational compliance maturity',
        expectedAnswerType: 'text' as const
      }))
    ];

    return questions;
  }

  private generateFollowUpQuestions(question: string): string[] {
    // Simple follow-up generation based on question content
    if (question.includes('encryption')) {
      return ['What key management system do you use?', 'How often do you rotate encryption keys?'];
    }
    if (question.includes('consent')) {
      return ['How do you document consent withdrawal?', 'What is your consent renewal process?'];
    }
    if (question.includes('officer') || question.includes('designated')) {
      return ['What are their specific responsibilities?', 'How often do they report to leadership?'];
    }
    return [];
  }

  private determineQuestioningGoal(context: IdeationInput['context']): string {
    const frameworks = context.detectedFrameworks || [];
    const gaps = context.complianceGaps || [];

    if (frameworks.length > 2) {
      return 'Understand implementation details across multiple compliance frameworks';
    } else if (gaps.length > 0) {
      return 'Fill identified compliance gaps and clarify requirements';
    } else {
      return 'Assess overall compliance readiness and identify key requirements';
    }
  }

  private extractSourcesFromSteps(steps: any[]): ChatOutput['sources'] {
    const sources: ChatOutput['sources'] = [];

    for (const step of steps) {
      if (step.action?.tool === 'vector_retrieval' && step.observation) {
        sources.push({
          type: 'knowledge_base',
          title: 'Compliance Knowledge Base',
          content: step.observation.substring(0, 200) + '...',
          confidence: 0.8
        });
      } else if (step.action?.tool === 'web_search' && step.observation) {
        sources.push({
          type: 'web_search',
          title: 'Current Compliance Information',
          content: step.observation.substring(0, 200) + '...',
          confidence: 0.7
        });
      }
    }

    return sources.slice(0, 3); // Return top 3 sources
  }

  private generateSuggestedActions(context: IdeationInput['context'], response: string): string[] {
    const actions = [];

    if (context.detectedFrameworks?.includes('FERPA')) {
      actions.push('Review your student data collection and consent processes');
    }
    if (context.detectedFrameworks?.includes('HIPAA')) {
      actions.push('Conduct a HIPAA risk assessment');
    }
    if (context.detectedFrameworks?.includes('IRB')) {
      actions.push('Submit your research protocol to the IRB for review');
    }

    // Add general actions based on response content
    if (response.toLowerCase().includes('policy')) {
      actions.push('Draft or update relevant compliance policies');
    }
    if (response.toLowerCase().includes('training')) {
      actions.push('Schedule compliance training for team members');
    }

    return actions.slice(0, 4);
  }

  private generateRelatedTopics(context: IdeationInput['context']): string[] {
    const topics = [];

    if (context.detectedFrameworks?.includes('FERPA')) {
      topics.push('Directory information policies', 'Student consent management');
    }
    if (context.detectedFrameworks?.includes('HIPAA')) {
      topics.push('Business associate agreements', 'Breach notification procedures');
    }
    if (context.detectedFrameworks?.includes('GDPR')) {
      topics.push('Data subject rights', 'Privacy impact assessments');
    }

    topics.push('Compliance monitoring', 'Risk assessment procedures', 'Incident response planning');

    return topics.slice(0, 5);
  }

  private async parseQuestionsFromAIResponse(aiResponse: string, context: IdeationInput['context']): Promise<QuestionOutput['questions']> {
    try {
      const questions: QuestionOutput['questions'] = [];

      // Look for numbered questions or bullet points in the response
      const questionPatterns = [
        /(\d+)\.\s*(.+?)(?=\d+\.|$)/gs,  // Numbered list
        /[-*]\s*(.+?)(?=[-*]|$)/gs,      // Bullet points
        /(?:^|\n)(.+\?)(?=\n|$)/gm      // Lines ending with question marks
      ];

      for (const pattern of questionPatterns) {
        const matches = [...aiResponse.matchAll(pattern)];

        for (const match of matches) {
          const questionText = (match[2] || match[1])?.trim();

          if (questionText && questionText.length > 10 && questionText.includes('?')) {
            const question = this.createQuestionFromText(questionText, context, questions.length);
            if (question) {
              questions.push(question);
            }
          }
        }

        if (questions.length > 0) break; // Use first successful pattern
      }

      // Remove duplicates and limit results
      const uniqueQuestions = questions.filter((q, index, arr) =>
        arr.findIndex(other => other.question.toLowerCase() === q.question.toLowerCase()) === index
      );

      return uniqueQuestions.slice(0, 10);
    } catch (error) {
      console.error('Error parsing AI questions:', error);
      return [];
    }
  }

  private createQuestionFromText(questionText: string, context: IdeationInput['context'], index: number): QuestionOutput['questions'][0] | null {
    if (!questionText || questionText.length < 10) return null;

    // Determine category based on question content
    const category = this.categorizeQuestion(questionText);

    // Determine priority based on context and content
    const priority = this.prioritizeQuestion(questionText, context);

    // Determine framework association
    const framework = this.associateWithFramework(questionText, context.detectedFrameworks);

    return {
      id: `ai-question-${index}-${Date.now()}`,
      question: questionText,
      category,
      priority,
      framework,
      reasoning: `AI-generated question based on project context and compliance analysis`,
      expectedAnswerType: this.determineAnswerType(questionText),
      followUpQuestions: this.generateFollowUpQuestions(questionText)
    };
  }

  private categorizeQuestion(questionText: string): 'implementation' | 'gap_filling' | 'risk_clarification' | 'process' {
    const lowerText = questionText.toLowerCase();

    if (lowerText.includes('implement') || lowerText.includes('setup') || lowerText.includes('configure')) {
      return 'implementation';
    } else if (lowerText.includes('process') || lowerText.includes('procedure') || lowerText.includes('workflow')) {
      return 'process';
    } else if (lowerText.includes('risk') || lowerText.includes('threat') || lowerText.includes('vulnerability')) {
      return 'risk_clarification';
    } else {
      return 'gap_filling';
    }
  }

  private prioritizeQuestion(questionText: string, context: IdeationInput['context']): 'high' | 'medium' | 'low' {
    const lowerText = questionText.toLowerCase();
    const urgentKeywords = ['critical', 'required', 'must', 'compliance', 'violation', 'breach'];
    const importantKeywords = ['should', 'recommend', 'best practice', 'security'];

    if (urgentKeywords.some(keyword => lowerText.includes(keyword))) {
      return 'high';
    } else if (importantKeywords.some(keyword => lowerText.includes(keyword))) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private associateWithFramework(questionText: string, frameworks?: string[]): string {
    if (!frameworks || frameworks.length === 0) return 'General';

    const lowerText = questionText.toLowerCase();

    for (const framework of frameworks) {
      if (lowerText.includes(framework.toLowerCase())) {
        return framework;
      }
    }

    // Framework-specific keyword matching
    if (lowerText.includes('student') || lowerText.includes('education')) return 'FERPA';
    if (lowerText.includes('health') || lowerText.includes('medical')) return 'HIPAA';
    if (lowerText.includes('research') || lowerText.includes('participant')) return 'IRB';
    if (lowerText.includes('personal data') || lowerText.includes('privacy')) return 'GDPR';

    return frameworks[0] || 'General';
  }

  private determineAnswerType(questionText: string): 'text' | 'boolean' | 'choice' | 'numeric' {
    const lowerText = questionText.toLowerCase();

    if (lowerText.includes('yes/no') || lowerText.includes('true/false') ||
        lowerText.startsWith('do you') || lowerText.startsWith('are you') ||
        lowerText.startsWith('is ') || lowerText.startsWith('have you')) {
      return 'boolean';
    } else if (lowerText.includes('how many') || lowerText.includes('number of')) {
      return 'numeric';
    } else if (lowerText.includes('which') || lowerText.includes('choose') || lowerText.includes('select')) {
      return 'choice';
    } else {
      return 'text';
    }
  }

  private createFallbackQuestionResponse(input: IdeationInput): QuestionOutput {
    const context = input.context;
    const maxQuestions = input.maxQuestions || 5;

    return {
      questions: [{
        id: `fallback-question-${Date.now()}`,
        question: 'What specific compliance requirements are you most concerned about for this project?',
        category: 'gap_filling',
        priority: 'high',
        framework: 'General',
        reasoning: 'Fallback question due to AI processing error',
        expectedAnswerType: 'text',
        followUpQuestions: ['What is your timeline for compliance implementation?']
      }],
      questioningStrategy: {
        overallGoal: 'Gather basic compliance requirements information',
        progressiveDisclosure: true,
        adaptiveFollowUp: true
      }
    };
  }

  private createFallbackChatResponse(input: IdeationInput): ChatOutput {
    return {
      response: 'I apologize, but I encountered an issue processing your request. Could you please rephrase your question or provide more specific details about your compliance needs?',
      sources: [],
      suggestedActions: ['Review project compliance requirements', 'Identify applicable frameworks'],
      relatedTopics: ['General compliance guidance', 'Risk assessment']
    };
  }
}