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
  Animated,
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
import { auth, db } from "../../firebaseConfig";

const WORDS_POOL = [
  "CAT",
  "DOG",
  "PIZZA",
  "SUN",
  "CAR",
  "HOUSE",
  "TREE",
  "BOOK",
  "ROBOT",
  "GHOST",
  "ALIEN",
  "DRAGON",
];
const SELECT_TIME = 15;
const PLAY_TIME = 60;

interface Player {
  id: string;
  username: string;
  score: number;
}

export default function GameRoom() {
  const { id, rounds } = useLocalSearchParams(); // Receive 'rounds' param
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
  const [totalRounds, setTotalRounds] = useState(Number(rounds) || 2); // Default to 2 if not passed
  const [turnIndex, setTurnIndex] = useState(0); // Track whose turn it is in the player list

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

  // 1. Manage Room Logic
  useEffect(() => {
    if (!roomId || !currentUser) return;

    const roomRef = doc(db, "rooms", roomId);
    const playerRef = doc(db, "rooms", roomId, "players", currentUser.uid);

    const joinRoom = async () => {
      // Initialize room with rounds info if I'm creating it
      await setDoc(
        roomRef,
        {
          active: true,
          totalRounds: Number(rounds) || 2,
          currentRound: 1,
          turnIndex: 0,
        },
        { merge: true }
      );

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

        // Sync Rounds info
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
      activePlayers.sort((a, b) => a.id.localeCompare(b.id)); // Consistent Sort
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
              // Drawer left, force next turn logic
              handleTimeUp(activePlayers); // Pass current active players to avoid stale state
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

  // Podium Animation
  useEffect(() => {
    if (gameState === "GAME_OVER") {
      Animated.sequence([
        Animated.spring(scaleAnim2, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }), // 2nd Place
        Animated.spring(scaleAnim1, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }), // 1st Place
        Animated.spring(scaleAnim3, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }), // 3rd Place
      ]).start();
    }
  }, [gameState]);

  // 3. Actions
  const startGame = async () => {
    if (players.length < 1) return;
    // Reset game state
    const roomRef = doc(db, "rooms", roomId);
    await updateDoc(roomRef, {
      currentRound: 1,
      turnIndex: 0,
      // Reset scores if needed, but keeping persistence for now is fine or clear them here
    });
    startTurn(players[0].id, 0, 1);
  };

  const startTurn = async (
    nextDrawerId: string,
    nextTurnIndex: number,
    nextRound: number
  ) => {
    const options = [];
    for (let i = 0; i < 3; i++)
      options.push(WORDS_POOL[Math.floor(Math.random() * WORDS_POOL.length)]);

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
    // Logic to determine next turn or game over
    let nextIndex = turnIndex + 1;
    let nextRound = currentRound;

    // Check if round is finished
    if (nextIndex >= currentPlayersList.length) {
      nextIndex = 0;
      nextRound++;
    }

    if (nextRound > totalRounds) {
      // Game Over!
      const roomRef = doc(db, "rooms", roomId);
      updateDoc(roomRef, { gameState: "GAME_OVER" });
    } else {
      // Next Turn
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
          {/* 2nd Place */}
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
          {/* 1st Place */}
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
          {/* 3rd Place */}
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
      {/* GAME OVER SCREEN */}
      {gameState === "GAME_OVER" ? (
        renderPodium()
      ) : (
        <>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <TouchableOpacity
                onPress={() => setShowSidebar(true)}
                style={styles.menuButton}
              >
                <Text style={styles.menuIcon}>👥</Text>
              </TouchableOpacity>
              <View>
                <Text style={styles.title}>
                  Round {currentRound} / {totalRounds}
                </Text>
                <Text style={styles.wordDisplay}>{getDisplayWord()}</Text>
              </View>
            </View>

            {gameState !== "WAITING" && (
              <View
                style={[styles.timerBadge, timeLeft < 10 && styles.timerUrgent]}
              >
                <Text style={styles.timerText}>{timeLeft}s</Text>
              </View>
            )}

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

      {/* Sidebar Modal */}
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

      {/* Word Selection Modal */}
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  menuButton: { padding: 5, backgroundColor: "#f0f0f0", borderRadius: 8 },
  menuIcon: { fontSize: 20 },
  headerButtons: { flexDirection: "row", gap: 8 },
  title: { fontSize: 10, color: "#666" },
  wordDisplay: { fontSize: 16, fontWeight: "bold", color: "#333" },
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

  canvasArea: { height: "70%", width: "100%" },
  chatContainer: { flex: 1 },

  timerBadge: {
    backgroundColor: "#333",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
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
