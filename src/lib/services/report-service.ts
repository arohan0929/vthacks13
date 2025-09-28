import {
  ReportData,
  ReportOverview,
  FrameworkScore,
  ComplianceGap,
  DocumentAnalysis,
  ScoreTrend,
  VisualizationData,
  ReportMetadata,
  ReportGenerationRequest,
  ReportGenerationResponse,
} from '@/lib/types/report-types';

interface AgentResults {
  classification?: any;
  grading?: any;
  improvement?: any;
  ideation?: any;
}

export class ReportService {
  private static instance: ReportService;

  public static getInstance(): ReportService {
    if (!ReportService.instance) {
      ReportService.instance = new ReportService();
    }
    return ReportService.instance;
  }

  /**
   * Transform agent analysis results into comprehensive report data
   */
  public async generateReportData(
    projectId: string,
    agentResults: AgentResults,
    documents: any[],
    existingTrends?: ScoreTrend[]
  ): Promise<ReportData> {
    const metadata = this.generateMetadata(projectId, agentResults);

    // Extract framework scores from grading agent
    const frameworkScores = this.extractFrameworkScores(agentResults.grading);

    // Extract compliance gaps from grading and improvement agents
    const gaps = this.extractComplianceGaps(agentResults.grading, agentResults.improvement);

    // Generate overview from all agent results
    const overview = this.generateOverview(frameworkScores, gaps, documents);

    // Analyze document coverage
    const documentAnalysis = this.analyzeDocuments(documents, agentResults);

    // Generate trend data (if historical data available)
    const trends = this.generateTrends(frameworkScores, existingTrends);

    // Generate visualization data
    const visualizations = this.generateVisualizationData(frameworkScores, gaps, trends);

    return {
      overview,
      frameworkScores,
      gaps,
      documentAnalysis,
      trends,
      visualizations,
      metadata,
    };
  }

  private generateOverview(
    frameworkScores: FrameworkScore[],
    gaps: ComplianceGap[],
    documents: any[]
  ): ReportOverview {
    const overallScore = frameworkScores.length > 0
      ? Math.round(frameworkScores.reduce((sum, f) => sum + f.overallScore, 0) / frameworkScores.length)
      : 0;

    const criticalGaps = gaps.filter(g => g.severity === 'critical').length;
    const highPriorityGaps = gaps.filter(g => g.severity === 'high').length;

    const riskLevel = this.calculateRiskLevel(overallScore, criticalGaps, highPriorityGaps);
    const complianceReadiness = this.calculateComplianceReadiness(overallScore, criticalGaps);

    return {
      overallScore,
      riskLevel,
      frameworkCount: frameworkScores.length,
      documentCount: documents.length,
      lastAssessment: new Date(),
      complianceReadiness,
      criticalGapsCount: criticalGaps,
      highPriorityGapsCount: highPriorityGaps,
    };
  }

  private extractFrameworkScores(gradingResults: any): FrameworkScore[] {
    if (!gradingResults?.frameworkScores && !gradingResults?.data?.frameworkScores) {
      return [];
    }

    const scores = gradingResults.frameworkScores || gradingResults.data.frameworkScores || [];

    return scores.map((score: any) => ({
      framework: score.framework,
      overallScore: score.overallScore || 0,
      maxScore: score.maxScore || 100,
      percentage: score.percentage || Math.round((score.overallScore / (score.maxScore || 100)) * 100),
      confidence: score.confidence || 0.8,
      priority: this.determinePriority(score.overallScore),
      categoryScores: score.categoryScores || {},
      strengths: score.strengths || [],
      criticalIssues: score.criticalIssues || [],
      readinessLevel: this.determineReadinessLevel(score.overallScore),
    }));
  }

