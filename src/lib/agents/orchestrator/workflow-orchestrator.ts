import { getAgentRegistry } from '../registry';
import { AgentContext } from '../base/types';
import { getCommunicationService } from '../tools/communication-tool';
import { z } from 'zod';

export interface WorkflowStep {
  id: string;
  name: string;
  agentType: 'classification' | 'ideation' | 'grader' | 'improvement';
  input: any;
  dependencies: string[];
  optional: boolean;
  retryCount: number;
  timeout: number; // milliseconds
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  executionMode: 'sequential' | 'parallel' | 'hybrid';
  errorHandling: 'fail_fast' | 'continue_on_error' | 'retry_failed';
  maxRetries: number;
  totalTimeout: number;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  projectId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  context: AgentContext;
  stepResults: Map<string, any>;
  stepErrors: Map<string, Error[]>;
  stepStatus: Map<string, 'pending' | 'running' | 'completed' | 'failed' | 'skipped'>;
  metrics: {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;
    totalExecutionTime: number;
    averageStepTime: number;
  };
}

export interface WorkflowResult {
  executionId: string;
  success: boolean;
  results: Record<string, any>;
  errors: Record<string, Error[]>;
  metrics: WorkflowExecution['metrics'];
  summary: {
    stepsExecuted: number;
    stepsSkipped: number;
    stepsFailed: number;
    totalTime: number;
    successRate: number;
  };
}

export class WorkflowOrchestrator {
  private executions = new Map<string, WorkflowExecution>();
  private workflows = new Map<string, WorkflowDefinition>();

  constructor() {
    this.initializeDefaultWorkflows();
  }

  /**
   * Register a workflow definition
   */
  registerWorkflow(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow);
    console.log(`Registered workflow: ${workflow.name}`);
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(
    workflowId: string,
    projectId: string,
    context: AgentContext,
    initialInput: any = {}
  ): Promise<WorkflowResult> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const executionId = this.generateExecutionId();
    const execution = this.createExecution(executionId, workflow, projectId, context);

    this.executions.set(executionId, execution);

