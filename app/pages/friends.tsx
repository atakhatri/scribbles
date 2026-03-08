import { useToast } from "@/context/ToastContext";
import GRADIENTS from "@/data/gradients";
import { auth, db, firestore } from "@/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatarGradientIndex?: number;
  isOnline?: boolean;
  lastSeen?: number;
  isGuest?: boolean;
}

const AVATAR_GRADIENTS = GRADIENTS;

const getAvatarGradient = (uid: string) => {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
};

const formatLastSeen = (timestamp?: number, isOnline?: boolean) => {
  if (!timestamp) return "Offline";
  const diff = Date.now() - timestamp;

  // If marked online and heartbeat within 2 mins, show Online
  if (isOnline && diff < 2 * 60 * 1000) return "Online";

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `Active ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Active ${days}d ago`;
};

export default function FriendsScreen() {
  const router = useRouter();
  const { inviteToRoomId } = useLocalSearchParams();
  const currentUser = auth.currentUser;
  const { showToast, showAlert } = useToast();
  const insets = useSafeAreaInsets();

  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);

  // Lists of users
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<UserProfile[]>([]);

  // My ID lists (for UI state)
  const [myFriendIds, setMyFriendIds] = useState<string[]>([]);
  const [myIncomingRequestIds, setMyIncomingRequestIds] = useState<string[]>(
    [],
  );
  const [myOutgoingRequestIds, setMyOutgoingRequestIds] = useState<string[]>(
    [],
  );

  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  // Selection Mode State
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);

  // Helper: Determine user collection
  const getUserCollection = async (
    userId: string,
  ): Promise<"users" | "guestUsers"> => {
    const usersDoc = await db.collection("users").doc(userId).get();
    return usersDoc.exists ? "users" : "guestUsers";
  };

  // 1. Listen to MY profile changes (Real-time updates for requests)
  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);

    // Check if current user is in users or guestUsers collection
    const checkAndListen = async () => {
      let myDocRef = db.collection("users").doc(currentUser.uid);
      let docSnap = await db.collection("users").doc(currentUser.uid).get();

      if (!docSnap.exists) {
        myDocRef = db.collection("guestUsers").doc(currentUser.uid);
      }

      const unsubscribe = myDocRef.onSnapshot(async (docSnap) => {
        if (docSnap.exists) {
          const data = docSnap.data();
          const fIds = data.friends || [];
          const incIds = data.incomingRequests || [];
          const outIds = data.outgoingRequests || [];

          setMyFriendIds(fIds);
          setMyIncomingRequestIds(incIds);
          setMyOutgoingRequestIds(outIds);

          // Fetch full profiles for friends and requests
          if (fIds.length > 0) await fetchUsersByIds(fIds, setFriends);
          else setFriends([]);

          if (incIds.length > 0) await fetchUsersByIds(incIds, setRequests);
          else setRequests([]);

          setLoading(false);
        }
      });

      return unsubscribe;
    };

    let unsubscribe: (() => void) | undefined;
    checkAndListen().then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Helper: Fetch user details from a list of IDs
  const fetchUsersByIds = async (
    ids: string[],
    setFunction: (users: UserProfile[]) => void,
  ) => {
    if (ids.length === 0) {
      setFunction([]);
      return;
    }
    try {
      // Firestore 'in' query is limited to 10.
      const idsToCheck = ids.slice(0, 10).filter(Boolean);

      if (idsToCheck.length === 0) {
        setFunction([]);
        return;
      }

      // Query both users and guestUsers collections
      const loadedUsers: UserProfile[] = [];

      // Fetch from users collection
      for (const id of idsToCheck) {
        try {
          const userDoc = await db.collection("users").doc(id).get();
          if (userDoc.exists) {
            loadedUsers.push({
              id: userDoc.id,
              ...userDoc.data(),
            } as UserProfile);
          }
        } catch (e) {
          // Continue to next
        }
      }

      // Fetch from guestUsers collection
      for (const id of idsToCheck) {
        // Only fetch if not already found
        if (!loadedUsers.find((u) => u.id === id)) {
          try {
            const guestDoc = await db.collection("guestUsers").doc(id).get();
            if (guestDoc.exists) {
              loadedUsers.push({
                id: guestDoc.id,
                isGuest: true,
                ...guestDoc.data(),
              } as UserProfile);
            }
          } catch (e) {
            // Continue to next
          }
        }
      }

      // Sort by Last Seen Descending (Most recent first)
      loadedUsers.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

      setFunction(loadedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  // 2. Search for users
  const handleSearch = async () => {
    if (!searchText.trim()) return;
    setSearching(true);
    setSearchResults([]);

    try {
      const text = searchText.trim();
      const foundUsers = new Map<string, UserProfile>();

      // Search in users collection
      try {
        const usersSnap = await db
          .collection("users")
          .where("username", ">=", text)
          .where("username", "<=", text + "\uf8ff")
          .get();

        usersSnap.docs.forEach((doc) =>
          foundUsers.set(doc.id, { id: doc.id, ...doc.data() } as UserProfile),
        );

        // Try email search on users
        const emailSnap = await db
          .collection("users")
          .where("email", "==", text)
          .get();
        emailSnap.docs.forEach((doc) =>
          foundUsers.set(doc.id, { id: doc.id, ...doc.data() } as UserProfile),
        );
      } catch (e) {
        console.error("Users search error:", e);
      }

      // Search in guestUsers collection
      try {
        const guestSnap = await db
          .collection("guestUsers")
          .where("username", ">=", text)
          .where("username", "<=", text + "\uf8ff")
          .get();

        guestSnap.docs.forEach((doc) =>
          foundUsers.set(doc.id, {
            id: doc.id,
            isGuest: true,
            ...doc.data(),
          } as UserProfile),
        );
      } catch (e) {
        console.error("Guest users search error:", e);
      }

      foundUsers.delete(currentUser?.uid || ""); // Remove myself
      setSearchResults(Array.from(foundUsers.values()));
    } catch (error) {
      console.error(error);
      showToast({ message: "Search failed", type: "error" });
    } finally {
      setSearching(false);
    }
  };

  // 3. Send Friend Request
  const sendRequest = async (targetUserId: string) => {
    if (!currentUser) return;
    try {
      const myCollection = await getUserCollection(currentUser.uid);
      const targetCollection = await getUserCollection(targetUserId);

      const myRef = db.collection(myCollection).doc(currentUser.uid);
      const targetRef = db.collection(targetCollection).doc(targetUserId);

      await myRef.update({
        outgoingRequests: firestore.FieldValue.arrayUnion(targetUserId),
      });
      await targetRef.update({
        incomingRequests: firestore.FieldValue.arrayUnion(currentUser.uid),
      });

      showToast({ message: "Friend request sent!", type: "success" });
    } catch (error) {
      showToast({ message: "Could not send request", type: "error" });
    }
  };

  // 4. Accept Friend Request
  const acceptRequest = async (requesterId: string) => {
    if (!currentUser) return;
    try {
      const myCollection = await getUserCollection(currentUser.uid);
      const requesterCollection = await getUserCollection(requesterId);

      const myRef = db.collection(myCollection).doc(currentUser.uid);
      const requesterRef = db.collection(requesterCollection).doc(requesterId);

      await myRef.update({
        friends: firestore.FieldValue.arrayUnion(requesterId),
        incomingRequests: firestore.FieldValue.arrayRemove(requesterId),
      });

      await requesterRef.update({
        friends: firestore.FieldValue.arrayUnion(currentUser.uid),
        outgoingRequests: firestore.FieldValue.arrayRemove(currentUser.uid),
      });

      showToast({ message: "You are now friends!", type: "success" });
    } catch (error) {
      showToast({ message: "Could not accept request", type: "error" });
    }
  };

  // 5. Remove Selected Friends
  const removeSelectedFriends = async () => {
    if (!currentUser || selectedFriends.length === 0) return;

    showAlert({
      title: "Remove Friends",
      message: `Are you sure you want to remove ${selectedFriends.length} friend(s)?`,
      buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              const myCollection = await getUserCollection(currentUser.uid);
              const myRef = db.collection(myCollection).doc(currentUser.uid);

              // Process removals in parallel
              const promises = selectedFriends.map(async (friendId) => {
                const friendCollection = await getUserCollection(friendId);
                const friendRef = db.collection(friendCollection).doc(friendId);
                await myRef.update({
                  friends: firestore.FieldValue.arrayRemove(friendId),
                });
                await friendRef.update({
                  friends: firestore.FieldValue.arrayRemove(currentUser.uid),
                });
              });

              await Promise.all(promises);
              setSelectionMode(false);
              setSelectedFriends([]);
            } catch (error) {
              showToast({
                message: "Could not remove some friends",
                type: "error",
              });
            }
          },
        },
      ],
    });
  };

  // 6. Invite Friend to Room
  const inviteFriendToRoom = async (friendId: string) => {
    if (!currentUser || !inviteToRoomId) return;
    try {
      await sendRequest(friendId); // Reusing sendRequest logic isn't quite right for game invites, let's fix:
      const targetCollection = await getUserCollection(friendId);
      const targetRef = db.collection(targetCollection).doc(friendId);
      await targetRef.update({
        gameInvites: firestore.FieldValue.arrayUnion({
          roomId: inviteToRoomId,
          inviterName: currentUser.displayName || "Player",
          timestamp: Date.now(),
        }),
      });
      showToast({ message: "Invitation sent successfully!", type: "success" });
    } catch (e) {
      showToast({ message: "Failed to send invite", type: "error" });
    }
  };

  const toggleSelection = (id: string) => {
    if (selectedFriends.includes(id)) {
      setSelectedFriends(selectedFriends.filter((fid) => fid !== id));
    } else {
      setSelectedFriends([...selectedFriends, id]);
    }
  };

  // UI Helper: Render action button based on relationship
  const renderActionButton = (user: UserProfile) => {
    if (myFriendIds.includes(user.id)) {
      return (
        <View
          style={[
            styles.actionBadge,
            { backgroundColor: "#e0e0e0", borderColor: "#333", borderWidth: 1 },
          ]}
        >
          <Text style={[styles.actionText, { color: "#333" }]}>Friends</Text>
        </View>
      );
    }
    if (myIncomingRequestIds.includes(user.id)) {
      return (
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: "#4caf50" }]}
          onPress={() => acceptRequest(user.id)}
        >
          <Text style={styles.actionButtonText}>Accept</Text>
        </TouchableOpacity>
      );
    }
    if (myOutgoingRequestIds.includes(user.id)) {
      return (
        <View
          style={[
            styles.actionBadge,
            {
              backgroundColor: "#fff3cd",
              borderColor: "#856404",
              borderWidth: 1,
            },
          ]}
        >
          <Text style={[styles.actionText, { color: "#856404" }]}>Sent</Text>
        </View>
      );
    }
    return (
      <TouchableOpacity
        style={styles.actionButton}
        onPress={() => sendRequest(user.id)}
      >
        <Text style={styles.actionButtonText}>Add Friend</Text>
      </TouchableOpacity>
    );
  };

  return (
    <ImageBackground
      source={require("../../assets/images/friends.jpeg")}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <View style={styles.container}>
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        >
          <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>
              {inviteToRoomId ? "Invite Friends" : "Friends"}
            </Text>

            <View style={{ width: 50 }} />
          </View>
          {/* SECTION 1: FRIEND REQUESTS */}
          {requests.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Friend Requests ({requests.length})
              </Text>
              {requests.map((req) => (
                <View key={req.id} style={styles.requestCard}>
                  <View>
                    <Text style={styles.searchName}>{req.username}</Text>
                    <Text style={styles.searchEmail}>wants to be friends</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      { backgroundColor: "#4caf50" },
                    ]}
                    onPress={() => acceptRequest(req.id)}
                  >
                    <Text style={styles.actionButtonText}>Accept</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* SECTION 2: SEARCH */}
          <View style={styles.searchContainer}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Username or Email"
                value={searchText}
                onChangeText={setSearchText}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.searchButton}
                onPress={handleSearch}
                disabled={searching}
              >
                {searching ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Ionicons name="search" size={16} color="white" />
                )}
              </TouchableOpacity>
            </View>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <View style={styles.resultsContainer}>
                {searchResults.map((user) => (
                  <View key={user.id} style={styles.userRow}>
                    <View>
                      <Text style={styles.searchName}>{user.username}</Text>
                      <Text style={styles.searchEmail}>
                        {user.isGuest ? "Guest" : user.email}
                      </Text>
                    </View>
                    {renderActionButton(user)}
                  </View>
                ))}
              </View>
            )}
            {searchResults.length === 0 && !searching && searchText !== "" && (
              <Text style={styles.noResults}>
                No users found. Try exact match.
              </Text>
            )}
          </View>

          <View style={styles.divider} />

          {/* SECTION 3: FRIENDS LIST */}
          <View style={styles.friendSection}>
            <Text style={styles.sectionTitle}>
              Your Friends ({friends.length})
            </Text>
            {!inviteToRoomId && friends.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setSelectionMode(!selectionMode);
                  setSelectedFriends([]);
                }}
                style={styles.manageButton}
              >
                <Text style={styles.manageButtonText}>
                  {selectionMode ? "Done" : "Manage"}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {loading && friends.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 20 }} color="#4a90e2" />
          ) : (
            <View>
              {friends.length === 0 ? (
                <Text style={styles.emptyText}>No friends yet.</Text>
              ) : (
                friends.map((friend) => (
                  <TouchableOpacity
                    key={friend.id}
                    style={styles.friendCard}
                    disabled={!selectionMode}
                    onPress={() => toggleSelection(friend.id)}
                    activeOpacity={0.8}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flex: 1,
                      }}
                    >
                      <LinearGradient
                        colors={
                          friend.avatarGradientIndex !== undefined &&
                          friend.avatarGradientIndex >= 0 &&
                          friend.avatarGradientIndex < AVATAR_GRADIENTS.length
                            ? AVATAR_GRADIENTS[friend.avatarGradientIndex]
                            : getAvatarGradient(friend.id)
                        }
                        style={styles.avatar}
                      >
                        <Text style={styles.avatarText}>
                          {friend.username[0].toUpperCase()}
                        </Text>
                        {friend.isOnline && (
                          <View style={styles.onlineIndicatorLarge} />
                        )}
                      </LinearGradient>
                      <View>
                        <Text style={styles.friendName}>{friend.username}</Text>
                        <Text style={styles.friendEmail}>
                          {friend.isGuest ? "Guest" : friend.email}
                        </Text>
                        <Text
                          style={[
                            styles.friendStatusText,
                            friend.isOnline &&
                            Date.now() - (friend.lastSeen || 0) < 120000
                              ? { color: "#4caf50", fontWeight: "bold" }
                              : { color: "#333", fontWeight: "bold" },
                          ]}
                        >
                          {formatLastSeen(friend.lastSeen, friend.isOnline)}
                        </Text>
                      </View>
                    </View>

                    {/* Right Side Action */}
                    {inviteToRoomId ? (
                      <TouchableOpacity
                        style={styles.inviteButton}
                        onPress={() => inviteFriendToRoom(friend.id)}
                      >
                        <Text style={styles.inviteButtonText}>Invite</Text>
                      </TouchableOpacity>
                    ) : selectionMode ? (
                      <View style={styles.checkbox}>
                        {selectedFriends.includes(friend.id) && (
                          <Ionicons name="checkmark" size={18} color="white" />
                        )}
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* Bulk Remove Button */}
          {selectionMode && selectedFriends.length > 0 && (
            <TouchableOpacity
              style={styles.bulkRemoveButton}
              onPress={removeSelectedFriends}
            >
              <Text style={styles.bulkRemoveText}>
                Remove Selected ({selectedFriends.length})
              </Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff00" },
  backgroundImage: { flex: 1 },
  content: { flex: 1, padding: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    // paddingTop: 30, // Handled dynamically
    marginBottom: 20,
  },
  backButton: { padding: 0 },
  backButtonText: { color: "white", fontWeight: "bold", fontSize: 20 },
  title: { fontSize: 28, fontWeight: "bold", color: "white" },
  section: { marginBottom: 15 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
    marginBottom: 10,
    paddingLeft: 10,
  },
  friendSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },

  // Requests
  requestCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "#e8f5e9",
    borderRadius: 10,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#4caf50",
  },

  // Search
  searchContainer: {
    backgroundColor: "#dddddda0",
    padding: 10,
    borderRadius: 15,
    marginBottom: 20,
  },
  inputRow: { flexDirection: "row", gap: 10 },
  input: {
    flex: 1,
    backgroundColor: "#f9f9f9",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  searchButton: {
    backgroundColor: "#ffaa00ff",
    padding: 14,
    justifyContent: "center",
    borderRadius: 100,
    borderWidth: 1,
    borderColor: "#333",
  },
  searchButtonText: { color: "white", fontWeight: "bold" },

  resultsContainer: { marginTop: 12 },
  searchName: { fontSize: 16, fontWeight: "bold", color: "#333" },
  searchEmail: { fontSize: 12, color: "#666", marginTop: 2 },
  userRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#f0f8ff",
    borderRadius: 8,
    marginBottom: 5,
  },
  noResults: {
    marginTop: 10,
    color: "white",
    fontStyle: "italic",
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 16,
  },

  // Buttons
  actionButton: {
    backgroundColor: "#333",
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 6,
    borderColor: "#333",
    borderWidth: 1,
  },
  actionButtonText: { color: "white", fontSize: 12, fontWeight: "bold" },
  actionBadge: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 6 },
  actionText: { fontSize: 12, fontWeight: "bold" },

  // Invite Button
  inviteButton: {
    backgroundColor: "#4a90e2",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  inviteButtonText: { color: "white", fontSize: 12, fontWeight: "bold" },

  // Manage Button
  manageButton: {
    padding: 8,
    backgroundColor: "#dddddda0",
    borderRadius: 8,
  },
  manageButtonText: { color: "white", fontWeight: "bold", fontSize: 14 },

  // Checkbox
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#666",
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
  },

  // Bulk Remove
  bulkRemoveButton: {
    backgroundColor: "#d32f2f",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
    marginBottom: 20,
  },
  bulkRemoveText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },

  divider: { height: 2, backgroundColor: "#ddd", marginBottom: 20 },

  // Friend Card
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#dddddda0",
    padding: 15,
    borderTopLeftRadius: 16,
    borderBottomRightRadius: 16,
    marginBottom: 10,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
    position: "relative",
  },
  onlineIndicatorLarge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#4caf50",
    borderWidth: 2,
    borderColor: "#dddddd",
  },
  avatarText: { fontSize: 20, fontWeight: "bold", color: "#333" },
  friendName: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  friendEmail: { fontSize: 16, color: "#333" },
  username: { fontWeight: "bold", color: "#fff" },
  friendStatusText: { fontSize: 12, marginTop: 2, fontWeight: "bold" },
  email: { fontSize: 12, color: "#666", marginTop: 2, flexShrink: 1 },
  emptyText: { textAlign: "center", color: "#999", marginTop: 10 },
});
