import { NextRequest, NextResponse } from 'next/server';
import { getProjectsService } from '@/lib/db/projects-service';
import { getDocumentsService } from '@/lib/db/documents-service';
import { getDriveService } from '@/lib/google-drive/drive-service';

// Helper function to verify Firebase token and get user
async function verifyTokenAndGetUser(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const idToken = authHeader.split('Bearer ')[1];
  const admin = await import('firebase-admin');

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const projectsService = getProjectsService();

    let user = await projectsService.getUserByFirebaseId(decodedToken.uid);
    if (!user) {
      user = await projectsService.createUser({
        firebase_uid: decodedToken.uid,
        email: decodedToken.email || '',
        name: decodedToken.name,
      });
    }

    return user;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

// GET /api/projects/[id]/documents - Get all documents for a project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyTokenAndGetUser(request.headers.get('authorization'));
    const { id: projectId } = await params;

    const projectsService = getProjectsService();
    const documentsService = getDocumentsService();

    // Verify project ownership
    const isOwner = await projectsService.isProjectOwner(projectId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    // Get documents for the project
    const documents = await documentsService.getDocumentsByProjectId(projectId);

    // Get document statistics
    const stats = await documentsService.getProjectDocumentStats(projectId);

    return NextResponse.json({
      documents,
      stats
    });
  } catch (error) {
    console.error('Error in GET /api/projects/[id]/documents:', error);

    if (error instanceof Error && error.message.includes('token')) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/documents - Link a Google Drive file to the project
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyTokenAndGetUser(request.headers.get('authorization'));
    const { id: projectId } = await params;

    const projectsService = getProjectsService();
    const documentsService = getDocumentsService();

    // Verify project ownership
    const isOwner = await projectsService.isProjectOwner(projectId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { driveFileId } = body;

    if (!driveFileId || typeof driveFileId !== 'string') {
      return NextResponse.json(
        { error: 'Drive file ID is required' },
        { status: 400 }
      );
    }

    // Check if document is already linked
    const existingDocument = await documentsService.getDocumentByDriveFileId(driveFileId);
    if (existingDocument) {
      return NextResponse.json(
        { error: 'Document is already linked to a project' },
        { status: 409 }
      );
    }

    // Get file metadata from Google Drive
    const driveService = await getDriveService();
    let driveFile;

    try {
      driveFile = await driveService.getFileMetadata(driveFileId);
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to access Google Drive file. Please check permissions.' },
        { status: 400 }
      );
    }

    // Create document record
    const document = await documentsService.createDocument({
      project_id: projectId,
      drive_file_id: driveFileId,
      file_name: driveFile.name,
      file_type: driveFile.mimeType?.split('/')[1] || 'unknown',
      mime_type: driveFile.mimeType,
      drive_url: driveFile.webViewLink,
      parent_folder_id: driveFile.parents?.[0] || null,
      last_modified: driveFile.modifiedTime ? new Date(driveFile.modifiedTime) : null,
      file_size: driveFile.size ? parseInt(driveFile.size) : null,
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/projects/[id]/documents:', error);

    if (error instanceof Error && error.message.includes('token')) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]/documents - Unlink documents from project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyTokenAndGetUser(request.headers.get('authorization'));
    const { id: projectId } = await params;

    const projectsService = getProjectsService();
    const documentsService = getDocumentsService();

    // Verify project ownership
    const isOwner = await projectsService.isProjectOwner(projectId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { documentId, driveFileId } = body;

    if (!documentId && !driveFileId) {
      return NextResponse.json(
        { error: 'Either documentId or driveFileId is required' },
        { status: 400 }
      );
    }

    // Delete the document
    if (documentId) {
      // Verify document belongs to this project
      const isDocumentInProject = await documentsService.isDocumentInProject(documentId, projectId);
      if (!isDocumentInProject) {
        return NextResponse.json(
          { error: 'Document not found in this project' },
          { status: 404 }
        );
      }

      await documentsService.deleteDocument(documentId);
    } else if (driveFileId) {
      // Find and delete by Drive file ID
      const document = await documentsService.getDocumentByDriveFileId(driveFileId);
      if (!document || document.project_id !== projectId) {
        return NextResponse.json(
          { error: 'Document not found in this project' },
          { status: 404 }
        );
      }

      await documentsService.deleteDocumentByDriveFileId(driveFileId);
    }

    return NextResponse.json({ message: 'Document unlinked successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/projects/[id]/documents:', error);

    if (error instanceof Error && error.message.includes('token')) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}