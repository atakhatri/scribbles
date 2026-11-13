import Preloader from "@/components/preloader";
import GRADIENTS from "@/data/gradients";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  Easing,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ChatWindow, { ChatMessage } from "../../components/ChatWindow";
import DrawingCanvas, { Stroke } from "../../components/DrawingCanvas";
import DrawingTools from "../../components/DrawingTools";
import InviteFriendsModal from "../../components/InviteFriendsModal";
import Podium from "../../components/Podium";
import WaitingLobby from "../../components/WaitingLobby";
import { WORDS_POOL } from "../../components/words";
import { useSocket } from "../../context/SocketContext";
import { useToast } from "../../context/ToastContext";
import { auth, db, firestore } from "../../firebaseConfig";

interface GameData {
  id?: string;
  roomId?: string;
  players: any[];
  playerInfo?: Record<string, { name: string; avatarGradientIndex?: number }>;
  currentDrawer: string;
  drawer?: string;
  word: string;
  currentWord?: string;
  strokes: Stroke[];
  liveStroke?: Stroke | null;
  status: "waiting" | "playing" | "finished";
  hostId: string;
  round: number;
  roundNumber?: number;
  maxRounds?: number;
  scores?: Record<string, number>;
  winner?: string;
  guesses?: any[];
  guessed?: string[];
  guessedPlayers?: string[];
  messages?: ChatMessage[];
  roundEndTimestamp?: number | null;
  serverNow?: number;
}

const AVATAR_GRADIENTS = GRADIENTS;

const getAvatarGradient = (uid?: string) => {
  if (!uid || typeof uid !== "string") return AVATAR_GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
};

