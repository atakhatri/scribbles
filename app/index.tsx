import GRADIENTS from "@/data/gradients";
import {
  fetchMultipleUsers,
  getUserCollection,
} from "@/utils/userCollectionHelper";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FirebaseAuthTypes } from "@react-native-firebase/auth";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { usePathname, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
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
import { auth, db, firestore } from "../firebaseConfig";
import { signInAsGuest } from "../utils/guestAuth";
// Generate numbers 1-20 for the wheel
const ROUND_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1);

const WELCOME_PHRASES = WELCOME_TEXT;

const AVATAR_GRADIENTS = GRADIENTS; // Reuse the same gradients for avatars

const MIN_FRIENDS_HEIGHT = 80;
const MAX_FRIENDS_HEIGHT = 500;

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
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
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
  const [isRefreshingFriends, setIsRefreshingFriends] = useState(false);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [activeGamePlayers, setActiveGamePlayers] = useState<any[]>([]);
  const [activeGameHostId, setActiveGameHostId] = useState<string | null>(null);
  const [avatarGradientIndex, setAvatarGradientIndex] = useState<number>(-1);

  const [createRoomModalVisible, setCreateRoomModalVisible] = useState(false);
  const [isFriendsExpanded, setIsFriendsExpanded] = useState(false);
  const [isGuestLoading, setIsGuestLoading] = useState(false);

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

  // Canvas height animation
  const canvasHeight = useRef(new Animated.Value(400)).current;

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

  // Native-like Android back behavior on home screen.
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (createRoomModalVisible) {
          setCreateRoomModalVisible(false);
          return true;
        }

        if (isFriendsExpanded) {
          Animated.spring(friendsPanelHeight, {
            toValue: MIN_FRIENDS_HEIGHT,
            useNativeDriver: false,
            friction: 8,
            tension: 40,
          }).start(({ finished }) => {
            if (finished) {
              setIsFriendsExpanded(false);
            }
          });
          return true;
        }

        BackHandler.exitApp();
        return true;
      };

      const sub = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );
      return () => sub.remove();
    }, [createRoomModalVisible, isFriendsExpanded, friendsPanelHeight]),
  );

  // Calculate canvas height based on screen size and friends panel position
  useEffect(() => {
    const updateCanvasHeight = (friendsHeight: number) => {
      const screenHeight = Dimensions.get("window").height;
      const headerHeight = headerHeightRef.current || 80;
      const joinPanelHeight = joinPanelHeightRef.current || 70;

      const MIN_CANVAS_HEIGHT = 200; // Minimum canvas height
      const MAX_CANVAS_HEIGHT = 600; // Maximum canvas height
      const PADDING = 40; // Total padding/margins

      const availableSpace =
        screenHeight -
        headerHeight -
        joinPanelHeight -
        friendsHeight -
        insets.top -
        insets.bottom -
        PADDING;

      const targetHeight = Math.max(
        MIN_CANVAS_HEIGHT,
        Math.min(MAX_CANVAS_HEIGHT, availableSpace),
      );

      return targetHeight;
    };

    // Listen to friendsPanelHeight changes
    const listenerId = friendsPanelHeight.addListener(({ value }) => {
      const targetHeight = updateCanvasHeight(value);
      Animated.spring(canvasHeight, {
        toValue: targetHeight,
        useNativeDriver: false,
        friction: 8,
        tension: 40,
      }).start();
    });

    // Set initial height
    const initialHeight = updateCanvasHeight(MIN_FRIENDS_HEIGHT);
    canvasHeight.setValue(initialHeight);

    // Handle screen dimension changes (rotation, etc.)
    const dimensionSubscription = Dimensions.addEventListener("change", () => {
      const currentFriendsHeight =
        (friendsPanelHeight as any)._value || MIN_FRIENDS_HEIGHT;
      const newHeight = updateCanvasHeight(currentFriendsHeight);
      Animated.spring(canvasHeight, {
        toValue: newHeight,
        useNativeDriver: false,
        friction: 8,
        tension: 40,
      }).start();
    });

    return () => {
      friendsPanelHeight.removeListener(listenerId);
      dimensionSubscription?.remove();
    };
  }, [insets.top, insets.bottom]);

  const cleanupUserFromOpenGames = async (uid: string) => {
    try {
      const gamesSnap = await db
        .collection("games")
        .where("players", "array-contains", uid)
        .get();

      for (const gameDoc of gamesSnap.docs) {
        const data = gameDoc.data() as any;
        const players = Array.isArray(data.players) ? data.players : [];
        const updatedPlayers = players.filter((p: any) => {
          const pid = typeof p === "string" ? p : p?.uid;
          return pid !== uid;
        });

        if (updatedPlayers.length === players.length) continue;

        if (updatedPlayers.length === 0) {
          await gameDoc.ref.delete();
          continue;
        }

        const updates: any = { players: updatedPlayers };

        if (data.hostId === uid) {
          const next = updatedPlayers[0];
          updates.hostId = typeof next === "string" ? next : next.uid;
        }

        if (data.currentDrawer === uid && data.status === "playing") {
          const oldIndex = players.findIndex((p: any) => {
            const pid = typeof p === "string" ? p : p?.uid;
            return pid === uid;
          });
          const nextIndex = oldIndex >= updatedPlayers.length ? 0 : oldIndex;
          const next = updatedPlayers[nextIndex];
          const nextUid = typeof next === "string" ? next : next.uid;

          updates.currentDrawer = nextUid;
          updates.word = "";
          updates.currentWord = "";
          updates.strokes = [];
          updates.guessed = [];
          updates.roundEndTimestamp = Date.now() + 30000;
        }

        await gameDoc.ref.update(updates);
      }
    } catch (e) {
      console.error("Failed to cleanup stale player from open games", e);
    }
  };

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
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        try {
          // Safety net: when app is reopened on home after force-close,
          // ensure this user is removed from any lingering active games.
          await cleanupUserFromOpenGames(currentUser.uid);

          // Use robust getUserCollection utility
          const userCollection = await getUserCollection(currentUser.uid);
          const docRef = db.collection(userCollection).doc(currentUser.uid);
          const docSnap = await docRef.get();

          if (docSnap.exists && docSnap.data()) {
            setUsername(
              docSnap.data()?.username || currentUser.displayName || "Player",
            );
          } else {
            setUsername(currentUser.displayName || "Player");
          }
        } catch (error) {
          console.error("Error fetching profile:", error);
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

  // 2. Listen to user document (invites, friends, avatar)
  useEffect(() => {
    if (!user) return;

    // Use robust getUserCollection and set up listener
    const setupListener = async () => {
      try {
        const userCollection = await getUserCollection(user.uid);
        const userDocRef = db.collection(userCollection).doc(user.uid);

        const unsub = userDocRef.onSnapshot(
          (docSnap) => {
            if (docSnap.exists && docSnap.data()) {
              const data = docSnap.data();
              const invites = data?.gameInvites || [];
              if (invites.length > 0 && pathname === "/") {
                // Show the latest invite
                setGameInvite(invites[invites.length - 1]);
              } else {
                setGameInvite(null);
              }

              // Friends Preview
              const fIds = data?.friends || [];
              setFriendCount(fIds.length);
              fetchTopFriends(fIds);

              if (data.avatarGradientIndex !== undefined) {
                setAvatarGradientIndex(data.avatarGradientIndex);
              }
            }
          },
          (error) => {
            console.error("User document listener error:", error);
          },
        );

        return unsub;
      } catch (error) {
        console.error("Error setting up user document listener:", error);
        // Return a no-op unsubscribe function
        return () => {};
      }
    };

    let unsubscribe: (() => void) | undefined;
    setupListener()
      .then((unsub) => {
        unsubscribe = unsub;
      })
      .catch((error) => {
        console.error("Error in setupListener:", error);
      });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user, pathname]);

  // Listen to active game (Waiting Group)
  useEffect(() => {
    if (!activeGameId) return;
    const unsub = db
      .collection("games")
      .doc(activeGameId)
      .onSnapshot(async (docSnap) => {
        if (docSnap.exists) {
          const data = docSnap.data();
          setActiveGameHostId((data as any).hostId || null);

          // Auto-navigate when host enters lobby, or when game starts.
          if (
            ((data as any).lobbyEnteredAt || data.status === "playing") &&
            pathname === "/"
          ) {
            router.push(`/game/${activeGameId}`);
            setActiveGameId(null);
            return;
          }

          // Update players list for waiting lobby
          if (data.players && Array.isArray(data.players)) {
            const pIds = data.players
              .map((p: any) => (typeof p === "string" ? p : p.uid))
              .filter(Boolean);

            if (pIds.length === 0) {
              setActiveGamePlayers([]);
            } else {
              // Use improved fetchMultipleUsers utility
              try {
                const pData = await fetchMultipleUsers(pIds.slice(0, 10));
                setActiveGamePlayers(pData);
              } catch (error) {
                console.error("Error fetching players:", error);
                setActiveGamePlayers([]);
              }
            }
          }

          // Sync rounds from game to local state
          if (data.maxRounds) setSelectedRounds(data.maxRounds);
        } else {
          // Lobby was removed (e.g. host deleted room) -> kick everyone out of waiting state.
          setActiveGameId(null);
          setActiveGamePlayers([]);
          setShowLobby(false);
          setShowJoin(true);
          showToast({ message: "Lobby was closed by host", type: "info" });
        }
      });
    return () => unsub();
  }, [activeGameId, pathname, showToast]);

  const fetchTopFriends = async (allFriendIds: string[]) => {
    if (allFriendIds.length === 0) {
      setFriendsPreview([]);
      return;
    }

    const idsToFetch = allFriendIds.slice(0, 10).filter(Boolean); // Fetch up to 10 to sort
    if (idsToFetch.length === 0) {
      setFriendsPreview([]);
      return;
    }

    try {
      // Use improved fetchMultipleUsers utility
      const friendsData = await fetchMultipleUsers(idsToFetch);

      // Sort by Last Seen Descending
      friendsData.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
      setFriendsPreview(friendsData.slice(0, 5));
    } catch (error) {
      console.error("Error fetching friends preview:", error);
      setFriendsPreview([]);
    }
  };

  const handleAcceptInvite = async () => {
    playSound(require("../assets/sounds/accept.mp3"));
    if (!gameInvite || !user) return;

    try {
      const userCollection = await getUserCollection(user.uid);
      const userRef = db.collection(userCollection).doc(user.uid);

      // Verify document exists
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        showToast({ message: "User profile not found", type: "error" });
        setGameInvite(null);
        return;
      }

      await userRef.update({
        gameInvites: firestore.FieldValue.arrayRemove(gameInvite),
      });

      const gameRef = db.collection("games").doc(gameInvite.roomId);
      await gameRef.update({
        players: firestore.FieldValue.arrayUnion(user.uid),
        [`scores.${user.uid}`]: 0,
        lastUpdated: firestore.FieldValue.serverTimestamp(),
      });

      setGameInvite(null);
      setActiveGameId(gameInvite.roomId);
    } catch (error) {
      console.error("Error accepting invite:", error);
      showToast({ message: "Failed to join game", type: "error" });
    }
  };

  const handleDeclineInvite = useCallback(async () => {
    playSound(require("../assets/sounds/decline.mp3"));
    if (!gameInvite || !user) return;

    try {
      const userCollection = await getUserCollection(user.uid);
      const userRef = db.collection(userCollection).doc(user.uid);

      // Verify document exists
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        console.warn("User document not found when declining invite");
        setGameInvite(null);
        return;
      }

      await userRef.update({
        gameInvites: firestore.FieldValue.arrayRemove(gameInvite),
      });
      setGameInvite(null);
    } catch (error) {
      console.error("Error declining invite:", error);
      // Still remove the invite from UI even if update fails
      setGameInvite(null);
    }
  }, [gameInvite, user, playSound]);

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
  }, [gameInvite, handleDeclineInvite]);

  const handleQuickInvite = async (friendId: string) => {
    try {
      if (!user) {
        showToast({ message: "Not logged in", type: "error" });
        return;
      }

      let gameId = activeGameId;
      if (!gameId) {
        gameId = Math.random().toString(36).substring(2, 6).toUpperCase();
        await db
          .collection("games")
          .doc(gameId)
          .set({
            status: "waiting",
            lobbyEnteredAt: null,
            currentDrawer: user.uid,
            currentWord: "",
            round: 1,
            maxRounds: selectedRounds,
            scores: { [user.uid]: 0 },
            players: [user.uid],
            hostId: user.uid,
            guesses: [],
            createdAt: Date.now(),
            lastUpdated: firestore.FieldValue.serverTimestamp(),
          });
        setActiveGameId(gameId);
      }

      // Use robust getUserCollection
      const friendCollection = await getUserCollection(friendId);
      const friendRef = db.collection(friendCollection).doc(friendId);

      // Verify friend document exists
      const friendDoc = await friendRef.get();
      if (!friendDoc.exists) {
        showToast({ message: "Friend not found", type: "error" });
        return;
      }

      await friendRef.update({
        gameInvites: firestore.FieldValue.arrayUnion({
          roomId: gameId,
          inviterName: username,
          inviterId: user.uid,
          timestamp: Date.now(),
        }),
      });

      showToast({ message: "Friend invited to join!", type: "success" });
    } catch (error) {
      console.error("Quick invite failed:", error);
      showToast({ message: "Failed to send invite", type: "error" });
    }
  };

  const handleCancelGame = async () => {
    if (!activeGameId || !user) return;
    if (activeGameHostId !== user.uid) return;

    showAlert({
      title: "Cancel Game",
      message: "Stop waiting and delete this room?",
      buttons: [
        {
          text: "Keep Waiting",
          style: "cancel",
          onPress: () => {
            playSound(require("../assets/sounds/lock.mp3"));
          },
        },
        {
          text: "Delete Room",
          style: "destructive",
          onPress: async () => {
            playSound(require("../assets/sounds/decline.mp3"));
            try {
              await db.collection("games").doc(activeGameId).delete();
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

  const handleLeaveLobby = async () => {
    if (!activeGameId || !user) return;

    showAlert({
      title: "Leave Lobby",
      message: "Leave this lobby?",
      buttons: [
        {
          text: "Keep Waiting",
          style: "cancel",
          onPress: () => {
            playSound(require("../assets/sounds/lock.mp3"));
          },
        },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            playSound(require("../assets/sounds/decline.mp3"));
            try {
              await db
                .collection("games")
                .doc(activeGameId)
                .update({
                  players: firestore.FieldValue.arrayRemove(user.uid),
                  [`scores.${user.uid}`]: firestore.FieldValue.delete(),
                  lastUpdated: firestore.FieldValue.serverTimestamp(),
                });
            } catch {
              // Ignore if room is already deleted.
            } finally {
              setActiveGameId(null);
              setActiveGamePlayers([]);
              setShowLobby(false);
              setShowJoin(true);
            }
          },
        },
      ],
    });
  };

  const handleEnterGameForAll = async () => {
    if (!activeGameId || !user) return;
    if (activeGameHostId !== user.uid) {
      showToast({ message: "Waiting for host to enter game", type: "info" });
      return;
    }

    try {
      await db.collection("games").doc(activeGameId).update({
        lobbyEnteredAt: Date.now(),
        lastUpdated: firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error("Failed to enter lobby for all", e);
      showToast({ message: "Could not enter game", type: "error" });
    }
  };

  const updateLobbyRounds = async (delta: number) => {
    playSound(require("../assets/sounds/click.mp3"));
    if (!activeGameId) return;
    const newRounds = Math.max(1, Math.min(20, selectedRounds + delta));
    try {
      await db.collection("games").doc(activeGameId).update({
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
          playSound(require("../assets/sounds/lock.mp3"));
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
  const friendsDragStartedExpandedRef = useRef(isFriendsExpanded);
  useEffect(() => {
    isFriendsExpandedRef.current = isFriendsExpanded;
  }, [isFriendsExpanded]);

  const friendsPanResponder = useRef(
    PanResponder.create({
      // Only capture tap-start while minimized so expanded controls stay clickable.
      onStartShouldSetPanResponder: () => !isFriendsExpandedRef.current,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5 || Math.abs(gestureState.dx) > 5;
      },
      onPanResponderGrant: () => {
        friendsDragStartedExpandedRef.current = isFriendsExpandedRef.current;
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

        if (shouldOpen !== friendsDragStartedExpandedRef.current) {
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

      await db
        .collection("games")
        .doc(randomCode)
        .set({
          status: "waiting",
          lobbyEnteredAt: null,
          currentDrawer: user.uid,
          currentWord: "",
          round: 1,
          maxRounds: roundsToPlay,
          scores: { [user.uid]: 0 },
          players: [user.uid],
          hostId: user.uid,
          guesses: [],
          lastUpdated: firestore.FieldValue.serverTimestamp(),
        });
      router.push(`/game/${randomCode}`);
      setCreateRoomModalVisible(false);
    } catch (error) {
      showToast({ message: "Failed to create game room", type: "error" });
    }
  };

  const joinRoom = async () => {
    if (!roomCode.trim()) {
      showToast({ message: "Please enter a room code", type: "error" });
      return;
    }

    if (roomCode.trim().length !== 4) {
      showToast({ message: "Room code must be 4 characters", type: "error" });
      return;
    }

    try {
      // Check if room exists in Firestore
      const roomRef = db.collection("games").doc(roomCode.toUpperCase());
      const roomSnap = await roomRef.get();

      if (!roomSnap.exists) {
        showToast({ message: "Room not found", type: "error" });
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

  const handleGuestLogin = async () => {
    setIsGuestLoading(true);
    try {
      console.log("Starting guest login...");

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Guest login timeout")), 15000),
      );

      const loginPromise = signInAsGuest();

      await Promise.race([loginPromise, timeoutPromise]);

      console.log("Guest login successful");

      // Give Firebase extra time to settle and replicate the document
      console.log("Waiting for Firebase to settle...");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      playSound(require("../assets/sounds/intro.mp3"));

      // Navigation will happen automatically via auth state change
      console.log("Guest login complete, auth state will update");
    } catch (error: any) {
      console.error("Guest login error:", error);
      console.error("Error details:", JSON.stringify(error));

      let errorMessage = "Failed to sign in as guest";

      if (error?.message?.includes("not available")) {
        errorMessage = "Anonymous login not enabled. Please contact support.";
      } else if (error?.message?.includes("timeout")) {
        errorMessage = "Login timed out. Check your internet connection.";
      } else if (error?.code) {
        errorMessage = `Login failed: ${error.code}`;
      } else if (error?.message) {
        errorMessage = error.message;
      }

      showToast({
        message: errorMessage,
        type: "error",
      });
    } finally {
      setIsGuestLoading(false);
    }
  };

  const handleRefreshFriendsStatus = async () => {
    if (!user || isRefreshingFriends) return;

    setIsRefreshingFriends(true);
    try {
      const userCollection = await getUserCollection(user.uid);
      const userDocRef = db.collection(userCollection).doc(user.uid);
      const userSnap = await userDocRef.get();

      if (!userSnap.exists) {
        setFriendCount(0);
        setFriendsPreview([]);
        showToast({ message: "Could not find your profile.", type: "error" });
        return;
      }

      const data = userSnap.data();
      const friendIds = data?.friends || [];
      setFriendCount(friendIds.length);
      await fetchTopFriends(friendIds);
      showToast({ message: "Friend statuses refreshed.", type: "success" });
    } catch (error) {
      console.error("Error refreshing friends status:", error);
      showToast({ message: "Failed to refresh friends.", type: "error" });
    } finally {
      setIsRefreshingFriends(false);
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
            {showJoin && (
              <Animated.View
                style={[styles.headerJoinCard, { opacity: joinOpacity }]}
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
                    onPress={() => {
                      joinRoom();
                    }}
                  >
                    <Text style={styles.buttonText}>Join Room</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}
            <TouchableOpacity
              onPress={() => {
                router.push("/pages/profile");
                playSound(require("../assets/sounds/lock.mp3"));
              }}
            >
              <LinearGradient
                colors={
                  avatarGradientIndex >= 0 &&
                  avatarGradientIndex < AVATAR_GRADIENTS.length
                    ? AVATAR_GRADIENTS[avatarGradientIndex]
                    : getAvatarGradient(user.uid)
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
            {showJoin && <HomeCanvas height={canvasHeight} />}

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
                    {activeGameHostId === user?.uid ? (
                      <View style={styles.stepper}>
                        <TouchableOpacity onPress={() => updateLobbyRounds(-1)}>
                          <Ionicons
                            name="remove-circle"
                            size={24}
                            color="#333"
                          />
                        </TouchableOpacity>
                        <Text style={styles.roundsText}>{selectedRounds}</Text>
                        <TouchableOpacity onPress={() => updateLobbyRounds(1)}>
                          <Ionicons name="add-circle" size={24} color="#333" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={styles.roundsText}>{selectedRounds}</Text>
                    )}
                  </View>
                </View>

                <View style={styles.waitingAvatars}>
                  {activeGamePlayers.map((p) => (
                    <View key={p.id} style={styles.waitingAvatarContainer}>
                      <LinearGradient
                        colors={
                          p.avatarGradientIndex !== undefined &&
                          p.avatarGradientIndex >= 0 &&
                          p.avatarGradientIndex < AVATAR_GRADIENTS.length
                            ? AVATAR_GRADIENTS[p.avatarGradientIndex]
                            : getAvatarGradient(p.id)
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
                    onPress={() => {
                      playSound(require("../assets/sounds/click.mp3"));
                      router.push({
                        pathname: "/pages/friends",
                        params: { inviteToRoomId: activeGameId },
                      });
                    }}
                  >
                    <Ionicons name="add" size={30} color="#666" />
                  </TouchableOpacity>
                </View>
                <View style={styles.waitingBtnRow}>
                  {activeGameHostId === user?.uid ? (
                    <TouchableOpacity
                      style={styles.cancelGameBtn}
                      onPress={handleCancelGame}
                    >
                      <Text style={styles.cancelGameText}>Cancel</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.cancelGameBtn}
                      onPress={handleLeaveLobby}
                    >
                      <Text style={styles.cancelGameText}>Leave</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.enterGameBtn}
                    onPress={() => {
                      handleEnterGameForAll();
                      playSound(require("../assets/sounds/gameStart.mp3"));
                    }}
                  >
                    <Text style={styles.enterGameText}>
                      {activeGameHostId === user?.uid
                        ? "Enter Game"
                        : "Waiting for Host"}
                    </Text>
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
                            friend.avatarGradientIndex !== undefined &&
                            friend.avatarGradientIndex >= 0 &&
                            friend.avatarGradientIndex < AVATAR_GRADIENTS.length
                              ? AVATAR_GRADIENTS[friend.avatarGradientIndex]
                              : getAvatarGradient(friend.id)
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
                    <View style={styles.friendsHeaderSpacer} />
                    <Text style={styles.friendsTitle}>Friends</Text>
                    <TouchableOpacity
                      onPress={() => {
                        playSound(require("../assets/sounds/lock.mp3"));
                        handleRefreshFriendsStatus();
                      }}
                      style={styles.refreshFriendsBtn}
                      disabled={isRefreshingFriends}
                    >
                      {isRefreshingFriends ? (
                        <ActivityIndicator size="small" color="#333" />
                      ) : (
                        <Ionicons name="refresh" size={20} color="#333" />
                      )}
                    </TouchableOpacity>
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
                            friend.avatarGradientIndex !== undefined &&
                            friend.avatarGradientIndex >= 0 &&
                            friend.avatarGradientIndex < AVATAR_GRADIENTS.length
                              ? AVATAR_GRADIENTS[friend.avatarGradientIndex]
                              : getAvatarGradient(friend.id)
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
                        onPress={() => {
                          playSound(require("../assets/sounds/lock.mp3"));
                          handleQuickInvite(friend.id);
                        }}
                      >
                        <Text style={styles.quickInviteText}>Invite</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.seeAllBtn}
                    onPress={() => {
                      playSound(require("../assets/sounds/friendsMenu.mp3"));
                      router.push("/pages/friends");
                    }}
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
                <View style={styles.modalTape} />
                <Text style={styles.modalTitle}>Create Room</Text>
                <Text style={styles.modalSubtitle}>
                  Set rounds for this lobby
                </Text>
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
                    onPress={() => {
                      setCreateRoomModalVisible(false);
                      playSound(require("../assets/sounds/click.mp3"));
                    }}
                    style={styles.cancelBtn}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      handleCreateRoom();
                      playSound(require("../assets/sounds/click.mp3"));
                    }}
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
            onPress={() => {
              playSound(require("../assets/sounds/click.mp3"));
              router.push("/auth/login");
            }}
          >
            <Text style={styles.buttonText}>Log In</Text>
          </TouchableOpacity>

          <View
            style={{
              flexDirection: "row",
              gap: 10,
              justifyContent: "space-between",
            }}
          >
            <TouchableOpacity
              style={[styles.buttonSecondary, { marginTop: 15 }]}
              onPress={() => {
                playSound(require("../assets/sounds/click.mp3"));
                router.push("/auth/register");
              }}
            >
              <Text style={styles.buttonTextSecondary}>Create Account</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.buttonGuest, { marginTop: 15 }]}
              onPress={() => {
                playSound(require("../assets/sounds/click.mp3"));
                handleGuestLogin();
              }}
              disabled={isGuestLoading}
            >
              {isGuestLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.buttonTextGuest}>Guest</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  containerTransparent: {
    flex: 1,
    backgroundColor: "#00000060",
    justifyContent: "center",
    alignItems: "center",
  },
  backgroundImage: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingTop: 10,
    padding: 10,
    gap: 10,
  },
  headerJoinCard: {
    backgroundColor: "#dddddd95",
    borderRadius: 20,
    padding: 6,
    flex: 1,
  },
  // greetingContainer: {
  //   flex: 1,
  //   overflow: "hidden",
  //   marginRight: 10,
  //   justifyContent: "center",
  //   height: 50,
  // },
  // welcomeText: {
  //   color: "white",
  //   fontSize: 18,
  //   fontWeight: "bold",
  //   backgroundColor: "rgba(0, 0, 0, 0.1)",
  //   padding: 8,
  //   borderRadius: 10,
  // },
  profileIcon: {
    width: 48,
    height: 48,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  profileIconText: { color: "#333", fontWeight: "bold", fontSize: 22 },
  content: { flex: 1, justifyContent: "center", padding: 20, width: "90%" },
  scrollContent: { padding: 0, paddingBottom: 20 },
  title: {
    fontSize: 60,
    fontWeight: "bold",
    color: "white",
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
    textAlign: "center",
    marginBottom: 5,
  },
  buttonGuest: {
    backgroundColor: "#33333370",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#333",
    flex: 1,
  },
  buttonTextGuest: { color: "white", fontWeight: "bold", fontSize: 16 },
  joinCard: {
    backgroundColor: "#dddddd95",
    borderRadius: 20,
    padding: 6,
    marginBottom: 10,
    marginHorizontal: 10,
  },
  input: {
    backgroundColor: "#fff9f2ff",
    padding: 12,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
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
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
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
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    paddingHorizontal: 6,
  },
  friendsHeaderSpacer: {
    width: 32,
    height: 32,
  },
  friendsTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  refreshFriendsBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#ffffff95",
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
    marginHorizontal: 10,
    alignItems: "center",
  },
  waitingUpperRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "95%",
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
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff9f2",
    borderRadius: 2,
    padding: 25,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
    borderWidth: 3,
    borderColor: "#333",
    shadowColor: "#000",
    shadowOffset: { width: 8, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 0,
    elevation: 10,
    position: "relative",
    transform: [{ rotate: "-0.5deg" }],
  },
  modalTape: {
    position: "absolute",
    top: -15,
    width: 100,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.8)",
    transform: [{ rotate: "-2deg" }],
    borderWidth: 1,
    borderColor: "#ddd",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#333",
    marginBottom: 10,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 15,
    color: "#555",
    marginBottom: 20,
    textAlign: "center",
    fontWeight: "600",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 15,
    width: "100%",
    justifyContent: "center",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: "#ddd",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#333",
    minWidth: 80,
  },
  cancelText: { color: "#333", fontWeight: "bold", fontSize: 14 },
  confirmBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: "#4ECDC4",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#333",
    minWidth: 80,
  },
  confirmText: { color: "#333", fontWeight: "bold", fontSize: 14 },
});
