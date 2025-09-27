import { sql } from './neon-client';
import {
  Document,
  CreateDocumentDTO,
  UpdateDocumentDTO
} from './types';

export class DocumentsService {
  // Create a new document link
  async createDocument(documentData: CreateDocumentDTO): Promise<Document> {
    try {
      const result = await sql`
        INSERT INTO documents (
          project_id,
          drive_file_id,
          file_name,
          file_type,
          mime_type,
          drive_url,
          parent_folder_id,
          last_modified,
          file_size
        )
        VALUES (
          ${documentData.project_id},
          ${documentData.drive_file_id},
          ${documentData.file_name},
          ${documentData.file_type || null},
          ${documentData.mime_type || null},
          ${documentData.drive_url || null},
          ${documentData.parent_folder_id || null},
          ${documentData.last_modified || null},
          ${documentData.file_size || null}
        )
        ON CONFLICT (drive_file_id)
        DO UPDATE SET
          file_name = EXCLUDED.file_name,
          file_type = EXCLUDED.file_type,
          mime_type = EXCLUDED.mime_type,
          drive_url = EXCLUDED.drive_url,
          parent_folder_id = EXCLUDED.parent_folder_id,
          last_modified = EXCLUDED.last_modified,
          file_size = EXCLUDED.file_size
        RETURNING *
      `;

      return result[0] as Document;
    } catch (error) {
      console.error('Error creating document:', error);
      throw error;
    }
  }

  // Get document by ID
  async getDocumentById(documentId: string): Promise<Document | null> {
    try {
      const result = await sql`
        SELECT * FROM documents
        WHERE id = ${documentId}
      `;

      return result.length > 0 ? (result[0] as Document) : null;
    } catch (error) {
      console.error('Error getting document by ID:', error);
      throw error;
    }
  }

  // Get document by Drive file ID
  async getDocumentByDriveFileId(driveFileId: string): Promise<Document | null> {
    try {
      const result = await sql`
        SELECT * FROM documents
        WHERE drive_file_id = ${driveFileId}
      `;

      return result.length > 0 ? (result[0] as Document) : null;
    } catch (error) {
      console.error('Error getting document by Drive file ID:', error);
      throw error;
    }
  }

  // Get all documents for a project
  async getDocumentsByProjectId(projectId: string): Promise<Document[]> {
    try {
      const result = await sql`
        SELECT * FROM documents
        WHERE project_id = ${projectId}
        ORDER BY created_at DESC
      `;

      return result as Document[];
    } catch (error) {
      console.error('Error getting documents by project ID:', error);
      throw error;
    }
  }

