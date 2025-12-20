import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Clipboard,
  FlatList,
  ImageBackground,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ChatWindow from "../../components/ChatWindow";
import DrawingCanvas, {
  DrawingCanvasRef,
} from "../../components/DrawingCanvas";
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
  const { id, rounds } = useLocalSearchParams();
  const router = useRouter();
  const roomId = Array.isArray(id) ? id[0] : id;
  const currentUser = auth.currentUser;

  // Game State
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
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
  const [showInviteView, setShowInviteView] = useState(false);
  const [myFriends, setMyFriends] = useState<Player[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);

  // Animation Values
  const scaleAnim1 = useRef(new Animated.Value(0)).current;
  const scaleAnim2 = useRef(new Animated.Value(0)).current;
  const scaleAnim3 = useRef(new Animated.Value(0)).current;

  const isDrawer = currentUser?.uid === drawerId;
  const isHost = hostId
    ? hostId === currentUser?.uid
    : players.length > 0 && players[0].id === currentUser?.uid;

  const drawerIdRef = useRef(drawerId);
  const hostIdRef = useRef(hostId);
  const canvasRef = useRef<DrawingCanvasRef>(null);
  useEffect(() => {
    drawerIdRef.current = drawerId;
  }, [drawerId]);
  useEffect(() => {
    hostIdRef.current = hostId;
  }, [hostId]);

  // 1. Manage Room Logic
  useEffect(() => {
    if (!roomId || !currentUser) return;

    const roomRef = doc(db, "rooms", roomId);
    const playerRef = doc(db, "rooms", roomId, "players", currentUser.uid);

    const joinRoom = async () => {
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        await setDoc(roomRef, {
          active: true,
          totalRounds: Number(rounds) || 2,
          currentRound: 1,
          turnIndex: 0,
          hostId: currentUser.uid,
        });
      }

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
        if (data.hostId) setHostId(data.hostId);
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
          const isHostCheck = hostIdRef.current
            ? hostIdRef.current === currentUser.uid
            : activePlayers.length > 0 &&
              activePlayers[0].id === currentUser.uid;

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

  // 2.5 Fetch Friends for Invite
  useEffect(() => {
    if (showSidebar && showInviteView && currentUser) {
      const fetchFriends = async () => {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            const friendIds = userDoc.data().friends || [];
            // Filter out players already in room
            const currentIds = players.map((p) => p.id);
            const inviteable = friendIds.filter(
              (id: string) => !currentIds.includes(id)
            );

            if (inviteable.length > 0) {
              // Firestore 'in' limit is 10, taking first 10 for simplicity
              const q = query(
                collection(db, "users"),
                where("__name__", "in", inviteable.slice(0, 10))
              );
              const snap = await getDocs(q);
              const loadedFriends = snap.docs.map(
                (d) => ({ id: d.id, ...d.data(), score: 0 } as Player)
              );
              setMyFriends(loadedFriends);
            } else {
              setMyFriends([]);
            }
          }
        } catch (e) {
          console.error("Error fetching friends", e);
        }
      };
      fetchFriends();
    }
  }, [showSidebar, showInviteView, currentUser, players]);

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

  const handleInvite = async (friendId: string) => {
    try {
      await updateDoc(doc(db, "users", friendId), {
        gameInvites: arrayUnion({
          roomId,
          inviterName: currentUser?.displayName || "Friend",
          timestamp: Date.now(),
        }),
      });
      Alert.alert("Success", "Invite sent!");
    } catch (e) {
      Alert.alert("Error", "Could not send invite");
    }
  };

  const clearBoard = async () => {
    const linesRef = collection(db, "rooms", roomId, "lines");
    const snapshot = await getDocs(linesRef);
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    canvasRef.current?.resetHistory();

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

  const handlePlayAgain = async () => {
    const batch = writeBatch(db);
    players.forEach((p) => {
      const pRef = doc(db, "rooms", roomId, "players", p.id);
      batch.update(pRef, { score: 0 });
    });
    await batch.commit();

    startGame();
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
      <ImageBackground
        source={require("../../assets/images/game_over.jpeg")}
        style={styles.podiumBackground}
      >
        <View style={styles.podiumContainer}>
          <Text style={styles.podiumTitle}>🏆 Game Over 🏆</Text>
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
          <View style={styles.podiumButtons}>
            {isHost && (
              <TouchableOpacity
                style={styles.playAgainButton}
                onPress={handlePlayAgain}
              >
                <Text style={styles.playAgainText}>Play Again</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.homeButton} onPress={handleLeave}>
              <Text style={styles.homeButtonText}>Back to Home</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>
    );
  };

  return (
    <SafeAreaProvider style={styles.container}>
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
                  onPress={() => canvasRef.current?.undo()}
                  style={styles.undoButton}
                >
                  <Text style={styles.buttonText}>{"<-"}</Text>
                </TouchableOpacity>
              )}
              {isDrawer && gameState === "PLAYING" && (
                <TouchableOpacity
                  onPress={() => canvasRef.current?.redo()}
                  style={styles.undoButton}
                >
                  <Text style={styles.buttonText}>{"->"}</Text>
                </TouchableOpacity>
              )}
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
              <TouchableOpacity
                onPress={() => canvasRef.current?.saveImage()}
                style={styles.saveButton}
              >
                <Text style={styles.buttonText}>Save</Text>
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
              ref={canvasRef}
            />
          </View>

          <View style={styles.chatContainer}>
            <ChatWindow
              roomId={roomId}
              currentWord={currentWord}
              isDrawer={isDrawer}
              roundEndTime={roundEndTime}
              drawerId={drawerId}
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

            {/* Sidebar Tabs */}
            <View style={styles.sidebarTabs}>
              <TouchableOpacity
                onPress={() => setShowInviteView(false)}
                style={[styles.tab, !showInviteView && styles.activeTab]}
              >
                <Text style={styles.tabText}>Players</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowInviteView(true)}
                style={[styles.tab, showInviteView && styles.activeTab]}
              >
                <Text style={styles.tabText}>Invite Friends</Text>
              </TouchableOpacity>
            </View>

            {!showInviteView ? (
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
            ) : (
              <FlatList
                data={myFriends}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>
                    No friends available to invite.
                  </Text>
                }
                renderItem={({ item }) => (
                  <View style={styles.playerRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {item.username[0].toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.playerName, { flex: 1 }]}>
                      {item.username}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleInvite(item.id)}
                      style={styles.inviteBtn}
                    >
                      <Text style={styles.inviteBtnText}>Invite</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
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
    </SafeAreaProvider>
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
  undoButton: {
    backgroundColor: "#4a90e2",
    padding: 8,
    width: 40,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
  },
  clearButton: { backgroundColor: "#ffaa00", padding: 8, borderRadius: 6 },
  leaveButton: { backgroundColor: "#ff4444", padding: 8, borderRadius: 6 },
  saveButton: { backgroundColor: "#4caf50", padding: 8, borderRadius: 6 },
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
  sidebarTabs: {
    flexDirection: "row",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  activeTab: { borderBottomWidth: 2, borderColor: "#4a90e2" },
  tabText: { fontWeight: "bold", color: "#333" },
  inviteBtn: {
    backgroundColor: "#4caf50",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  inviteBtnText: { color: "white", fontWeight: "bold", fontSize: 12 },
  emptyText: {
    textAlign: "center",
    color: "#999",
    marginTop: 20,
    fontStyle: "italic",
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
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  podiumBackground: {
    flex: 1,
    resizeMode: "cover",
    justifyContent: "center",
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
    paddingBottom: 0,
    borderBottomColor: "#333",
    borderBottomWidth: 2,
  },
  podiumPillarContainer: { alignItems: "center" },
  podiumBar: {
    width: 80,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 15,
    paddingBottom: 10,
    borderColor: "#333",
    borderWidth: 2,
    borderBottomColor: "transparent",
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
  podiumName: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
  },
  winnerName: {
    fontSize: 20,
    color: "#ffd500ff",
    fontWeight: "bold",
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  podiumScore: { color: "white", fontWeight: "bold", fontSize: 18 },
  fireworks: { fontSize: 40, position: "absolute", top: -55 },
  podiumButtons: {
    marginTop: 50,
    width: "100%",
    alignItems: "center",
    gap: 15,
  },
  homeButton: {
    backgroundColor: "#33333331",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    minWidth: 200,
    alignItems: "center",
    borderColor: "#4a90e2",
    borderWidth: 2,
  },
  homeButtonText: { color: "#eee", fontWeight: "bold", fontSize: 18 },
  playAgainButton: {
    backgroundColor: "#ff9800",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    minWidth: 200,
    alignItems: "center",
    borderColor: "#333",
    borderWidth: 2,
  },
  playAgainText: { color: "#333", fontWeight: "bold", fontSize: 18 },
});
