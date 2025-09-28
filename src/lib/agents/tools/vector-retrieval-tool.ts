import { z } from 'zod';
import { BaseTool } from './base-tool';
import { getChromaService } from '../../vector/chroma-service';
import { getGeminiEmbeddingService } from '../../ai/gemini-embeddings';

const VectorRetrievalSchema = z.object({
  projectId: z.string(),
  query: z.string(),
  limit: z.number().optional().default(10),
  threshold: z.number().optional().default(0.7),
  filters: z.object({
    documentId: z.string().optional(),
    chunkType: z.string().optional(),
    hierarchyLevel: z.number().optional()
  }).optional()
});

export class VectorRetrievalTool extends BaseTool {
  constructor() {
    super({
      name: 'vector_retrieval',
      description: 'Retrieve relevant document chunks using semantic similarity search from ChromaDB vector store',
      schema: VectorRetrievalSchema,
      category: 'retrieval'
    });
  }

  protected async _call(arg: string): Promise<string> {
    try {
      const input = JSON.parse(arg);
      const { projectId, query, limit, threshold, filters } = VectorRetrievalSchema.parse(input);

      const chromaService = getChromaService();
      const embeddingService = getGeminiEmbeddingService();

      // Generate embedding for the query
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      // Build query options
      const queryOptions: any = {
        n_results: limit,
        include: ['metadatas', 'documents', 'distances']
      };

      // Add filters if provided
      if (filters) {
        const where: any = {};
        if (filters.documentId) where.document_id = filters.documentId;
        if (filters.chunkType) where.chunk_type = filters.chunkType;
        if (filters.hierarchyLevel) where.hierarchy_level = filters.hierarchyLevel;

        if (Object.keys(where).length > 0) {
          queryOptions.where = where;
        }
      }

      // Perform similarity search
      const results = await chromaService.queryBySemanticSimilarity(
        projectId,
        queryEmbedding,
        queryOptions
      );

      // Filter by threshold
      const filteredResults = {
        ids: [],
        documents: [],
        metadatas: [],
        distances: []
      };

      for (let i = 0; i < results.distances.length; i++) {
        if (results.distances[i] <= (1 - threshold)) { // ChromaDB uses distance, lower is better
          filteredResults.ids.push(results.ids[i]);
          filteredResults.documents.push(results.documents[i]);
          filteredResults.metadatas.push(results.metadatas[i]);
          filteredResults.distances.push(results.distances[i]);
        }
      }

      // Format response for agent
      const response = {
        query,
        resultsFound: filteredResults.ids.length,
        chunks: filteredResults.ids.map((id, index) => ({
          id,
          content: filteredResults.documents[index],
          metadata: filteredResults.metadatas[index],
          similarity: 1 - filteredResults.distances[index], // Convert distance to similarity
          relevanceScore: Math.round((1 - filteredResults.distances[index]) * 100) / 100
        }))
      };

      return JSON.stringify(response, null, 2);
    } catch (error) {
      throw new Error(`Vector retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; issues: string[] }> {
    const issues: string[] = [];

    try {
      const chromaService = getChromaService();
      const isHealthy = await chromaService.healthCheck();

      if (!isHealthy) {
        issues.push('ChromaDB service is not healthy');
      }

      const embeddingService = getGeminiEmbeddingService();
      const embeddingHealthy = await embeddingService.isHealthy();

      if (!embeddingHealthy) {
        issues.push('Gemini embedding service is not healthy');
      }

      return {
        status: issues.length === 0 ? 'healthy' : 'degraded',
        issues
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        issues: [error instanceof Error ? error.message : 'Health check failed']
      };
    }
  }
}