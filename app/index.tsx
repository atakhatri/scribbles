import GRADIENTS from "@/data/gradients";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { usePathname, useRouter } from "expo-router";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  ImageBackground,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Preloader from "../components/preloader";
import WELCOME_TEXT from "../data/welcomePhrases";
import { auth, db } from "../firebaseConfig";
// Generate numbers 1-20 for the wheel
const ROUND_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1);

const WELCOME_PHRASES = WELCOME_TEXT;

const AVATAR_GRADIENTS = GRADIENTS; // Reuse the same gradients for avatars

const getAvatarGradient = (uid: string): [string, string, ...string[]] => {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length] as [
    string,
    string,
    ...string[],
  ];
};

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function Index() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [splashAnimationFinished, setSplashAnimationFinished] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [username, setUsername] = useState("Loading...");
  const [showRoundModal, setShowRoundModal] = useState(false);
  const [greetingTemplate, setGreetingTemplate] = useState(WELCOME_PHRASES[0]);

  // Round Selection State
  const [selectedRounds, setSelectedRounds] = useState(2);
  const [customRounds, setCustomRounds] = useState("");
  const [useCustomInput, setUseCustomInput] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [gameInvite, setGameInvite] = useState<any>(null);
  const [friendsPreview, setFriendsPreview] = useState<any[]>([]);
  const [friendCount, setFriendCount] = useState(0);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [activeGamePlayers, setActiveGamePlayers] = useState<any[]>([]);
  const [avatarGradientIndex, setAvatarGradientIndex] = useState<number>(-1);

  // Animation State
  const [showJoin, setShowJoin] = useState(true);
  const [showLobby, setShowLobby] = useState(false);
  const joinOpacity = useRef(new Animated.Value(1)).current;
  const lobbyOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setGreetingTemplate(
      WELCOME_PHRASES[Math.floor(Math.random() * WELCOME_PHRASES.length)],
    );

    // Ensure preloader runs for at least one full animation cycle (4000ms)
    const timer = setTimeout(() => {
      setSplashAnimationFinished(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  // Handle Fade Transitions between Join and Lobby
  useEffect(() => {
    if (activeGameId) {
      // Transition to Lobby: Fade out Join -> Fade in Lobby
      Animated.timing(joinOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }).start(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setShowJoin(false);
        setShowLobby(true);
        Animated.timing(lobbyOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }).start();
      });
    } else {
      // Transition to Join: Fade out Lobby -> Fade in Join
      Animated.timing(lobbyOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }).start(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setShowLobby(false);
        setShowJoin(true);
        Animated.timing(joinOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }).start();
      });
    }
  }, [activeGameId]);

  // 1. Listen for Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        const docRef = doc(db, "users", currentUser.uid);
        try {
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setUsername(docSnap.data().username);
          } else {
            setUsername(currentUser.displayName || "Player");
          }
        } catch (e) {
          console.error("Error fetching profile", e);
          setUsername(currentUser.displayName || "Player");
        }
      }
      setLoading(false);
    });

    // Check onboarding status
    const checkOnboarding = async () => {
      try {
        const value = await AsyncStorage.getItem("hasSeenOnboarding");
        if (value === "true") {
          setHasSeenOnboarding(true);
        }
      } catch (e) {
        console.error("Error reading onboarding status", e);
      }
    };
    checkOnboarding();
    return () => unsubscribe();
  }, []);

  // 1.5 Listen for Game Invites
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const invites = data.gameInvites || [];
        if (invites.length > 0) {
          // Show the latest invite
          setGameInvite(invites[invites.length - 1]);
        } else {
          setGameInvite(null);
        }

        // Friends Preview
        const fIds = data.friends || [];
        setFriendCount(fIds.length);
        fetchTopFriends(fIds);

        if (data.avatarGradientIndex !== undefined) {
          setAvatarGradientIndex(data.avatarGradientIndex);
        }
      }
    });
    return () => unsub();
  }, [user]);

  // Listen to active game (Waiting Group)
  useEffect(() => {
    if (!activeGameId) return;
    const unsub = onSnapshot(
      doc(db, "games", activeGameId),
      async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();

          // Auto-navigate if game starts
          if (data.status === "playing" && pathname === "/") {
            router.push(`/game/${activeGameId}`);
            setActiveGameId(null);
            return;
          }

          const pIds = data.players || [];
          if (pIds.length > 0) {
            const usersRef = collection(db, "users");
            const q = query(
              usersRef,
              where("__name__", "in", pIds.slice(0, 10)),
            );
            const snap = await getDocs(q);
            const pData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setActiveGamePlayers(pData);
          }

          // Sync rounds from game to local state
          if (data.maxRounds) setSelectedRounds(data.maxRounds);
        }
      },
    );
    return () => unsub();
  }, [activeGameId, pathname]);

  const fetchTopFriends = async (allFriendIds: string[]) => {
    if (allFriendIds.length === 0) {
      setFriendsPreview([]);
      return;
    }
    const idsToFetch = allFriendIds.slice(0, 4);
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("__name__", "in", idsToFetch));
      const snap = await getDocs(q);
      const friendsData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setFriendsPreview(friendsData);
    } catch (e) {
      console.error("Error fetching friends preview", e);
    }
  };

  const handleAcceptInvite = async () => {
    if (!gameInvite || !user) return;
    try {
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        gameInvites: arrayRemove(gameInvite),
      });
      setGameInvite(null);
      router.push(`/game/${gameInvite.roomId}`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeclineInvite = async () => {
    if (!gameInvite || !user) return;
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, {
      gameInvites: arrayRemove(gameInvite),
    });
    setGameInvite(null);
  };

  const handleQuickInvite = async (friendId: string) => {
    try {
      let gameId = activeGameId;
      if (!gameId) {
        gameId = Math.random().toString(36).substring(2, 6).toUpperCase();
        await setDoc(doc(db, "games", gameId), {
          status: "waiting",
          currentDrawer: user!.uid,
          currentWord: "",
          round: 1,
          maxRounds: selectedRounds,
          scores: { [user!.uid]: 0 },
          players: [user!.uid],
          hostId: user!.uid,
          guesses: [],
          createdAt: Date.now(),
        });
        setActiveGameId(gameId);
      }

      await updateDoc(doc(db, "users", friendId), {
        gameInvites: arrayUnion({
          roomId: gameId,
          inviterName: username,
          timestamp: Date.now(),
        }),
      });
      Alert.alert("Invite Sent", "Friend invited to join!");
    } catch (e) {
      console.error("Quick invite failed", e);
      Alert.alert("Error", "Failed to send invite");
    }
  };

  const handleCancelGame = async () => {
    if (!activeGameId) return;
    Alert.alert("Cancel Game", "Stop waiting and delete this room?", [
      { text: "Keep Waiting", style: "cancel" },
      {
        text: "Delete Room",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "games", activeGameId));
            setActiveGameId(null);
            setActiveGamePlayers([]);
          } catch (e) {
            Alert.alert("Error", "Could not delete room");
          }
        },
      },
    ]);
  };

  const updateLobbyRounds = async (delta: number) => {
    if (!activeGameId) return;
    const newRounds = Math.max(1, Math.min(20, selectedRounds + delta));
    try {
      await updateDoc(doc(db, "games", activeGameId), {
        maxRounds: newRounds,
      });
    } catch (e) {
      console.error("Failed to update rounds", e);
    }
  };

  // 2. Navigation Functions
  const handleCreateRoom = async () => {
    let roundsToPlay = selectedRounds;

    if (useCustomInput) {
      const parsed = parseInt(customRounds);
      if (isNaN(parsed) || parsed < 1 || parsed > 20) {
        Alert.alert(
          "Invalid Rounds",
          "Please enter a number between 1 and 20.",
        );
        return;
      }
      roundsToPlay = parsed;
    }

    const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();

    try {
      if (!user) return;

      await setDoc(doc(db, "games", randomCode), {
        status: "waiting",
        currentDrawer: user.uid,
        currentWord: "",
        round: 1,
        maxRounds: roundsToPlay,
        scores: { [user.uid]: 0 },
        players: [user.uid],
        hostId: user.uid,
        guesses: [],
      });
      router.push(`/game/${randomCode}`);
    } catch (error) {
      Alert.alert("Error", "Failed to create game room");
    }
  };

  const joinRoom = () => {
    if (roomCode.trim().length === 0) {
      Alert.alert("Required", "Please enter a room code first.");
      return;
    }
    router.push(`/game/${roomCode.toUpperCase()}`);
  };

  if (loading || !splashAnimationFinished) {
    return <Preloader />;
  }

  // ---------------- RENDER: LOGGED IN LOBBY ----------------
  if (user) {
    return (
      <ImageBackground
        source={require("../assets/images/main_inner.jpeg")}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <SafeAreaProvider style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.welcomeText}>
              {greetingTemplate.replace("{name}", username)}
            </Text>
            <TouchableOpacity onPress={() => router.push("/profile")}>
              <LinearGradient
                colors={
                  (avatarGradientIndex >= 0 &&
                  avatarGradientIndex < AVATAR_GRADIENTS.length
                    ? AVATAR_GRADIENTS[avatarGradientIndex]
                    : getAvatarGradient(user.uid)) as [
                    string,
                    string,
                    ...string[],
                  ]
                }
                style={styles.profileIcon}
              >
                <Text style={styles.profileIconText}>
                  {username[0]?.toUpperCase() || "U"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* <Text style={styles.title}>Scribbles</Text> */}

            {showJoin && (
              <Animated.View style={[styles.card, { opacity: joinOpacity }]}>
                <View style={styles.joinGroupPanel}>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter Room Code"
                    placeholderTextColor={"#333"}
                    value={roomCode}
                    onChangeText={setRoomCode}
                    autoCapitalize="characters"
                    maxLength={6}
                  />
                  <TouchableOpacity
                    style={styles.buttonPrimary}
                    onPress={joinRoom}
                  >
                    <Text style={styles.buttonText}>Join Room</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.divider}>
                  <Text style={styles.dividerText}>OR</Text>
                </View>
                <View style={styles.createGroupPanel}>
                  <View style={styles.roundsSelector}>
                    <Text style={styles.roundsLabel}>Rounds</Text>
                    <View style={styles.stepper}>
                      <TouchableOpacity
                        onPress={() =>
                          setSelectedRounds((prev) => Math.max(1, prev - 1))
                        }
                      >
                        <Ionicons name="remove-circle" size={24} color="#333" />
                      </TouchableOpacity>
                      <Text style={styles.roundsText}>{selectedRounds}</Text>
                      <TouchableOpacity
                        onPress={() =>
                          setSelectedRounds((prev) => Math.min(20, prev + 1))
                        }
                      >
                        <Ionicons name="add-circle" size={24} color="#333" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.buttonSecondary}
                    onPress={handleCreateRoom}
                  >
                    <Text style={styles.buttonTextSecondary}>Create Room</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            {/* Waiting Group Panel */}
            {showLobby && (
              <Animated.View
                style={[styles.waitingGroupPanel, { opacity: lobbyOpacity }]}
              >
                <View style={styles.waitingUpperRow}>
                  <View style={styles.waitingHeader}>
                    <Text style={styles.waitingTitle}>
                      Lobby: {activeGameId}
                    </Text>
                    <Text style={styles.waitingSubtitle}>
                      Waiting for players...
                    </Text>
                  </View>

                  <View style={[styles.roundsSelector, { marginBottom: 15 }]}>
                    <Text style={styles.roundsLabel}>Rounds</Text>
                    <View style={styles.stepper}>
                      <TouchableOpacity onPress={() => updateLobbyRounds(-1)}>
                        <Ionicons name="remove-circle" size={24} color="#333" />
                      </TouchableOpacity>
                      <Text style={styles.roundsText}>{selectedRounds}</Text>
                      <TouchableOpacity onPress={() => updateLobbyRounds(1)}>
                        <Ionicons name="add-circle" size={24} color="#333" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <View style={styles.waitingAvatars}>
                  {activeGamePlayers.map((p) => (
                    <View key={p.id} style={styles.waitingAvatarContainer}>
                      <LinearGradient
                        colors={
                          (p.avatarGradientIndex !== undefined &&
                          p.avatarGradientIndex >= 0 &&
                          p.avatarGradientIndex < AVATAR_GRADIENTS.length
                            ? AVATAR_GRADIENTS[p.avatarGradientIndex]
                            : getAvatarGradient(p.id)) as [
                            string,
                            string,
                            ...string[],
                          ]
                        }
                        style={styles.waitingAvatar}
                      >
                        <Text style={styles.waitingAvatarText}>
                          {p.username?.[0]?.toUpperCase()}
                        </Text>
                      </LinearGradient>
                      <Text style={styles.waitingName} numberOfLines={1}>
                        {p.username}
                      </Text>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.inviteMoreBtn}
                    onPress={() =>
                      router.push({
                        pathname: "/friends",
                        params: { inviteToRoomId: activeGameId },
                      })
                    }
                  >
                    <Ionicons name="add" size={30} color="#666" />
                  </TouchableOpacity>
                </View>
                <View style={styles.waitingBtnRow}>
                  <TouchableOpacity
                    style={styles.cancelGameBtn}
                    onPress={handleCancelGame}
                  >
                    <Text style={styles.cancelGameText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.enterGameBtn}
                    onPress={() => router.push(`/game/${activeGameId}`)}
                  >
                    <Text style={styles.enterGameText}>Enter Game</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            {/* Friends Panel */}
            <View style={styles.friendsPanel}>
              <View style={styles.friendsHeader}>
                <Text style={styles.friendsTitle}>Friends</Text>
              </View>
              <View style={styles.friendsListVertical}>
                {friendsPreview.slice(0, 4).map((friend) => (
                  <View key={friend.id} style={styles.friendRow}>
                    <View style={styles.friendInfo}>
                      <LinearGradient
                        colors={
                          (friend.avatarGradientIndex !== undefined &&
                          friend.avatarGradientIndex >= 0 &&
                          friend.avatarGradientIndex < AVATAR_GRADIENTS.length
                            ? AVATAR_GRADIENTS[friend.avatarGradientIndex]
                            : getAvatarGradient(friend.id)) as [
                            string,
                            string,
                            ...string[],
                          ]
                        }
                        style={styles.friendAvatarSmall}
                      >
                        <Text style={styles.friendAvatarTextSmall}>
                          {friend.username?.[0]?.toUpperCase()}
                        </Text>
                      </LinearGradient>
                      <Text style={styles.friendName}>{friend.username}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.quickInviteBtn}
                      onPress={() => handleQuickInvite(friend.id)}
                    >
                      <Text style={styles.quickInviteText}>Invite</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
              {friendCount > 0 && (
                <TouchableOpacity
                  style={styles.seeAllBtn}
                  onPress={() => router.push("/friends")}
                >
                  <Text style={styles.seeAllText}>View All Friends</Text>
                  <Ionicons name="chevron-down" size={20} color="#ffffff" />
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>

          {/* Game Invite Modal */}
          <Modal
            visible={!!gameInvite}
            transparent
            animationType="fade"
            onRequestClose={handleDeclineInvite}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Game Invite! 🎮</Text>
                <Text style={styles.modalSubtitle}>
                  {gameInvite?.inviterName} invited you to play.
                </Text>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    onPress={handleDeclineInvite}
                    style={styles.cancelBtn}
                  >
                    <Text style={styles.cancelText}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleAcceptInvite}
                    style={styles.confirmBtn}
                  >
                    <Text style={styles.confirmText}>Join Game</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </SafeAreaProvider>
      </ImageBackground>
    );
  }

  // ---------------- RENDER: LANDING SCREEN ----------------
  return (
    <ImageBackground
      source={require("../assets/images/main_bg.jpeg")}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <SafeAreaProvider style={styles.containerTransparent}>
        <View style={styles.content}>
          <Text style={styles.title}>Scribbles</Text>
          <TouchableOpacity
            style={styles.buttonPrimary}
            onPress={() => router.push("/auth/login")}
          >
            <Text style={styles.buttonText}>Log In</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buttonSecondary, { marginTop: 15 }]}
            onPress={() => router.push("/auth/register")}
          >
            <Text style={styles.buttonTextSecondary}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaProvider>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  containerTransparent: {
    flex: 1,
    backgroundColor: "transparent",
  },
  backgroundImage: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 40,
  },
  welcomeText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    padding: 8,
    borderRadius: 10,
    marginLeft: 5,
  },
  profileIcon: {
    width: 48,
    height: 48,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  profileIconText: { color: "#333", fontWeight: "bold", fontSize: 22 },
  content: { flex: 1, justifyContent: "center", padding: 20 },
  scrollContent: { padding: 10, paddingBottom: 50 },
  title: {
    fontSize: 64,
    fontWeight: "bold",
    color: "white",
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
    textAlign: "center",
    marginBottom: 5,
  },
  card: {
    backgroundColor: "#dddddd95",
    borderRadius: 20,
    padding: 10,
    marginBottom: 20,
  },
  label: { fontSize: 18, fontWeight: "900", marginBottom: 10, color: "black" },
  input: {
    backgroundColor: "#fff9f2ff",
    padding: 12,
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 0,
    borderWidth: 2,
    borderColor: "#333",
    color: "#333",
    flex: 1,
  },
  joinGroupPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  buttonPrimary: {
    backgroundColor: "#333",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#333",
  },
  buttonText: { color: "white", fontWeight: "bold", fontSize: 16 },
  buttonSecondary: {
    backgroundColor: "#33333370",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#333",
    flex: 1,
  },
  buttonTextSecondary: { color: "white", fontWeight: "bold", fontSize: 16 },
  divider: { alignItems: "center", marginVertical: 10 },
  dividerText: { color: "#333", fontSize: 18, fontWeight: "bold" },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fffaeeff",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
  },
  modalSubtitle: { fontSize: 16, color: "#666", marginBottom: 20 },

  // Suitcase Lock Picker Styles
  pickerContainer: {
    height: 200,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    backgroundColor: "#fff9f2ff",
    borderRadius: 10,
    overflow: "hidden",
  },
  pickerWindow: {
    position: "absolute",
    top: 75,
    height: 50,
    width: "80%",
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: "#e27d4aff",
    zIndex: 10,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
  },
  scroller: { width: "100%" },
  scrollerContent: { alignItems: "center" },
  scrollItem: {
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  scrollItemText: { fontSize: 24, color: "#ccc", fontWeight: "bold" },
  selectedItemText: { color: "#333", fontSize: 32 },

  customInput: {
    width: "80%",
    height: 50,
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 18,
    textAlign: "center",
    marginBottom: 20,
  },

  toggleInputBtn: { marginBottom: 20 },
  toggleInputText: {
    color: "#333",
    fontSize: 16,
    fontWeight: "600",
    textDecorationLine: "underline",
  },

  modalButtons: { flexDirection: "row", gap: 10, width: "100%" },
  cancelBtn: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    backgroundColor: "#333",
    alignItems: "center",
  },
  cancelText: { color: "#ddd", fontWeight: "bold" },
  confirmBtn: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    backgroundColor: "#e27d4aff",
    alignItems: "center",
  },
  confirmText: { color: "white", fontWeight: "bold" },

  createGroupPanel: {
    flexDirection: "row",
    gap: 8,
  },
  roundsSelector: {
    backgroundColor: "#fff9f2ff",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#333",
    padding: 5,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 100,
  },
  roundsLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#555",
    textTransform: "uppercase",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roundsText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },

  // Friends Panel
  friendsPanel: {
    backgroundColor: "#dddddd95",
    borderRadius: 20,
    padding: 10,
  },
  friendsHeader: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },
  friendsTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ffffff",
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  friendsListVertical: { gap: 10 },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 12,
  },
  friendInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  friendAvatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  friendAvatarTextSmall: { color: "#333", fontWeight: "bold", fontSize: 16 },
  friendName: { fontSize: 16, fontWeight: "600", color: "#333" },
  quickInviteBtn: {
    backgroundColor: "#4a90e2",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  quickInviteText: { color: "white", fontWeight: "bold", fontSize: 12 },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 15,
    gap: 5,
  },
  seeAllText: { color: "#ffffff", fontSize: 14, fontWeight: "600" },

  // Waiting Group Panel
  waitingGroupPanel: {
    backgroundColor: "#dddddd95",
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    alignItems: "center",
  },
  waitingUpperRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  waitingHeader: {
    alignItems: "flex-start",
  },
  waitingTitle: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  waitingSubtitle: { fontSize: 14, color: "#ffffff", marginBottom: 15 },
  waitingAvatars: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 15,
    marginBottom: 20,
    justifyContent: "center",
  },
  waitingAvatarContainer: { alignItems: "center", width: 60 },
  waitingAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 5,
  },
  waitingAvatarText: { fontSize: 20, fontWeight: "bold", color: "#333" },
  waitingName: {
    fontSize: 12,
    color: "#ffffff",
    fontWeight: "bold",
    textAlign: "center",
  },
  inviteMoreBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0f0f0",
    borderWidth: 2,
    borderColor: "#333",
    borderStyle: "dashed",
  },
  waitingBtnRow: { flexDirection: "row", gap: 10 },
  enterGameBtn: {
    flex: 1,
    backgroundColor: "#ff9900",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  enterGameText: { color: "#333", fontWeight: "bold", fontSize: 16 },
  cancelGameBtn: {
    flex: 1,
    backgroundColor: "#fee2e2",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelGameText: {
    color: "#991b1b",
    fontWeight: "bold",
    fontSize: 16,
  },
});
