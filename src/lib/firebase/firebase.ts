// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, User } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBtFFOizlXrp18p_e4TGMLudRy9O5Xs0rE",
  authDomain: "vthacks13-74208.firebaseapp.com",
  projectId: "vthacks13-74208",
  storageBucket: "vthacks13-74208.firebasestorage.app",
  messagingSenderId: "957212751673",
  appId: "1:957212751673:web:4b42e810ddb7c511b31ae8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Google Auth Provider with Drive scopes
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');
googleProvider.setCustomParameters({
  access_type: 'offline',
  prompt: 'consent'
});

// Store for Google OAuth access token
let googleAccessToken: string | null = null;
let googleRefreshToken: string | null = null;

// Auth helper functions
export const signInWithGoogle = async (): Promise<User | null> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);

    // Extract Google OAuth credentials
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential) {
      googleAccessToken = credential.accessToken || null;
      googleRefreshToken = credential.refreshToken || null;

      if (googleAccessToken) {
        console.log('Google OAuth access token obtained successfully');
      }
    }

    return result.user;
  } catch (error) {
    console.error("Error signing in with Google:", error);
    throw error;
  }
};

export const logOut = async (): Promise<void> => {
  try {
    await signOut(auth);
    // Clear stored tokens
    googleAccessToken = null;
    googleRefreshToken = null;
  } catch (error) {
    console.error("Error signing out:", error);
    throw error;
  }
};

// Get Google Drive access token from the current user
export const getDriveAccessToken = async (): Promise<string | null> => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("No authenticated user found");
    }

    // Return the stored Google OAuth access token
    if (!googleAccessToken) {
      throw new Error("No Google OAuth access token available. Please sign in again.");
    }

    return googleAccessToken;
  } catch (error) {
    console.error("Error getting Drive access token:", error);
    return null;
  }
};

// Check if user has granted Drive permissions
export const hasDrivePermissions = async (): Promise<boolean> => {
  try {
    const user = auth.currentUser;
    if (!user) return false;

    // Check if we have a valid Google OAuth access token
    return !!googleAccessToken;
  } catch (error) {
    console.error("Error checking Drive permissions:", error);
    return false;
  }
};

// Refresh Google OAuth access token
export const refreshGoogleAccessToken = async (): Promise<string | null> => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("No authenticated user found");
    }

    // Force refresh the user's tokens
    await user.getIdToken(true);

    // If we have a refresh token, we could implement proper OAuth refresh here
    // For now, request user to sign in again if token is invalid
    if (!googleAccessToken) {
      throw new Error("Access token expired. Please sign in again.");
    }

    return googleAccessToken;
  } catch (error) {
    console.error("Error refreshing access token:", error);
    return null;
  }
};

export default app;