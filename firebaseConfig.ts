import auth from "@react-native-firebase/auth";
import database from "@react-native-firebase/database";
import firestore from "@react-native-firebase/firestore";

// React Native Firebase auto-initializes from google-services.json
// No need to call initializeApp()

// Get references to Firebase services
const authInstance = auth();
const db = firestore();
const rtdb = database();

// Export firestore module for FieldValue access
export { authInstance as auth, db, firestore, rtdb };