export default function GameRoom() {
  const { id } = useLocalSearchParams();
  const roomId = (Array.isArray(id) ? id[0] : (id as string))?.toUpperCase();
  const router = useRouter();
  const { showToast, playSound } = useToast();
  const { socket, isConnected } = useSocket();

  // Track userId reactively so auth.currentUser is never null on initial mount or Web reload
  const [userId, setUserId] = useState<string | undefined>(
    auth.currentUser?.uid,
  );
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUserId(u?.uid);
    });
    return () => unsub();
  }, []);

  const [gameData, setGameData] = useState<GameData | null>(null);
  const [liveStroke, setLiveStroke] = useState<Stroke | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const [currentColor, setCurrentColor] = useState("#000000");
  const [currentWidth, setCurrentWidth] = useState(3);

  const [showPlayersMenu, setShowPlayersMenu] = useState(false);
  const [playersList, setPlayersList] = useState<any[]>([]);
  const [showLobbyVisible, setShowLobbyVisible] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [showDrawingTools, setShowDrawingTools] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  // Stats update state (persisted to Firestore on game finish)
  const [hasUpdatedStats, setHasUpdatedStats] = useState(false);
  const [lastStatus, setLastStatus] = useState<GameData["status"] | null>(null);

  // Round animation state
  const [lastSeenRound, setLastSeenRound] = useState<number>(0);
  const [roundAlertText, setRoundAlertText] = useState("");
  const roundAlertOpacity = useRef(new Animated.Value(0)).current;
  const roundAlertScale = useRef(new Animated.Value(0.5)).current;
  const lastInviteTimestamp = useRef<number>(0);
  const didLeaveRoomRef = useRef(false);
  const serverTimeOffsetRef = useRef<number>(0);

  const TOTAL_ROUNDS_FALLBACK = 5;

  // Helper: Determine user collection in Firestore (for profile info & end-of-game stats)
  const getUserCollection = async (
    uid: string,
  ): Promise<"users" | "guestUsers"> => {
    try {
      const usersDoc = await db.collection("users").doc(uid).get();
      if (usersDoc.exists) {
        return "users";
      }
      const guestUsersDoc = await db.collection("guestUsers").doc(uid).get();
      return guestUsersDoc.exists ? "guestUsers" : "guestUsers";
    } catch (e) {
      console.error("Error determining user collection:", e);
      return "guestUsers";
    }
  };

  const leaveGameRoom = (withMessage = true) => {
    const activeUid = userId || auth.currentUser?.uid;
    if (!roomId || !activeUid || didLeaveRoomRef.current) return;
    didLeaveRoomRef.current = true;
    socket?.emit("room:leave", {
      roomId,
      userId: activeUid,
      uid: activeUid,
      withMessage,
    });
  };

  // Helper function to calculate current turn within the round
  const calculateCurrentTurn = () => {
    if (!gameData?.players) return 1;
    const players = gameData.players.filter(Boolean);
    const activeDrawer = gameData.currentDrawer || gameData.drawer;
    const currentDrawerIndex = players.findIndex((p: any) => {
      const uid = typeof p === "string" ? p : p?.uid;
      return uid === activeDrawer;
    });
    return currentDrawerIndex >= 0 ? currentDrawerIndex + 1 : 1;
  };

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
  }, [showPlayersMenu, slideAnim, playSound]);

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

  // Listen for game invites in Firestore (Toast only)
  useEffect(() => {
    if (!userId) return;

    const checkInvites = async () => {
      try {
        const userCollection = await getUserCollection(userId);
        const unsub = db
          .collection(userCollection)
          .doc(userId)
          .onSnapshot(
            (docSnap) => {
              if (docSnap.exists) {
                const data = docSnap.data();
                const invites = data?.gameInvites || [];
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
            },
            (error) => {
              console.error("Game invite listener error:", error);
            },
          );
        return unsub;
      } catch (error) {
        console.error("Error setting up invite listener:", error);
        return () => {};
      }
    };

    let unsub: (() => void) | undefined;
    checkInvites().then((unsubscribe) => {
      unsub = unsubscribe;
    });

    return () => {
      if (unsub) unsub();
    };
  }, [userId, showToast]);

  // Control lobby visibility based on game status
  useEffect(() => {
    if (gameData?.status === "waiting") setShowLobbyVisible(true);
    else setShowLobbyVisible(false);
  }, [gameData?.status]);

  // Update user stats in Firestore when game finishes
  useEffect(() => {
    const currentStatus = gameData?.status;
    if (!currentStatus || !userId) return;

    // Reset stats guard if starting a new game ("Play Again")
    if (currentStatus === "playing" && lastStatus === "finished") {
      setHasUpdatedStats(false);
    }

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
          const allScores = Object.values(scores).filter(
            (s): s is number => typeof s === "number",
          );
          const maxScore = allScores.length > 0 ? Math.max(...allScores) : 0;
          const isWinner = myScore > 0 && myScore === maxScore;

          const userCollection = await getUserCollection(userId);
          const userRef = db.collection(userCollection).doc(userId);
          const userSnap = await userRef.get();

          if (!userSnap.exists) {
            await userRef.set(
              {
                totalGames: 1,
                totalScore: myScore,
                wins: isWinner ? 1 : 0,
                lastMatches: [
                  {
                    roomId,
                    score: myScore,
                    won: isWinner,
                    playedAt: Date.now(),
                  },
                ],
                createdAt: Date.now(),
              },
              { merge: true },
            );
            return;
          }

          const userData = userSnap.data();
          const currentLastMatches = Array.isArray(userData?.lastMatches)
            ? userData.lastMatches
            : [];

          const latestMatch = {
            roomId,
            score: myScore,
            won: isWinner,
            playedAt: Date.now(),
          };

          const newLastMatches = [latestMatch, ...currentLastMatches].slice(
            0,
            5,
          );

          await userRef.update({
            totalGames: firestore.FieldValue.increment(1),
            totalScore: firestore.FieldValue.increment(myScore),
            wins: isWinner
              ? firestore.FieldValue.increment(1)
              : firestore.FieldValue.increment(0),
            lastMatches: newLastMatches,
          });
        } catch (error) {
          console.error("Failed to update stats:", error);
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
  }, [
    gameData?.status,
    userId,
    lastStatus,
    hasUpdatedStats,
    roomId,
    playSound,
  ]);

  // Round change animation
  useEffect(() => {
    if (!gameData) return;
    const currentRound = gameData.round || gameData.roundNumber || 1;
    const maxRounds = gameData.maxRounds || TOTAL_ROUNDS_FALLBACK;

    if (lastSeenRound === 0) {
      setLastSeenRound(currentRound);
      return;
    }

    if (currentRound > lastSeenRound) {
      playSound(require("../../assets/sounds/gameStart.mp3"));

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
  }, [gameData?.round, gameData?.roundNumber, lastSeenRound, playSound]);

  useEffect(() => {
    // When a new word is set (new turn starts), hide the tools by default
    setShowDrawingTools(false);
    setLiveStroke(null);
  }, [gameData?.word]);

  // Word selection and timer
  const [candidateWords, setCandidateWords] = useState<string[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [customWord, setCustomWord] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const lastPickerKeyRef = useRef<string>("");

  // Normalize incoming state so whether server sends legacy or new keys, GameData is 100% consistent
  const normalizeState = (raw: any): GameData => {
    const currentDrawer = raw.currentDrawer || raw.drawer || "";
    const round = raw.round || raw.roundNumber || 1;
    const guessed = raw.guessed || raw.guessedPlayers || [];
    let roundEndTimestamp = raw.roundEndTimestamp ?? null;
    if (!roundEndTimestamp) {
      if (raw.isChoosingWord && raw.chooseWordStartTime) {
        roundEndTimestamp = raw.chooseWordStartTime + 30000;
      } else if (!raw.isChoosingWord && raw.roundStartTime) {
        roundEndTimestamp =
          raw.roundStartTime + (raw.roundDuration || 120) * 1000;
      }
    }
    return {
      ...raw,
      id: raw.id || raw.roomId,
      currentDrawer,
      round,
      guessed,
      roundEndTimestamp,
    };
  };

  // ---------------- WEBSOCKET ROOM JOIN & LISTENERS ----------------
  useEffect(() => {
    if (!roomId || !userId || !socket) return;

    didLeaveRoomRef.current = false;

    const joinViaSocket = async () => {
      let displayName = auth.currentUser?.displayName || "Player";
      let avatarGradientIndex: number | undefined = undefined;
      let avatar: string | null = null;

      try {
        const col = await getUserCollection(userId);
        const docSnap = await db.collection(col).doc(userId).get();
        if (docSnap.exists) {
          const d = docSnap.data();
          displayName = d?.username || d?.displayName || displayName;
          avatarGradientIndex = d?.avatarGradientIndex;
          avatar = d?.avatarUrl || d?.photoURL || null;
        }
      } catch {}

      socket.emit(
        "room:join",
        {
          roomId,
          uid: userId,
          userId,
          name: displayName,
          displayName,
          avatar,
          avatarGradientIndex,
          user: {
            uid: userId,
            name: displayName,
            displayName,
            avatar,
            avatarGradientIndex,
          },
        },
        (res: { ok: boolean; state?: GameData; error?: string }) => {
          if (!res?.ok || !res.state) {
            showToast({
              message: res?.error || "Game not found",
              type: "error",
            });
            router.replace("/");
            return;
          }
          const normalized = normalizeState(res.state);
          if (normalized.serverNow) {
            serverTimeOffsetRef.current = normalized.serverNow - Date.now();
          }
          setGameData(normalized);
          setLiveStroke(normalized.liveStroke || null);
          setLoading(false);
        },
      );
    };

    if (isConnected) {
      joinViaSocket();
    }

    const handleRoomState = (state: GameData) => {
      if (!state) return;
      const incomingId = state.id || state.roomId;
      if (incomingId && incomingId !== roomId) return;
      const normalized = normalizeState(state);
      if (normalized.serverNow) {
        serverTimeOffsetRef.current = normalized.serverNow - Date.now();
      }
      setGameData(normalized);
      setLiveStroke(normalized.liveStroke || null);
      setLoading(false);
    };

    const handleStrokesUpdated = (strokes: Stroke[]) => {
      setLiveStroke(null);
      setGameData((prev) => (prev ? { ...prev, strokes } : prev));
    };

    const handleLiveStroke = (incomingStroke: Stroke | null) => {
      setLiveStroke(incomingStroke);
    };

    const handleRoomClosed = (payload?: { reason?: string }) => {
      showToast({
        message: payload?.reason || "Room closed",
        type: "info",
      });
      router.replace("/");
    };

    socket.on("room:state", handleRoomState);
    socket.on("draw:strokesUpdated", handleStrokesUpdated);
    socket.on("draw:live", handleLiveStroke);
    socket.on("canvas:stroke_live", handleLiveStroke);
    socket.on("room:closed", handleRoomClosed);

    return () => {
      socket.off("room:state", handleRoomState);
      socket.off("draw:strokesUpdated", handleStrokesUpdated);
      socket.off("draw:live", handleLiveStroke);
      socket.off("canvas:stroke_live", handleLiveStroke);
      socket.off("room:closed", handleRoomClosed);
    };
  }, [roomId, userId, socket, isConnected, router, showToast]);

  // Keep latest refs for unmount cleanup so re-renders or userId hydration never prematurely emit room:leave
  const latestRoomIdRef = useRef(roomId);
  const latestUserIdRef = useRef(userId);
  const latestSocketRef = useRef(socket);
  useEffect(() => {
    latestRoomIdRef.current = roomId;
    latestUserIdRef.current = userId || auth.currentUser?.uid;
    latestSocketRef.current = socket;
  }, [roomId, userId, socket]);

  // Only leave room when GameRoom component truly unmounts
  useEffect(() => {
    return () => {
      const rId = latestRoomIdRef.current;
      const uId = latestUserIdRef.current || auth.currentUser?.uid;
      if (rId && uId && !didLeaveRoomRef.current) {
        didLeaveRoomRef.current = true;
        latestSocketRef.current?.emit("room:leave", {
          roomId: rId,
          userId: uId,
          uid: uId,
          withMessage: true,
        });
      }
    };
  }, []);

  // Remove player when app goes to background on mobile
  useEffect(() => {
    if (!roomId || !userId) return;

    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background") {
        leaveGameRoom(false);
      }
    });

    return () => sub.remove();
  }, [roomId, userId]);

  // Build sorted playersList directly from WebSocket room state (Null-safe for both object and string items)
  useEffect(() => {
    if (!gameData?.players) return;

    const rawValid = gameData.players.filter(Boolean);
    const resolved = rawValid.map((p: any) => {
      const pUid =
        typeof p === "string" ? p : p?.uid || p?.id || userId || "anon";
      const pInfo = gameData.playerInfo?.[pUid];
      const pName =
        (typeof p === "object"
          ? p?.displayName || p?.username || p?.name
          : undefined) ||
        pInfo?.name ||
        (pUid === userId ? auth.currentUser?.displayName || "You" : "Player");
      const pGrad =
        typeof p === "object" && p?.avatarGradientIndex !== undefined
          ? p.avatarGradientIndex
          : pInfo?.avatarGradientIndex;

      return {
        uid: pUid,
        displayName: pName,
        points: gameData.scores
          ? (gameData.scores[pUid] ??
            (typeof p === "object" ? p?.points : 0) ??
            0)
          : ((typeof p === "object" ? p?.points : 0) ?? 0),
        avatar: typeof p === "object" ? p?.avatar || null : null,
        avatarGradientIndex: pGrad,
      };
    });

    if (resolved.length === 0 && userId) {
      resolved.push({
        uid: userId,
        displayName: auth.currentUser?.displayName || "Player",
        points: gameData.scores?.[userId] ?? 0,
        avatar: null,
        avatarGradientIndex: undefined,
      });
    }

    resolved.sort((a: any, b: any) => (b.points || 0) - (a.points || 0));
    setPlayersList(resolved);
  }, [gameData?.players, gameData?.scores, gameData?.playerInfo, userId]);

  // Generate candidate words for drawer during the selection phase
  useEffect(() => {
    const isDrawer = gameData?.currentDrawer === userId;
    const currentWord = gameData?.word || gameData?.currentWord;
    const isSelectionPhase =
      !!isDrawer && !currentWord && gameData?.status === "playing";
    const pickerKey = `${gameData?.round ?? 0}:${gameData?.currentDrawer ?? ""}:${gameData?.roundEndTimestamp ?? 0}:${refreshKey}`;

    const filterWord = (w: string) => {
      if (!w) return false;
      const n = w.trim();
      if (!/^[A-Za-z\s'-]+$/.test(n)) return false;
      const len = n.replace(/\s+/g, "").length;
      return len >= 3 && len <= 15;
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

    const fetchWithTimeout = async (
      url: string,
      timeout = 4000,
    ): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
      } catch (e) {
        clearTimeout(timeoutId);
        throw e;
      }
    };

    const fetchRemoteWords = async () => {
      try {
        const resp = await fetchWithTimeout(
          "https://random-word-api.vercel.app/api?words=80",
          4000,
        );
        if (resp.ok) {
          const words: string[] = await resp.json();
          const filtered = words
            .map((w: string) => w.toUpperCase())
            .filter(filterWord);

          if (filtered.length >= 3) return filtered;
        }
      } catch {}

      try {
        const topics = [
          "food",
          "nature",
          "sports",
          "objects",
          "tools",
          "clothing",
          "vehicles",
          "music",
          "science",
          "technology",
          "movies",
          "literature",
          "art",
        ];
        const topic = topics[Math.floor(Math.random() * topics.length)];
        const dm = await fetchWithTimeout(
          `https://api.datamuse.com/words?topics=${topic}&max=100`,
          4000,
        );
        if (dm.ok) {
          const dmJson = await dm.json();
          const candidates = dmJson
            .map((x: any) => (x.word || "").toString().toUpperCase())
            .filter(filterWord);
          if (candidates.length >= 3) return candidates;
        }
      } catch {}

      return null;
    };

    if (!isSelectionPhase) {
      lastPickerKeyRef.current = "";
      setCandidateWords([]);
      setCustomWord("");
      return;
    }

    if (lastPickerKeyRef.current === pickerKey && candidateWords.length > 0) {
      return;
    }
    lastPickerKeyRef.current = pickerKey;

    let cancelled = false;

    (async () => {
      const remote = await fetchRemoteWords();
      if (remote && remote.length >= 3) {
        if (!cancelled) setCandidateWords(pickRandom(remote, 3));
        return;
      }

      const singleWords = WORDS_POOL.filter(
        (w) => !w.includes(" ") && w.length >= 4 && w.length <= 10,
      ).map((w) => w.toUpperCase());

      const mediumWords = WORDS_POOL.filter(
        (w) => w.length >= 5 && w.length <= 8,
      ).map((w) => w.toUpperCase());

      const allLocalWords = WORDS_POOL.map((w) => w.toUpperCase()).filter(
        filterWord,
      );

      let poolToUse = singleWords;
      if (poolToUse.length < 10) poolToUse = mediumWords;
      if (poolToUse.length < 10) poolToUse = allLocalWords;

      if (!cancelled) {
        setCandidateWords(
          pickRandom(poolToUse.length >= 3 ? poolToUse : WORDS_POOL.slice(), 3),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    gameData?.currentDrawer,
    gameData?.word,
    gameData?.currentWord,
    gameData?.status,
    gameData?.round,
    gameData?.roundEndTimestamp,
    userId,
    refreshKey,
  ]);

  // Countdown based on authoritative server gameData.roundEndTimestamp + clock offset
  useEffect(() => {
    let timer: any = null;
    const endTs = gameData?.roundEndTimestamp;
    if (endTs) {
      const update = () => {
        const estimatedServerNow = Date.now() + serverTimeOffsetRef.current;
        const secs = Math.max(
          0,
          Math.ceil((endTs - estimatedServerNow) / 1000),
        );
        setRemainingSeconds(secs);
        if (secs <= 0) clearInterval(timer);
      };
      update();
      timer = setInterval(update, 1000);
    } else {
      setRemainingSeconds(null);
    }
    return () => clearInterval(timer);
  }, [gameData?.round, gameData?.roundEndTimestamp]);

  // ---------------- DRAWING & GAME ACTIONS ----------------
  const handleStrokeStart = () => {
    if (
      isDrawer &&
      gameData?.status === "playing" &&
      secretWord.trim().length > 0
    ) {
      setIsDrawing(true);
    }
  };

  const handleLiveStroke = (stroke: Stroke | null) => {
    if (!gameData || gameData.currentDrawer !== userId || !socket) return;
    socket.emit("draw:live", {
      roomId,
      userId,
      stroke,
    });
  };

  const handleStrokeFinished = (newStroke: Stroke) => {
    setIsDrawing(false);
    if (!gameData || gameData.currentDrawer !== userId || !socket) return;

    // Optimistically update local strokes for zero-flicker rendering
    setGameData((prev) =>
      prev ? { ...prev, strokes: [...(prev.strokes || []), newStroke] } : prev,
    );

    socket.emit("draw:stroke", {
      roomId,
      userId,
      stroke: newStroke,
    });
  };

  const handleClearCanvas = () => {
    if (!gameData || gameData.currentDrawer !== userId || !socket) return;
    socket.emit("canvas:clear", { roomId, userId });
  };

  const handleUndo = () => {
    if (!gameData || gameData.currentDrawer !== userId || !socket) return;
    socket.emit("canvas:undo", { roomId, userId });
  };

  const handleFillCanvas = () => {
    if (!gameData || gameData.currentDrawer !== userId || !socket) return;
    const fillStroke: Stroke = {
      path: "",
      color: currentColor,
      width: 0,
      fill: true,
    };
    setGameData((prev) =>
      prev ? { ...prev, strokes: [...(prev.strokes || []), fillStroke] } : prev,
    );
    socket.emit("draw:stroke", {
      roomId,
      userId,
      stroke: fillStroke,
    });
  };

  const copyRoomIdToClipboard = async () => {
    if (!roomId) return;
    try {
      await Clipboard.setStringAsync(roomId);
      showToast({ message: "Room code copied to clipboard", type: "success" });
    } catch (e) {
      console.error("Failed to copy room id", e);
    }
  };

  const handleStartGame = () => {
    if (!gameData || !socket || !userId) return;
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

    socket.emit(
      "game:start",
      { roomId, userId, uid: userId },
      (res: { ok: boolean; error?: string }) => {
        if (!res?.ok && res?.error) {
          showToast({ message: res.error, type: "info" });
        }
      },
    );
  };

  const handleSelectWord = (selectedWord: string) => {
    if (!socket || !userId) return;
    playSound(require("../../assets/sounds/word.mp3"));
    socket.emit("game:selectWord", {
      roomId,
      userId,
      uid: userId,
      word: selectedWord,
    });
  };

  const handleCustomWordSubmit = () => {
    const w = customWord.trim().toUpperCase();
    if (!w) return;
    if (w.length < 2 || w.length > 20) {
      showToast({ message: "Word must be 2-20 characters", type: "error" });
      return;
    }
    handleSelectWord(w);
  };

  if (loading || isExiting) {
    return (
      <View style={styles.loadingContainer}>
        <Preloader />
        <Text style={styles.loadingText}>
          {isExiting ? "Exiting..." : "Loading Game Room..."}
        </Text>
      </View>
    );
  }

  const isDrawer = Boolean(userId && gameData?.currentDrawer === userId);
  const hasGuessed = gameData?.guessed?.includes(userId || "");
  const secretWord = gameData?.word ?? "";

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [320, 0],
  });

  const handleExitFromPodium = () => {
    leaveGameRoom(false);
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
                playSound(require("../../assets/sounds/click.mp3"));
                Alert.alert("Exit Game", "Leave this room?", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Exit",
                    style: "destructive",
                    onPress: () => {
                      leaveGameRoom(true);
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
              <Ionicons name="exit" size={20} color="#B91C1C" />
            </TouchableOpacity>
            {remainingSeconds !== null && (
              <View style={styles.timerBadge}>
                <Text style={styles.timerText}>
                  {Math.floor((remainingSeconds || 0) / 60)}:
                  {String((remainingSeconds || 0) % 60).padStart(2, "0")}
                </Text>
              </View>
            )}
            <View style={styles.roomBar}>
              <Text style={styles.roomText}>{roomId}</Text>
              <TouchableOpacity
                onPress={copyRoomIdToClipboard}
                style={styles.copyButton}
              >
                <Ionicons name="copy" size={16} color="#374151" />
              </TouchableOpacity>
            </View>
            <View style={styles.roundBadge}>
              <Text style={styles.roundText}>
                {((gameData?.round || 1) - 1).toString()}.
                {calculateCurrentTurn()} /{" "}
                {gameData?.maxRounds ?? TOTAL_ROUNDS_FALLBACK}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setShowPlayersMenu((v) => !v);
              }}
              style={styles.playersToggle}
            >
              <Ionicons name="people" size={22} color="#333" />
            </TouchableOpacity>
          </View>

          {/* Waiting lobby shown when room is in waiting state */}
          <WaitingLobby
            visible={showLobbyVisible}
            onClose={() => setShowLobbyVisible(false)}
            onLeave={() => {
              leaveGameRoom(true);
              router.replace("/");
            }}
            roomId={roomId}
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
                !(gameData?.word || gameData?.currentWord) && (
                  <View style={styles.wordPicker}>
                    <View style={styles.wordPickerHeader}>
                      <Text style={styles.wordPickerTitle}>
                        Choose a word to draw
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          setRefreshKey((k) => k + 1);
                          playSound(require("../../assets/sounds/click.mp3"));
                        }}
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
                          onPress={() => handleSelectWord(w)}
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

              {/* Canvas */}
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
                    liveStroke={liveStroke}
                    onLiveStroke={handleLiveStroke}
                    onStrokeFinished={handleStrokeFinished}
                  />
                </View>

                {/* Overlay tools positioned on top of canvas */}
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
                          {...({ onFill: handleFillCanvas } as any)}
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
                gameId={roomId}
                isDrawer={isDrawer}
                currentWord={gameData?.word || ""}
                currentUser={{
                  uid: userId || auth.currentUser?.uid || "anon",
                  displayName:
                    playersList.find((p) => p.uid === userId)?.displayName ||
                    auth.currentUser?.displayName ||
                    "Player",
                }}
                guesses={gameData?.guessed || []}
                initialMessages={gameData?.messages || []}
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
              <TouchableOpacity
                onPress={() => {
                  playSound(require("../../assets/sounds/lock.mp3"));
                  setShowPlayersMenu(false);
                }}
              >
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
                onPress={() => {
                  setShowInviteModal(true);
                  playSound(require("../../assets/sounds/click.mp3"));
                }}
              >
                <Text style={styles.inviteText}>Invite Friends</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
          <InviteFriendsModal
            visible={showInviteModal}
            onClose={() => setShowInviteModal(false)}
            roomId={roomId}
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
    marginTop: -20,
    color: "#666",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    paddingTop: 40,
    backgroundColor: "#fbbf24",
    borderBottomWidth: 2,
    borderBottomColor: "#333",
    gap: 8,
    flexWrap: "nowrap",
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
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#92400E",
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 50,
    maxWidth: 80,
  },
  roomText: {
    color: "#333",
    fontSize: 14,
    fontWeight: "600",
  },
  copyButton: {
    padding: 4,
    marginLeft: 4,
  },
  roundBadge: {
    backgroundColor: "#DBEAFE",
    borderWidth: 1,
    borderColor: "#333",
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 60,
    maxWidth: 80,
  },
  roundText: {
    color: "#4338CA",
    fontWeight: "700",
    fontSize: 14,
  },
  playersToggle: {
    padding: 6,
    paddingHorizontal: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
    flexShrink: 0,
  },
  exitButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  timerBadge: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
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
    width: "100%",
    maxWidth: 280,
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
    color: "#FBBF24",
    textShadowColor: "#B91C1C",
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
    textAlign: "center",
    paddingVertical: 20,
    paddingHorizontal: 40,
    backgroundColor: "rgba(74, 27, 0, 0.74)",
    borderRadius: 16,
    borderWidth: 4,
    borderColor: "#F59E0B",
  },
});
