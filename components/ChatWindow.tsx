import { User } from "firebase/auth";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../firebaseConfig";

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  isCorrectGuess: boolean;
  timestamp: any;
}

interface ChatProps {
  gameId: string;
  currentUser: User | null;
  currentWord: string;
  isDrawer: boolean;
<<<<<<< HEAD
  roundEndTime: number | null; // New prop for scoring
=======
  onCorrectGuess: (userId: string) => Promise<void>;
>>>>>>> c542d9b36a0754b217908210bf8205353cde4d51
}

export default function ChatWindow({
  gameId,
  currentUser,
  currentWord,
  isDrawer,
<<<<<<< HEAD
  roundEndTime,
=======
  onCorrectGuess,
>>>>>>> c542d9b36a0754b217908210bf8205353cde4d51
}: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!gameId) return;

    const messagesRef = collection(db, "games", gameId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: ChatMessage[] = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as ChatMessage);
      });
      setMessages(msgs);
      setTimeout(
        () => flatListRef.current?.scrollToEnd({ animated: true }),
        100
      );
    });

    return () => unsubscribe();
  }, [gameId]);

  const handleSend = async () => {
    if (!inputText.trim() || !currentUser) return;

    const text = inputText.trim();
    const isGuess = text.toLowerCase() === currentWord.toLowerCase();

<<<<<<< HEAD
    // 🏆 WIN CONDITION CHECK 🏆
    const isWin =
      !isDrawer &&
      currentWord &&
      textToSend.toUpperCase() === currentWord.toUpperCase();

    if (isWin) {
      if (user) {
        // Calculate Time-Based Score
        let points = 50; // Base points
        if (roundEndTime) {
          const timeLeft = Math.max(
            0,
            Math.ceil((roundEndTime - Date.now()) / 1000)
          );
          // Bonus: 2 points per second left
          points += timeLeft * 2;
        }

        // A. Update Player Score
        const playerRef = doc(db, "rooms", roomId, "players", user.uid);
        await updateDoc(playerRef, { score: increment(points) });

        // B. Mark as "Guessed"
        const roomRef = doc(db, "rooms", roomId);
        await updateDoc(roomRef, {
          guessedPlayers: arrayUnion(user.uid),
        });
      }

      // C. Post System Message
      await addDoc(msgsRef, {
        text: `🎉 ${user?.displayName || "Player"} GUESSED THE WORD!`,
        sender: "SYSTEM",
        createdAt: serverTimestamp(),
        isSystem: true,
=======
    // If it's a correct guess
    if (isGuess && !isDrawer) {
      // Don't show the word in chat, show a system message or specific style
      await addDoc(collection(db, "games", gameId, "messages"), {
        userId: currentUser.uid,
        userName: currentUser.displayName || "Player",
        text: "Correctly guessed the word!",
        isCorrectGuess: true,
        timestamp: serverTimestamp(),
>>>>>>> c542d9b36a0754b217908210bf8205353cde4d51
      });

      await onCorrectGuess(currentUser.uid);
    } else {
      // Normal message
      await addDoc(collection(db, "games", gameId, "messages"), {
        userId: currentUser.uid,
        userName: currentUser.displayName || "Player",
        text: text,
        isCorrectGuess: false,
        timestamp: serverTimestamp(),
      });
    }

    setInputText("");
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const isSystem = item.isCorrectGuess;

    return (
      <View style={[styles.messageRow, isSystem && styles.systemRow]}>
        <Text style={[styles.userName, isSystem && styles.systemText]}>
          {item.userName}:
        </Text>
        <Text style={[styles.messageText, isSystem && styles.systemText]}>
          {item.text}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
      style={styles.container}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={
            isDrawer ? "Chat with players..." : "Type your guess here..."
          }
          placeholderTextColor="#999"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 10,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 6,
    flexWrap: "wrap",
  },
  userName: {
    fontWeight: "bold",
    marginRight: 6,
    color: "#333",
  },
  messageText: {
    color: "#333",
  },
  systemRow: {
    backgroundColor: "#dcfce7", // Light green bg for correct guesses
    padding: 4,
    borderRadius: 4,
  },
  systemText: {
    color: "#166534",
    fontWeight: "bold",
  },
  inputContainer: {
    flexDirection: "row",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginRight: 10,
    fontSize: 16,
  },
  sendButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  sendText: {
    color: "#3b82f6",
    fontWeight: "600",
    fontSize: 16,
  },
});
