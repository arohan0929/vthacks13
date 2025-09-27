import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/firebase/firebase';
import { getProjectsService } from '@/lib/db/projects-service';

// Helper function to verify Firebase token and get user
async function verifyTokenAndGetUser(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const idToken = authHeader.split('Bearer ')[1];

  let decodedToken;

  try {
    const admin = await import('firebase-admin');

    // Initialize Firebase Admin if not already initialized
    if (!admin.apps.length) {
      const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID || 'vthacks13-74208',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      };

      if (!serviceAccount.clientEmail || !serviceAccount.privateKey) {
        throw new Error('Firebase Admin credentials not configured');
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    console.error('Firebase Admin verification failed:', error);
    throw new Error('Invalid token');
  }

  const projectsService = getProjectsService();

  // Get or create user
  let user = await projectsService.getUserByFirebaseId(decodedToken.uid);
  if (!user) {
    user = await projectsService.createUser({
      firebase_uid: decodedToken.uid,
      email: decodedToken.email || '',
      name: decodedToken.name,
    });
  }

  return user;
}

// GET /api/projects - Get all projects for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const user = await verifyTokenAndGetUser(request.headers.get('authorization'));
    const projectsService = getProjectsService();

    // Get project summaries for the user
    const projects = await projectsService.getProjectSummariesByUserId(user.id);

    return NextResponse.json({ projects });
  } catch (error) {
    console.error('Error in GET /api/projects:', error);

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

// POST /api/projects - Create a new project
export async function POST(request: NextRequest) {
  try {
    const user = await verifyTokenAndGetUser(request.headers.get('authorization'));

    // Parse request body
    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 }
      );
    }

    const projectsService = getProjectsService();

    // Create the project
    const project = await projectsService.createProject({
      user_id: user.id,
      name: name.trim(),
      description: description?.trim() || null,
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/projects:', error);

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