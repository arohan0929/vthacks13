import { getEncoding } from 'js-tiktoken';
import { DocumentStructureParser, HierarchyNode, DocumentStructure } from './structure-parser';
import { SemanticBoundaryDetector, SemanticAnalysisResult } from './semantic-analyzer';

export interface ChunkingConfig {
  min_chunk_size: number; // minimum tokens per chunk
  max_chunk_size: number; // maximum tokens per chunk
  target_chunk_size: number; // preferred tokens per chunk
  overlap_percentage: number; // percentage overlap between chunks
  prefer_semantic_boundaries: boolean; // prioritize semantic over structural
  respect_section_boundaries: boolean; // never split across major sections
  include_heading_context: boolean; // include parent headings in chunks
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  tokens: number;
  position: number; // absolute position in document

  // Hierarchy metadata
  heading_path: string[]; // ["1. Introduction", "1.2 Background"]
  hierarchy_level: number; // depth in document tree
  parent_section_id?: string;
  chunk_type: 'heading' | 'paragraph' | 'mixed' | 'table' | 'list' | 'code';

  // Semantic metadata
  semantic_density: number; // coherence score
  topic_keywords: string[]; // extracted key terms
  has_overlap_previous: boolean;
  has_overlap_next: boolean;
  overlap_text?: string; // overlapping portion

  // Relationships
  previous_chunk_id?: string;
  next_chunk_id?: string;
  sibling_chunk_ids: string[]; // same-level chunks
  child_chunk_ids: string[]; // nested content

  metadata: {
    created_at: Date;
    source_file_id: string;
    source_file_name: string;
    chunking_method: 'structural' | 'semantic' | 'hybrid';
  };
}

export interface ChunkingResult {
  chunks: DocumentChunk[];
  total_chunks: number;
  total_tokens: number;
  average_chunk_size: number;
  overlap_efficiency: number; // how much useful overlap was created
  semantic_coherence: number; // average coherence across chunks
  hierarchy_preservation: number; // how well hierarchy was maintained
}

export class SemanticChunker {
  private structureParser = new DocumentStructureParser();
  private semanticDetector = new SemanticBoundaryDetector();
  private tokenizer = getEncoding('cl100k_base'); // GPT-4 tokenizer
  private chunkCounter = 0;

  private readonly defaultConfig: ChunkingConfig = {
    min_chunk_size: 200,
    max_chunk_size: 500,
    target_chunk_size: 400,
    overlap_percentage: 10,
    prefer_semantic_boundaries: true,
    respect_section_boundaries: true,
    include_heading_context: true
  };

  /**
   * Main chunking method that combines structural and semantic analysis
   */
  public async chunkDocument(
    content: string,
    documentId: string,
    sourceFileId: string,
    sourceFileName: string,
    config: Partial<ChunkingConfig> = {}
  ): Promise<ChunkingResult> {
    const finalConfig = { ...this.defaultConfig, ...config };
    this.chunkCounter = 0;

    // Step 1: Parse document structure
    const structure = this.structureParser.parseDocument(content);

    // Step 2: Analyze semantic boundaries
    const semanticAnalysis = await this.semanticDetector.analyzeSemanticBoundaries(structure.nodes);

    // Step 3: Apply hybrid chunking algorithm
    const chunks = await this.applyHybridChunking(
      structure,
      semanticAnalysis,
      documentId,
      sourceFileId,
      sourceFileName,
      finalConfig
    );

    // Step 4: Post-process chunks (add overlaps, relationships)
    const processedChunks = this.postProcessChunks(chunks, finalConfig);

    // Step 5: Calculate metrics
    const metrics = this.calculateChunkingMetrics(processedChunks, semanticAnalysis);

    return {
      chunks: processedChunks,
      total_chunks: processedChunks.length,
      total_tokens: processedChunks.reduce((sum, chunk) => sum + chunk.tokens, 0),
      average_chunk_size: processedChunks.reduce((sum, chunk) => sum + chunk.tokens, 0) / processedChunks.length,
      ...metrics
    };
  }

