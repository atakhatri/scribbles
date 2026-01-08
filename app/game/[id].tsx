import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  StyleSheet,
  Text,
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
  roundEndTimestamp?: number;
}

export default function GameRoom() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentColor, setCurrentColor] = useState("#000000");
  const [currentWidth, setCurrentWidth] = useState(3);

  // Ref to prevent overlapping updates
  const isUpdating = useRef(false);

  const [showPlayersMenu, setShowPlayersMenu] = useState(false);
  const [playersList, setPlayersList] = useState<any[]>([]);
  const [showLobbyVisible, setShowLobbyVisible] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const TOTAL_ROUNDS_FALLBACK = 5; // fallback rounds if none provided
  const slideAnim = useRef(new Animated.Value(0)).current; // 0 closed, 1 open

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: showPlayersMenu ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showPlayersMenu, slideAnim]);

  // control lobby visibility based on game status
  useEffect(() => {
    if (gameData?.status === "waiting") setShowLobbyVisible(true);
    else setShowLobbyVisible(false);
  }, [gameData?.status]);

  const userId = auth.currentUser?.uid;

  // Word selection and timer
  const [candidateWords, setCandidateWords] = useState<string[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;

    const gameRef = doc(db, "games", id as string);
    const unsubscribe = onSnapshot(gameRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as GameData;
        setGameData(data);
      } else {
        Alert.alert("Error", "Game not found");
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
          "https://random-word-api.vercel.app/api?words=60"
        );
        if (!resp.ok) throw new Error("remote word fetch failed");
        const words: string[] = (await resp.json()).map((w: string) =>
          w.toUpperCase()
        );
        const filtered = words.filter(filterWord);
        if (filtered.length >= 3) return filtered;

        // fallback: try Datamuse for more varied words (may include multi-word phrases)
        const dm = await fetch(
          "https://api.datamuse.com/words?ml=object&max=100"
        );
        if (dm.ok) {
          const dmJson = await dm.json();
          const candidates = dmJson
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

    if (isDrawer && !currentWord) {
      (async () => {
        const remote = await fetchRemoteWords();
        if (remote && remote.length > 0) {
          setCandidateWords(pickRandom(remote, 3));
          return;
        }

        // Fallback to local WORDS_POOL, prefer less-childish by filtering length
        const localFiltered = WORDS_POOL.filter(filterWord).map((w) =>
          w.toUpperCase()
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
    }
  }, [gameData?.currentDrawer, userId, gameData]);

  // Countdown based on gameData.roundEndTimestamp
  useEffect(() => {
    let timer: any = null;
    const endTs = (gameData as any)?.roundEndTimestamp;
    if (endTs) {
      const update = () => {
        const secs = Math.max(0, Math.ceil((endTs - Date.now()) / 1000));
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

  // When time runs out, immediately advance the turn to the next player.
  // Use a ref to ensure we only process a given roundEndTimestamp once.
  const timeoutProcessedRef = useRef<number | null>(null);
  useEffect(() => {
    if (remainingSeconds !== 0) return;
    if (!id || !gameData) return;
    if (gameData.status !== "playing") return;
    const endTs = (gameData as any)?.roundEndTimestamp;
    if (!endTs) return;
    if (timeoutProcessedRef.current === endTs) return; // already processed
    timeoutProcessedRef.current = endTs;

    (async () => {
      try {
        const gameRef = doc(db, "games", id as string);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(gameRef);
          if (!snap.exists()) return;
          const data = snap.data() as any;

          const playersRaw = Array.isArray(data.players) ? data.players : [];
          const players: string[] = playersRaw.map((p: any) =>
            typeof p === "string" ? p : p?.uid || p
          );
          const currentDrawer: string = data.currentDrawer;

          // Determine next drawer and whether the round should increment
          let nextDrawer = currentDrawer;
          let shouldIncrementRound = false;
          if (players.length > 1) {
            const foundIdx = players.findIndex((p) => p === currentDrawer);
            const idx = foundIdx >= 0 ? foundIdx : 0;
            const nextIdx = (idx + 1) % players.length;
            nextDrawer = players[nextIdx];
            if (nextIdx <= idx) shouldIncrementRound = true;
          }

          const nextRound = (data.round || 1) + (shouldIncrementRound ? 1 : 0);
          const maxRounds = data.maxRounds || TOTAL_ROUNDS_FALLBACK;
          const newStatus = nextRound > maxRounds ? "finished" : "playing";
          const newRoundEnd =
            newStatus === "playing" ? Date.now() + 120000 : null;

          const updateObj: any = {
            strokes: [],
            word: "",
            currentWord: "",
            guessed: [],
            round: nextRound,
            currentDrawer: nextDrawer,
            status: newStatus,
          };
          // set or clear roundEndTimestamp depending on status
          updateObj.roundEndTimestamp = newRoundEnd;

          tx.update(gameRef, updateObj);
        });
      } catch (e) {
        console.error("advance on timeout failed", e);
      }
    })();
  }, [remainingSeconds, id, gameData]);

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
          typeof p === "string" ? p === userId : p?.uid === userId
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
        try {
          await updateDoc(gameRef, { players: arrayRemove(userId) });
        } catch (e) {}
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
              const userDoc = await getDoc(doc(db, "users", p));
              const data = userDoc.exists() ? userDoc.data() : null;
              return {
                uid: p,
                displayName:
                  data?.username ||
                  data?.displayName ||
                  (p === userId ? auth.currentUser?.displayName : undefined) ||
                  p,
                points: gameData.scores ? gameData.scores[p] ?? 0 : 0,
                avatar: data?.avatarUrl || data?.photoURL || null,
              };
            } catch (e) {
              return {
                uid: p,
                displayName: p,
                points: gameData.scores ? gameData.scores[p] ?? 0 : 0,
              };
            }
          } else {
            return {
              uid: p.uid,
              displayName: p.displayName || p.username || p.uid,
              points: gameData.scores
                ? gameData.scores[p.uid] ?? 0
                : p.points ?? 0,
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

  const handleStrokeFinished = async (newStroke: Stroke) => {
    if (!gameData || gameData.currentDrawer !== userId || isUpdating.current)
      return;

    try {
      isUpdating.current = true;
      const gameRef = doc(db, "games", id as string);

      // We append ONLY the new stroke to the array.
      await updateDoc(gameRef, {
        strokes: arrayUnion(newStroke),
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
      Alert.alert("Copied", "Room code copied to clipboard");
    } catch (e) {
      console.error("Failed to copy room id", e);
    }
  };

  const handleStartGame = async () => {
    if (!gameData) return;
    if (gameData.hostId !== userId) {
      Alert.alert("Only host", "Only the host can start the game.");
      return;
    }
    if ((gameData.players?.length || 0) < 2) {
      Alert.alert(
        "Need more players",
        "At least 2 players are required to start the game."
      );
      return;
    }

    try {
      const gameRef = doc(db, "games", id as string);
      const firstDrawer = gameData.players[0]?.uid || gameData.players[0];
      const roundEnd = Date.now() + 120000; // 120s
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
      });
    } catch (error) {
      console.error("Error starting game", error);
    }
  };

  const handleCorrectGuess = async (guesserId: string) => {
    if (!id) return;
    const gameRef = doc(db, "games", id as string);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        if (!snap.exists()) return;
        const data = snap.data() as any;

        const playersRaw = Array.isArray(data.players) ? data.players : [];
        const players: string[] = playersRaw.map((p: any) =>
          typeof p === "string" ? p : p?.uid || p
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

        // Determine non-drawer players who need to guess
        const nonDrawerPlayers = players.filter((p) => p !== currentDrawer);

        const allGuessed = nonDrawerPlayers.every((p) =>
          guessedArr.includes(p)
        );

        if (!allGuessed) return; // wait for all to guess

        // All players guessed: compute scoring and advance round immediately
        const endTs = data.roundEndTimestamp || Date.now();
        const remainingSeconds = Math.max(
          0,
          Math.ceil((endTs - Date.now()) / 1000)
        );

        // Scoring formula:
        // - Each guesser gets 10 + remainingSeconds points
        // - Drawer gets (5 + floor(remainingSeconds/2)) * numberOfGuessers
        const guesserPoints = 10 + remainingSeconds;
        const drawerPointsPerGuesser = 5 + Math.floor(remainingSeconds / 2);

        const scoresObj: Record<string, number> = data.scores || {};

        // Award points to each guesser (non-drawer players)
        nonDrawerPlayers.forEach((uid) => {
          if (guessedArr.includes(uid)) {
            scoresObj[uid] = (scoresObj[uid] || 0) + guesserPoints;
          }
        });

        // Award points to the drawer
        const numGuessers = nonDrawerPlayers.filter((u) =>
          guessedArr.includes(u)
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
        if (players.length > 1) {
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

        const newRoundEnd = Date.now() + 120000; // reset timer for next round

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
        });
      });
    } catch (e) {
      console.error("handleCorrectGuess transaction failed", e);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Loading Game Room...</Text>
      </View>
    );
  }

  const isDrawer = gameData?.currentDrawer === userId;

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
                    onPress: () => router.replace("/"),
                  },
                ]);
              }}
              style={styles.exitButton}
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

          {/* Main Game Area */}
          <View style={styles.gameContent}>
            {/* Word selection panel for drawer before drawing */}
            {gameData?.currentDrawer === userId &&
              !((gameData as any)?.word || (gameData as any).currentWord) && (
                <View style={styles.wordPicker}>
                  <Text style={styles.wordPickerTitle}>
                    Choose a word to draw
                  </Text>
                  <View style={styles.wordOptions}>
                    {candidateWords.map((w) => (
                      <TouchableOpacity
                        key={w}
                        style={styles.wordOption}
                        onPress={async () => {
                          try {
                            const gameRef = doc(db, "games", id as string);
                            const roundEnd = Date.now() + 120000;
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
                <Text style={styles.wordLabel}>Guess the word!</Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={styles.secretWord}>
                    {secretWord
                      .split("")
                      .map((c) => (c === " " ? " " : "_ "))
                      .join("")}
                  </Text>
                  <Text style={styles.wordLength}>
                    ({(secretWord || "").replace(/\s+/g, "").length})
                  </Text>
                </View>
              </View>
            )}

            {/* Canvas - THIS Component receives 'color', 'strokeWidth', 'strokes' */}
            <View style={styles.canvasContainer}>
              <DrawingCanvas
                color={currentColor}
                strokeWidth={currentWidth}
                enabled={isDrawer && gameData?.status === "playing"}
                strokes={gameData?.strokes || []}
                onStrokeFinished={handleStrokeFinished}
              />

              {/* Overlay tools positioned on top of canvas so they're always visible */}
              {isDrawer && (
                <View style={styles.toolsOverlay} pointerEvents="box-none">
                  <DrawingTools
                    selectedColor={currentColor}
                    onSelectColor={setCurrentColor}
                    strokeWidth={currentWidth}
                    onSelectWidth={setCurrentWidth}
                    onClear={handleClearCanvas}
                    onUndo={handleUndo}
                  />
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
            />
          </View>

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
                  <Text style={styles.playerName}>{p.displayName}</Text>
                  <View style={styles.playerMeta}>
                    <Text style={styles.playerPoints}>{p.points ?? 0} pts</Text>
                    {gameData?.currentDrawer === p.uid && (
                      <Text style={styles.drawerTag}>Drawing</Text>
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
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
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
    padding: 12,
    paddingTop: 40,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    justifyContent: "space-evenly",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
  },
  statusBadge: {
    backgroundColor: "#E0E7FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: "#4338CA",
    fontSize: 12,
    fontWeight: "bold",
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
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
    backgroundColor: "#E5E7EB",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roomText: {
    color: "#374151",
    fontSize: 16,
  },
  copyButton: {
    padding: 6,
  },
  roundBadge: {
    backgroundColor: "#bccbffff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    // marginLeft: 6,
  },
  roundText: {
    color: "#4338CA",
    fontSize: 16,
  },
  playersToggle: {
    padding: 8,
    paddingHorizontal: 10,
    // marginLeft: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
  },
  headerStartButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#4338CA",
    borderRadius: 8,
    // marginLeft: 8,
  },
  headerStartText: {
    color: "white",
    fontWeight: "700",
  },
  exitButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    // marginRight: 8,
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
  },
  timerText: {
    color: "#4338CA",
    fontWeight: "700",
    fontSize: 16,
  },
  playersOverlay: {
    position: "absolute",
    right: 12,
    top: 100,
    width: 300,
    bottom: 20,
    backgroundColor: "white",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 10,
    padding: 12,
  },
  playersHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  playersTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
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
    borderBottomColor: "#F3F4F6",
  },
  playerName: {
    fontSize: 14,
    color: "#111827",
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
  },
  wordPickerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
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
  },
  wordOptionText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 14,
  },
});
