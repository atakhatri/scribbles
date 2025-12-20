import { getApp, getApps, initializeApp } from 'firebase/app';
// @ts-ignore: Suppress type error for getReactNativePersistence if types are outdated
import AsyncStorage from '@react-native-async-storage/async-storage';
// @ts-ignore: Fix for "Module has no exported member getReactNativePersistence"
import { Auth, getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your Firebase configuration
const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let auth: Auth;

try {
    // Explicitly initialize Auth with AsyncStorage persistence.
    // This is critical for keeping the user logged in after a restart.
    auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
    });
} catch (error) {
    // If initializeAuth fails (e.g. if auth instance already exists), fall back to getAuth
    // which generally attempts to auto-detect persistence.
    console.log("Auth init fallback:", error);
    auth = getAuth(app);
}

const db = getFirestore(app);

export { auth, db };

