import { NextRequest, NextResponse } from 'next/server';
import { getDriveService } from '@/lib/google-drive/drive-service';

// Helper function to verify Firebase token
async function verifyToken(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const idToken = authHeader.split('Bearer ')[1];
  const admin = await import('firebase-admin');

  try {
    // Initialize Firebase Admin if not already initialized
    if (!admin.apps.length) {
      const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID || 'vthacks13-74208',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      };

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

// GET /api/drive/files - List Google Drive files
export async function GET(request: NextRequest) {
  try {
    // Verify Firebase ID token for user authentication
    await verifyToken(request.headers.get('authorization'));

    // Extract Google OAuth access token from header
    const oauthToken = request.headers.get('x-google-access-token');
    if (!oauthToken) {
      return NextResponse.json(
        { error: 'Google OAuth access token required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId') || undefined;
    const pageSize = parseInt(searchParams.get('pageSize') || '50');
    const query = searchParams.get('query');

    // Pass the OAuth token to the drive service
    const driveService = await getDriveService(oauthToken);

    let files;

    if (query) {
      // Search files
      files = await driveService.searchFiles(query, pageSize);
    } else {
      // List files in folder or root
      files = await driveService.listFiles(folderId, pageSize);
    }

    return NextResponse.json({ files });
  } catch (error) {
    console.error('Error in GET /api/drive/files:', error);

    if (error instanceof Error && error.message.includes('token')) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to access Google Drive. Please check permissions.' },
      { status: 500 }
    );
  }
}