  /**
   * Apply hybrid chunking algorithm combining structural and semantic analysis
   */
  private async applyHybridChunking(
    structure: DocumentStructure,
    semanticAnalysis: SemanticAnalysisResult,
    documentId: string,
    sourceFileId: string,
    sourceFileName: string,
    config: ChunkingConfig
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];
    const processedNodes = new Set<string>();

    // Phase 1: Handle major sections (H1, H2) as chunk boundaries
    if (config.respect_section_boundaries) {
      const majorSections = this.identifyMajorSections(structure);

      for (const section of majorSections) {
        const sectionChunks = await this.chunkSection(
          section,
          structure,
          semanticAnalysis,
          documentId,
          sourceFileId,
          sourceFileName,
          config
        );
        chunks.push(...sectionChunks);

        // Mark nodes as processed
        this.markNodesAsProcessed(section.nodes, processedNodes);
      }
    }

    // Phase 2: Handle remaining unprocessed nodes
    const remainingNodes = structure.nodes.filter(node => !processedNodes.has(node.id));
    if (remainingNodes.length > 0) {
      const remainingChunks = await this.chunkNodeSequence(
        remainingNodes,
        structure,
        semanticAnalysis,
        documentId,
        sourceFileId,
        sourceFileName,
        config
      );
      chunks.push(...remainingChunks);
    }

