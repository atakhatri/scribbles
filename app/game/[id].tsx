import GRADIENTS from "@/data/gradients";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ChatWindow from "../../components/ChatWindow";
import DrawingCanvas from "../../components/DrawingCanvas";
import DrawingTools from "../../components/DrawingTools";
import InviteFriendsModal from "../../components/InviteFriendsModal";
import Podium from "../../components/Podium";
import WaitingLobby from "../../components/WaitingLobby";
import { WORDS_POOL } from "../../components/words";
import { useToast } from "../../context/ToastContext";
import { auth, db } from "../../firebaseConfig";

interface Stroke {
  path: string;
  color: string;
  width: number;
}

interface GameData {
  players: any[];
  currentDrawer: string;
  word: string;
  strokes: Stroke[];
  status: "waiting" | "playing" | "finished";
  hostId: string;
  round: number;
  maxRounds?: number;
  scores?: Record<string, number>;
  winner?: string;
  guesses?: any[]; // Added guesses to interface
  guessed?: string[];
  roundEndTimestamp?: number;
}

const AVATAR_GRADIENTS = GRADIENTS;

const getAvatarGradient = (uid: string) => {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
};

export default function GameRoom() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { showToast, showAlert, playSound } = useToast();
  const userId = auth.currentUser?.uid;
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const [currentColor, setCurrentColor] = useState("#000000");
  const [currentWidth, setCurrentWidth] = useState(3);

  // Ref to prevent overlapping updates
  const isUpdating = useRef(false);

  const [showPlayersMenu, setShowPlayersMenu] = useState(false);
  const [playersList, setPlayersList] = useState<any[]>([]);
  const [showLobbyVisible, setShowLobbyVisible] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [showDrawingTools, setShowDrawingTools] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  // Stats update state
  const [hasUpdatedStats, setHasUpdatedStats] = useState(false);
  const [lastStatus, setLastStatus] = useState<GameData["status"] | null>(null);

  // Round animation state
  const [lastSeenRound, setLastSeenRound] = useState<number>(0);
  const [roundAlertText, setRoundAlertText] = useState("");
  const roundAlertOpacity = useRef(new Animated.Value(0)).current;
  const roundAlertScale = useRef(new Animated.Value(0.5)).current;
  const lastInviteTimestamp = useRef<number>(0);
  const [lastDrawer, setLastDrawer] = useState<string | null>(null);

  // Time Sync Logic
  const timeOffsetRef = useRef(0);
  const getServerTime = () => Date.now() + timeOffsetRef.current;
  const logTimer = (...args: any[]) => {
    if (__DEV__) {
      console.log("[GameTimer]", ...args);
    }
  };

  // Helper: Determine user collection
  const getUserCollection = async (
    userId: string,
  ): Promise<"users" | "guestUsers"> => {
    try {
      const usersDoc = await getDocs(
        query(collection(db, "users"), where("__name__", "==", userId)),
      );
      return usersDoc.empty ? "guestUsers" : "users";
    } catch (e) {
      console.error("Error determining user collection:", e);
      return "users"; // Default to users on error
    }
  };

  useEffect(() => {
    if (!userId) return;
    const syncTime = async () => {
      try {
        // Create a temporary doc in 'games' (since we have write access) to get server time
        const syncRef = doc(db, "games", `SYNC_${userId}_${Math.random()}`);
        await setDoc(syncRef, { t: serverTimestamp() });
        const snap = await getDoc(syncRef);
        if (snap.exists()) {
          const serverTime = snap.data().t.toMillis();
          timeOffsetRef.current = serverTime - Date.now();
          await deleteDoc(syncRef);
        }
      } catch (e) {
        console.log("Time sync failed", e);
      }
    };
    syncTime();
  }, [userId]);

  const TOTAL_ROUNDS_FALLBACK = 5; // fallback rounds if none provided
  const slideAnim = useRef(new Animated.Value(0)).current; // 0 closed, 1 open

  useEffect(() => {
    if (showPlayersMenu) {
      playSound(require("../../assets/sounds/friendsMenu.mp3"));
    }
    Animated.timing(slideAnim, {
      toValue: showPlayersMenu ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showPlayersMenu, slideAnim]);

  // Listen for keyboard visibility to adjust layout
  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Listen for game invites (Toast only)
  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(doc(db, "users", userId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const invites = data.gameInvites || [];
        if (invites.length > 0) {
          const latest = invites[invites.length - 1];
          if (latest.timestamp > lastInviteTimestamp.current) {
            lastInviteTimestamp.current = latest.timestamp;
            if (Date.now() - latest.timestamp < 15000) {
              showToast({
                message: `${latest.inviterName} invited you to play!`,
                type: "info",
              });
            }
          }
        }
      }
    });
    return () => unsub();
  }, [userId]);

  // control lobby visibility based on game status
  useEffect(() => {
    if (gameData?.status === "waiting") setShowLobbyVisible(true);
    else setShowLobbyVisible(false);
  }, [gameData?.status]);

  // Update user stats when game finishes
  useEffect(() => {
    const currentStatus = gameData?.status;
    if (!currentStatus || !userId) return;

    // Only update stats if we transitioned from 'playing' to 'finished'
    // This prevents updates on re-renders or if joining an already finished game
    if (
      lastStatus === "playing" &&
      currentStatus === "finished" &&
      !hasUpdatedStats
    ) {
      setHasUpdatedStats(true);
      const updateStats = async () => {
        try {
          const scores = gameData?.scores || {};
          const myScore = scores[userId] || 0;
          const allScores = Object.values(scores);
          const maxScore = allScores.length > 0 ? Math.max(...allScores) : 0;
          const isWinner = myScore > 0 && myScore === maxScore;

          const userCollection = await getUserCollection(userId);
          const userRef = doc(db, userCollection, userId);

          // Get current recent games to update them
          const userSnap = await getDoc(userRef);
          const userData = userSnap.data();
          const currentRecentGames = userData?.recentGames || [];

          // Add the new game and keep the list at a max of 5
          const newRecentGames = [
            { gameId: id, playedAt: Date.now() },
            ...currentRecentGames,
          ].slice(0, 5);

          await updateDoc(userRef, {
            totalGames: increment(1),
            totalScore: increment(myScore),
            wins: isWinner ? increment(1) : increment(0),
            recentGames: newRecentGames,
          });
        } catch (e) {
          console.error("Failed to update stats", e);
        }
      };
      updateStats();
    }

    if (lastStatus === "waiting" && currentStatus === "playing") {
      playSound(require("../../assets/sounds/gameStart.mp3"));
    }

    if (currentStatus !== lastStatus) {
      setLastStatus(currentStatus);
    }
  }, [gameData?.status, userId, lastStatus, hasUpdatedStats]);

  // Round change animation
  useEffect(() => {
    if (!gameData) return;
    const currentRound = gameData.round;
    const maxRounds = gameData.maxRounds || TOTAL_ROUNDS_FALLBACK;

    if (lastSeenRound === 0) {
      setLastSeenRound(currentRound);
      return;
    }

    if (currentRound > lastSeenRound) {
      playSound(require("../../assets/sounds/gameStart.mp3"));

      if (userId === gameData.hostId) {
        addDoc(collection(db, "games", id as string, "messages"), {
          text: `Round ${currentRound} started!`,
          isSystem: true,
          userName: "Game",
          userId: "system",
          timestamp: serverTimestamp(),
        }).catch((err) => console.error("Failed to send round start msg", err));
      }

      if (maxRounds > 1) {
        const text =
          currentRound === maxRounds
            ? "LAST ROUND STARTED!"
            : `ROUND ${currentRound} STARTED!`;
        setRoundAlertText(text);

        roundAlertOpacity.setValue(0);
        roundAlertScale.setValue(0.5);

        Animated.sequence([
          Animated.parallel([
            Animated.timing(roundAlertOpacity, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
              easing: Easing.out(Easing.back(1.5)),
            }),
            Animated.timing(roundAlertScale, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
              easing: Easing.out(Easing.back(1.5)),
            }),
          ]),
          Animated.delay(2000),
          Animated.timing(roundAlertOpacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setRoundAlertText("");
        });
      }
      setLastSeenRound(currentRound);
    }
  }, [gameData?.round, lastSeenRound, userId, gameData?.hostId, id]);

  useEffect(() => {
    if (!gameData || !userId) return;
    const currentDrawer = gameData.currentDrawer;

    if (lastDrawer === null) {
      setLastDrawer(currentDrawer);
      return;
    }

    if (currentDrawer !== lastDrawer) {
      if (gameData.status === "playing" && userId === gameData.hostId) {
        const drawerName =
          playersList.find((p) => p.uid === currentDrawer)?.displayName ||
          "A player";
        addDoc(collection(db, "games", id as string, "messages"), {
          text: `${drawerName} is drawing!`,
          isSystem: true,
          userName: "Game",
          userId: "system",
          timestamp: serverTimestamp(),
        }).catch((err) => console.error("Failed to send drawer msg", err));
      }
      setLastDrawer(currentDrawer);
    }
  }, [
    gameData?.currentDrawer,
    lastDrawer,
    userId,
    gameData?.hostId,
    playersList,
    id,
    gameData?.status,
  ]);

  useEffect(() => {
    // When a new word is set (new turn starts), hide the tools by default
    // so the drawer has to open them.
    setShowDrawingTools(false);
  }, [gameData?.word]);

  // Word selection and timer
  const [candidateWords, setCandidateWords] = useState<string[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [customWord, setCustomWord] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!id) return;

    const gameRef = doc(db, "games", id as string);
    const unsubscribe = onSnapshot(gameRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as GameData;
        setGameData(data);
      } else {
        showToast({ message: "Game not found", type: "error" });
        router.replace("/");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [id]);

  // Generate candidate words for drawer when they become the current drawer
  useEffect(() => {
    const isDrawer = gameData?.currentDrawer === userId;
    const currentWord =
      (gameData as any)?.word ?? (gameData as any)?.currentWord;

    const filterWord = (w: string) => {
      if (!w) return false;
      // normalize and remove extra spacing
      const n = w.trim();
      // allow spaces and letters, exclude digits/punctuation
      if (!/^[A-Za-z\s'-]+$/.test(n)) return false;
      const len = n.replace(/\s+/g, "").length; // length excluding spaces
      return len >= 3 && len <= 12;
    };

    const pickRandom = (arr: string[], count: number) => {
      const copy = arr.slice();
      const res: string[] = [];
      for (let i = 0; i < count && copy.length > 0; i++) {
        const idx = Math.floor(Math.random() * copy.length);
        res.push(copy.splice(idx, 1)[0]);
      }
      return res;
    };

    const fetchRemoteWords = async () => {
      try {
        // Try Random Word API (vercel). Returns lowercase single words.
        const resp = await fetch(
          "https://random-word-api.vercel.app/api?words=60",
        );
        if (!resp.ok) throw new Error("remote word fetch failed");
        const words: string[] = (await resp.json()).map((w: string) =>
          w.toUpperCase(),
        );
        const filtered = words.filter(filterWord);
        if (filtered.length >= 3) return filtered;

        // fallback: try Datamuse for more varied words (may include multi-word phrases)
        const topics = [
          "animals",
          "food",
          "nature",
          "sports",
          "transport",
          "home",
          "clothing",
          "music",
          "tools",
        ];
        const topic = topics[Math.floor(Math.random() * topics.length)];
        const dm = await fetch(
          `https://api.datamuse.com/words?topics=${topic}&max=100&md=p`,
        );
        if (dm.ok) {
          const dmJson = await dm.json();
          const candidates = dmJson
            .filter((x: any) => {
              const w = (x.word || "").toLowerCase();
              return (
                x.tags?.includes("n") && !w.endsWith("ing") && !w.endsWith("ed")
              );
            })
            .map((x: any) => (x.word || "").toString().toUpperCase())
            .filter(filterWord);
          if (candidates.length >= 3) return candidates;
        }
      } catch (e) {
        // ignore errors and allow fallback to local pool
        console.warn("remote words unavailable", e);
      }
      return null;
    };

    if (isDrawer && !currentWord && gameData?.status === "playing") {
      (async () => {
        const remote = await fetchRemoteWords();
        if (remote && remote.length > 0) {
          setCandidateWords(pickRandom(remote, 3));
          return;
        }

        // Fallback to local WORDS_POOL, prefer less-childish by filtering length
        const localFiltered = WORDS_POOL.filter(filterWord).map((w) =>
          w.toUpperCase(),
        );
        if (localFiltered.length >= 3) {
          setCandidateWords(pickRandom(localFiltered, 3));
        } else {
          // final fallback: pick any from pool
          setCandidateWords(pickRandom(WORDS_POOL.slice(), 3));
        }
      })();
    } else {
      setCandidateWords([]);
      setCustomWord("");
    }
  }, [
    gameData?.currentDrawer,
    gameData?.word,
    gameData?.status,
    userId,
    refreshKey,
  ]);

  // Countdown based on gameData.roundEndTimestamp
  useEffect(() => {
    let timer: any = null;
    const endTs = (gameData as any)?.roundEndTimestamp;
    if (endTs) {
      const update = () => {
        const secs = Math.max(0, Math.ceil((endTs - getServerTime()) / 1000));
        setRemainingSeconds(secs);
        if (__DEV__ && secs <= 3) {
          logTimer("tick", {
            roomId: id,
            secs,
            endTs,
            now: getServerTime(),
            drawer: gameData?.currentDrawer,
            round: gameData?.round,
            hasWord: !!(gameData as any)?.word,
          });
        }
        if (secs <= 0) clearInterval(timer);
      };
      update();
      timer = setInterval(update, 1000);
    } else {
      setRemainingSeconds(null);
    }
    return () => clearInterval(timer);
  }, [gameData?.round, gameData?.roundEndTimestamp]);

  // When time runs out, immediately advance the turn to the next player.
  // Use a ref to ensure we only process a given roundEndTimestamp once.
  const timeoutProcessedRef = useRef<number | null>(null);
  useEffect(() => {
    if (remainingSeconds !== 0) return;
    if (!id || !gameData) return;
    if (gameData.status !== "playing") return;
    const endTs = (gameData as any)?.roundEndTimestamp;
    if (!endTs) return;
    if (getServerTime() < endTs - 1000) return;

    // Only the host should trigger the turn change to avoid race conditions/conflicts
    if (gameData.hostId !== userId) return;

    if (timeoutProcessedRef.current === endTs) return; // already processed
    timeoutProcessedRef.current = endTs;
    logTimer("timeout candidate", {
      roomId: id,
      endTs,
      now: getServerTime(),
      drawer: gameData.currentDrawer,
      round: gameData.round,
      hasWord: !!(gameData as any)?.word,
    });

    (async () => {
      let didProcessTransition = false;
      try {
        const gameRef = doc(db, "games", id as string);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(gameRef);
          if (!snap.exists()) return;
          const data = snap.data() as any;

          // Process only if this is still the same active timer window.
          if (data.status !== "playing") return;
          if (data.roundEndTimestamp !== endTs) return;
          if (getServerTime() < data.roundEndTimestamp - 1000) return;

          // 1. Word Selection Phase Timeout
          // If word is not selected yet, pick a random word and give time to draw.
          if (!data.word) {
            const pool =
              WORDS_POOL && WORDS_POOL.length > 0
                ? WORDS_POOL
                : ["APPLE", "BANANA", "CAT"];
            const randomWord =
              pool[Math.floor(Math.random() * pool.length)].toUpperCase();
            const drawingRoundEnd = getServerTime() + 120000; // 2 mins to draw
            tx.update(gameRef, {
              word: randomWord,
              currentWord: randomWord,
              roundEndTimestamp: drawingRoundEnd,
              guessed: [],
            });
            didProcessTransition = true;
            logTimer("word auto-selected after picker timeout", {
              roomId: id,
              selectedWord: randomWord,
              drawingRoundEnd,
              drawer: data.currentDrawer,
              round: data.round,
            });
            return;
          }

          // 2. Drawing Phase Timeout (Turn End)
          // Word was selected, but time ran out. Move to next player.

          const msgRef = doc(collection(db, "games", id as string, "messages"));
          tx.set(msgRef, {
            text: "Time's up!",
            isSystem: true,
            userName: "Game",
            userId: "system",
            timestamp: serverTimestamp(),
          });

          const playersRaw = Array.isArray(data.players) ? data.players : [];
          const players: string[] = playersRaw.map((p: any) =>
            typeof p === "string" ? p : p?.uid || p,
          );
          const currentDrawer: string = data.currentDrawer;

          // Award points to the drawer based on how many people guessed
          const scoresObj = data.scores || {};
          const guessedArr = Array.isArray(data.guessed)
            ? data.guessed.filter((uid: string) => uid !== currentDrawer)
            : [];
          // Drawer gets points for each guesser. Since time is 0, base points only.
          // Using the same formula logic: 5 * count
          const drawerPoints = 5 * guessedArr.length;

          if (currentDrawer && drawerPoints > 0) {
            scoresObj[currentDrawer] =
              (scoresObj[currentDrawer] || 0) + drawerPoints;
          }

          // Determine next drawer and whether the round should increment
          let nextDrawer = currentDrawer;
          let shouldIncrementRound = false;

          if (players.length > 0) {
            const foundIdx = players.findIndex((p) => p === currentDrawer);
            // If current drawer not found (e.g. left), start from 0.
            const idx = foundIdx >= 0 ? foundIdx : 0;
            const nextIdx = (idx + 1) % players.length;
            nextDrawer = players[nextIdx];

            // If we wrapped around to the start (or passed it), increment round
            if (nextIdx <= idx) shouldIncrementRound = true;
          }

          const nextRound = (data.round || 1) + (shouldIncrementRound ? 1 : 0);
          const maxRounds = data.maxRounds || TOTAL_ROUNDS_FALLBACK;
          const newStatus = nextRound > maxRounds ? "finished" : "playing";

          // Next phase is Word Selection (30s)
          const newRoundEnd =
            newStatus === "playing" ? getServerTime() + 30000 : null;

          const updateObj: any = {
            scores: scoresObj,
            strokes: [],
            word: "",
            currentWord: "",
            guessed: [],
            round: nextRound,
            currentDrawer: nextDrawer,
            status: newStatus,
            roundEndTimestamp: newRoundEnd,
            lastUpdated: serverTimestamp(),
          };

          tx.update(gameRef, updateObj);
          didProcessTransition = true;
          logTimer("turn advanced after drawing timeout", {
            roomId: id,
            previousDrawer: currentDrawer,
            nextDrawer,
            roundBefore: data.round,
            roundAfter: nextRound,
            statusAfter: newStatus,
            nextEndTs: newRoundEnd,
          });
        });
        if (!didProcessTransition) {
          // Release the lock when this invocation was a no-op so the true expiry can be processed later.
          timeoutProcessedRef.current = null;
          logTimer("timeout no-op, released lock", {
            roomId: id,
            endTs,
            now: getServerTime(),
          });
        }
      } catch (e) {
        console.error("advance on timeout failed", e);
        timeoutProcessedRef.current = null;
        logTimer("timeout failed, released lock", {
          roomId: id,
          endTs,
          now: getServerTime(),
        });
      }
    })();
  }, [remainingSeconds, id, gameData, userId]);

  // Ensure current user is added to the room players list once (on mount), and removed on unmount.
  useEffect(() => {
    if (!id || !userId) return;
    const gameRef = doc(db, "games", id as string);
    let joined = false;

    (async () => {
      try {
        const snap = await getDoc(gameRef);
        const players = snap.exists() ? (snap.data() as any).players || [] : [];
        const already = players.some((p: any) =>
          typeof p === "string" ? p === userId : p?.uid === userId,
        );
        if (!already) {
          try {
            await updateDoc(gameRef, { players: arrayUnion(userId) });
          } catch (e) {
            console.error("Failed to join room", e);
          }
          try {
            const scoreObj: any = {};
            scoreObj[`scores.${userId}`] = 0;
            await updateDoc(gameRef, scoreObj);
          } catch (e) {}
          try {
            await addDoc(collection(db, "games", id as string, "messages"), {
              isSystem: true,
              systemType: "join",
              text: `${
                auth.currentUser?.displayName || "A player"
              } joined the game`,
              timestamp: serverTimestamp(),
            });
          } catch (e) {}
        }
        joined = true;
      } catch (e) {
        console.error("join effect error", e);
      }
    })();

    return () => {
      (async () => {
        if (!joined) return;
        let roomDeleted = false;
        try {
          roomDeleted = await runTransaction(db, async (tx) => {
            const docSnap = await tx.get(gameRef);
            if (!docSnap.exists()) return true;
            const data = docSnap.data();
            const currentPlayers = data.players || [];
            const updatedPlayers = currentPlayers.filter((p: any) => {
              const pid = typeof p === "string" ? p : p.uid;
              return pid !== userId;
            });

            if (updatedPlayers.length === 0) {
              tx.delete(gameRef);
              return true;
            }

            const updates: any = { players: updatedPlayers };

            if (data.hostId === userId) {
              if (updatedPlayers.length > 0) {
                const next = updatedPlayers[0];
                updates.hostId = typeof next === "string" ? next : next.uid;
              }
            }

            // If the current drawer leaves, pass the turn to the next player
            if (data.currentDrawer === userId && data.status === "playing") {
              if (updatedPlayers.length > 0) {
                const myIndex = currentPlayers.findIndex((p: any) => {
                  const pid = typeof p === "string" ? p : p.uid;
                  return pid === userId;
                });
                // The player at myIndex is removed, so the next player shifts into that index.
                // If myIndex was the last one, we wrap to 0.
                const nextIndex =
                  myIndex >= updatedPlayers.length ? 0 : myIndex;
                const nextPlayer = updatedPlayers[nextIndex];
                const nextUid =
                  typeof nextPlayer === "string" ? nextPlayer : nextPlayer.uid;

                updates.currentDrawer = nextUid;
                updates.word = "";
                updates.currentWord = "";
                updates.strokes = [];
                updates.guessed = [];
                updates.roundEndTimestamp =
                  Date.now() + timeOffsetRef.current + 30000; // 30s for word selection
              } else {
                updates.status = "finished";
              }
            }

            tx.update(gameRef, updates);
            return false;
          });
        } catch (e) {}
        if (!roomDeleted) {
          try {
            await addDoc(collection(db, "games", id as string, "messages"), {
              isSystem: true,
              systemType: "leave",
              text: `${
                auth.currentUser?.displayName || "A player"
              } left the game`,
              timestamp: serverTimestamp(),
            });
          } catch (e) {}
        }
      })();
    };
  }, [id, userId]);

  useEffect(() => {
    if (!gameData) return;
    (async () => {
      try {
        const promises = (gameData.players || []).map(async (p: any) => {
          if (typeof p === "string") {
            try {
              // Try users collection first, then guestUsers
              let userDoc = await getDoc(doc(db, "users", p));
              let data = userDoc.exists() ? userDoc.data() : null;

              if (!data) {
                userDoc = await getDoc(doc(db, "guestUsers", p));
                data = userDoc.exists() ? userDoc.data() : null;
              }

              return {
                uid: p,
                displayName:
                  data?.username ||
                  data?.displayName ||
                  (p === userId ? auth.currentUser?.displayName : undefined) ||
                  p,
                points: gameData.scores ? (gameData.scores[p] ?? 0) : 0,
                avatar: data?.avatarUrl || data?.photoURL || null,
                avatarGradientIndex: data?.avatarGradientIndex,
              };
            } catch (e) {
              return {
                uid: p,
                displayName: p,
                points: gameData.scores ? (gameData.scores[p] ?? 0) : 0,
              };
            }
          } else {
            return {
              uid: p.uid,
              displayName: p.displayName || p.username || p.uid,
              points: gameData.scores
                ? (gameData.scores[p.uid] ?? 0)
                : (p.points ?? 0),
            };
          }
        });

        const resolved = await Promise.all(promises);
        // sort by points desc for convenience
        resolved.sort((a: any, b: any) => (b.points || 0) - (a.points || 0));
        setPlayersList(resolved);
      } catch (e) {
        console.error("Error building players list", e);
      }
    })();
  }, [gameData, userId]);

  const handleStrokeStart = () => {
    if (
      isDrawer &&
      gameData?.status === "playing" &&
      secretWord.trim().length > 0
    ) {
      setIsDrawing(true);
    }
  };

  const handleStrokeFinished = async (newStroke: Stroke) => {
    setIsDrawing(false);
    if (!gameData || gameData.currentDrawer !== userId || isUpdating.current)
      return;

    try {
      isUpdating.current = true;
      const gameRef = doc(db, "games", id as string);

      // We append ONLY the new stroke to the array.
      await updateDoc(gameRef, {
        strokes: arrayUnion(newStroke),
        lastUpdated: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error saving stroke:", error);
    } finally {
      isUpdating.current = false;
    }
  };

  const handleClearCanvas = async () => {
    if (!gameData || gameData.currentDrawer !== userId) return;
    try {
      const gameRef = doc(db, "games", id as string);
      await updateDoc(gameRef, {
        strokes: [], // Reset strokes
      });
    } catch (error) {
      console.error("Error clearing canvas:", error);
    }
  };

  const handleUndo = async () => {
    if (!gameData || gameData.currentDrawer !== userId) return;
    try {
      const gameRef = doc(db, "games", id as string);
      const snap = await getDoc(gameRef);
      if (!snap.exists()) return;
      const data = snap.data() as any;
      const strokes = Array.isArray(data.strokes) ? data.strokes.slice() : [];
      if (strokes.length === 0) return;
      strokes.pop();
      await updateDoc(gameRef, { strokes });
    } catch (e) {
      console.error("Undo failed", e);
    }
  };

  const copyRoomIdToClipboard = async () => {
    if (!id) return;
    try {
      await Clipboard.setStringAsync(id as string);
      showToast({ message: "Room code copied to clipboard", type: "success" });
    } catch (e) {
      console.error("Failed to copy room id", e);
    }
  };

  const handleStartGame = async () => {
    if (!gameData) return;
    if (gameData.hostId !== userId) {
      showToast({ message: "Only the host can start the game.", type: "info" });
      return;
    }
    if ((gameData.players?.length || 0) < 2) {
      showToast({
        message: "At least 2 players are required to start the game.",
        type: "info",
      });
      return;
    }

    try {
      const gameRef = doc(db, "games", id as string);
      const firstDrawer = gameData.players[0]?.uid || gameData.players[0];
      const roundEnd = getServerTime() + 30000; // 30s for word selection
      timeoutProcessedRef.current = null;
      await updateDoc(gameRef, {
        status: "playing",
        round: 1,
        currentDrawer: firstDrawer,
        strokes: [],
        guesses: [],
        guessed: [],
        roundEndTimestamp: roundEnd,
        word: "",
        currentWord: "",
        lastUpdated: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error starting game", error);
    }
  };

  const handleCorrectGuess = async (guesserId: string) => {
    playSound(require("../../assets/sounds/correct.mp3"));
    if (!id) return;
    const gameRef = doc(db, "games", id as string);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        if (!snap.exists()) return;
        const data = snap.data() as any;

        const playersRaw = Array.isArray(data.players) ? data.players : [];
        const players: string[] = playersRaw.map((p: any) =>
          typeof p === "string" ? p : p?.uid || p,
        );
        const currentDrawer: string = data.currentDrawer;

        const guessedArr: string[] = Array.isArray(data.guessed)
          ? data.guessed.slice()
          : [];

        // If already recorded, no-op
        if (guessedArr.includes(guesserId)) return;

        // add the new guesser
        guessedArr.push(guesserId);

        // persist guessed array
        tx.update(gameRef, { guessed: guessedArr });

        // Award points to THIS guesser immediately
        const endTs = data.roundEndTimestamp || getServerTime();
        const remainingSeconds = Math.max(
          0,
          Math.ceil((endTs - getServerTime()) / 1000),
        );
        const guesserPoints = 10 + remainingSeconds;
        const scoresObj: Record<string, number> = data.scores || {};
        scoresObj[guesserId] = (scoresObj[guesserId] || 0) + guesserPoints;

        // Determine non-drawer players who need to guess
        const nonDrawerPlayers = players.filter((p) => p !== currentDrawer);

        const allGuessed = nonDrawerPlayers.every((p) =>
          guessedArr.includes(p),
        );

        if (!allGuessed) {
          // Just update the guesser's score and return
          tx.update(gameRef, { scores: scoresObj });
          return;
        }

        // All players guessed: compute scoring and advance round immediately
        // Award points to the drawer
        const drawerPointsPerGuesser = 5 + Math.floor(remainingSeconds / 2);

        const numGuessers = nonDrawerPlayers.filter((u) =>
          guessedArr.includes(u),
        ).length;
        if (currentDrawer) {
          scoresObj[currentDrawer] =
            (scoresObj[currentDrawer] || 0) +
            drawerPointsPerGuesser * numGuessers;
        }

        // Determine next drawer. Only advance the round when the drawer
        // cycles back to the beginning of the players list (wraps around).
        let nextDrawer = currentDrawer;
        let shouldIncrementRound = false;
        if (players.length > 0) {
          const foundIdx = players.findIndex((p) => p === currentDrawer);
          const idx = foundIdx >= 0 ? foundIdx : 0;
          const nextIdx = (idx + 1) % players.length;
          nextDrawer = players[nextIdx];
          // If nextIdx wrapped to a lower or equal index, we've completed a cycle
          // through all players and should increment the round.
          if (nextIdx <= idx) shouldIncrementRound = true;
        }

        const nextRound = (data.round || 1) + (shouldIncrementRound ? 1 : 0);
        const maxRounds = data.maxRounds || TOTAL_ROUNDS_FALLBACK;

        const newStatus = nextRound > maxRounds ? "finished" : "playing";

        const newRoundEnd =
          newStatus === "playing" ? getServerTime() + 30000 : null;

        // Update game doc to reflect round end and scoring
        tx.update(gameRef, {
          scores: scoresObj,
          strokes: [],
          word: "",
          currentWord: "",
          guessed: [],
          round: nextRound,
          currentDrawer: nextDrawer,
          roundEndTimestamp: newRoundEnd,
          status: newStatus,
          lastUpdated: serverTimestamp(),
        });
      });
    } catch (e) {
      console.error("handleCorrectGuess transaction failed", e);
    }
  };

  const handleCustomWordSubmit = async () => {
    const w = customWord.trim().toUpperCase();
    if (!w) return;
    if (w.length < 2 || w.length > 20) {
      showToast({ message: "Word must be 2-20 characters", type: "error" });
      return;
    }
    try {
      const gameRef = doc(db, "games", id as string);
      const roundEnd = getServerTime() + 120000;
      await updateDoc(gameRef, {
        word: w,
        currentWord: w,
        roundEndTimestamp: roundEnd,
        guessed: [],
        lastUpdated: serverTimestamp(),
      });
    } catch (e) {
      console.error("custom word select failed", e);
    }
  };

  if (loading || isExiting) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>
          {isExiting ? "Exiting..." : "Loading Game Room..."}
        </Text>
      </View>
    );
  }

  const isDrawer = gameData?.currentDrawer === userId;
  const hasGuessed = gameData?.guessed?.includes(userId || "");

  const secretWord = gameData?.word ?? "";

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [320, 0],
  });

  const handleExitFromPodium = () => {
    router.replace("/");
  };

  return (
    <View style={styles.container}>
      {gameData?.status === "finished" && (
        <Podium
          players={playersList}
          onExit={handleExitFromPodium}
          onPlayAgain={handleStartGame}
        />
      )}
      {gameData?.status === "finished" ? null : (
        <>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => {
                Alert.alert("Exit Game", "Leave this room?", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Exit",
                    style: "destructive",
                    onPress: () => {
                      setIsExiting(true);
                      playSound(require("../../assets/sounds/exit.mp3"));
                      setTimeout(() => router.replace("/"), 100);
                    },
                  },
                ]);
              }}
              style={styles.exitButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.exitText}>Exit</Text>
            </TouchableOpacity>
            {remainingSeconds !== null && (
              <View style={styles.timerBadge}>
                <Text style={styles.timerText}>
                  {Math.floor((remainingSeconds || 0) / 60)}:
                  {String((remainingSeconds || 0) % 60).padStart(2, "0")}
                </Text>
              </View>
            )}
            {/* <View style={styles.headerCenter}> */}
            <View style={styles.roomBar}>
              <Text style={styles.roomText}>Code: {id}</Text>
              <TouchableOpacity
                onPress={copyRoomIdToClipboard}
                style={styles.copyButton}
              >
                <Ionicons name="copy" size={18} color="#374151" />
              </TouchableOpacity>
            </View>
            <View style={styles.roundBadge}>
              <Text style={styles.roundText}>
                {gameData?.round ?? 0} /{" "}
                {gameData?.maxRounds ?? TOTAL_ROUNDS_FALLBACK}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowPlayersMenu((v) => !v)}
              style={styles.playersToggle}
            >
              <Ionicons name="people" size={22} color="#333" />
            </TouchableOpacity>
          </View>

          {/* Waiting lobby shown when room is in waiting state */}
          <WaitingLobby
            visible={showLobbyVisible}
            onClose={() => setShowLobbyVisible(false)}
            onLeave={() => router.replace("/")}
            roomId={id as string}
            players={playersList}
            hostId={gameData?.hostId}
            onStart={handleStartGame}
          />

          {/* Main Content Wrapper: Reorders Chat/Game when keyboard is open */}
          <View
            style={{
              flex: 1,
              flexDirection: isKeyboardVisible ? "column-reverse" : "column",
            }}
          >
            {/* Main Game Area */}
            <View style={styles.gameContent}>
              {/* Word selection panel for drawer before drawing */}
              {gameData?.currentDrawer === userId &&
                !((gameData as any)?.word || (gameData as any).currentWord) && (
                  <View style={styles.wordPicker}>
                    <View style={styles.wordPickerHeader}>
                      <Text style={styles.wordPickerTitle}>
                        Choose a word to draw
                      </Text>
                      <TouchableOpacity
                        onPress={() => setRefreshKey((k) => k + 1)}
                        style={styles.shuffleButton}
                      >
                        <Ionicons name="shuffle" size={18} color="#4B5563" />
                        <Text style={styles.shuffleText}>Shuffle</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.wordOptions}>
                      {candidateWords.map((w) => (
                        <TouchableOpacity
                          key={w}
                          style={styles.wordOption}
                          onPress={async () => {
                            try {
                              const gameRef = doc(db, "games", id as string);
                              const roundEnd = getServerTime() + 120000;
                              await updateDoc(gameRef, {
                                word: w,
                                currentWord: w,
                                roundEndTimestamp: roundEnd,
                                guessed: [],
                              });
                            } catch (e) {
                              console.error("select word failed", e);
                            }
                          }}
                        >
                          <Text style={styles.wordOptionText}>{w}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.customWordSection}>
                      <Text style={styles.orText}>OR</Text>
                      <View style={styles.customInputRow}>
                        <TextInput
                          style={styles.customInput}
                          placeholder="Type your own..."
                          placeholderTextColor="#9CA3AF"
                          value={customWord}
                          onChangeText={setCustomWord}
                          maxLength={20}
                          autoCapitalize="characters"
                        />
                        <TouchableOpacity
                          style={styles.customSubmitBtn}
                          onPress={handleCustomWordSubmit}
                        >
                          <Ionicons name="checkmark" size={20} color="white" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
              {/* Word Display */}
              {isDrawer && gameData?.status === "playing" && (
                <View style={styles.wordContainer}>
                  <Text style={styles.wordLabel}>Draw this:</Text>
                  <Text style={styles.secretWord}>{secretWord}</Text>
                </View>
              )}

              {!isDrawer && gameData?.status === "playing" && (
                <View style={styles.wordContainer}>
                  <Text style={styles.wordLabel}>
                    {hasGuessed ? "You guessed it!" : "Guess the word!"}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text
                      style={[
                        styles.secretWord,
                        hasGuessed && { color: "#22C55E" },
                      ]}
                    >
                      {hasGuessed
                        ? secretWord
                        : secretWord
                            .split("")
                            .map((c) => (c === " " ? " " : "_ "))
                            .join("")}
                    </Text>
                    {!hasGuessed && (
                      <Text style={styles.wordLength}>
                        ({(secretWord || "").replace(/\s+/g, "").length})
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {/* Canvas - THIS Component receives 'color', 'strokeWidth', 'strokes' */}
              <View style={styles.canvasContainer}>
                <View
                  style={{ flex: 1 }}
                  onTouchStart={handleStrokeStart}
                  onTouchEnd={() => setIsDrawing(false)}
                  onTouchCancel={() => setIsDrawing(false)}
                >
                  <DrawingCanvas
                    color={currentColor}
                    strokeWidth={currentWidth}
                    enabled={
                      isDrawer &&
                      gameData?.status === "playing" &&
                      secretWord.trim().length > 0
                    }
                    strokes={gameData?.strokes || []}
                    onStrokeFinished={handleStrokeFinished}
                  />
                </View>

                {/* Overlay tools positioned on top of canvas so they're always visible */}
                {isDrawer && secretWord.trim().length > 0 && !isDrawing && (
                  <View style={styles.toolsOverlay} pointerEvents="box-none">
                    {showDrawingTools ? (
                      <View
                        style={styles.toolsWrapper}
                        pointerEvents="box-none"
                      >
                        <DrawingTools
                          selectedColor={currentColor}
                          onSelectColor={setCurrentColor}
                          strokeWidth={currentWidth}
                          onSelectWidth={setCurrentWidth}
                          onClear={handleClearCanvas}
                          onUndo={handleUndo}
                        />
                        <TouchableOpacity
                          style={styles.closeToolsButton}
                          onPress={() => setShowDrawingTools(false)}
                        >
                          <Ionicons name="close" size={20} color="white" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View pointerEvents="auto">
                        <TouchableOpacity
                          style={styles.showToolsButton}
                          onPress={() => setShowDrawingTools(true)}
                        >
                          <Ionicons name="brush" size={28} color="white" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </View>

            {/* Chat / Guesses */}
            <View style={styles.chatContainer}>
              <ChatWindow
                gameId={id as string}
                isDrawer={isDrawer}
                currentWord={gameData?.word || ""}
                currentUser={{
                  uid: auth.currentUser?.uid || "anon",
                  displayName: auth.currentUser?.displayName || "Player",
                }}
                guesses={gameData?.guesses || []}
                onCorrectGuess={handleCorrectGuess}
                avoidKeyboard={!isKeyboardVisible}
              />
            </View>
          </View>

          {/* Backdrop for Player Menu */}
          {showPlayersMenu && (
            <TouchableOpacity
              style={styles.menuBackdrop}
              activeOpacity={1}
              onPress={() => setShowPlayersMenu(false)}
            />
          )}

          {/* Player Menu Overlay (sliding) */}
          <Animated.View
            style={[styles.playersOverlay, { transform: [{ translateX }] }]}
            pointerEvents={showPlayersMenu ? "auto" : "none"}
          >
            <View style={styles.playersHeader}>
              <Text style={styles.playersTitle}>Players</Text>
              <TouchableOpacity onPress={() => setShowPlayersMenu(false)}>
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>
            <View style={styles.playersList}>
              {playersList.map((p: any) => (
                <View key={p.uid} style={styles.playerRow}>
                  <View style={styles.playerAvatarContainer}>
                    <LinearGradient
                      colors={
                        (p.avatarGradientIndex !== undefined &&
                        p.avatarGradientIndex >= 0 &&
                        p.avatarGradientIndex < AVATAR_GRADIENTS.length
                          ? AVATAR_GRADIENTS[p.avatarGradientIndex]
                          : getAvatarGradient(p.uid)) as any
                      }
                      style={styles.playerAvatar}
                    >
                      <Text style={styles.playerAvatarText}>
                        {p.displayName?.[0]?.toUpperCase()}
                      </Text>
                    </LinearGradient>
                    {gameData?.hostId === p.uid && (
                      <View style={styles.hostCrown}>
                        <Text style={{ fontSize: 16 }}>👑</Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.playerName,
                      p.uid === userId && {
                        color: "#4F46E5",
                        fontWeight: "bold",
                      },
                    ]}
                  >
                    {p.displayName}
                    {p.uid === userId ? " (You)" : ""}
                  </Text>
                  <View style={styles.playerMeta}>
                    <Text style={styles.playerPoints}>{p.points ?? 0} pts</Text>
                    {gameData?.currentDrawer === p.uid && (
                      <Text style={styles.drawerTag}>Drawing</Text>
                    )}
                    {gameData?.guessed?.includes(p.uid) && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#22C55E"
                        style={{ marginLeft: 4 }}
                      />
                    )}
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.playersFooter}>
              <TouchableOpacity
                style={styles.inviteButton}
                onPress={() => setShowInviteModal(true)}
              >
                <Text style={styles.inviteText}>Invite Friends</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
          <InviteFriendsModal
            visible={showInviteModal}
            onClose={() => setShowInviteModal(false)}
            roomId={id as string}
          />

          {/* Round Alert Overlay */}
          {roundAlertText ? (
            <View style={styles.roundAlertContainer} pointerEvents="none">
              <Animated.Text
                style={[
                  styles.roundAlertText,
                  {
                    opacity: roundAlertOpacity,
                    transform: [
                      { scale: roundAlertScale },
                      { rotate: "-6deg" },
                    ],
                  },
                ]}
              >
                {roundAlertText}
              </Animated.Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffe2af",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#666",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 6,
    paddingTop: 40,
    backgroundColor: "#fbbf24",
    borderBottomWidth: 2,
    borderBottomColor: "#333",
    justifyContent: "space-evenly",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  gameContent: {
    flex: 2,
    padding: 10,
  },
  wordContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  wordLabel: {
    color: "#6B7280",
    fontSize: 14,
  },
  secretWord: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111827",
    letterSpacing: 2,
  },
  canvasContainer: {
    flex: 1,
    minHeight: 300,
    backgroundColor: "white",
    borderRadius: 10,
    boxShadow: "0px 1px 2px rgba(0,0,0,0.1)",
    elevation: 2,
    marginBottom: 10,
    position: "relative",
  },
  toolsOverlay: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    alignItems: "center",
  },
  showToolsButton: {
    backgroundColor: "rgba(67, 149, 255, 0.73)",
    padding: 15,
    borderRadius: 35,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  toolsWrapper: {
    flexDirection: "column-reverse",
    alignItems: "center",
    marginBottom: 16,
  },
  closeToolsButton: {
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 8,
    borderRadius: 20,
    marginBottom: 0,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.8,
  },
  chatContainer: {
    flex: 1,
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 5,
    overflow: "hidden",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-evenly",
    gap: 0,
  },
  roomBar: {
    // marginLeft: 6,
    flexDirection: "row",
    alignItems: "center",
    // gap: 8,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#92400E",
  },
  roomText: {
    color: "#333",
    fontSize: 16,
  },
  copyButton: {
    padding: 6,
  },
  roundBadge: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    // marginLeft: 6,
    borderWidth: 1,
    borderColor: "#333",
  },
  roundText: {
    color: "#4338CA",
    fontWeight: "700",
    fontSize: 16,
  },
  playersToggle: {
    padding: 8,
    paddingHorizontal: 10,
    // marginLeft: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  exitButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    // marginRight: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  exitText: {
    color: "#B91C1C",
    fontWeight: "700",
  },
  timerBadge: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    // marginRight: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  timerText: {
    color: "#4338CA",
    fontWeight: "700",
    fontSize: 16,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    zIndex: 15,
  },
  playersOverlay: {
    position: "absolute",
    right: 0,
    top: 40,
    width: 300,
    bottom: 20,
    backgroundColor: "white",
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    boxShadow: "0px 4px 8px rgba(0,0,0,0.08)",
    elevation: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#333",
    zIndex: 20,
  },
  playersHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  playersTitle: {
    fontSize: 16,
    textTransform: "uppercase",
    fontWeight: "700",
    color: "#333",
  },
  playersList: {
    flex: 1,
    marginTop: 6,
  },
  playerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  playerAvatarContainer: {
    position: "relative",
    marginRight: 10,
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  playerAvatarText: {
    color: "#333",
    fontWeight: "bold",
    fontSize: 14,
  },
  hostCrown: {
    position: "absolute",
    top: -12,
    left: -2,
    transform: [{ rotate: "-25deg" }],
  },
  playerName: {
    fontSize: 14,
    color: "#111827",
    flex: 1,
  },
  playerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  playerPoints: {
    color: "#6B7280",
    fontSize: 12,
  },
  drawerTag: {
    backgroundColor: "#E0E7FF",
    color: "#4338CA",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    fontSize: 12,
    overflow: "hidden",
  },
  playersFooter: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  inviteButton: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  inviteText: {
    color: "#374151",
    fontWeight: "600",
  },
  startButton: {
    flex: 1,
    backgroundColor: "#4338CA",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  startText: {
    color: "white",
    fontWeight: "700",
  },
  wordPicker: {
    padding: 16,
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    marginBottom: 12,
    alignItems: "center",
    borderColor: "#333",
    borderWidth: 2,
  },
  wordPickerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  wordLength: {
    marginLeft: 2,
    color: "#6B7280",
    fontSize: 16,
  },
  wordOptions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    flexWrap: "wrap",
  },
  wordOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#FBBF24",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#92400E",
  },
  wordOptionText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 14,
  },
  customWordSection: {
    marginTop: 16,
    alignItems: "center",
    width: "100%",
  },
  orText: {
    color: "#92400E",
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 8,
  },
  customInputRow: {
    flexDirection: "row",
    gap: 8,
    width: "90%",
  },
  customInput: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: "#111827",
    borderColor: "#333",
    borderWidth: 1,
  },
  customSubmitBtn: {
    backgroundColor: "#ff8800",
    padding: 10,
    borderRadius: 33,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  wordPickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 12,
  },
  shuffleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 4,
  },
  shuffleText: {
    fontSize: 14,
    color: "#4B5563",
    fontWeight: "600",
  },
  roundAlertContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
    elevation: 100,
  },
  roundAlertText: {
    fontSize: 36,
    fontWeight: "900",
    color: "#FBBF24", // Amber-400
    textShadowColor: "#B91C1C",
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
    textAlign: "center",
    paddingVertical: 20,
    paddingHorizontal: 40,
    backgroundColor: "rgba(74, 27, 0, 0.74)",
    borderRadius: 16,
    borderWidth: 4,
    borderColor: "#F59E0B", // Amber-500
  },
});
