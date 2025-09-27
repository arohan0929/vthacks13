# Phase 1: Semantic Chunking Foundation

## Overview

Build a robust document processing pipeline that converts Google Drive documents into semantically meaningful chunks, generates embeddings, and stores them in a vector database. This foundation will support the future multi-agent compliance analysis framework.

## Core Pipeline

```
Google Drive Documents → Text Extraction → Semantic Chunking → Embeddings → Vector Storage
```

## Technical Architecture

### 1. Document Processing Service
- **Input**: Google Drive file IDs
- **Output**: Structured text with preserved document hierarchy
- **Technology**: Existing Google Drive API integration

### 2. Semantic Chunking Engine
- **Input**: Raw document text + metadata
- **Output**: Semantically coherent chunks with metadata
- **Strategy**: Hybrid (structural + semantic boundaries)

### 3. Embedding Generation
- **Input**: Text chunks
- **Output**: Vector embeddings
- **Technology**: gemini models for embedding

### 4. Vector Database
- **Storage**: Chunks + embeddings + metadata
- **Technology**: chromadb with the persistence 


- [ ] Implement hierarchical chunking (respect document structure). Not all documents will have this so using semantic boundry detection is very important. 
- [ ] Add semantic boundary detection using embedding similarity
- [ ] Configure chunk size parameters (target ~400-500 tokens)
- [ ] Implement overlapping chunks (10% overlap)
- [ ] Preserve parent-child relationships between sections and chunks
- [ ] Add chunk metadata (position, heading path, type)


**Chunk Schema**:
```typescript
interface DocumentChunk {
  id: string
  document_id: string
  content: string
  tokens: number
  position: number
  heading_path: string[]  // ["Introduction", "Data Handling", "Storage"]
  chunk_type: "paragraph" | "table" | "list" | "heading"
  parent_section_id?: string
  metadata: {
    created_at: Date
    source_file_id: string
    source_file_name: string
  }
}
```

You may change the schema. 


- [ ] Create main processing service that coordinates all steps
- [ ] Add progress tracking for long-running document processing
- [ ] Implement incremental processing (only process changed documents)
- [ ] Add comprehensive error handling and logging
- [ ] Create processing status endpoints