    return chunks;
  }

  /**
   * Identify major sections that should serve as natural chunk boundaries
   */
  private identifyMajorSections(structure: DocumentStructure): Array<{
    heading: HierarchyNode;
    nodes: HierarchyNode[];
  }> {
    const sections: Array<{ heading: HierarchyNode; nodes: HierarchyNode[] }> = [];

    // Find H1 and H2 headings as major section boundaries
    const majorHeadings = structure.nodes.filter(
      node => node.type === 'heading' && node.level <= 2
    );

    for (const heading of majorHeadings) {
      const sectionNodes = this.structureParser.getNodesUnderHeading(structure, heading.id);
      sections.push({
        heading,
        nodes: [heading, ...sectionNodes]
      });
    }

    return sections;
  }

  /**
   * Chunk a specific section using hybrid approach
   */
  private async chunkSection(
    section: { heading: HierarchyNode; nodes: HierarchyNode[] },
    structure: DocumentStructure,
    semanticAnalysis: SemanticAnalysisResult,
    documentId: string,
    sourceFileId: string,
    sourceFileName: string,
    config: ChunkingConfig
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];

    // Calculate total tokens in section
    const sectionTokens = this.calculateNodesTokens(section.nodes);

    if (sectionTokens <= config.max_chunk_size) {
      // Section fits in one chunk
      const chunk = this.createChunkFromNodes(
        section.nodes,
        structure,
        documentId,
        sourceFileId,
        sourceFileName,
        'structural'
      );
      chunks.push(chunk);
    } else {
      // Section needs to be split - use semantic analysis
      const subChunks = await this.chunkNodeSequence(
        section.nodes,
        structure,
        semanticAnalysis,
        documentId,
        sourceFileId,
        sourceFileName,
        config
      );
      chunks.push(...subChunks);
    }

    return chunks;
  }

  /**
   * Chunk a sequence of nodes using semantic boundaries
   */
  private async chunkNodeSequence(
    nodes: HierarchyNode[],
    structure: DocumentStructure,
    semanticAnalysis: SemanticAnalysisResult,
    documentId: string,
    sourceFileId: string,
    sourceFileName: string,
    config: ChunkingConfig
  ): Promise<DocumentChunk[]> {
    const chunks: DocumentChunk[] = [];

    // Use semantic analysis to find optimal split points
    const splitPoints = this.findOptimalSplitPoints(nodes, semanticAnalysis, config);

    let currentStart = 0;
    for (const splitPoint of [...splitPoints, nodes.length]) {
      if (splitPoint > currentStart) {
        const chunkNodes = nodes.slice(currentStart, splitPoint);
        const chunk = this.createChunkFromNodes(
          chunkNodes,
          structure,
          documentId,
          sourceFileId,
          sourceFileName,
          'hybrid'
        );
        chunks.push(chunk);
        currentStart = splitPoint;
      }
    }

    return chunks;
  }

  /**
   * Find optimal split points based on semantic analysis and chunk size constraints
   */
  private findOptimalSplitPoints(
    nodes: HierarchyNode[],
    semanticAnalysis: SemanticAnalysisResult,
    config: ChunkingConfig
  ): number[] {
    const splitPoints: number[] = [];
    let currentTokens = 0;
    let lastViableSplit = 0;

    for (let i = 0; i < nodes.length; i++) {
      const nodeTokens = this.countTokens(nodes[i].content);
      currentTokens += nodeTokens;

      // Check if we've reached target size and have a viable split point
      if (currentTokens >= config.target_chunk_size) {
        const semanticSplit = this.findNearestSemanticBoundary(
          i,
          semanticAnalysis,
          config.prefer_semantic_boundaries
        );

        if (semanticSplit > lastViableSplit) {
          splitPoints.push(semanticSplit);
          lastViableSplit = semanticSplit;
          currentTokens = this.calculateTokensFromPosition(nodes, semanticSplit);
        }
      }

      // Force split if we exceed max size
      if (currentTokens >= config.max_chunk_size) {
        if (i > lastViableSplit) {
          splitPoints.push(i);
          lastViableSplit = i;
          currentTokens = 0;
        }
      }
    }

    return splitPoints;
  }

  /**
   * Find the nearest semantic boundary to a given position
   */
  private findNearestSemanticBoundary(
    position: number,
    semanticAnalysis: SemanticAnalysisResult,
    preferSemantic: boolean
  ): number {
    if (!preferSemantic) return position;

    // Look for strong semantic boundaries near the position
    const nearbyBoundaries = semanticAnalysis.boundaries.filter(
      boundary => Math.abs(boundary.position - position) <= 3
    );

    if (nearbyBoundaries.length > 0) {
      // Choose the strongest boundary
      const strongest = nearbyBoundaries.reduce((best, current) =>
        current.boundary_strength > best.boundary_strength ? current : best
      );
      return strongest.position;
    }

    return position;
  }

  /**
   * Create a chunk from a sequence of nodes
   */
  private createChunkFromNodes(
    nodes: HierarchyNode[],
    structure: DocumentStructure,
    documentId: string,
    sourceFileId: string,
    sourceFileName: string,
    chunkingMethod: 'structural' | 'semantic' | 'hybrid'
  ): DocumentChunk {
    const chunkId = this.generateChunkId();
    const content = this.combineNodesContent(nodes, structure);
    const tokens = this.countTokens(content);

    // Extract metadata from nodes
    const headingPath = this.extractHeadingPath(nodes, structure);
    const hierarchyLevel = this.calculateHierarchyLevel(nodes);
    const chunkType = this.determineChunkType(nodes);
    const topicKeywords = this.extractTopicKeywords(content);

    // Calculate semantic density (coherence within chunk)
    const semanticDensity = this.calculateChunkCoherence(nodes);

    return {
      id: chunkId,
      document_id: documentId,
      content,
      tokens,
      position: this.chunkCounter,
      heading_path: headingPath,
      hierarchy_level: hierarchyLevel,
      chunk_type: chunkType,
      semantic_density: semanticDensity,
      topic_keywords: topicKeywords,
      has_overlap_previous: false,
      has_overlap_next: false,
      sibling_chunk_ids: [],
      child_chunk_ids: [],
      metadata: {
        created_at: new Date(),
        source_file_id: sourceFileId,
        source_file_name: sourceFileName,
        chunking_method: chunkingMethod
      }
    };
  }

  /**
   * Combine nodes content with proper formatting
   */
  private combineNodesContent(nodes: HierarchyNode[], structure: DocumentStructure): string {
    const contentParts: string[] = [];

    for (const node of nodes) {
      if (node.type === 'heading') {
        // Add heading with proper formatting
        const prefix = '#'.repeat(node.level);
        contentParts.push(`${prefix} ${node.content}`);
      } else {
        contentParts.push(node.content);
      }
    }

    return contentParts.join('\n\n');
  }

  /**
   * Extract heading path for a chunk
   */
  private extractHeadingPath(nodes: HierarchyNode[], structure: DocumentStructure): string[] {
    // Find the first node and use its path
    const firstNode = nodes[0];
    if (!firstNode) return [];

    // If the first node is a heading, include it in the path
    if (firstNode.type === 'heading') {
      return [...firstNode.path, firstNode.content];
    }

    return firstNode.path;
  }

  /**
   * Calculate the hierarchy level for a chunk
   */
  private calculateHierarchyLevel(nodes: HierarchyNode[]): number {
    const headingNodes = nodes.filter(node => node.type === 'heading');
    if (headingNodes.length > 0) {
      return Math.min(...headingNodes.map(node => node.level));
    }

    // Use the level of the first node
    return nodes[0]?.level || 0;
  }

  /**
   * Determine the primary type of a chunk
   */
  private determineChunkType(nodes: HierarchyNode[]): DocumentChunk['chunk_type'] {
    const types = nodes.map(node => node.type);
    const uniqueTypes = [...new Set(types)];

    if (uniqueTypes.length === 1) {
      return uniqueTypes[0] as DocumentChunk['chunk_type'];
    }

    // Mixed content - determine primary type
    if (types.includes('heading')) return 'heading';
    if (types.includes('table')) return 'table';
    if (types.includes('list')) return 'list';
    if (types.includes('code')) return 'code';

    return 'mixed';
  }

  /**
   * Extract topic keywords from content
   */
  private extractTopicKeywords(content: string): string[] {
    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);

    // Simple frequency analysis
    const wordCounts = new Map<string, number>();
    words.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });

    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0]);
  }

  /**
   * Calculate semantic coherence within a chunk
   */
  private calculateChunkCoherence(nodes: HierarchyNode[]): number {
    // Simple heuristic based on content consistency
    if (nodes.length <= 1) return 1.0;

    const allWords = nodes
      .map(node => node.content.toLowerCase().split(/\s+/))
      .flat();

    const uniqueWords = new Set(allWords);
    const totalWords = allWords.length;

    // Higher ratio of unique to total words suggests lower coherence
    return Math.max(0, 1 - (uniqueWords.size / totalWords));
  }

  /**
   * Post-process chunks to add overlaps and relationships
   */
  private postProcessChunks(chunks: DocumentChunk[], config: ChunkingConfig): DocumentChunk[] {
    // Add overlaps between adjacent chunks
    this.addChunkOverlaps(chunks, config);

    // Establish relationships between chunks
    this.establishChunkRelationships(chunks);

    return chunks;
  }

  /**
   * Add overlapping content between adjacent chunks
   */
  private addChunkOverlaps(chunks: DocumentChunk[], config: ChunkingConfig): void {
    for (let i = 0; i < chunks.length - 1; i++) {
      const currentChunk = chunks[i];
      const nextChunk = chunks[i + 1];

      // Calculate overlap size
      const overlapTokens = Math.floor(currentChunk.tokens * (config.overlap_percentage / 100));

      if (overlapTokens > 0) {
        const overlapText = this.extractOverlapText(currentChunk.content, overlapTokens);

        if (overlapText) {
          currentChunk.has_overlap_next = true;
          currentChunk.overlap_text = overlapText;
          nextChunk.has_overlap_previous = true;
        }
      }
    }
  }

  /**
   * Extract overlap text from the end of a chunk
   */
  private extractOverlapText(content: string, targetTokens: number): string | undefined {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim());
    if (sentences.length === 0) return undefined;

    // Take sentences from the end until we reach target tokens
    let overlapText = '';
    let tokens = 0;

    for (let i = sentences.length - 1; i >= 0 && tokens < targetTokens; i--) {
      const sentence = sentences[i].trim();
      const sentenceTokens = this.countTokens(sentence);

      if (tokens + sentenceTokens <= targetTokens) {
        overlapText = sentence + '. ' + overlapText;
        tokens += sentenceTokens;
      } else {
        break;
      }
    }

    return overlapText.trim() || undefined;
  }

  /**
   * Establish relationships between chunks
   */
  private establishChunkRelationships(chunks: DocumentChunk[]): void {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Set previous/next relationships
      if (i > 0) {
        chunk.previous_chunk_id = chunks[i - 1].id;
      }
      if (i < chunks.length - 1) {
        chunk.next_chunk_id = chunks[i + 1].id;
      }

      // Find sibling chunks (same hierarchy level)
      chunk.sibling_chunk_ids = chunks
        .filter(other =>
          other.id !== chunk.id &&
          other.hierarchy_level === chunk.hierarchy_level
        )
        .map(other => other.id);
    }
  }

  /**
   * Calculate chunking quality metrics
   */
  private calculateChunkingMetrics(
    chunks: DocumentChunk[],
    semanticAnalysis: SemanticAnalysisResult
  ): {
    overlap_efficiency: number;
    semantic_coherence: number;
    hierarchy_preservation: number;
  } {
    const overlapEfficiency = this.calculateOverlapEfficiency(chunks);
    const semanticCoherence = chunks.reduce((sum, chunk) => sum + chunk.semantic_density, 0) / chunks.length;
    const hierarchyPreservation = this.calculateHierarchyPreservation(chunks);

    return {
      overlap_efficiency: overlapEfficiency,
      semantic_coherence: semanticCoherence,
      hierarchy_preservation: hierarchyPreservation
    };
  }

  /**
   * Calculate how efficiently overlaps were created
   */
  private calculateOverlapEfficiency(chunks: DocumentChunk[]): number {
    const chunksWithOverlap = chunks.filter(chunk => chunk.has_overlap_next || chunk.has_overlap_previous);
    return chunksWithOverlap.length / Math.max(1, chunks.length - 1);
  }

  /**
   * Calculate how well document hierarchy was preserved
   */
  private calculateHierarchyPreservation(chunks: DocumentChunk[]): number {
    // Simple heuristic: check if heading paths are consistent
    let consistentPaths = 0;
    for (let i = 1; i < chunks.length; i++) {
      const current = chunks[i];
      const previous = chunks[i - 1];

      // Paths should be related (one is subset of other or they share prefix)
      if (this.arePathsRelated(current.heading_path, previous.heading_path)) {
        consistentPaths++;
      }
    }

    return Math.max(1, chunks.length - 1) > 0 ? consistentPaths / (chunks.length - 1) : 1;
  }

  /**
   * Check if two heading paths are related
   */
  private arePathsRelated(path1: string[], path2: string[]): boolean {
    const minLength = Math.min(path1.length, path2.length);
    for (let i = 0; i < minLength; i++) {
      if (path1[i] !== path2[i]) {
        return i > 0; // Share at least one common prefix level
      }
    }
    return true; // One path is subset of the other
  }

  // Utility methods

  private generateChunkId(): string {
    return `chunk_${++this.chunkCounter}_${Date.now()}`;
  }

  private countTokens(text: string): number {
    try {
      return this.tokenizer.encode(text).length;
    } catch (error) {
      // Fallback to word-based estimation
      return Math.ceil(text.split(/\s+/).length * 0.75);
    }
  }

  private calculateNodesTokens(nodes: HierarchyNode[]): number {
    return nodes.reduce((total, node) => total + this.countTokens(node.content), 0);
  }

  private calculateTokensFromPosition(nodes: HierarchyNode[], position: number): number {
    return nodes.slice(position).reduce((total, node) => total + this.countTokens(node.content), 0);
  }

  private markNodesAsProcessed(nodes: HierarchyNode[], processedSet: Set<string>): void {
    nodes.forEach(node => processedSet.add(node.id));
  }
}