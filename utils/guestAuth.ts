import { auth, db, firestore } from "../firebaseConfig";

// Generate a random guest username
const generateGuestUsername = () => {
    const adjectives = [
        "Swift",
        "Brave",
        "Clever",
        "Bold",
        "Bright",
        "Quick",
        "Silent",
        "Wild",
        "Epic",
        "Cosmic",
    ];
    const nouns = [
        "Artist",
        "Painter",
        "Sketcher",
        "Creator",
        "Doodler",
        "Designer",
        "Craftsman",
        "Illustrator",
        "Drawer",
        "Scribbler",
    ];
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomNum = Math.floor(Math.random() * 999);
    return `${randomAdj}${randomNoun}${randomNum}`;
};

// Sign in as guest
export const signInAsGuest = async () => {
    try {
        // Validate Firebase is initialized
        if (!auth || !db) {
            throw new Error("Firebase not initialized");
        }

        // Check if auth is ready
        if (typeof auth.signInAnonymously !== "function") {
            throw new Error("Anonymous authentication not available");
        }

        console.log("Attempting anonymous sign in...");
        const userCredential = await auth.signInAnonymously();

        if (!userCredential || !userCredential.user) {
            throw new Error("Failed to create anonymous user");
        }

        const user = userCredential.user;
        console.log("Anonymous user created:", user.uid);

        const guestUsername = generateGuestUsername();

        // Create guest user document in guestUsers collection
        console.log("Creating guest user document...");
        await db.collection("guestUsers").doc(user.uid).set({
            username: guestUsername,
            email: "Guest",
            isGuest: true,
            createdAt: firestore.FieldValue.serverTimestamp(),
            friends: [],
            isOnline: false,
            lastSeen: Date.now(),
        });

        // Verify document was created
        console.log("Verifying guest user document...");
        const docCheck = await db.collection("guestUsers").doc(user.uid).get();
        if (!docCheck.exists) {
            throw new Error("Failed to verify guest user document creation");
        }

        console.log("Guest user document created and verified successfully");
        return user;
    } catch (error: any) {
        console.error("Error signing in as guest:", error);
        console.error("Error code:", error?.code);
        console.error("Error message:", error?.message);

        // Re-throw with more context
        const errorMessage = error?.message || "Unknown error";
        const errorCode = error?.code || "unknown";
        throw new Error(`Guest login failed: ${errorMessage} (${errorCode})`);
    }
};

// Clean up guest account on logout
export const cleanupGuestAccount = async (userId: string) => {
    try {
        // Check if user document exists in guestUsers collection
        await db.collection("guestUsers").doc(userId).delete();
        console.log("Guest account cleaned up:", userId);
    } catch (error) {
        console.error("Error cleaning up guest account:", error);
    }
};

// Check if a user is a guest
export const isGuestUser = async (userId: string): Promise<boolean> => {
    try {
        const guestDoc = await db.collection("guestUsers").doc(userId).get();
        return !!guestDoc.exists;
    } catch (error) {
        console.error("Error checking if user is guest:", error);
        return false;
    }
};