  // Update document metadata
  async updateDocument(documentId: string, updateData: UpdateDocumentDTO): Promise<Document> {
    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (updateData.file_name !== undefined) {
        updates.push(`file_name = $${updates.length + 1}`);
        values.push(updateData.file_name);
      }

      if (updateData.file_type !== undefined) {
        updates.push(`file_type = $${updates.length + 1}`);
        values.push(updateData.file_type);
      }

      if (updateData.mime_type !== undefined) {
        updates.push(`mime_type = $${updates.length + 1}`);
        values.push(updateData.mime_type);
      }

      if (updateData.drive_url !== undefined) {
        updates.push(`drive_url = $${updates.length + 1}`);
        values.push(updateData.drive_url);
      }

      if (updateData.last_modified !== undefined) {
        updates.push(`last_modified = $${updates.length + 1}`);
        values.push(updateData.last_modified);
      }

      if (updateData.last_analyzed !== undefined) {
        updates.push(`last_analyzed = $${updates.length + 1}`);
        values.push(updateData.last_analyzed);
      }

      if (updateData.file_size !== undefined) {
        updates.push(`file_size = $${updates.length + 1}`);
        values.push(updateData.file_size);
      }

      if (updates.length === 0) {
        throw new Error('No fields to update');
      }

      const query = `
        UPDATE documents
        SET ${updates.join(', ')}
        WHERE id = $${updates.length + 1}
        RETURNING *
      `;

      values.push(documentId);

      const result = await sql.unsafe(query, values);
      return result[0] as Document;
    } catch (error) {
      console.error('Error updating document:', error);
      throw error;
    }
  }

  // Delete a document link
  async deleteDocument(documentId: string): Promise<void> {
    try {
      await sql`
        DELETE FROM documents
        WHERE id = ${documentId}
      `;
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  }

  // Delete document by Drive file ID
  async deleteDocumentByDriveFileId(driveFileId: string): Promise<void> {
    try {
      await sql`
        DELETE FROM documents
        WHERE drive_file_id = ${driveFileId}
      `;
    } catch (error) {
      console.error('Error deleting document by Drive file ID:', error);
      throw error;
    }
  }

  // Update last analyzed timestamp
  async markDocumentAsAnalyzed(documentId: string): Promise<void> {
    try {
      await sql`
        UPDATE documents
        SET last_analyzed = CURRENT_TIMESTAMP
        WHERE id = ${documentId}
      `;
    } catch (error) {
      console.error('Error marking document as analyzed:', error);
      throw error;
    }
  }

  // Get documents that need analysis (modified since last analysis)
  async getDocumentsNeedingAnalysis(projectId: string): Promise<Document[]> {
    try {
      const result = await sql`
        SELECT * FROM documents
        WHERE project_id = ${projectId}
        AND (
          last_analyzed IS NULL
          OR last_modified > last_analyzed
        )
        ORDER BY last_modified DESC
      `;

      return result as Document[];
    } catch (error) {
      console.error('Error getting documents needing analysis:', error);
      throw error;
    }
  }

  // Get documents modified since a specific date
  async getDocumentsModifiedSince(projectId: string, since: Date): Promise<Document[]> {
    try {
      const result = await sql`
        SELECT * FROM documents
        WHERE project_id = ${projectId}
        AND last_modified > ${since.toISOString()}
        ORDER BY last_modified DESC
      `;

      return result as Document[];
    } catch (error) {
      console.error('Error getting recently modified documents:', error);
      throw error;
    }
  }

  // Sync document metadata from Drive API response
  async syncDocumentMetadata(
    driveFileId: string,
    metadata: {
      name: string;
      mimeType: string;
      modifiedTime: string;
      size?: string;
      webViewLink: string;
    }
  ): Promise<Document | null> {
    try {
      const result = await sql`
        UPDATE documents
        SET
          file_name = ${metadata.name},
          mime_type = ${metadata.mimeType},
          last_modified = ${metadata.modifiedTime},
          file_size = ${metadata.size ? parseInt(metadata.size) : null},
          drive_url = ${metadata.webViewLink}
        WHERE drive_file_id = ${driveFileId}
        RETURNING *
      `;

      return result.length > 0 ? (result[0] as Document) : null;
    } catch (error) {
      console.error('Error syncing document metadata:', error);
      throw error;
    }
  }

  // Get document statistics for a project
  async getProjectDocumentStats(projectId: string): Promise<{
    totalDocuments: number;
    analyzedDocuments: number;
    pendingDocuments: number;
    lastAnalyzedDate?: Date;
  }> {
    try {
      const result = await sql`
        SELECT
          COUNT(*) as total_documents,
          COUNT(last_analyzed) as analyzed_documents,
          COUNT(*) - COUNT(last_analyzed) as pending_documents,
          MAX(last_analyzed) as last_analyzed_date
        FROM documents
        WHERE project_id = ${projectId}
      `;

      if (result.length === 0) {
        return {
          totalDocuments: 0,
          analyzedDocuments: 0,
          pendingDocuments: 0
        };
      }

      const row = result[0];
      return {
        totalDocuments: row.total_documents || 0,
        analyzedDocuments: row.analyzed_documents || 0,
        pendingDocuments: row.pending_documents || 0,
        lastAnalyzedDate: row.last_analyzed_date
      };
    } catch (error) {
      console.error('Error getting document stats:', error);
      throw error;
    }
  }

  // Check if document belongs to project
  async isDocumentInProject(documentId: string, projectId: string): Promise<boolean> {
    try {
      const result = await sql`
        SELECT 1 FROM documents
        WHERE id = ${documentId} AND project_id = ${projectId}
      `;

      return result.length > 0;
    } catch (error) {
      console.error('Error checking document project ownership:', error);
      return false;
    }
  }
}

// Singleton instance
let documentsServiceInstance: DocumentsService | null = null;

export function getDocumentsService(): DocumentsService {
  if (!documentsServiceInstance) {
    documentsServiceInstance = new DocumentsService();
  }
  return documentsServiceInstance;
}