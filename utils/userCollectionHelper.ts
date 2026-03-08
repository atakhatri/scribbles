import { db } from "@/firebaseConfig";

/**
 * Cache for user collection mappings to avoid repeated Firestore queries
 * Maps userId -> "users" | "guestUsers"
 */
const collectionCache = new Map<string, "users" | "guestUsers">();

/**
 * Determines which Firestore collection a user belongs to (users or guestUsers)
 * with caching and robust error handling
 * 
 * @param userId - The user ID to check
 * @param useCache - Whether to use the cache (default: true)
 * @returns Promise<"users" | "guestUsers">
 */
export async function getUserCollection(
    userId: string,
    useCache: boolean = true
): Promise<"users" | "guestUsers"> {
    if (!userId) {
        console.warn("getUserCollection called with empty userId");
        return "users"; // Default fallback
    }

    // Check cache first
    if (useCache && collectionCache.has(userId)) {
        return collectionCache.get(userId)!;
    }

    try {
        // Try to fetch from users collection first
        const usersDoc = await db.collection("users").doc(userId).get();

        if (usersDoc.exists) {
            collectionCache.set(userId, "users");
            return "users";
        }

        // If not in users, check guestUsers
        const guestDoc = await db.collection("guestUsers").doc(userId).get();

        if (guestDoc.exists) {
            collectionCache.set(userId, "guestUsers");
            return "guestUsers";
        }

        // Document doesn't exist in either collection yet
        // This can happen with race conditions during account creation
        console.warn(`User ${userId} not found in either collection, will retry`);

        // Wait briefly and try one more time
        await new Promise(resolve => setTimeout(resolve, 500));

        const retryUsersDoc = await db.collection("users").doc(userId).get();
        if (retryUsersDoc.exists) {
            collectionCache.set(userId, "users");
            return "users";
        }

        const retryGuestDoc = await db.collection("guestUsers").doc(userId).get();
        if (retryGuestDoc.exists) {
            collectionCache.set(userId, "guestUsers");
            return "guestUsers";
        }

        // Still not found - default to guestUsers (most likely a guest user in progress)
        console.warn(`User ${userId} still not found after retry, defaulting to guestUsers`);
        collectionCache.set(userId, "guestUsers");
        return "guestUsers";

    } catch (error) {
        console.error("Error in getUserCollection:", error);

        // On error, check cache as last resort
        if (collectionCache.has(userId)) {
            return collectionCache.get(userId)!;
        }

        // Ultimate fallback
        return "users";
    }
}

/**
 * Gets the Firestore document reference for a user in the appropriate collection
 * 
 * @param userId - The user ID
 * @param useCache - Whether to use the cache (default: true)
 * @returns Promise with the document reference
 */
export async function getUserDocRef(userId: string, useCache: boolean = true) {
    const collection = await getUserCollection(userId, useCache);
    return db.collection(collection).doc(userId);
}

/**
 * Safely updates a user document with proper collection detection and error handling
 * 
 * @param userId - The user ID
 * @param updateData - The data to update
 * @param useCache - Whether to use the cache (default: true)
 * @returns Promise<boolean> - true if successful, false otherwise
 */
export async function safeUpdateUser(
    userId: string,
    updateData: any,
    useCache: boolean = true
): Promise<boolean> {
    try {
        const docRef = await getUserDocRef(userId, useCache);
        await docRef.update(updateData);
        return true;
    } catch (error) {
        console.error(`Failed to update user ${userId}:`, error);
        return false;
    }
}

/**
 * Safely gets a user document with proper collection detection
 * 
 * @param userId - The user ID
 * @param useCache - Whether to use the cache (default: true)
 * @returns Promise with the document snapshot
 */
export async function safeGetUser(userId: string, useCache: boolean = true) {
    try {
        const docRef = await getUserDocRef(userId, useCache);
        return await docRef.get();
    } catch (error) {
        console.error(`Failed to get user ${userId}:`, error);
        return null;
    }
}

/**
 * Clears the collection cache for a specific user or all users
 * 
 * @param userId - Optional user ID to clear, if not provided clears all
 */
export function clearCollectionCache(userId?: string) {
    if (userId) {
        collectionCache.delete(userId);
    } else {
        collectionCache.clear();
    }
}

/**
 * Fetches multiple users from appropriate collections efficiently
 * 
 * @param userIds - Array of user IDs to fetch
 * @returns Promise<Array> of user objects with id and isGuest properties
 */
export async function fetchMultipleUsers(userIds: string[]): Promise<any[]> {
    if (!userIds || userIds.length === 0) return [];

    const users: any[] = [];
    const uniqueIds = [...new Set(userIds)]; // Remove duplicates

    try {
        // Fetch all users in parallel
        const results = await Promise.all(
            uniqueIds.map(async (id) => {
                try {
                    const collection = await getUserCollection(id);
                    const doc = await db.collection(collection).doc(id).get();

                    if (doc.exists) {
                        return {
                            id: doc.id,
                            isGuest: collection === "guestUsers",
                            ...doc.data(),
                        };
                    }
                    return null;
                } catch (error) {
                    console.error(`Error fetching user ${id}:`, error);
                    return null;
                }
            })
        );

        // Filter out null results
        return results.filter((user) => user !== null) as any[];
    } catch (error) {
        console.error("Error in fetchMultipleUsers:", error);
        return [];
    }
}
