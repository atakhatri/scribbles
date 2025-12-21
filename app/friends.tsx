import { useRouter } from "expo-router";
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";

interface UserProfile {
  id: string;
  username: string;
  email: string;
}

export default function FriendsScreen() {
  const router = useRouter();
  const currentUser = auth.currentUser;

  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);

  // Lists of users
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<UserProfile[]>([]);

  // My ID lists (for UI state)
  const [myFriendIds, setMyFriendIds] = useState<string[]>([]);
  const [myIncomingRequestIds, setMyIncomingRequestIds] = useState<string[]>(
    []
  );
  const [myOutgoingRequestIds, setMyOutgoingRequestIds] = useState<string[]>(
    []
  );

  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  // 1. Listen to MY profile changes (Real-time updates for requests)
  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);

    const myDocRef = doc(db, "users", currentUser.uid);
    const unsubscribe = onSnapshot(myDocRef, async (docSnap) => {
      if (docSnap.exists()) {
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

    return () => unsubscribe();
  }, []);

  // Helper: Fetch user details from a list of IDs
  const fetchUsersByIds = async (
    ids: string[],
    setFunction: (users: UserProfile[]) => void
  ) => {
    try {
      // Firestore 'in' query is limited to 10.
      const idsToCheck = ids.slice(0, 10);
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("__name__", "in", idsToCheck));
      const querySnapshot = await getDocs(q);

      const loadedUsers: UserProfile[] = [];
      querySnapshot.forEach((doc) => {
        loadedUsers.push({ id: doc.id, ...doc.data() } as UserProfile);
      });
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
      const usersRef = collection(db, "users");
      const text = searchText.trim();

      // QUERY 1: Username "Starts With" search
      const usernameQuery = query(
        usersRef,
        where("username", ">=", text),
        where("username", "<=", text + "\uf8ff")
      );

      // QUERY 2: Email Exact Match
      const emailQuery = query(usersRef, where("email", "==", text));

      const [usernameSnap, emailSnap] = await Promise.all([
        getDocs(usernameQuery),
        getDocs(emailQuery),
      ]);

      const foundUsers = new Map<string, UserProfile>();
      usernameSnap.forEach((doc) =>
        foundUsers.set(doc.id, { id: doc.id, ...doc.data() } as UserProfile)
      );
      emailSnap.forEach((doc) =>
        foundUsers.set(doc.id, { id: doc.id, ...doc.data() } as UserProfile)
      );

      foundUsers.delete(currentUser?.uid || ""); // Remove myself
      setSearchResults(Array.from(foundUsers.values()));
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Search failed");
    } finally {
      setSearching(false);
    }
  };

  // 3. Send Friend Request
  const sendRequest = async (targetUserId: string) => {
    if (!currentUser) return;
    try {
      const myRef = doc(db, "users", currentUser.uid);
      const targetRef = doc(db, "users", targetUserId);

      await updateDoc(myRef, { outgoingRequests: arrayUnion(targetUserId) });
      await updateDoc(targetRef, {
        incomingRequests: arrayUnion(currentUser.uid),
      });

      Alert.alert("Success", "Friend request sent!");
    } catch (error) {
      Alert.alert("Error", "Could not send request");
    }
  };

  // 4. Accept Friend Request
  const acceptRequest = async (requesterId: string) => {
    if (!currentUser) return;
    try {
      const myRef = doc(db, "users", currentUser.uid);
      const requesterRef = doc(db, "users", requesterId);

      await updateDoc(myRef, {
        friends: arrayUnion(requesterId),
        incomingRequests: arrayRemove(requesterId),
      });

      await updateDoc(requesterRef, {
        friends: arrayUnion(currentUser.uid),
        outgoingRequests: arrayRemove(currentUser.uid),
      });

      Alert.alert("Success", "You are now friends!");
    } catch (error) {
      Alert.alert("Error", "Could not accept request");
    }
  };

  // 5. Remove Friend (NEW)
  const removeFriend = async (friendId: string) => {
    if (!currentUser) return;

    Alert.alert(
      "Remove Friend",
      "Are you sure you want to remove this friend?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              const myRef = doc(db, "users", currentUser.uid);
              const friendRef = doc(db, "users", friendId);

              // Remove from both lists
              await updateDoc(myRef, { friends: arrayRemove(friendId) });
              await updateDoc(friendRef, {
                friends: arrayRemove(currentUser.uid),
              });
            } catch (error) {
              Alert.alert("Error", "Could not remove friend");
            }
          },
        },
      ]
    );
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
      source={require("../assets/images/friends.jpeg")}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <SafeAreaProvider style={styles.container}>
        <ScrollView style={styles.content}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Friends</Text>
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
                    <Text style={styles.username}>{req.username}</Text>
                    <Text style={styles.email}>wants to be friends</Text>
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
            <Text style={styles.sectionTitle}>Find Players</Text>
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
                  <Text style={styles.searchButtonText}>Search</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <View style={styles.resultsContainer}>
                {searchResults.map((user) => (
                  <View key={user.id} style={styles.userRow}>
                    <View>
                      <Text style={styles.username}>{user.username}</Text>
                      <Text style={styles.email}>{user.email}</Text>
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
          <Text style={styles.sectionTitle}>
            Your Friends ({friends.length})
          </Text>

          {loading && friends.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 20 }} color="#4a90e2" />
          ) : (
            <View>
              {friends.length === 0 ? (
                <Text style={styles.emptyText}>No friends yet.</Text>
              ) : (
                friends.map((friend) => (
                  <View key={friend.id} style={styles.friendCard}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flex: 1,
                      }}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {friend.username[0].toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.friendName}>{friend.username}</Text>
                        <Text style={styles.friendEmail}>Friend</Text>
                      </View>
                    </View>
                    {/* Remove Button */}
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removeFriend(friend.id)}
                    >
                      <Text style={styles.removeButtonText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaProvider>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff33" },
  backgroundImage: { flex: 1 },
  content: { flex: 1, padding: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 30,
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
    backgroundColor: "#dddddd7f",
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
    borderColor: "#ddd",
  },
  searchButton: {
    backgroundColor: "#ffaa00ff",
    paddingHorizontal: 20,
    justifyContent: "center",
    borderRadius: 8,
  },
  searchButtonText: { color: "white", fontWeight: "bold" },

  resultsContainer: { marginTop: 12 },
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

  // Remove Button
  removeButton: {
    backgroundColor: "#ffebee",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderColor: "#d32f2fff",
    borderWidth: 1,
  },
  removeButtonText: { color: "#d32f2f", fontSize: 11, fontWeight: "bold" },

  divider: { height: 2, backgroundColor: "#ddd", marginBottom: 20 },

  // Friend Card
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fffcf0ff",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  avatarText: { fontSize: 20, fontWeight: "bold", color: "white" },
  friendName: { fontSize: 16, fontWeight: "bold", color: "#333" },
  friendEmail: { fontSize: 12, color: "#434343ff" },
  username: { fontWeight: "bold", color: "#333" },
  email: { fontSize: 12, color: "#666", marginTop: 2, flexShrink: 1 },
  emptyText: { textAlign: "center", color: "#999", marginTop: 10 },
});
