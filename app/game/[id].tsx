import { Ionicons } from "@expo/vector-icons";
import { Skia } from "@shopify/react-native-skia";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  ImageBackground,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ChatWindow from "../../components/ChatWindow";
import DrawingCanvas, { DrawingPath } from "../../components/DrawingCanvas";
import DrawingTools from "../../components/DrawingTools";
import { WORDS_POOL } from "../../components/words";
import { auth, db } from "../../firebaseConfig";

const { width } = Dimensions.get("window");

// --- FALLBACK WORD DICTIONARY ---
const FALLBACK_WORD_LIST = WORDS_POOL;

type GameState = {
  status: "waiting" | "playing" | "finished";
  currentDrawer: string;
  currentWord: string;
  wordChoices?: string[];
  round: number;
  maxRounds: number;
  scores: Record<string, number>;
  players: string[];
  hostId: string;
  guesses: string[];
  hints?: number[];
  paths?: any[]; // Added for drawing sync
  turnStartTime?: any; // Added for robust timer
};

export default function GameScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [timeLeft, setTimeLeft] = useState(60);

  // Drawing State
  const [paths, setPaths] = useState<DrawingPath[]>([]);
  const [currentPath, setCurrentPath] = useState<DrawingPath | null>(null);
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [previousColor, setPreviousColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [isEraser, setIsEraser] = useState(false);

  const [allWords, setAllWords] = useState<string[]>(FALLBACK_WORD_LIST);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const slideAnim = useRef(new Animated.Value(-width * 0.8)).current;
  const [customWord, setCustomWord] = useState("");

  // Ref to access latest state inside intervals without triggering re-renders
  const gameStateRef = useRef<GameState | null>(null);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const processingRoundEnd = useRef(false);
  const isLeaving = useRef(false);

  // Invite State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

  // Use local interface or any to avoid import errors
  const canvasRef = useRef<any>(null);

  const fetchFriends = async () => {
    if (!currentUser) return;
    setLoadingFriends(true);
    try {
      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      if (userDoc.exists()) {
        const friendIds = userDoc.data().friends || [];
        if (friendIds.length > 0) {
          const chunks = [];
          for (let i = 0; i < friendIds.length; i += 10) {
            chunks.push(friendIds.slice(i, i + 10));
          }
          const loadedFriends: any[] = [];
          for (const chunk of chunks) {
            const q = query(
              collection(db, "users"),
              where("__name__", "in", chunk)
            );
            const snap = await getDocs(q);
            snap.forEach((d) => loadedFriends.push({ id: d.id, ...d.data() }));
          }
          setFriends(loadedFriends);
        } else {
          setFriends([]);
        }
      }
    } catch (e) {
      console.error("Error fetching friends", e);
      Alert.alert("Error", "Could not load friends list.");
    } finally {
      setLoadingFriends(false);
    }
  };

  const handleInviteFriend = async (friendId: string, friendName: string) => {
    try {
      const myName =
        playerNames[currentUser?.uid || ""] ||
        currentUser?.displayName ||
        "Friend";
      await updateDoc(doc(db, "users", friendId), {
        gameInvites: arrayUnion({
          roomId: id,
          inviterName: myName,
          timestamp: Date.now(),
        }),
      });
      Alert.alert("Sent", `Invite sent to ${friendName}!`);
    } catch (e) {
      console.error("Error sending invite", e);
      Alert.alert("Error", "Failed to send invite.");
    }
  };

  // --- FETCH ONLINE WORD LIST ---
  useEffect(() => {
    const fetchWords = async () => {
      try {
        const response = await fetch(
          "https://raw.githubusercontent.com/scribble-rs/scribble.rs/master/data/words_en.txt"
        );
        const text = await response.text();
        const onlineWords = text
          .split("\n")
          .map((w) => w.trim())
          .filter((w) => w.length >= 3 && w.length <= 25);

        if (onlineWords.length > 100) {
          console.log(
            "Loaded " + onlineWords.length + " words from online dictionary."
          );
          setAllWords((prev) => [...prev, ...onlineWords]);
        }
      } catch (error) {
        console.log(
          "Failed to fetch online word list, using fallback dictionary.",
          error
        );
      }
    };
    fetchWords();
  }, []);

  useEffect(() => {
    if (!id) return;

    const gameDocRef = doc(db, "games", id as string);
    const unsubscribe = onSnapshot(gameDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as GameState;
        setGameState(data);

        // SYNC PATHS: If paths exist in DB, parse them for the canvas
        if (data.paths) {
          // We optimize to not overwrite 'currentPath' (active drawing) logic
          // but we need to ensure the main 'paths' array matches the server.
          const loadedPaths = data.paths.map((p: any) => ({
            ...p,
            path: Skia.Path.MakeFromSVGString(p.pathString) || Skia.Path.Make(),
          }));
          setPaths(loadedPaths);
        } else {
          // New round or cleared
          setPaths([]);
        }
      } else {
        Alert.alert("Error", "Game not found");
        router.replace("/");
      }
    });

    return () => unsubscribe();
  }, [id]);

  // Join game if not already in
  useEffect(() => {
    if (gameState && currentUser && id && !isLeaving.current) {
      if (!gameState.players.includes(currentUser.uid)) {
        // Notify chat that player joined
        addDoc(collection(db, "games", id as string, "messages"), {
          userId: "system",
          userName: "System",
          text: `${currentUser.displayName || "A player"} joined.`,
          isSystem: true,
          timestamp: serverTimestamp(),
        });

        updateDoc(doc(db, "games", id as string), {
          players: arrayUnion(currentUser.uid),
          [`scores.${currentUser.uid}`]: 0,
        }).catch((e) => console.error("Error joining game:", e));
      }
    }
  }, [gameState, currentUser, id]);

  // Fetch player names
  useEffect(() => {
    if (!gameState?.players) return;
    const fetchNames = async () => {
      const names: Record<string, string> = {};
      for (const uid of gameState.players) {
        if (playerNames[uid]) {
          names[uid] = playerNames[uid];
          continue;
        }
        try {
          const userDoc = await getDoc(doc(db, "users", uid));
          names[uid] = userDoc.exists() ? userDoc.data().username : "Player";
        } catch {
          names[uid] = "Player";
        }
      }
      setPlayerNames(names);
    };
    fetchNames();
  }, [gameState?.players]);

  const getWordChoices = () => {
    const choices = new Set<string>();
    let attempts = 0;
    while (choices.size < 3 && attempts < 50) {
      const randomIndex = Math.floor(Math.random() * allWords.length);
      const w = allWords[randomIndex];
      if (w) choices.add(w);
      attempts++;
    }
    return Array.from(choices);
  };

  const handleNextRound = async () => {
    if (!gameState || !id || processingRoundEnd.current) return;
    processingRoundEnd.current = true;

    // Calculate total turns (Cycles * Players)
    const totalTurns = gameState.maxRounds * gameState.players.length;

    if (gameState.round >= totalTurns) {
      await updateDoc(doc(db, "games", id as string), {
        status: "finished",
      });
      return;
    }

    const currentPlayerIndex = gameState.players.indexOf(
      gameState.currentDrawer
    );
    const nextPlayerIndex = (currentPlayerIndex + 1) % gameState.players.length;
    const nextDrawer = gameState.players[nextPlayerIndex];

    const choices = getWordChoices();

    await updateDoc(doc(db, "games", id as string), {
      currentDrawer: nextDrawer,
      currentWord: "", // Empty indicates choosing phase
      wordChoices: choices,
      round: gameState.round + 1,
      guesses: [],
      hints: [],
      paths: [], // Clear canvas
      turnStartTime: serverTimestamp(), // Sync timer
    });

    setPaths([]); // Clear local paths immediately
  };

  const handleSelectWord = async (word: string) => {
    if (!id) return;
    await updateDoc(doc(db, "games", id as string), {
      currentWord: word,
      wordChoices: [],
      turnStartTime: serverTimestamp(), // Start the guessing timer
    });
  };

  const startGame = async () => {
    if (!gameState || !id) return;
    const choices = getWordChoices();
    await updateDoc(doc(db, "games", id as string), {
      status: "playing",
      currentWord: "",
      wordChoices: choices,
      round: 1,
      guesses: [],
      hints: [],
      paths: [],
      turnStartTime: serverTimestamp(),
    });
  };

  // --- TIMER LOGIC (ROBUST) ---
  useEffect(() => {
    if (gameState?.status === "playing") {
      processingRoundEnd.current = false;
      const isHost = currentUser?.uid === gameState.hostId;

      if (!gameState.currentWord) {
        // --- CHOOSING PHASE (20s) ---
        // Simple local timer for choosing is usually fine, but serverTime is better
        // We'll stick to local for choosing to keep it snappy, but guard against stuck states
        setTimeLeft(20);
        const timer = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev <= 1) {
              // Time's up for choosing
              clearInterval(timer);
              if (isHost) {
                // Auto-select random word
                const choices = gameState.wordChoices || [];
                const randomWord = choices[0] || "apple";
                handleSelectWord(randomWord);
              }
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        return () => clearInterval(timer);
      } else {
        // --- GUESSING PHASE (120s) ---
        // Use server turnStartTime if available for accuracy
        const calculateTime = () => {
          if (gameState.turnStartTime?.seconds) {
            const now = Date.now() / 1000;
            const start = gameState.turnStartTime.seconds;
            const elapsed = now - start;
            const remaining = Math.max(0, Math.floor(120 - elapsed));
            return remaining;
          }
          return 120; // Fallback
        };

        setTimeLeft(calculateTime()); // Initial set

        const timer = setInterval(() => {
          const remaining = calculateTime();
          setTimeLeft(remaining);

          if (remaining <= 0) {
            clearInterval(timer);
            if (isHost) {
              handleNextRound();
            }
          }
        }, 1000);
        return () => clearInterval(timer);
      }
    }
  }, [gameState?.status, gameState?.currentWord, gameState?.turnStartTime]);
  // Dependency on turnStartTime ensures we don't reset unless the SERVER says the turn reset.
  // Drawing strokes does NOT change turnStartTime, so this fixes the bug.

  // Check for early round end (all guessed)
  useEffect(() => {
    if (
      gameState?.status === "playing" &&
      gameState.guesses &&
      gameState.players
    ) {
      const guessersCount = gameState.players.length - 1;
      if (guessersCount > 0 && gameState.guesses.length >= guessersCount) {
        if (currentUser?.uid === gameState.hostId) {
          handleNextRound();
        }
      }
    }
  }, [gameState?.guesses?.length]);

  const handleCorrectGuess = async (userId: string) => {
    if (!id || !gameState) return;
    if (gameState.guesses.includes(userId)) return; // Prevent double points

    // Scoring Formula
    const guesserPoints = 50 + timeLeft * 2;
    const drawerPoints = 20 + Math.floor(timeLeft * 0.5);

    await updateDoc(doc(db, "games", id as string), {
      guesses: arrayUnion(userId),
      [`scores.${userId}`]: increment(guesserPoints),
      [`scores.${gameState.currentDrawer}`]: increment(drawerPoints),
    });
  };

  const handlePlayAgain = async () => {
    if (!id || !gameState) return;

    const resetScores: Record<string, number> = {};
    gameState.players.forEach((uid) => (resetScores[uid] = 0));

    await updateDoc(doc(db, "games", id as string), {
      status: "waiting",
      round: 1,
      currentWord: "",
      guesses: [],
      scores: resetScores,
      paths: [],
    });
  };

  // --- DRAWING HANDLERS ---
  const isDrawer = gameState?.currentDrawer === currentUser?.uid;

  const handleStrokeStart = (x: number, y: number) => {
    if (!isDrawer) return;
    const newPath = Skia.Path.Make();
    newPath.moveTo(x, y);
    setCurrentPath({
      path: newPath,
      color: selectedColor,
      strokeWidth: strokeWidth,
    });
  };

  const handleStrokeActive = (x: number, y: number) => {
    if (!isDrawer || !currentPath) return;
    currentPath.path.lineTo(x, y);
    // Force re-render for local smoothness
    setCurrentPath({ ...currentPath });
  };

  const handleStrokeEnd = async () => {
    if (!isDrawer || !currentPath || !id) return;

    // Optimistic update
    const newPaths = [...paths, currentPath];
    setPaths(newPaths);
    setCurrentPath(null);

    // Sync to Firestore
    const pathData = {
      pathString: currentPath.path.toSVGString(),
      color: currentPath.color,
      strokeWidth: currentPath.strokeWidth,
    };

    try {
      await updateDoc(doc(db, "games", id as string), {
        paths: arrayUnion(pathData),
      });
    } catch (err) {
      console.error("Failed to save stroke", err);
    }
  };

  const handleClear = async () => {
    setPaths([]);
    if (id) {
      await updateDoc(doc(db, "games", id as string), {
        paths: [],
      });
    }
  };

  const handleUndo = async () => {
    // Local undo
    if (paths.length === 0) return;
    const newPaths = paths.slice(0, -1);
    setPaths(newPaths);

    // Firestore Undo (requires rewriting the whole array)
    // This is expensive but necessary for undo
    if (id) {
      const serializedPaths = newPaths.map((p) => ({
        pathString: p.path.toSVGString(),
        color: p.color,
        strokeWidth: p.strokeWidth,
      }));
      await updateDoc(doc(db, "games", id as string), {
        paths: serializedPaths,
      });
    }
  };

  const toggleMenu = () => {
    if (isMenuOpen) {
      Animated.timing(slideAnim, {
        toValue: -width * 0.8,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setIsMenuOpen(false));
    } else {
      setIsMenuOpen(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  };

  const copyRoomCode = async () => {
    if (id) {
      await Clipboard.setStringAsync(id as string);
      Alert.alert("Copied", "Room code copied to clipboard!");
    }
  };

  const handleLeaveGame = () => {
    Alert.alert("Leave Game", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          isLeaving.current = true;
          if (id && currentUser) {
            // Notify chat that player left
            await addDoc(collection(db, "games", id as string, "messages"), {
              userId: "system",
              userName: "System",
              text: `${
                playerNames[currentUser.uid] ||
                currentUser.displayName ||
                "A player"
              } left.`,
              isSystem: true,
              timestamp: serverTimestamp(),
            });
            // Remove player from game
            await updateDoc(doc(db, "games", id as string), {
              players: arrayRemove(currentUser.uid),
            });
          }
          router.replace("/");
        },
      },
    ]);
  };

  if (!gameState)
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text>Loading Game...</Text>
      </View>
    );

  // --- GAME OVER SCREEN ---
  if (gameState.status === "finished") {
    const sortedPlayers = [...gameState.players].sort((a, b) => {
      const scoreA = gameState.scores[a] || 0;
      const scoreB = gameState.scores[b] || 0;
      return scoreB - scoreA;
    });

    const top3 = sortedPlayers.slice(0, 3);

    return (
      <ImageBackground
        source={require("../../assets/images/game_over.jpeg")}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <SafeAreaView style={styles.resultsContainer}>
          <Text style={styles.resultsTitle}>Game Over!</Text>

          <View style={styles.podiumContainer}>
            {/* 2nd Place */}
            {top3[1] && (
              <View style={[styles.podiumItem, styles.podium2]}>
                <View style={styles.avatarLarge}>
                  <Text style={styles.avatarTextLarge}>
                    {playerNames[top3[1]]?.[0]?.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.podiumName}>{playerNames[top3[1]]}</Text>
                <Text style={styles.podiumScore}>
                  {gameState.scores[top3[1]]} pts
                </Text>
                <View style={styles.bar2}>
                  <Text style={styles.rankText}>2</Text>
                </View>
              </View>
            )}

            {/* 1st Place */}
            {top3[0] && (
              <View style={[styles.podiumItem, styles.podium1]}>
                <Ionicons
                  name="trophy"
                  size={40}
                  color="black"
                  style={{ marginBottom: 2, borderColor: "#333" }}
                />
                <View
                  style={[styles.avatarLarge, { backgroundColor: "#FFD700" }]}
                >
                  <Text style={styles.avatarTextLarge}>
                    {playerNames[top3[0]]?.[0]?.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.podiumName}>{playerNames[top3[0]]}</Text>
                <Text style={styles.podiumScore}>
                  {gameState.scores[top3[0]]} pts
                </Text>
                <View style={styles.bar1}>
                  <Text style={styles.rankText}>1</Text>
                </View>
              </View>
            )}

            {/* 3rd Place */}
            {top3[2] && (
              <View style={[styles.podiumItem, styles.podium3]}>
                <View style={styles.avatarLarge}>
                  <Text style={styles.avatarTextLarge}>
                    {playerNames[top3[2]]?.[0]?.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.podiumName}>{playerNames[top3[2]]}</Text>
                <Text style={styles.podiumScore}>
                  {gameState.scores[top3[2]]} pts
                </Text>
                <View style={styles.bar3}>
                  <Text style={styles.rankText}>3</Text>
                </View>
              </View>
            )}
          </View>

          <View style={styles.resultButtons}>
            <TouchableOpacity
              style={styles.buttonPrimary}
              onPress={handlePlayAgain}
            >
              <Text style={styles.buttonText}>Play Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.buttonSecondary}
              onPress={() => router.replace("/")}
            >
              <Text style={styles.buttonTextSecondary}>Back to Home</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  const currentCycle = Math.ceil(gameState.round / gameState.players.length);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      {/* --- TOP HEADER --- */}
      <View style={styles.header}>
        <TouchableOpacity onPress={toggleMenu} style={styles.iconButton}>
          <Ionicons name="menu" size={28} color="#333" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={copyRoomCode}
          style={styles.roomCodeContainer}
        >
          <Text style={styles.roomCodeLabel}>Code: </Text>
          <Text style={styles.roomCodeText}>{id}</Text>
          <Ionicons
            name="copy-outline"
            size={16}
            color="#666"
            style={{ marginLeft: 4 }}
          />
        </TouchableOpacity>

        <Text style={styles.roundInfo}>
          Round {currentCycle}/{gameState.maxRounds}
        </Text>
      </View>

      {/* --- STATUS & ACTIONS --- */}
      <View style={styles.subHeader}>
        <Text style={styles.statusText}>
          {gameState.status === "waiting"
            ? "Waiting..."
            : isDrawer
            ? "Draw!"
            : `Guess: ${
                gameState.currentWord
                  ? gameState.currentWord
                      .split("")
                      .map((char, index) => {
                        if (char === " ") return "  ";
                        if (gameState.hints?.includes(index)) return char + " ";
                        return "_ ";
                      })
                      .join("") + ` (${gameState.currentWord.length})`
                  : "Choosing..."
              }`}
        </Text>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            onPress={() => Alert.alert("Saved", "Image saved!")}
            style={styles.actionBtn}
          >
            <Ionicons name="save-outline" size={20} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLeaveGame} style={styles.actionBtn}>
            <Ionicons name="exit-outline" size={20} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
      </View>

      {/* --- START GAME AREA --- */}
      {gameState.status === "waiting" && (
        <View style={styles.startArea}>
          {currentUser?.uid === gameState.hostId ? (
            <TouchableOpacity onPress={startGame} style={styles.startButton}>
              <Text style={styles.startButtonText}>Start Game</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.waitingText}>Waiting for host to start...</Text>
          )}
        </View>
      )}

      <View style={styles.gameContainer}>
        {/* Word Display (Only if playing) */}
        {gameState.status === "playing" && (
          <View style={styles.wordContainer}>
            {isDrawer ? (
              <View style={{ alignItems: "center" }}>
                <Text style={styles.wordText}>
                  Word:{" "}
                  <Text style={styles.highlightWord}>
                    {gameState.currentWord || "Choosing..."}
                  </Text>
                </Text>
                <Text style={styles.timerText}>
                  {gameState.currentWord ? `${timeLeft}s` : ""}
                </Text>
              </View>
            ) : (
              <Text style={styles.wordText}>
                Time:{" "}
                <Text style={styles.timerText}>
                  {gameState.currentWord ? `${timeLeft}s` : "..."}
                </Text>
              </Text>
            )}
          </View>
        )}

        {gameState.status === "playing" && !gameState.currentWord ? (
          <View style={styles.selectionOverlay}>
            {isDrawer ? (
              <View style={styles.selectionContent}>
                <Text style={styles.selectionTitle}>Choose a Word</Text>
                <View style={styles.choicesContainer}>
                  {gameState.wordChoices?.map((word, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.choiceButton}
                      onPress={() => handleSelectWord(word)}
                    >
                      <Text style={styles.choiceText}>{word}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.dividerContainer}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TextInput
                  style={styles.customInput}
                  placeholder="Type custom word (max 12 chars)"
                  value={customWord}
                  onChangeText={setCustomWord}
                  maxLength={12}
                />
                <TouchableOpacity
                  style={[styles.choiceButton, styles.customButton]}
                  onPress={() => {
                    if (customWord.trim().length > 0) {
                      handleSelectWord(customWord.trim());
                      setCustomWord("");
                    }
                  }}
                >
                  <Text style={[styles.choiceText, styles.customButtonText]}>
                    Use Custom Word
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.selectionContent}>
                <Text style={styles.waitingTextLarge}>
                  {playerNames[gameState.currentDrawer] || "Drawer"} is choosing
                  a word...
                </Text>
                <ActivityIndicator
                  size="large"
                  color="#333"
                  style={{ marginTop: 20 }}
                />
              </View>
            )}
          </View>
        ) : (
          <>
            <View style={styles.canvasContainer}>
              <DrawingCanvas
                ref={canvasRef}
                paths={paths}
                currentPath={currentPath}
                onStrokeStart={handleStrokeStart}
                onStrokeActive={handleStrokeActive}
                onStrokeEnd={handleStrokeEnd}
                isReadOnly={!isDrawer}
                gameId={id as string}
                initialSnapshot={null}
              />
            </View>

            {isDrawer && (
              <View style={styles.toolsContainer}>
                <DrawingTools
                  selectedColor={selectedColor}
                  onSelectColor={setSelectedColor}
                  strokeWidth={strokeWidth}
                  onSelectStrokeWidth={setStrokeWidth}
                  isEraser={isEraser}
                  toggleEraser={() => {
                    if (isEraser) {
                      setIsEraser(false);
                      setSelectedColor(previousColor);
                    } else {
                      setPreviousColor(selectedColor);
                      setIsEraser(true);
                      setSelectedColor("#FFFFFF");
                    }
                  }}
                  onClear={handleClear}
                  onUndo={handleUndo}
                />
              </View>
            )}
          </>
        )}

        <View style={styles.chatContainer}>
          <ChatWindow
            gameId={id as string}
            currentUser={currentUser}
            currentWord={gameState.currentWord}
            isDrawer={isDrawer}
            guesses={gameState.guesses}
            onCorrectGuess={handleCorrectGuess}
          />
        </View>
      </View>

      {/* --- SIDE MENU --- */}
      {isMenuOpen && (
        <TouchableOpacity
          style={styles.menuOverlay}
          onPress={toggleMenu}
          activeOpacity={1}
        />
      )}
      <Animated.View
        style={[styles.sideMenu, { transform: [{ translateX: slideAnim }] }]}
      >
        <Text style={styles.menuTitle}>Players</Text>
        <ScrollView style={styles.playerList}>
          {gameState.players.map((uid) => {
            const isDrawing = gameState.currentDrawer === uid;
            const hasGuessed = gameState.guesses.includes(uid);
            return (
              <View key={uid} style={styles.playerItem}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {playerNames[uid]?.[0]?.toUpperCase() || "P"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.playerName}>
                    {playerNames[uid] || "Loading..."}
                  </Text>
                  {isDrawing && (
                    <Text style={styles.statusLabel}>✏️ Drawing</Text>
                  )}
                  {hasGuessed && (
                    <Text style={[styles.statusLabel, { color: "#4caf50" }]}>
                      ✅ Guessed
                    </Text>
                  )}
                </View>
                <Text style={styles.playerScore}>
                  {gameState.scores[uid] || 0} pts
                </Text>
              </View>
            );
          })}
        </ScrollView>
        {gameState.status === "waiting" && (
          <TouchableOpacity
            style={styles.inviteBtn}
            onPress={() => {
              setShowInviteModal(true);
              fetchFriends();
            }}
          >
            <Text style={styles.inviteBtnText}>Invite Friends</Text>
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* Invite Friends Modal */}
      <Modal
        visible={showInviteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Invite Friends</Text>

            {loadingFriends ? (
              <ActivityIndicator size="large" color="#333" />
            ) : friends.length === 0 ? (
              <Text style={styles.emptyText}>No friends found.</Text>
            ) : (
              <ScrollView
                style={styles.friendsList}
                contentContainerStyle={{ paddingBottom: 20 }}
              >
                {friends.map((friend) => (
                  <View key={friend.id} style={styles.friendRow}>
                    <Text style={styles.friendNameText}>{friend.username}</Text>
                    <TouchableOpacity
                      style={styles.sendBtn}
                      onPress={() =>
                        handleInviteFriend(friend.id, friend.username)
                      }
                    >
                      <Text style={styles.sendBtnText}>Invite</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setShowInviteModal(false)}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F0F2F5",
  },
  backgroundImage: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E4E6EB",
    backgroundColor: "#F0F2F5",
  },
  iconButton: {
    padding: 4,
  },
  roomCodeContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E4E6EB",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  roomCodeLabel: {
    fontSize: 12,
    color: "#666",
  },
  roomCodeText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
  },
  roundInfo: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  subHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: "#F0F2F5",
  },
  statusText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    padding: 6,
    backgroundColor: "#E4E6EB",
    borderRadius: 8,
  },
  startArea: {
    padding: 10,
    alignItems: "center",
    backgroundColor: "#fff9f2",
  },
  startButton: {
    backgroundColor: "#333",
    paddingHorizontal: 30,
    paddingVertical: 10,
    borderRadius: 25,
  },
  startButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  waitingText: {
    color: "#666",
    fontStyle: "italic",
  },
  wordContainer: {
    alignItems: "center",
    paddingVertical: 5,
    backgroundColor: "#F0F2F5",
  },
  wordText: {
    fontSize: 18,
    color: "#333",
  },
  highlightWord: {
    fontWeight: "bold",
    color: "#e27d4a",
    textTransform: "uppercase",
    fontSize: 20,
  },
  timerText: {
    color: "#333",
    fontWeight: "bold",
    fontSize: 18,
  },
  statusLabel: {
    color: "#e27d4a",
    fontSize: 12,
    fontWeight: "bold",
  },
  gameContainer: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: "#F0F2F5",
  },
  canvasContainer: {
    flex: 2,
    backgroundColor: "white",
    margin: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4E6EB",
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  toolsContainer: {
    paddingHorizontal: 10,
    marginBottom: 5,
  },
  chatContainer: {
    flex: 1,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#E4E6EB",
  },

  // Menu Styles
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    zIndex: 10,
  },
  sideMenu: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: width * 0.8,
    backgroundColor: "white",
    zIndex: 20,
    padding: 20,
    paddingTop: 50,
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
  },
  menuTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#333",
  },
  playerList: {
    flex: 1,
  },
  playerItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
    backgroundColor: "#f9f9f9",
    padding: 10,
    borderRadius: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e27d4a",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  avatarText: { color: "white", fontWeight: "bold", fontSize: 18 },
  playerName: { fontSize: 16, fontWeight: "600", color: "#333" },
  playerScore: { fontSize: 14, fontWeight: "bold", color: "#666" },
  inviteBtn: {
    backgroundColor: "#333",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  inviteBtnText: { color: "white", fontWeight: "bold", fontSize: 16 },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    maxHeight: "80%",
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
    color: "#333",
  },
  friendsList: { width: "100%" },
  friendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  friendNameText: { fontSize: 16, fontWeight: "600", color: "#333" },
  sendBtn: {
    backgroundColor: "#333",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  sendBtnText: { color: "white", fontWeight: "bold", fontSize: 14 },
  closeBtn: { marginTop: 20, alignSelf: "center", padding: 10 },
  closeBtnText: { color: "#666", fontSize: 16, fontWeight: "600" },
  emptyText: {
    textAlign: "center",
    color: "#999",
    marginVertical: 20,
    fontSize: 16,
  },

  // Results Screen
  resultsContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "transparent",
    margin: 20,
    borderRadius: 20,
  },
  resultsTitle: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 30,
  },
  podiumContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    marginBottom: 40,
    height: 300,
    borderBottomColor: "#333",
    borderBottomWidth: 4,
  },
  podiumItem: {
    alignItems: "center",
    justifyContent: "flex-end",
    marginHorizontal: 5,
  },
  podium1: { zIndex: 10 },
  podium2: {},
  podium3: {},
  avatarLarge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#e27d4a",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 5,
    borderWidth: 2,
    borderColor: "#333",
  },
  avatarTextLarge: { fontSize: 24, fontWeight: "bold", color: "white" },
  podiumName: { fontWeight: "bold", color: "#333", marginBottom: 2 },
  podiumScore: { fontSize: 12, color: "#666", marginBottom: 5 },
  bar1: {
    width: 80,
    height: 150,
    backgroundColor: "#FFD700",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderColor: "#333",
    borderWidth: 2,
    borderBottomColor: "transparent",
  },
  bar2: {
    width: 70,
    height: 100,
    backgroundColor: "#C0C0C0",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderColor: "#333",
    borderWidth: 2,
    borderBottomColor: "transparent",
  },
  bar3: {
    width: 70,
    height: 70,
    backgroundColor: "#CD7F32",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderColor: "#333",
    borderWidth: 2,
    borderBottomColor: "transparent",
  },
  rankText: { fontSize: 24, fontWeight: "bold", color: "white", opacity: 0.8 },
  resultButtons: { width: "100%", gap: 10 },
  buttonPrimary: {
    backgroundColor: "#333",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: { color: "white", fontWeight: "bold", fontSize: 18 },
  buttonSecondary: {
    backgroundColor: "transparent",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#333",
  },
  buttonTextSecondary: { color: "#333", fontWeight: "bold", fontSize: 18 },

  // Selection Overlay
  selectionOverlay: {
    flex: 2,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "white",
    margin: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4E6EB",
  },
  selectionContent: {
    width: "100%",
    padding: 20,
    alignItems: "center",
  },
  selectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#333",
  },
  choicesContainer: {
    width: "100%",
    gap: 10,
  },
  choiceButton: {
    backgroundColor: "#f0f2f5",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  choiceText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    textTransform: "capitalize",
  },
  waitingTextLarge: {
    fontSize: 18,
    color: "#666",
    textAlign: "center",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 15,
    width: "100%",
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#ddd",
  },
  dividerText: {
    marginHorizontal: 10,
    color: "#999",
    fontWeight: "bold",
    fontSize: 12,
  },
  customInput: {
    width: "100%",
    backgroundColor: "#f9f9f9",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 10,
  },
  customButton: {
    backgroundColor: "#333",
    borderColor: "#333",
    width: "100%",
  },
  customButtonText: {
    color: "white",
  },
});
