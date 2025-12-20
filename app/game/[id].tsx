import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { arrayUnion, doc, onSnapshot, updateDoc } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ChatWindow from "../../components/ChatWindow";
import DrawingCanvas from "../../components/DrawingCanvas"; // Removed named import that might fail
import DrawingTools from "../../components/DrawingTools";
import { auth, db } from "../../firebaseConfig";

// Local definition to fix type errors if the component doesn't export it
interface CanvasRef {
  clear: () => void;
}

// --- FALLBACK WORD DICTIONARY ---
const FALLBACK_WORD_LIST = [
  "apple",
  "banana",
  "house",
  "tree",
  "ocean",
  "chair",
  "table",
  "phone",
  "mouse",
  "pizza",
  "ghost",
  "robot",
  "cloud",
  "storm",
  "beach",
  "party",
  "music",
  "dance",
  "clock",
  "train",
  "plane",
  "smile",
  "heart",
  "stars",
  "horse",
  "snake",
  "bread",
  "water",
  "light",
  "dream",
  "space",
  "earth",
  "world",
  "candy",
  "cakes",
  "river",
  "mount",
  "shoes",
  "shirt",
  "pants",
  "socks",
  "glass",
  "spoon",
  "knife",
  "plate",
  "truck",
  "cycle",
  "grass",
  "flower",
  "books",
  "paper",
  "pen",
  "pencil",
  "ruler",
  "brush",
  "paint",
  "color",
  "sound",
  "voice",
  "happy",
  "angry",
  "funny",
  "joker",
  "king",
  "queen",
  "chess",
  "games",
  "video",
  "radio",
  "alert",
  "brick",
  "stone",
  "metal",
  "wood",
  "fire",
  "flame",
  "smoke",
  "steam",
  "frost",
  "snow",
  "winter",
  "summer",
  "spring",
  "autumn",
  "leaves",
  "roots",
  "seeds",
  "fruit",
  "berry",
  "melon",
  "lemon",
  "grape",
  "peach",
  "mango",
  "onion",
  "carrot",
  "potato",
  "tomato",
  "salad",
  "lunch",
  "dinner",
  "snack",
  "drink",
  "juice",
  "coffee",
  "sugar",
  "spice",
  "honey",
  "butter",
  "toast",
  "bacon",
  "eggs",
  "cheese",
  "cream",
  "yogurt",
  "cookie",
  "donut",
  "bagel",
  "waffle",
  "pasta",
  "sushi",
  "tacos",
  "curry",
  "soup",
  "stew",
  "roast",
  "grill",
  "fry",
  "bake",
  "boil",
  "swim",
  "jump",
  "walk",
  "run",
  "climb",
  "slide",
  "swing",
  "skate",
  "board",
  "surf",
  "dive",
  "float",
  "sink",
  "fly",
  "soar",
  "drive",
  "ride",
  "steer",
  "brake",
  "crash",
  "park",
  "stop",
  "go",
  "slow",
  "fast",
  "speed",
  "race",
  "win",
  "lose",
  "draw",
  "doctor",
  "nurse",
  "pilot",
  "chef",
  "artist",
  "actor",
  "singer",
  "dancer",
  "writer",
  "judge",
  "lawyer",
  "police",
  "guard",
  "thief",
  "spy",
  "hero",
  "enemy",
  "friend",
  "family",
  "baby",
  "child",
  "adult",
  "elder",
  "human",
  "alien",
  "magic",
  "witch",
  "wizard",
  "dragon",
  "fairy",
  "elf",
  "giant",
  "dwarf",
  "troll",
  "beast",
  "shark",
  "whale",
  "dolphin",
  "eagle",
  "hawk",
  "owl",
  "bat",
  "crow",
  "duck",
  "swan",
  "frog",
  "toad",
  "turtle",
  "crab",
  "fish",
  "seal",
  "bear",
  "wolf",
  "fox",
  "deer",
  "moose",
  "elk",
  "bison",
  "sheep",
  "goat",
  "pig",
  "cow",
  "bull",
  "cat",
  "dog",
  "pet",
  "vet",
  "zoo",
  "wild",
  "tame",
  "circus",
  "fair",
  "park",
  "shop",
  "mall",
  "bank",
  "post",
  "mail",
  "stamp",
  "letter",
];

type GameState = {
  status: "waiting" | "playing" | "finished";
  currentDrawer: string;
  currentWord: string;
  round: number;
  maxRounds: number;
  scores: Record<string, number>;
  players: string[];
  hostId: string;
  guesses: string[];
};