  private extractComplianceGaps(gradingResults: any, improvementResults: any): ComplianceGap[] {
    const gaps: ComplianceGap[] = [];

    // Extract gaps from grading results
    if (gradingResults?.prioritizedGaps || gradingResults?.data?.prioritizedGaps) {
      const gradingGaps = gradingResults.prioritizedGaps || gradingResults.data.prioritizedGaps || [];
      gaps.push(...gradingGaps.map((gap: any, index: number) => ({
        id: gap.id || `gap-${index}`,
        framework: gap.framework,
        category: gap.category,
        requirement: gap.description || gap.requirement,
        description: gap.description,
        severity: gap.severity,
        currentScore: gap.currentScore || 0,
        maxScore: gap.maxScore || 100,
        impact: gap.impact || 50,
        effort: gap.effort || 'medium',
        estimatedHours: this.estimateEffort(gap.effort),
        currentStatus: gap.currentStatus || 'missing',
        evidence: gap.evidence ? gap.evidence.map((e: any) => ({
          source: e.source || 'Unknown',
          content: e.content || e,
          relevance: e.relevance || 0.8,
        })) : [],
        recommendations: gap.recommendations || [],
      })));
    }

    // Extract additional gaps from improvement results
    if (improvementResults?.recommendations || improvementResults?.data?.recommendations) {
      const improvements = improvementResults.recommendations || improvementResults.data.recommendations || [];
      improvements.forEach((rec: any, index: number) => {
        if (rec.type === 'gap_fix' || rec.category === 'compliance_gap') {
          gaps.push({
            id: `improvement-gap-${index}`,
            framework: rec.framework || 'General',
            category: rec.category || 'Implementation',
            requirement: rec.title || rec.description,
            description: rec.description,
            severity: rec.priority === 'critical' ? 'critical' : rec.priority || 'medium',
            currentScore: 0,
            maxScore: 100,
            impact: rec.impact || 50,
            effort: rec.effort || 'medium',
            estimatedHours: rec.estimatedHours || this.estimateEffort(rec.effort),
            currentStatus: 'missing',
            evidence: [],
            recommendations: [rec.solution || rec.description],
          });
        }
      });
    }

    return gaps;
  }

  private analyzeDocuments(documents: any[], agentResults: AgentResults): DocumentAnalysis[] {
    return documents.map(doc => {
      const analysis: DocumentAnalysis = {
        documentId: doc.id,
        documentName: doc.name || doc.title,
        documentType: doc.type || 'other',
        coverageScore: this.calculateDocumentCoverage(doc, agentResults),
        frameworkCoverage: this.calculateFrameworkCoverage(doc, agentResults),
        keyFindings: doc.summary ? [doc.summary] : [],
        recommendations: [],
        lastAnalyzed: new Date(),
      };

      return analysis;
    });
  }

  private generateTrends(currentScores: FrameworkScore[], existingTrends?: ScoreTrend[]): ScoreTrend[] {
    const trends: ScoreTrend[] = existingTrends || [];

    // Add current data point
    const currentTrend: ScoreTrend = {
      date: new Date(),
      overallScore: currentScores.length > 0
        ? Math.round(currentScores.reduce((sum, f) => sum + f.overallScore, 0) / currentScores.length)
        : 0,
      frameworkScores: currentScores.map(f => ({
        framework: f.framework,
        score: f.overallScore,
      })),
      changeFromPrevious: 0,
      changeType: 'stable',
    };

    // Calculate change from previous if available
    if (trends.length > 0) {
      const previousTrend = trends[trends.length - 1];
      currentTrend.changeFromPrevious = currentTrend.overallScore - previousTrend.overallScore;
      currentTrend.changeType =
        currentTrend.changeFromPrevious > 2 ? 'improvement' :
        currentTrend.changeFromPrevious < -2 ? 'decline' : 'stable';
    }

    return [...trends, currentTrend];
  }

  private generateVisualizationData(
    frameworkScores: FrameworkScore[],
    gaps: ComplianceGap[],
    trends: ScoreTrend[]
  ): VisualizationData {
    return {
      radarData: this.generateRadarData(frameworkScores),
      heatmapData: this.generateHeatmapData(frameworkScores),
      priorityMatrix: this.generatePriorityMatrix(gaps),
      trendData: this.generateTrendChartData(trends),
      gaugeData: this.generateGaugeData(frameworkScores),
    };
  }

  private generateRadarData(frameworkScores: FrameworkScore[]) {
    if (frameworkScores.length === 0) return [];

    // Get all unique categories
    const allCategories = new Set<string>();
    frameworkScores.forEach(fs => {
      Object.keys(fs.categoryScores).forEach(cat => allCategories.add(cat));
    });

    return frameworkScores.map(fs => {
      const data: any = { framework: fs.framework };
      allCategories.forEach(category => {
        data[category] = fs.categoryScores[category]?.percentage || 0;
      });
      return data;
    });
  }

  private generateHeatmapData(frameworkScores: FrameworkScore[]) {
    const heatmapData: any[] = [];

    frameworkScores.forEach(fs => {
      Object.entries(fs.categoryScores).forEach(([category, score]) => {
        heatmapData.push({
          framework: fs.framework,
          category,
          score: score.percentage,
          color: this.getScoreColor(score.percentage),
        });
      });
    });

    return heatmapData;
  }

