const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

/**
 * Scheduled function to delete game rooms that haven't been updated in 1 hour.
 * Runs every 60 minutes.
 */
exports.cleanupOldGames = functions.pubsub
  .schedule("every 60 minutes")
  .onRun(async (context) => {
    const db = admin.firestore();
    const now = Date.now();
    const cutoff = now - 60 * 60 * 1000; // 1 hour ago
    const cutoffDate = new Date(cutoff);

    // Query for games where 'lastUpdated' is older than 1 hour
    const gamesRef = db.collection("games");
    const snapshot = await gamesRef.where("lastUpdated", "<", cutoffDate).get();

    if (snapshot.empty) {
      return null;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`Deleted ${snapshot.size} inactive games.`);
    return null;
  });
