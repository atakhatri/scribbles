import GRADIENTS from "@/data/gradients";
import { auth, db, firestore } from "../firebaseConfig";

/**
 * Sign in anonymously as a guest and create a guestUsers document in Firestore.
 * Supports an optional custom nickname chosen by the user on the Landing Screen.
 */
export const signInAsGuest = async (customNickname?: string) => {
  const userCredential = await auth.signInAnonymously();
  const user = userCredential.user;

  if (!user) {
    throw new Error("Failed to create guest user");
  }

  const cleanNickname = customNickname?.trim();
  const guestName =
    cleanNickname && cleanNickname.length >= 2
      ? cleanNickname
      : `Guest_${user.uid.substring(0, 5).toUpperCase()}`;

  await user.updateProfile({ displayName: guestName });

  const randomGradientIndex = Math.floor(Math.random() * GRADIENTS.length);

  await db
    .collection("guestUsers")
    .doc(user.uid)
    .set(
      {
        uid: user.uid,
        username: guestName,
        usernameLower: guestName.toLowerCase(),
        displayName: guestName,
        isGuest: true,
        wins: 0,
        totalGames: 0,
        totalScore: 0,
        friends: [],
        friendRequests: [],
        sentRequests: [],
        gameInvites: [],
        avatarGradientIndex: randomGradientIndex,
        createdAt: firestore.FieldValue.serverTimestamp(),
        lastSeen: Date.now(),
        isOnline: true,
      },
      { merge: true },
    );

  return user;
};

/**
 * Clean up guest user data from Firestore when a guest logs out.
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
    await guestDocRef.delete();
  } catch (error) {
    console.error("Error cleaning up guest account:", error);
  }
};