  private generatePriorityMatrix(gaps: ComplianceGap[]) {
    return gaps.map(gap => ({
      gap,
      x: this.mapEffortToNumber(gap.effort),
      y: gap.impact,
      size: this.mapSeverityToSize(gap.severity),
      color: this.getSeverityColor(gap.severity),
    }));
  }

  private generateTrendChartData(trends: ScoreTrend[]) {
    return trends.map(trend => {
      const data: any = {
        date: trend.date.toISOString().split('T')[0],
        overall: trend.overallScore,
      };

      trend.frameworkScores.forEach(fs => {
        data[fs.framework] = fs.score;
      });

      return data;
    });
  }

  private generateGaugeData(frameworkScores: FrameworkScore[]) {
    return frameworkScores.map(fs => ({
      label: fs.framework,
      value: fs.overallScore,
      maxValue: fs.maxScore,
      color: this.getScoreColor(fs.percentage),
      target: 80, // Target compliance score
    }));
  }

  private generateMetadata(projectId: string, agentResults: AgentResults): ReportMetadata {
    return {
      reportId: `report-${projectId}-${Date.now()}`,
      projectId,
      generatedAt: new Date(),
      generatedBy: 'system', // Would be actual user in production
      analysisVersion: '1.0.0',
      processingTime: 0, // Would be calculated
      agentsUsed: Object.keys(agentResults).filter(key => agentResults[key as keyof AgentResults]),
      documentVersions: [], // Would include actual document versions
    };
  }

  // Helper methods
  private calculateRiskLevel(overallScore: number, criticalGaps: number, highPriorityGaps: number): 'critical' | 'high' | 'medium' | 'low' {
    if (overallScore < 40 || criticalGaps > 0) return 'critical';
    if (overallScore < 60 || highPriorityGaps > 2) return 'high';
    if (overallScore < 80) return 'medium';
    return 'low';
  }

  private calculateComplianceReadiness(overallScore: number, criticalGaps: number): 'not_ready' | 'partially_ready' | 'mostly_ready' | 'compliant' {
    if (criticalGaps > 0 || overallScore < 30) return 'not_ready';
    if (overallScore < 60) return 'partially_ready';
    if (overallScore < 85) return 'mostly_ready';
    return 'compliant';
  }

  private determinePriority(score: number): 'critical' | 'high' | 'medium' | 'low' {
    if (score < 40) return 'critical';
    if (score < 60) return 'high';
    if (score < 80) return 'medium';
    return 'low';
  }

  private determineReadinessLevel(score: number): 'not_ready' | 'partially_ready' | 'mostly_ready' | 'compliant' {
    if (score < 30) return 'not_ready';
    if (score < 60) return 'partially_ready';
    if (score < 85) return 'mostly_ready';
    return 'compliant';
  }

  private calculateDocumentCoverage(doc: any, agentResults: AgentResults): number {
    // Simple heuristic based on document having analysis results
    if (doc.summary || doc.analysis) return 85;
    if (doc.processed) return 60;
    return 30;
  }

  private calculateFrameworkCoverage(doc: any, agentResults: AgentResults) {
    // Default framework coverage - would be more sophisticated in production
    return [
      { framework: 'GDPR', coverage: 75, gaps: [], strengths: ['Data handling documented'] },
      { framework: 'SOX', coverage: 60, gaps: ['Access controls unclear'], strengths: [] },
    ];
  }

  private estimateEffort(effort: string): number {
    switch (effort) {
      case 'low': return 8;
      case 'medium': return 24;
      case 'high': return 80;
      default: return 24;
    }
  }

  private mapEffortToNumber(effort: string): number {
    switch (effort) {
      case 'low': return 20;
      case 'medium': return 50;
      case 'high': return 80;
      default: return 50;
    }
  }

  private mapSeverityToSize(severity: string): number {
    switch (severity) {
      case 'critical': return 20;
      case 'high': return 15;
      case 'medium': return 10;
      case 'low': return 5;
      default: return 10;
    }
  }

  private getScoreColor(percentage: number): string {
    if (percentage >= 80) return '#16A34A'; // Green
    if (percentage >= 60) return '#CA8A04'; // Yellow
    if (percentage >= 40) return '#EA580C'; // Orange
    return '#DC2626'; // Red
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical': return '#DC2626';
      case 'high': return '#EA580C';
      case 'medium': return '#CA8A04';
      case 'low': return '#16A34A';
      default: return '#6B7280';
    }
  }
}

export const reportService = ReportService.getInstance();