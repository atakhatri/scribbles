import { db } from "../firebaseConfig";

/**
 * Clean up guest user data from Firestore when a guest logs out.
 * Active rooms are now managed in-memory by the WebSocket server and cleaned up automatically on disconnect.
 */
export const cleanupGuestAccount = async (uid: string): Promise<void> => {
  try {
    const guestDocRef = db.collection("guestUsers").doc(uid);
    const guestDoc = await guestDocRef.get();

    if (!guestDoc.exists) {
      return;
    }

    const guestData = guestDoc.data();
    const friends: string[] = guestData?.friends || [];

    // Remove this guest from all friends' friend lists in both collections
    const cleanupPromises = friends.map(async (friendUid) => {
      const userRef = db.collection("users").doc(friendUid);
      const userDoc = await userRef.get();

      if (userDoc.exists) {
        const updatedFriends = (userDoc.data()?.friends || []).filter(
          (id: string) => id !== uid,
        );
        await userRef.update({ friends: updatedFriends });
      } else {
        const guestFriendRef = db.collection("guestUsers").doc(friendUid);
        const guestFriendDoc = await guestFriendRef.get();
        if (guestFriendDoc.exists) {
          const updatedFriends = (guestFriendDoc.data()?.friends || []).filter(
            (id: string) => id !== uid,
          );
          await guestFriendRef.update({ friends: updatedFriends });
        }
      }
    });

    await Promise.all(cleanupPromises);

    // Delete the guest user document itself
    await guestDocRef.delete();
  } catch (error) {
    console.error("Error cleaning up guest account:", error);
  }
};