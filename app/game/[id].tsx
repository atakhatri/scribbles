import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Clipboard,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ChatWindow from "../../components/ChatWindow";
import DrawingCanvas from "../../components/DrawingCanvas";
import { WORDS_POOL } from "../../components/words";
import { auth, db } from "../../firebaseConfig";

const SELECT_TIME = 15;
const PLAY_TIME = 60;

interface Player {
  id: string;
  username: string;
  score: number;
}

export default function GameRoom() {
  const { id, rounds } = useLocalSearchParams();
  const router = useRouter();
  const roomId = Array.isArray(id) ? id[0] : id;
  const currentUser = auth.currentUser;

  // Game State
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [currentWord, setCurrentWord] = useState<string>("");
  const [gameState, setGameState] = useState<
    "WAITING" | "SELECTING" | "PLAYING" | "GAME_OVER"
  >("WAITING");
  const [roundEndTime, setRoundEndTime] = useState<number | null>(null);
  const [wordOptions, setWordOptions] = useState<string[]>([]);
  const [guessedPlayers, setGuessedPlayers] = useState<string[]>([]);
  const [canvasColor, setCanvasColor] = useState<string>("#FFFFFF");

  // Round Tracking
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(Number(rounds) || 2);
  const [turnIndex, setTurnIndex] = useState(0);

  const [players, setPlayers] = useState<Player[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  // Animation Values
  const scaleAnim1 = useRef(new Animated.Value(0)).current;
  const scaleAnim2 = useRef(new Animated.Value(0)).current;
  const scaleAnim3 = useRef(new Animated.Value(0)).current;

  const isDrawer = currentUser?.uid === drawerId;
  const isHost = players.length > 0 && players[0].id === currentUser?.uid;

  const drawerIdRef = useRef(drawerId);
  useEffect(() => {
    drawerIdRef.current = drawerId;
  }, [drawerId]);

  // Dictionary Management
  const availableWordsRef = useRef<string[]>(WORDS_POOL);

  useEffect(() => {
    const fetchDictionary = async () => {
      try {
        const res = await fetch(
          "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt"
        );
        if (res.ok) {
          const text = await res.text();
          const words = text
            .split("\n")
            .map((w) => w.trim().toUpperCase())
            .filter((w) => w.length >= 3 && w.length <= 12);

          if (words.length > 1000) {
            availableWordsRef.current = words;
            console.log(`Loaded ${words.length} words from online dictionary.`);
          }
        }
      } catch (e) {
        console.log("Using offline word list fallback.");
      }
    };
    fetchDictionary();
  }, []);

  // 1. Manage Room Logic
  useEffect(() => {
    if (!roomId || !currentUser) return;

    const roomRef = doc(db, "rooms", roomId);
    const playerRef = doc(db, "rooms", roomId, "players", currentUser.uid);

    const joinRoom = async () => {
      await setDoc(roomRef, {}, { merge: true });

      await setDoc(
        playerRef,
        {
          username: currentUser.displayName || "Player",
          score: 0,
          id: currentUser.uid,
        },
        { merge: true }
      );

      await addDoc(collection(db, "rooms", roomId, "messages"), {
        text: `👋 ${currentUser.displayName || "Player"} joined!`,
        sender: "SYSTEM",
        createdAt: serverTimestamp(),
        isSystem: true,
      });
    };
    joinRoom();

    const unsubscribeRoom = onSnapshot(roomRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setDrawerId(data.drawerId);
        setCurrentWord(data.word || "");
        setGameState(data.gameState || "WAITING");
        setWordOptions(data.wordOptions || []);
        setGuessedPlayers(data.guessedPlayers || []);
        setCanvasColor(data.canvasColor || "#FFFFFF");

        if (data.totalRounds) setTotalRounds(data.totalRounds);
        if (data.currentRound) setCurrentRound(data.currentRound);
        if (data.turnIndex !== undefined) setTurnIndex(data.turnIndex);

        if (data.roundEndTime) {
          const endTime =
            data.roundEndTime instanceof Timestamp
              ? data.roundEndTime.toMillis()
              : data.roundEndTime;
          setRoundEndTime(endTime);
        }
      }
    });

    const playersColRef = collection(db, "rooms", roomId, "players");
    const unsubscribePlayers = onSnapshot(playersColRef, (snapshot) => {
      const activePlayers: Player[] = snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          } as Player)
      );
      activePlayers.sort((a, b) => a.id.localeCompare(b.id));
      setPlayers(activePlayers);

      snapshot.docChanges().forEach((change) => {
        if (change.type === "removed") {
          const leftPlayer = change.doc.data() as Player;
          const isHostCheck =
            activePlayers.length > 0 && activePlayers[0].id === currentUser.uid;

          if (isHostCheck) {
            addDoc(collection(db, "rooms", roomId, "messages"), {
              text: `🚪 ${leftPlayer.username} left.`,
              sender: "SYSTEM",
              createdAt: serverTimestamp(),
              isSystem: true,
            });

            if (leftPlayer.id === drawerIdRef.current) {
              handleTimeUp(activePlayers);
            }
          }
        }
      });
    });

    return () => {
      deleteDoc(playerRef);
      unsubscribeRoom();
      unsubscribePlayers();
    };
  }, [roomId, currentUser]);

  // 2. Timer
  useEffect(() => {
    if (gameState === "PLAYING" && isDrawer) {
      const totalGuessers = players.length - 1;
      if (totalGuessers > 0 && guessedPlayers.length >= totalGuessers) {
        handleTimeUp();
        return;
      }
    }

    if (!roundEndTime || gameState === "GAME_OVER") return;

    const interval = setInterval(() => {
      const remaining = Math.ceil((roundEndTime - Date.now()) / 1000);
      if (remaining <= 0) {
        setTimeLeft(0);
        clearInterval(interval);
        if (isDrawer) {
          if (gameState === "SELECTING") {
            const randomWord =
              wordOptions[Math.floor(Math.random() * wordOptions.length)];
            handleWordSelect(randomWord);
          } else {
            handleTimeUp();
          }
        }
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [roundEndTime, isDrawer, gameState, guessedPlayers, players]);

  useEffect(() => {
    if (gameState === "GAME_OVER") {
      Animated.sequence([
        Animated.spring(scaleAnim2, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim1, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim3, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [gameState]);

  // 3. Actions
  const startGame = async () => {
    if (players.length < 1) return;
    const roomRef = doc(db, "rooms", roomId);
    await updateDoc(roomRef, {
      currentRound: 1,
      turnIndex: 0,
    });
    startTurn(players[0].id, 0, 1);
  };

  const startTurn = async (
    nextDrawerId: string,
    nextTurnIndex: number,
    nextRound: number
  ) => {
    const options = [];
    const pool = availableWordsRef.current;
    for (let i = 0; i < 3; i++)
      options.push(WORDS_POOL[Math.floor(Math.random() * WORDS_POOL.length)]);
    options.push(pool[Math.floor(Math.random() * pool.length)]);

    const roomRef = doc(db, "rooms", roomId);
    await updateDoc(roomRef, {
      drawerId: nextDrawerId,
      turnIndex: nextTurnIndex,
      currentRound: nextRound,
      gameState: "SELECTING",
      wordOptions: options,
      word: "",
      guessedPlayers: [],
      canvasColor: "#FFFFFF",
      roundEndTime: Timestamp.fromMillis(Date.now() + SELECT_TIME * 1000),
    });

    clearBoard();
  };

  const handleWordSelect = async (selectedWord: string) => {
    const roomRef = doc(db, "rooms", roomId);
    await updateDoc(roomRef, {
      word: selectedWord,
      gameState: "PLAYING",
      roundEndTime: Timestamp.fromMillis(Date.now() + PLAY_TIME * 1000),
    });
  };

  const handleBackgroundChange = async (color: string) => {
    const roomRef = doc(db, "rooms", roomId);
    await updateDoc(roomRef, {
      canvasColor: color,
    });
  };

  const handleTimeUp = (currentPlayersList = players) => {
    let nextIndex = turnIndex + 1;
    let nextRound = currentRound;

    if (nextIndex >= currentPlayersList.length) {
      nextIndex = 0;
      nextRound++;
    }

    if (nextRound > totalRounds) {
      const roomRef = doc(db, "rooms", roomId);
      updateDoc(roomRef, { gameState: "GAME_OVER" });
    } else {
      startTurn(currentPlayersList[nextIndex].id, nextIndex, nextRound);
    }
  };

  const clearBoard = async () => {
    const linesRef = collection(db, "rooms", roomId, "lines");
    const snapshot = await getDocs(linesRef);
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    const roomRef = doc(db, "rooms", roomId);
    await updateDoc(roomRef, { canvasColor: "#FFFFFF" });
  };

  const handleLeave = async () => {
    if (players.length <= 1) {
      try {
        await deleteDoc(doc(db, "rooms", roomId));
      } catch (e) {}
    }
    router.back();
  };

  const copyRoomId = () => {
    Clipboard.setString(roomId);
    Alert.alert("Copied!", "Room ID copied to clipboard.");
  };

  const getDisplayWord = () => {
    if (gameState === "WAITING") return "Waiting for players...";
    if (gameState === "GAME_OVER") return "Game Over!";
    if (gameState === "SELECTING")
      return isDrawer ? "Choose a word!" : "Drawer is choosing...";
    if (isDrawer) return `Draw: ${currentWord}`;

    const length = currentWord.length;
    return `Guess: ${currentWord
      .split("")
      .map((c) => (c === " " ? " " : "_"))
      .join(" ")} (${length})`;
  };

  const renderPodium = () => {
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    const winner = sortedPlayers[0];
    const second = sortedPlayers[1];
    const third = sortedPlayers[2];

    return (
      <View style={styles.podiumContainer}>
        <Text style={styles.podiumTitle}>🏆 Final Results 🏆</Text>
        <View style={styles.podiumStage}>
          {second && (
            <Animated.View
              style={[
                styles.podiumPillarContainer,
                { transform: [{ scale: scaleAnim2 }] },
              ]}
            >
              <View style={styles.podiumAvatar}>
                <Text style={styles.avatarEmoji}>🥈</Text>
              </View>
              <Text style={styles.podiumName}>{second.username}</Text>
              <View
                style={[
                  styles.podiumBar,
                  { height: 100, backgroundColor: "#C0C0C0" },
                ]}
              >
                <Text style={styles.podiumScore}>{second.score}</Text>
              </View>
            </Animated.View>
          )}
          {winner && (
            <Animated.View
              style={[
                styles.podiumPillarContainer,
                { transform: [{ scale: scaleAnim1 }] },
              ]}
            >
              <Text style={styles.fireworks}>🎆</Text>
              <View style={[styles.podiumAvatar, styles.winnerAvatar]}>
                <Text style={styles.avatarEmoji}>👑</Text>
              </View>
              <Text style={[styles.podiumName, styles.winnerName]}>
                {winner.username}
              </Text>
              <View
                style={[
                  styles.podiumBar,
                  { height: 150, backgroundColor: "#FFD700" },
                ]}
              >
                <Text style={styles.podiumScore}>{winner.score}</Text>
              </View>
            </Animated.View>
          )}
          {third && (
            <Animated.View
              style={[
                styles.podiumPillarContainer,
                { transform: [{ scale: scaleAnim3 }] },
              ]}
            >
              <View style={styles.podiumAvatar}>
                <Text style={styles.avatarEmoji}>🥉</Text>
              </View>
              <Text style={styles.podiumName}>{third.username}</Text>
              <View
                style={[
                  styles.podiumBar,
                  { height: 70, backgroundColor: "#CD7F32" },
                ]}
              >
                <Text style={styles.podiumScore}>{third.score}</Text>
              </View>
            </Animated.View>
          )}
        </View>
        <TouchableOpacity style={styles.homeButton} onPress={handleLeave}>
          <Text style={styles.homeButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={styles.container}
      edges={["top", "bottom", "left", "right"]}
    >
      {gameState === "GAME_OVER" ? (
        renderPodium()
      ) : (
        <>
          <View style={styles.header}>
            {/* 🏠 NEW: Top Bar with Room ID */}
            <View style={styles.topBar}>
              <TouchableOpacity
                onPress={copyRoomId}
                style={styles.roomCodeBadge}
              >
                <Text style={styles.roomCodeLabel}>ROOM CODE:</Text>
                <Text style={styles.roomCodeText}>{roomId}</Text>
                <Text style={styles.copyIcon}>📋</Text>
              </TouchableOpacity>

              <View style={styles.roundBadge}>
                <Text style={styles.roundText}>
                  Round {currentRound}/{totalRounds}
                </Text>
              </View>
            </View>

            {/* Main Game Info Row */}
            <View style={styles.gameInfoRow}>
              <TouchableOpacity
                onPress={() => setShowSidebar(true)}
                style={styles.menuButton}
              >
                <Text style={styles.menuIcon}>👥</Text>
              </TouchableOpacity>

              <Text style={styles.wordDisplay}>{getDisplayWord()}</Text>

              {gameState !== "WAITING" ? (
                <View
                  style={[
                    styles.timerBadge,
                    timeLeft < 10 && styles.timerUrgent,
                  ]}
                >
                  <Text style={styles.timerText}>{timeLeft}s</Text>
                </View>
              ) : (
                <View style={{ width: 40 }} />
              )}
            </View>

            <View style={styles.headerButtons}>
              {isDrawer && gameState === "PLAYING" && (
                <TouchableOpacity
                  onPress={clearBoard}
                  style={styles.clearButton}
                >
                  <Text style={styles.buttonText}>Clear</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={handleLeave}
                style={styles.leaveButton}
              >
                <Text style={styles.buttonText}>Leave</Text>
              </TouchableOpacity>
            </View>
          </View>

          {gameState === "WAITING" && isHost && (
            <View style={styles.controls}>
              <TouchableOpacity onPress={startGame} style={styles.startButton}>
                <Text style={styles.startButtonText}>Start Game</Text>
              </TouchableOpacity>
            </View>
          )}

          {gameState === "WAITING" && !isHost && (
            <View style={styles.controls}>
              <Text style={{ color: "#666", fontStyle: "italic" }}>
                Waiting for host to start...
              </Text>
            </View>
          )}

          <View style={styles.canvasArea}>
            <DrawingCanvas
              roomId={roomId}
              isReadOnly={!isDrawer || gameState !== "PLAYING"}
              canvasColor={canvasColor}
              onBackgroundChange={handleBackgroundChange}
              key={isDrawer ? "drawer" : "guesser"}
            />
          </View>

          <View style={styles.chatContainer}>
            <ChatWindow
              roomId={roomId}
              currentWord={currentWord}
              isDrawer={isDrawer}
              roundEndTime={roundEndTime}
            />
          </View>
        </>
      )}

      {/* Sidebar & Word Modals (Same as before) */}
      <Modal
        visible={showSidebar}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowSidebar(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.sidebar}>
            <View style={styles.sidebarHeader}>
              <Text style={styles.sidebarTitle}>
                Players ({players.length})
              </Text>
              <TouchableOpacity onPress={() => setShowSidebar(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={players}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.playerRow,
                    item.id === currentUser?.uid && styles.meRow,
                  ]}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {item.username[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.playerName}>
                      {item.username}{" "}
                      {item.id === currentUser?.uid ? "(You)" : ""}
                    </Text>
                    <Text style={styles.playerRole}>
                      {item.id === drawerId ? "✏️ Drawing" : "👀 Guessing"}
                    </Text>
                  </View>
                  <View style={styles.scoreBadge}>
                    <Text style={styles.scoreText}>{item.score} pts</Text>
                  </View>
                  {guessedPlayers.includes(item.id) && (
                    <Text style={{ marginLeft: 10, fontSize: 18 }}>✅</Text>
                  )}
                </View>
              )}
            />
          </View>
          <TouchableOpacity
            style={styles.modalClickAway}
            onPress={() => setShowSidebar(false)}
          />
        </View>
      </Modal>

      <Modal
        visible={isDrawer && gameState === "SELECTING"}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.wordModalOverlay}>
          <View style={styles.wordModal}>
            <Text style={styles.wordModalTitle}>Choose a Word!</Text>
            <View style={styles.wordOptions}>
              {wordOptions.map((word, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.wordOptionBtn}
                  onPress={() => handleWordSelect(word)}
                >
                  <Text style={styles.wordOptionText}>{word}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ marginTop: 15, color: "#fff" }}>
              Auto-pick in {timeLeft}s
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  header: {
    padding: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },

  // 🆕 Top Bar Styles
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  roomCodeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e3f2fd",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2196F3",
  },
  roomCodeLabel: {
    fontSize: 10,
    color: "#2196F3",
    fontWeight: "bold",
    marginRight: 5,
  },
  roomCodeText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    marginRight: 5,
  },
  copyIcon: { fontSize: 12 },
  roundBadge: {
    backgroundColor: "#f0f0f0",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  roundText: { fontSize: 12, fontWeight: "bold", color: "#333" },

  gameInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 0,
  },
  menuButton: {
    padding: 5,
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  menuIcon: { fontSize: 20 },
  wordDisplay: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    flex: 1,
    textAlign: "center",
  },

  headerButtons: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 10, color: "#666" },
  controls: { padding: 10, alignItems: "center" },
  startButton: {
    backgroundColor: "#4a90e2",
    paddingHorizontal: 30,
    paddingVertical: 8,
    borderRadius: 20,
  },
  startButtonText: { color: "white", fontWeight: "bold" },
  clearButton: { backgroundColor: "#ffaa00", padding: 8, borderRadius: 6 },
  leaveButton: { backgroundColor: "#ff4444", padding: 8, borderRadius: 6 },
  buttonText: { color: "white", fontWeight: "bold", fontSize: 12 },

  canvasArea: { height: "55%", width: "100%" },
  chatContainer: { flex: 1 },

  timerBadge: {
    backgroundColor: "#333",
    padding: 8,
    borderRadius: 6,
    width: 48,
    alignItems: "center",
  },
  timerUrgent: { backgroundColor: "#ff4444" },
  timerText: { color: "white", fontWeight: "bold", fontSize: 12 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    flexDirection: "row",
  },
  sidebar: {
    width: "80%",
    backgroundColor: "white",
    padding: 20,
    paddingTop: 50,
  },
  modalClickAway: { width: "20%" },
  sidebarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  sidebarTitle: { fontSize: 24, fontWeight: "bold", color: "#333" },
  closeButton: { fontSize: 24, color: "#666" },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    marginBottom: 10,
    backgroundColor: "#f9f9f9",
    borderRadius: 10,
  },
  meRow: { backgroundColor: "#e3f2fd", borderWidth: 1, borderColor: "#4a90e2" },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ddd",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  avatarText: { fontWeight: "bold", color: "#555" },
  playerName: { fontSize: 16, fontWeight: "bold", color: "#333" },
  playerRole: { fontSize: 12, color: "#666" },
  scoreBadge: {
    backgroundColor: "#ffeb3b",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  scoreText: { fontSize: 12, fontWeight: "bold", color: "#f57f17" },
  wordModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  wordModal: {
    width: "80%",
    backgroundColor: "white",
    borderRadius: 20,
    padding: 30,
    alignItems: "center",
  },
  wordModalTitle: { fontSize: 22, fontWeight: "bold", marginBottom: 20 },
  wordOptions: { width: "100%", gap: 10 },
  wordOptionBtn: {
    backgroundColor: "#4a90e2",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  wordOptionText: { color: "white", fontSize: 18, fontWeight: "bold" },

  // Podium Styles
  podiumContainer: {
    flex: 1,
    backgroundColor: "#4a90e2",
    justifyContent: "center",
    alignItems: "center",
  },
  podiumTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "white",
    marginBottom: 40,
  },
  podiumStage: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    height: 300,
    paddingBottom: 20,
  },
  podiumPillarContainer: { alignItems: "center" },
  podiumBar: {
    width: 80,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 10,
  },
  podiumAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "white",
    marginBottom: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  winnerAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "#FFD700",
  },
  avatarEmoji: { fontSize: 30 },
  podiumName: { color: "white", fontWeight: "bold", marginBottom: 5 },
  winnerName: { fontSize: 20, color: "#FFD700" },
  podiumScore: { color: "white", fontWeight: "bold", fontSize: 18 },
  fireworks: { fontSize: 40, position: "absolute", top: -60 },
  homeButton: {
    marginTop: 50,
    backgroundColor: "white",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  homeButtonText: { color: "#4a90e2", fontWeight: "bold", fontSize: 18 },
});