    try {
      execution.status = 'running';
      execution.startTime = new Date();

      // Execute workflow based on execution mode
      switch (workflow.executionMode) {
        case 'sequential':
          await this.executeSequential(execution, workflow, initialInput);
          break;
        case 'parallel':
          await this.executeParallel(execution, workflow, initialInput);
          break;
        case 'hybrid':
          await this.executeHybrid(execution, workflow, initialInput);
          break;
      }

      execution.status = 'completed';
      execution.endTime = new Date();

      return this.createWorkflowResult(execution);

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      console.error(`Workflow ${workflowId} execution failed:`, error);
      throw error;
    }
  }

  /**
   * Get workflow execution status
   */
  getExecutionStatus(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Cancel a running workflow
   */
  async cancelWorkflow(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (execution.status === 'running') {
      execution.status = 'cancelled';
      execution.endTime = new Date();
      console.log(`Workflow execution ${executionId} cancelled`);
    }
  }

  /**
   * List all workflow definitions
   */
  listWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Execute steps sequentially
   */
  private async executeSequential(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    initialInput: any
  ): Promise<void> {
    const registry = getAgentRegistry();
    let currentInput = initialInput;

    for (const step of workflow.steps) {
      if (execution.status === 'cancelled') break;

      try {
        // Check dependencies
        if (!this.areDependenciesMet(step, execution)) {
          if (step.optional) {
            this.markStepSkipped(execution, step);
            continue;
          } else {
            throw new Error(`Dependencies not met for step ${step.id}`);
          }
        }

        // Execute step
        await this.executeStep(execution, step, currentInput, registry);

        // Use step result as input for next step
        const stepResult = execution.stepResults.get(step.id);
        if (stepResult) {
          currentInput = { ...currentInput, [step.agentType]: stepResult };
        }

      } catch (error) {
        await this.handleStepError(execution, step, error as Error, workflow);
      }
    }
  }

  /**
   * Execute steps in parallel
   */
  private async executeParallel(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    initialInput: any
  ): Promise<void> {
    const registry = getAgentRegistry();

    // Execute all independent steps in parallel
    const stepPromises = workflow.steps
      .filter(step => step.dependencies.length === 0)
      .map(step => this.executeStep(execution, step, initialInput, registry));

    await Promise.allSettled(stepPromises);

    // Execute dependent steps after their dependencies complete
    const remainingSteps = workflow.steps.filter(step => step.dependencies.length > 0);

    while (remainingSteps.length > 0 && execution.status !== 'cancelled') {
      const readySteps = remainingSteps.filter(step =>
        this.areDependenciesMet(step, execution)
      );

      if (readySteps.length === 0) {
        // No more steps can be executed
        break;
      }

      const readyPromises = readySteps.map(step =>
        this.executeStep(execution, step, initialInput, registry)
      );

      await Promise.allSettled(readyPromises);

      // Remove executed steps
      readySteps.forEach(step => {
        const index = remainingSteps.indexOf(step);
        if (index > -1) remainingSteps.splice(index, 1);
      });
    }
  }

  /**
   * Execute steps in hybrid mode (combination of sequential and parallel)
   */
  private async executeHybrid(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    initialInput: any
  ): Promise<void> {
    // Group steps by dependency level
    const stepLevels = this.groupStepsByDependencyLevel(workflow.steps);
    let currentInput = initialInput;

    for (const level of stepLevels) {
      if (execution.status === 'cancelled') break;

      // Execute steps in this level in parallel
      const registry = getAgentRegistry();
      const levelPromises = level.map(step =>
        this.executeStep(execution, step, currentInput, registry)
      );

      await Promise.allSettled(levelPromises);

      // Merge results for next level
      for (const step of level) {
        const stepResult = execution.stepResults.get(step.id);
        if (stepResult) {
          currentInput = { ...currentInput, [step.agentType]: stepResult };
        }
      }
    }
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    execution: WorkflowExecution,
    step: WorkflowStep,
    input: any,
    registry: any
  ): Promise<void> {
    const stepStartTime = Date.now();
    execution.stepStatus.set(step.id, 'running');

    try {
      // Find agent for this step
      const projectAgents = registry.discover({
        tags: [execution.projectId],
        capabilities: [this.getRequiredCapability(step.agentType)]
      });

      const agent = projectAgents.find((a: any) =>
        a.metadata.id.includes(step.agentType)
      );

      if (!agent) {
        throw new Error(`No ${step.agentType} agent found for project ${execution.projectId}`);
      }

      // Prepare step input
      const stepInput = this.prepareStepInput(step, input, execution);

      // Execute agent with timeout
      const result = await Promise.race([
        registry.executeAgent(agent.metadata.id, stepInput, execution.context),
        this.createTimeoutPromise(step.timeout)
      ]);

      // Store result
      execution.stepResults.set(step.id, result);
      execution.stepStatus.set(step.id, 'completed');

      // Update metrics
      const stepTime = Date.now() - stepStartTime;
      execution.metrics.completedSteps++;
      execution.metrics.totalExecutionTime += stepTime;
      execution.metrics.averageStepTime =
        execution.metrics.totalExecutionTime / execution.metrics.completedSteps;

      console.log(`Step ${step.id} completed in ${stepTime}ms`);

    } catch (error) {
      execution.stepStatus.set(step.id, 'failed');
      execution.metrics.failedSteps++;

      const stepErrors = execution.stepErrors.get(step.id) || [];
      stepErrors.push(error as Error);
      execution.stepErrors.set(step.id, stepErrors);

      throw error;
    }
  }

  /**
   * Handle step execution errors
   */
  private async handleStepError(
    execution: WorkflowExecution,
    step: WorkflowStep,
    error: Error,
    workflow: WorkflowDefinition
  ): Promise<void> {
    console.error(`Step ${step.id} failed:`, error);

    switch (workflow.errorHandling) {
      case 'fail_fast':
        throw error;

      case 'continue_on_error':
        if (!step.optional) {
          console.warn(`Non-optional step ${step.id} failed but continuing`);
        }
        this.markStepSkipped(execution, step);
        break;

      case 'retry_failed':
        const stepErrors = execution.stepErrors.get(step.id) || [];
        if (stepErrors.length < step.retryCount) {
          console.log(`Retrying step ${step.id}, attempt ${stepErrors.length + 1}`);
          // Note: Actual retry logic would be implemented here
          // For now, we'll mark as failed
        }
        this.markStepSkipped(execution, step);
        break;
    }
  }

  private createExecution(
    executionId: string,
    workflow: WorkflowDefinition,
    projectId: string,
    context: AgentContext
  ): WorkflowExecution {
    return {
      id: executionId,
      workflowId: workflow.id,
      projectId,
      status: 'pending',
      startTime: new Date(),
      context,
      stepResults: new Map(),
      stepErrors: new Map(),
      stepStatus: new Map(),
      metrics: {
        totalSteps: workflow.steps.length,
        completedSteps: 0,
        failedSteps: 0,
        skippedSteps: 0,
        totalExecutionTime: 0,
        averageStepTime: 0
      }
    };
  }

  private createWorkflowResult(execution: WorkflowExecution): WorkflowResult {
    const results: Record<string, any> = {};
    const errors: Record<string, Error[]> = {};

    execution.stepResults.forEach((result, stepId) => {
      results[stepId] = result;
    });

    execution.stepErrors.forEach((stepErrors, stepId) => {
      errors[stepId] = stepErrors;
    });

    const stepsExecuted = execution.metrics.completedSteps;
    const stepsSkipped = execution.metrics.skippedSteps;
    const stepsFailed = execution.metrics.failedSteps;
    const totalSteps = execution.metrics.totalSteps;

    return {
      executionId: execution.id,
      success: execution.status === 'completed',
      results,
      errors,
      metrics: execution.metrics,
      summary: {
        stepsExecuted,
        stepsSkipped,
        stepsFailed,
        totalTime: execution.endTime ?
          execution.endTime.getTime() - execution.startTime.getTime() : 0,
        successRate: totalSteps > 0 ? stepsExecuted / totalSteps : 0
      }
    };
  }

  private areDependenciesMet(step: WorkflowStep, execution: WorkflowExecution): boolean {
    return step.dependencies.every(depId =>
      execution.stepStatus.get(depId) === 'completed'
    );
  }

  private markStepSkipped(execution: WorkflowExecution, step: WorkflowStep): void {
    execution.stepStatus.set(step.id, 'skipped');
    execution.metrics.skippedSteps++;
  }

  private prepareStepInput(step: WorkflowStep, input: any, execution: WorkflowExecution): any {
    // Merge step input with previous results based on dependencies
    let stepInput = { ...step.input };

    for (const depId of step.dependencies) {
      const depResult = execution.stepResults.get(depId);
      if (depResult) {
        stepInput = { ...stepInput, ...depResult };
      }
    }

    return { ...stepInput, ...input };
  }

  private getRequiredCapability(agentType: string): string {
    const capabilityMap: Record<string, string> = {
      'classification': 'framework_detection',
      'ideation': 'question_generation',
      'grader': 'compliance_analysis',
      'improvement': 'remediation_planning'
    };
    return capabilityMap[agentType] || agentType;
  }

  private groupStepsByDependencyLevel(steps: WorkflowStep[]): WorkflowStep[][] {
    const levels: WorkflowStep[][] = [];
    const processed = new Set<string>();
    const stepMap = new Map(steps.map(step => [step.id, step]));

    while (processed.size < steps.length) {
      const currentLevel: WorkflowStep[] = [];

      for (const step of steps) {
        if (processed.has(step.id)) continue;

        // Check if all dependencies are processed
        const canProcess = step.dependencies.every(depId => processed.has(depId));

        if (canProcess) {
          currentLevel.push(step);
          processed.add(step.id);
        }
      }

      if (currentLevel.length === 0) {
        // Circular dependency or other issue
        console.warn('Unable to resolve all step dependencies');
        break;
      }

      levels.push(currentLevel);
    }

    return levels;
  }

  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Step timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeDefaultWorkflows(): void {
    // Full compliance analysis workflow
    this.registerWorkflow({
      id: 'full_compliance_analysis',
      name: 'Full Compliance Analysis',
      description: 'Complete compliance analysis workflow with all agents',
      executionMode: 'sequential',
      errorHandling: 'continue_on_error',
      maxRetries: 2,
      totalTimeout: 300000, // 5 minutes
      steps: [
        {
          id: 'classification',
          name: 'Framework Classification',
          agentType: 'classification',
          input: {},
          dependencies: [],
          optional: false,
          retryCount: 2,
          timeout: 60000
        },
        {
          id: 'ideation',
          name: 'Generate Questions',
          agentType: 'ideation',
          input: { mode: 'questions' },
          dependencies: ['classification'],
          optional: true,
          retryCount: 1,
          timeout: 45000
        },
        {
          id: 'grading',
          name: 'Compliance Grading',
          agentType: 'grader',
          input: {},
          dependencies: ['classification'],
          optional: false,
          retryCount: 2,
          timeout: 90000
        },
        {
          id: 'improvement',
          name: 'Improvement Recommendations',
          agentType: 'improvement',
          input: {},
          dependencies: ['grading'],
          optional: false,
          retryCount: 1,
          timeout: 60000
        }
      ]
    });

    // Quick assessment workflow
    this.registerWorkflow({
      id: 'quick_assessment',
      name: 'Quick Compliance Assessment',
      description: 'Fast compliance assessment focusing on classification and basic scoring',
      executionMode: 'parallel',
      errorHandling: 'fail_fast',
      maxRetries: 1,
      totalTimeout: 120000, // 2 minutes
      steps: [
        {
          id: 'classification',
          name: 'Framework Classification',
          agentType: 'classification',
          input: { analysisDepth: 'quick' },
          dependencies: [],
          optional: false,
          retryCount: 1,
          timeout: 30000
        },
        {
          id: 'grading',
          name: 'Compliance Grading',
          agentType: 'grader',
          input: {},
          dependencies: ['classification'],
          optional: false,
          retryCount: 1,
          timeout: 60000
        }
      ]
    });
  }
}

// Singleton instance
let orchestratorInstance: WorkflowOrchestrator | null = null;

export function getWorkflowOrchestrator(): WorkflowOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new WorkflowOrchestrator();
  }
  return orchestratorInstance;
}