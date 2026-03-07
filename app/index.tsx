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
  Animated,
  Dimensions,
  Easing,
  ImageBackground,
  LayoutAnimation,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AnimatedBackground from "../components/AnimatedBG";
import HomeCanvas from "../components/HomeCanvas";
import GameInviteModal from "../components/gameInvite";
import Preloader from "../components/preloader";
import { useToast } from "../context/ToastContext";
import WELCOME_TEXT from "../data/welcomePhrases";
import { auth, db } from "../firebaseConfig";
// Generate numbers 1-20 for the wheel
const ROUND_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1);

const WELCOME_PHRASES = WELCOME_TEXT;

const AVATAR_GRADIENTS = GRADIENTS; // Reuse the same gradients for avatars

const MIN_FRIENDS_HEIGHT = 80;
const MAX_FRIENDS_HEIGHT = 500;

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

const isNewArchitectureEnabled =
  Platform.OS === "android" &&
  (globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager !=
    null;

if (
  Platform.OS === "android" &&
  !isNewArchitectureEnabled &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function Index() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { showToast, showAlert, playSound } = useToast();
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

  const [createRoomModalVisible, setCreateRoomModalVisible] = useState(false);
  const [isFriendsExpanded, setIsFriendsExpanded] = useState(false);

  // Animation State
  const [showJoin, setShowJoin] = useState(true);
  const [showLobby, setShowLobby] = useState(false);
  const joinOpacity = useRef(new Animated.Value(1)).current;
  const lobbyOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const friendsSlideAnim = useRef(new Animated.Value(100)).current;
  const friendsPanelHeight = useRef(
    new Animated.Value(MIN_FRIENDS_HEIGHT),
  ).current;

  // Layout Refs for Drag Constraints
  const headerHeightRef = useRef(0);
  const joinPanelHeightRef = useRef(0);

  const minimizedOpacity = friendsPanelHeight.interpolate({
    inputRange: [MIN_FRIENDS_HEIGHT, MIN_FRIENDS_HEIGHT + 100],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const expandedOpacity = friendsPanelHeight.interpolate({
    inputRange: [MIN_FRIENDS_HEIGHT, MIN_FRIENDS_HEIGHT + 100],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const fabBottom = friendsPanelHeight.interpolate({
    inputRange: [MIN_FRIENDS_HEIGHT, MAX_FRIENDS_HEIGHT],
    outputRange: [100, MAX_FRIENDS_HEIGHT + 20],
    extrapolate: "clamp",
  });

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

  // Animations for UI elements
  useEffect(() => {
    let pulseAnimation: Animated.CompositeAnimation | null = null;

    if (user) {
      // Start Pulse Animation for Create Room button
      pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: false,
          }),
        ]),
      );
      pulseAnimation.start();

      // Start Slide Up Animation for Friends Panel
      friendsSlideAnim.setValue(150); // Start off-screen
      Animated.timing(friendsSlideAnim, {
        toValue: 0,
        duration: 800,
        easing: Easing.out(Easing.back(1)),
        useNativeDriver: false,
        delay: 300,
      }).start();
    }

    return () => {
      if (pulseAnimation) pulseAnimation.stop();
    };
  }, [user]);

  // Handle Fade Transitions between Join and Lobby
  useEffect(() => {
    if (activeGameId) {
      // Transition to Lobby: Fade out Join -> Fade in Lobby
      Animated.timing(joinOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
        easing: Easing.out(Easing.cubic),
      }).start(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setShowJoin(false);
        setShowLobby(true);
        Animated.timing(lobbyOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
          easing: Easing.out(Easing.cubic),
        }).start();
      });
    } else {
      // Transition to Join: Fade out Lobby -> Fade in Join
      Animated.timing(lobbyOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
        easing: Easing.out(Easing.cubic),
      }).start(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setShowLobby(false);
        setShowJoin(true);
        Animated.timing(joinOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
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
        if (invites.length > 0 && pathname === "/") {
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
  }, [user, pathname]);

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
    const idsToFetch = allFriendIds.slice(0, 10); // Fetch up to 10 to sort
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("__name__", "in", idsToFetch));
      const snap = await getDocs(q);
      const friendsData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Sort by Last Seen Descending
      friendsData.sort(
        (a: any, b: any) => (b.lastSeen || 0) - (a.lastSeen || 0),
      );
      setFriendsPreview(friendsData.slice(0, 5));
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

  // Auto-revoke invite after 15 seconds
  useEffect(() => {
    if (gameInvite) {
      const timeSinceInvite = Date.now() - (gameInvite.timestamp || Date.now());
      const timeRemaining = Math.max(0, 15000 - timeSinceInvite);

      const timer = setTimeout(() => {
        handleDeclineInvite();
      }, timeRemaining);
      return () => clearTimeout(timer);
    }
  }, [gameInvite]);

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
      showToast({ message: "Friend invited to join!", type: "success" });
    } catch (e) {
      console.error("Quick invite failed", e);
      showToast({ message: "Failed to send invite", type: "error" });
    }
  };

  const handleCancelGame = async () => {
    if (!activeGameId) return;
    showAlert({
      title: "Cancel Game",
      message: "Stop waiting and delete this room?",
      buttons: [
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
              showToast({ message: "Could not delete room", type: "error" });
            }
          },
        },
      ],
    });
  };

  const updateLobbyRounds = async (delta: number) => {
    playSound(require("../assets/sounds/click.mp3"));
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

  // Draggable FAB Logic
  const pan = useRef(new Animated.ValueXY()).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2;
      },
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gestureState) => {
        const screenHeight = Dimensions.get("window").height;
        const currentFriendsHeight = (friendsPanelHeight as any)._value;
        // fabBottom interpolation logic: friendsHeight + 20 (approx based on inputRange/outputRange)
        const currentFabBottom = currentFriendsHeight + 20;
        const fabHeight = 60;

        const baseY = screenHeight - currentFabBottom - fabHeight;
        const currentOffsetY = (pan.y as any)._offset || 0;

        // Top Limit: Bottom of Join Panel (Header + Padding + Card Height)
        // Adding 30px buffer
        const topBoundary =
          (headerHeightRef.current || 100) +
          (joinPanelHeightRef.current || 150) +
          30;

        // Bottom Limit: Top of Friends Panel
        const bottomBoundary =
          screenHeight - (currentFriendsHeight + insets.bottom);

        const minTotalDy = topBoundary - baseY;
        const maxTotalDy = bottomBoundary - fabHeight - baseY;

        const lowerBound = minTotalDy - currentOffsetY;
        const upperBound = maxTotalDy - currentOffsetY;

        let newDy = Math.max(lowerBound, Math.min(gestureState.dy, upperBound));
        pan.setValue({ x: gestureState.dx, y: newDy });
      },
      onPanResponderRelease: (_, gestureState) => {
        pan.flattenOffset();
        // Detect tap vs drag
        if (Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5) {
          setCreateRoomModalVisible(true);
        } else {
          // Snap to nearest edge
          const screenWidth = Dimensions.get("window").width;
          const currentX = (pan.x as any)._value;
          const currentY = (pan.y as any)._value;

          // Initial center X (from left) = screenWidth - 20 (right margin) - 30 (half width)
          const startCenterX = screenWidth - 50;
          const currentCenterX = startCenterX + currentX;

          let targetX = 0; // Default to Right edge (original position)
          if (currentCenterX < screenWidth / 2) {
            // Snap to Left: Target visual left = 20
            // Visual Left = (screenWidth - 80) + x
            // 20 = screenWidth - 80 + targetX => targetX = 100 - screenWidth
            targetX = 100 - screenWidth;
          }

          Animated.spring(pan, {
            toValue: { x: targetX, y: currentY },
            useNativeDriver: false,
            friction: 6,
            tension: 40,
          }).start();
        }
      },
    }),
  ).current;

  const isFriendsExpandedRef = useRef(isFriendsExpanded);
  useEffect(() => {
    isFriendsExpandedRef.current = isFriendsExpanded;
  }, [isFriendsExpanded]);

  const friendsPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5 || Math.abs(gestureState.dx) > 5;
      },
      onPanResponderGrant: () => {
        friendsPanelHeight.extractOffset();
        if (!isFriendsExpandedRef.current) {
          setIsFriendsExpanded(true);
        }
      },
      onPanResponderMove: (_, gestureState) => {
        friendsPanelHeight.setValue(-gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        friendsPanelHeight.flattenOffset();
        const { dy, vy } = gestureState;
        const isTap = Math.abs(dy) < 5 && Math.abs(gestureState.dx) < 5;
        const currentHeight = (friendsPanelHeight as any)._value;

        let shouldOpen = false;

        if (isTap) {
          shouldOpen =
            currentHeight < (MIN_FRIENDS_HEIGHT + MAX_FRIENDS_HEIGHT) / 2;
        } else {
          if (vy < -0.5 || dy < -50) shouldOpen = true;
          else if (vy > 0.5 || dy > 50) shouldOpen = false;
          else
            shouldOpen =
              currentHeight > (MIN_FRIENDS_HEIGHT + MAX_FRIENDS_HEIGHT) / 2;
        }

        if (shouldOpen !== isFriendsExpandedRef.current) {
          playSound(require("../assets/sounds/friendsMenu.mp3"));
        }

        Animated.spring(friendsPanelHeight, {
          toValue: shouldOpen ? MAX_FRIENDS_HEIGHT : MIN_FRIENDS_HEIGHT,
          useNativeDriver: false,
          friction: 8,
          tension: 40,
        }).start(({ finished }) => {
          if (finished) {
            setIsFriendsExpanded(shouldOpen);
          }
        });
      },
    }),
  ).current;

  // 2. Navigation Functions
  const handleCreateRoom = async () => {
    let roundsToPlay = selectedRounds;

    if (useCustomInput) {
      const parsed = parseInt(customRounds);
      if (isNaN(parsed) || parsed < 1 || parsed > 20) {
        showToast({
          message: "Please enter a number between 1 and 20.",
          type: "error",
        });
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
      setCreateRoomModalVisible(false);
    } catch (error) {
      showToast({ message: "Failed to create game room", type: "error" });
    }
  };

  const joinRoom = async () => {
    if (roomCode.trim().length === 0) {
      showToast({ message: "Please enter a room code first.", type: "info" });
      return;
    }

    if (roomCode.trim().length < 4) {
      showToast({ message: "Room code must be 4 characters.", type: "error" });
      return;
    }

    // Check if room exists
    try {
      const roomRef = doc(db, "games", roomCode.toUpperCase());
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        showToast({ message: "Room not found.", type: "error" });
        return;
      }

      router.push(`/game/${roomCode.toUpperCase()}`);
    } catch (error) {
      console.error("Error checking room:", error);
      showToast({
        message: "Failed to check room. Please try again.",
        type: "error",
      });
    }
  };

  if (loading || !splashAnimationFinished) {
    return <Preloader />;
  }

  // ---------------- RENDER: LOGGED IN LOBBY ----------------
  if (user) {
    return (
      <AnimatedBackground source={require("../assets/images/main_inner.jpeg")}>
        <View style={styles.container}>
          <View
            style={[styles.header, { paddingTop: insets.top + 10 }]}
            onLayout={(e) =>
              (headerHeightRef.current = e.nativeEvent.layout.height)
            }
          >
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
              <Animated.View
                style={[styles.joinCard, { opacity: joinOpacity }]}
                onLayout={(e) =>
                  (joinPanelHeightRef.current = e.nativeEvent.layout.height)
                }
              >
                <View style={styles.joinGroupPanel}>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter Room Code"
                    placeholderTextColor={"#333"}
                    value={roomCode}
                    onChangeText={setRoomCode}
                    autoCapitalize="characters"
                    maxLength={4}
                  />
                  <TouchableOpacity
                    style={(styles.buttonPrimary, styles.buttonJoin)}
                    onPress={joinRoom}
                  >
                    <Text style={styles.buttonText}>Join Room</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}
            {showJoin && !isFriendsExpanded && <HomeCanvas />}

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
          </ScrollView>

          {/* Friends Panel (Bottom Sheet) */}
          <Animated.View
            style={[
              styles.friendsPanel,
              {
                height: Animated.add(friendsPanelHeight, insets.bottom),
                paddingBottom: insets.bottom,
                transform: [{ translateY: friendsSlideAnim }],
                overflow: "hidden",
              },
            ]}
          >
            <Animated.View
              {...friendsPanResponder.panHandlers}
              style={styles.friendsHeaderTouchable}
            >
              <View style={styles.friendsHandle} />

              <View>
                <Animated.View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    opacity: minimizedOpacity,
                  }}
                >
                  <View style={styles.minimizedFriendsContent}>
                    <View style={styles.avatarRow}>
                      {friendsPreview.slice(0, 5).map((friend) => (
                        <LinearGradient
                          key={friend.id}
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
                          style={styles.minimizedAvatar}
                        >
                          <Text style={styles.minimizedAvatarText}>
                            {friend.username?.[0]?.toUpperCase()}
                          </Text>
                          {friend.isOnline && (
                            <View style={styles.onlineIndicator} />
                          )}
                        </LinearGradient>
                      ))}
                      {friendCount > 5 && (
                        <View
                          style={[
                            styles.minimizedAvatar,
                            { backgroundColor: "#ddd" },
                          ]}
                        >
                          <Text style={styles.minimizedAvatarText}>
                            +{friendCount - 5}
                          </Text>
                        </View>
                      )}
                      {friendCount === 0 && (
                        <Ionicons
                          name="person-add"
                          size={24}
                          color="#333"
                          style={{ marginLeft: 5 }}
                        />
                      )}
                    </View>
                    <Ionicons name="chevron-up" size={24} color="#333" />
                  </View>
                </Animated.View>

                <Animated.View style={{ opacity: expandedOpacity }}>
                  <View style={styles.friendsHeader}>
                    <Text style={styles.friendsTitle}>Friends</Text>
                    <Ionicons name="chevron-down" size={24} color="#333" />
                  </View>
                </Animated.View>
              </View>
            </Animated.View>

            {isFriendsExpanded && (
              <Animated.View style={{ flex: 1, opacity: expandedOpacity }}>
                <ScrollView
                  style={styles.friendsListVertical}
                  showsVerticalScrollIndicator={false}
                >
                  {friendsPreview.map((friend) => (
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
                        <View>
                          <Text style={styles.friendName}>
                            {friend.username}
                          </Text>
                          <Text
                            style={[
                              styles.friendStatusTextSmall,
                              friend.isOnline &&
                              Date.now() - (friend.lastSeen || 0) < 120000
                                ? { color: "#4caf50" }
                                : { color: "#666" },
                            ]}
                          >
                            {formatLastSeen(friend.lastSeen, friend.isOnline)}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={styles.quickInviteBtn}
                        onPress={() => handleQuickInvite(friend.id)}
                      >
                        <Text style={styles.quickInviteText}>Invite</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.seeAllBtn}
                    onPress={() => router.push("/friends")}
                  >
                    <Text style={styles.seeAllText}>
                      {friendCount === 0 ? "Add Friends" : "View All Friends"}
                    </Text>
                    <Ionicons
                      name={
                        friendCount === 0
                          ? "person-add-outline"
                          : "chevron-forward"
                      }
                      size={24}
                      color="#333"
                    />
                  </TouchableOpacity>
                </ScrollView>
              </Animated.View>
            )}
          </Animated.View>

          {/* Draggable Create Room FAB */}
          {showJoin && (
            <Animated.View
              {...panResponder.panHandlers}
              style={[
                styles.draggableFab,
                {
                  bottom: Animated.add(fabBottom, insets.bottom),
                  transform: [
                    { translateX: pan.x },
                    { translateY: pan.y },
                    { scale: pulseAnim },
                  ],
                },
              ]}
            >
              <Ionicons name="add" size={32} color="white" />
            </Animated.View>
          )}

          {/* Create Room Modal */}
          <Modal
            visible={createRoomModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setCreateRoomModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Create Room</Text>
                <View style={styles.createGroupPanel}>
                  <View style={styles.roundsSelector}>
                    <Text style={styles.roundsLabel}>Rounds</Text>
                    <View style={styles.stepper}>
                      <TouchableOpacity
                        onPress={() => {
                          playSound(require("../assets/sounds/click.mp3"));
                          setSelectedRounds((prev) => Math.max(1, prev - 1));
                        }}
                      >
                        <Ionicons name="remove-circle" size={24} color="#333" />
                      </TouchableOpacity>
                      <Text style={styles.roundsText}>{selectedRounds}</Text>
                      <TouchableOpacity
                        onPress={() => {
                          playSound(require("../assets/sounds/click.mp3"));
                          setSelectedRounds((prev) => Math.min(20, prev + 1));
                        }}
                      >
                        <Ionicons name="add-circle" size={24} color="#333" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    onPress={() => setCreateRoomModalVisible(false)}
                    style={styles.cancelBtn}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCreateRoom}
                    style={styles.confirmBtn}
                  >
                    <Text style={styles.confirmText}>Create</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Game Invite Modal */}
          <GameInviteModal
            visible={!!gameInvite}
            invite={gameInvite}
            onDecline={handleDeclineInvite}
            onAccept={handleAcceptInvite}
          />
        </View>
      </AnimatedBackground>
      // </ImageBackground>
    );
  }

  // ---------------- RENDER: LANDING SCREEN ----------------
  return (
    <ImageBackground
      source={require("../assets/images/main_bg.jpeg")}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <View style={styles.containerTransparent}>
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
      </View>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 20,
    padding: 10,
  },
  welcomeText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    padding: 8,
    borderRadius: 10,
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
  joinCard: {
    backgroundColor: "#dddddd95",
    borderRadius: 20,
    padding: 6,
    marginBottom: 20,
  },
  input: {
    backgroundColor: "#fff9f2ff",
    padding: 12,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    fontSize: 16,
    marginBottom: 0,
    color: "#333",
    flex: 1,
  },
  joinGroupPanel: {
    flexDirection: "row",
    alignItems: "center",
  },
  buttonJoin: {
    backgroundColor: "#333",
    padding: 12,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#333",
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
  },
  buttonTextSecondary: { color: "white", fontWeight: "bold", fontSize: 16 },
  createGroupPanel: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginBottom: 20,
    justifyContent: "space-between",
  },
  roundsSelector: {
    backgroundColor: "#fff9f2ff",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#333",
    padding: 4,
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
    backgroundColor: "#ffffff80",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 15,
    // paddingBottom: 25, // Handled dynamically via insets
    shadowColor: "#333",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 10,
    position: "absolute",
    bottom: -4,
    left: 0,
    right: 0,
  },
  friendsHandle: {
    width: 40,
    height: 5,
    backgroundColor: "#333",
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 10,
  },
  friendsHeaderTouchable: {
    paddingBottom: 20,
  },
  minimizedFriendsContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
  },
  minimizedLabel: { fontWeight: "bold", color: "#333", fontSize: 18 },
  avatarRow: { flexDirection: "row", gap: 4 },
  minimizedAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 0,
    borderColor: "#333",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  onlineIndicator: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#4caf50",
    borderWidth: 2,
    borderColor: "#fff",
  },
  minimizedAvatarText: { fontSize: 14, fontWeight: "bold", color: "#333" },

  friendsHeader: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  friendsTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  friendsListVertical: { gap: 10 },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff82",
    padding: 10,
    borderRadius: 12,
    marginBottom: 5,
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
  friendStatusTextSmall: { fontSize: 11, fontWeight: "500" },
  quickInviteBtn: {
    backgroundColor: "#37cea8",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  quickInviteText: { color: "#333", fontWeight: "bold", fontSize: 12 },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 15,
    gap: 5,
  },
  seeAllText: {
    color: "#333",
    fontSize: 16,
    fontWeight: "600",
    paddingBottom: 1,
  },

  noFriendsOnlineText: {
    textAlign: "center",
    color: "#555",
    fontStyle: "italic",
    marginVertical: 20,
  },

  // Draggable FAB
  draggableFab: {
    position: "absolute",
    bottom: 100,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#e27d4aff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },

  // Waiting Group Panel
  waitingGroupPanel: {
    backgroundColor: "#dddddd95",
    borderRadius: 20,
    padding: 10,
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
  waitingTitle: { fontSize: 14, fontWeight: "bold", color: "#fff" },
  waitingSubtitle: { fontSize: 12, color: "#ffffff", marginBottom: 15 },
  waitingAvatars: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 15,
    marginBottom: 20,
    justifyContent: "center",
  },
  waitingAvatarContainer: { alignItems: "center", width: 60 },
  waitingAvatar: {
    width: 40,
    height: 40,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 3,
  },
  waitingAvatarText: { fontSize: 16, fontWeight: "bold", color: "#333" },
  waitingName: {
    fontSize: 12,
    color: "#ffffff",
    fontWeight: "bold",
    textAlign: "center",
  },
  inviteMoreBtn: {
    width: 40,
    height: 40,
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
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  enterGameText: { color: "#333", fontWeight: "bold", fontSize: 14 },
  cancelGameBtn: {
    flex: 1,
    backgroundColor: "#fee2e2",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelGameText: {
    color: "#991b1b",
    fontWeight: "bold",
    fontSize: 14,
  },

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
    marginBottom: 20,
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
});