export default function GameScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [timeLeft, setTimeLeft] = useState(60);
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [isEraser, setIsEraser] = useState(false);
  const [allWords, setAllWords] = useState<string[]>(FALLBACK_WORD_LIST);

  // Use local interface or any to avoid import errors
  const canvasRef = useRef<any>(null);

  // --- FETCH ONLINE WORD LIST ---
  useEffect(() => {
    const fetchWords = async () => {
      try {
        const response = await fetch(
          "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt"
        );
        const text = await response.text();
        const onlineWords = text
          .split("\n")
          .map((w) => w.trim())
          .filter((w) => w.length >= 3 && w.length <= 12);

        if (onlineWords.length > 500) {
          console.log(
            "Loaded " + onlineWords.length + " words from online dictionary."
          );
          setAllWords((prev) => [...prev, ...onlineWords]);
        }
      } catch (error) {
        console.warn(
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

        if (data.status === "finished") {
          Alert.alert("Game Over", "The game has ended!");
          router.replace("/");
        }
      } else {
        Alert.alert("Error", "Game not found");
        router.replace("/");
      }
    });

    return () => unsubscribe();
  }, [id]);

  const getRandomWord = () => {
    const randomIndex = Math.floor(Math.random() * allWords.length);
    return allWords[randomIndex];
  };

  const handleNextRound = async () => {
    if (!gameState || !id) return;

    const currentPlayerIndex = gameState.players.indexOf(
      gameState.currentDrawer
    );
    const nextPlayerIndex = (currentPlayerIndex + 1) % gameState.players.length;
    const nextDrawer = gameState.players[nextPlayerIndex];

    const nextWord = getRandomWord();

    await updateDoc(doc(db, "games", id as string), {
      currentDrawer: nextDrawer,
      currentWord: nextWord,
      round: gameState.round + 1,
      guesses: [],
    });

    if (canvasRef.current) {
      canvasRef.current.clear();
    }
  };

  const startGame = async () => {
    if (!gameState || !id) return;
    const firstWord = getRandomWord();
    await updateDoc(doc(db, "games", id as string), {
      status: "playing",
      currentWord: firstWord,
      round: 1,
      guesses: [],
    });
  };

  useEffect(() => {
    if (gameState?.status === "playing") {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (currentUser?.uid === gameState.hostId) {
              handleNextRound();
            }
            return 60;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameState?.status, gameState?.round, gameState?.hostId, allWords]);

  const handleCorrectGuess = async (userId: string) => {
    if (!id) return;
    await updateDoc(doc(db, "games", id as string), {
      guesses: arrayUnion(userId),
    });
  };

  if (!gameState)
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text>Loading Game...</Text>
      </View>
    );

  const isDrawer = gameState.currentDrawer === currentUser?.uid;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.timer}>{timeLeft}s</Text>
          <Text style={styles.roundInfo}>
            Round {gameState.round}/{gameState.maxRounds}
          </Text>
        </View>

        {gameState.status === "waiting" &&
          currentUser?.uid === gameState.hostId && (
            <TouchableOpacity onPress={startGame} style={styles.startButton}>
              <Text style={styles.startButtonText}>Start</Text>
            </TouchableOpacity>
          )}
      </View>

      <View style={styles.wordContainer}>
        {isDrawer ? (
          <Text style={styles.wordText}>
            Draw:{" "}
            <Text style={styles.highlightWord}>{gameState.currentWord}</Text>
          </Text>
        ) : (
          <Text style={styles.wordText}>
            Guess the word! ({gameState.currentWord.length} letters)
          </Text>
        )}
      </View>

      <View style={styles.gameContainer}>
        <View style={styles.canvasContainer}>
          <DrawingCanvas
            ref={canvasRef}
            gameId={id as string}
            isDrawer={isDrawer}
            selectedColor={selectedColor}
            strokeWidth={strokeWidth}
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
                setIsEraser(!isEraser);
                setSelectedColor(isEraser ? "#000000" : "#FFFFFF");
              }}
              onClear={() => {
                if (canvasRef.current) canvasRef.current.clear();
              }}
            />
          </View>
        )}

        <View style={styles.chatContainer}>
          <ChatWindow
            gameId={id as string}
            currentUser={currentUser}
            currentWord={gameState.currentWord}
            isDrawer={isDrawer}
            onCorrectGuess={handleCorrectGuess}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    backgroundColor: "white",
  },
  backButton: {
    padding: 5,
  },
  headerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
  timer: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FF6B6B",
  },
  roundInfo: {
    fontSize: 14,
    color: "#666",
  },
  startButton: {
    backgroundColor: "#4ECDC4",
    paddingHorizontal: 15,
    paddingVertical: 6,
    borderRadius: 20,
  },
  startButtonText: {
    color: "white",
    fontWeight: "bold",
  },
  wordContainer: {
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  wordText: {
    fontSize: 18,
    color: "#333",
  },
  highlightWord: {
    fontWeight: "bold",
    color: "#4ECDC4",
    textTransform: "uppercase",
  },
  gameContainer: {
    flex: 1,
    flexDirection: "column",
  },
  canvasContainer: {
    flex: 2,
    backgroundColor: "white",
    margin: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  toolsContainer: {
    paddingHorizontal: 10,
    marginBottom: 5,
  },
  chatContainer: {
    flex: 1,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
});
