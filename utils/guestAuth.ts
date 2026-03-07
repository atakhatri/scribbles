import { signInAnonymously, User } from "firebase/auth";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

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
export const signInAsGuest = async (): Promise<User> => {
    try {
        const userCredential = await signInAnonymously(auth);
        const user = userCredential.user;
        const guestUsername = generateGuestUsername();

        // Create guest user document in guestUsers collection
        await setDoc(doc(db, "guestUsers", user.uid), {
            username: guestUsername,
            email: "Guest",
            isGuest: true,
            createdAt: serverTimestamp(),
            friends: [],
        });

        return user;
    } catch (error) {
        console.error("Error signing in as guest:", error);
        throw error;
    }
};

// Clean up guest account on logout
export const cleanupGuestAccount = async (userId: string) => {
    try {
        // Check if user document exists in guestUsers collection
        await deleteDoc(doc(db, "guestUsers", userId));
        console.log("Guest account cleaned up:", userId);
    } catch (error) {
        console.error("Error cleaning up guest account:", error);
    }
};

// Check if a user is a guest
export const isGuestUser = async (userId: string): Promise<boolean> => {
    try {
        const guestDocRef = doc(db, "guestUsers", userId);
        const guestDoc = await (await import("firebase/firestore")).getDoc(
            guestDocRef,
        );
        return guestDoc.exists();
    } catch (error) {
        console.error("Error checking if user is guest:", error);
        return false;
    }
};
