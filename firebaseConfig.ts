import { Platform } from "react-native";

let authInstance: any;
let db: any;
let rtdb: any;
let firestoreModule: any;

if (Platform.OS === "web") {
    // Web needs explicit app initialization before using auth/firestore/database.
    const firebase = require("firebase/compat/app").default;
    require("firebase/compat/auth");
    require("firebase/compat/firestore");
    require("firebase/compat/database");

    const firebaseConfig = {
        apiKey:
            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
        authDomain:
            process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket:
            process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId:
            process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId:
            process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
        databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
    };

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    authInstance = firebase.auth();
    db = firebase.firestore();
    rtdb = firebase.database();
    firestoreModule = firebase.firestore;
} else {
    const auth = require("@react-native-firebase/auth").default;
    const database = require("@react-native-firebase/database").default;
    const firestore = require("@react-native-firebase/firestore").default;

    authInstance = auth();
    db = firestore();
    rtdb = database();
    firestoreModule = firestore;
}

// Export firestore module for FieldValue access.
export { authInstance as auth, db, firestoreModule as firestore, rtdb };

