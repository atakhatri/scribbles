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
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { db } from "../firebaseConfig";

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  isCorrectGuess: boolean;
  isCloseGuess?: boolean;
  isSystem?: boolean;
  timestamp: any;
}

interface ChatProps {
  gameId: string;
  currentUser: User | null;
  currentWord: string;
  isDrawer: boolean;
  guesses: string[];
  onCorrectGuess: (userId: string) => Promise<void>;
}

const getLevenshteinDistance = (a: string, b: string) => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

export default function ChatWindow({
  gameId,
  currentUser,
  currentWord,
  isDrawer,
  guesses,
  onCorrectGuess,
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
    const alreadyGuessed = guesses.includes(currentUser.uid);

    const dist = getLevenshteinDistance(
      text.toLowerCase(),
      currentWord.toLowerCase()
    );
    const isClose =
      dist > 0 &&
      ((currentWord.length <= 5 && dist === 1) ||
        (currentWord.length > 5 && dist <= 2));

    // If it's a correct guess
    if (isGuess && !isDrawer) {
      if (alreadyGuessed) {
        setInputText("");
        return;
      }
      // Don't show the word in chat, show a system message or specific style
      await addDoc(collection(db, "games", gameId, "messages"), {
        userId: currentUser.uid,
        userName: currentUser.displayName || "Player",
        text: "Correctly guessed the word!",
        isCorrectGuess: true,
        timestamp: serverTimestamp(),
      });

      await onCorrectGuess(currentUser.uid);
    } else if (isClose && !isDrawer && !alreadyGuessed) {
      // Close guess - send system message but don't reveal text
      await addDoc(collection(db, "games", gameId, "messages"), {
        userId: currentUser.uid,
        userName: currentUser.displayName || "Player",
        text: `${currentUser.displayName || "Player"} is close!`,
        isCloseGuess: true,
        timestamp: serverTimestamp(),
      });
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
    const isCorrect = item.isCorrectGuess;
    const isClose = item.isCloseGuess;
    const isSystem = item.isSystem;

    let rowStyle: StyleProp<ViewStyle> = styles.messageRow;
    let textStyle: StyleProp<TextStyle> = styles.messageText;
    let nameStyle: StyleProp<TextStyle> = styles.userName;

    if (isCorrect) {
      rowStyle = [styles.messageRow, styles.correctRow];
      textStyle = [styles.messageText, styles.correctText];
      nameStyle = [styles.userName, styles.correctText];
    } else if (isClose) {
      rowStyle = [styles.messageRow, styles.closeRow];
      textStyle = [styles.messageText, styles.closeText];
      nameStyle = [styles.userName, styles.closeText];
    } else if (isSystem) {
      rowStyle = [styles.messageRow, styles.systemRow];
      textStyle = [styles.messageText, styles.systemText];
      nameStyle = [styles.userName, styles.systemText];
    }

    return (
      <View style={rowStyle}>
        <Text style={nameStyle}>{item.userName}:</Text>
        <Text style={textStyle}>{item.text}</Text>
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
  correctRow: {
    backgroundColor: "#dcfce7", // Light green bg for correct guesses
    padding: 4,
    borderRadius: 4,
  },
  correctText: {
    color: "#166534",
    fontWeight: "bold",
  },
  closeRow: {
    backgroundColor: "#fef9c3", // Light yellow
    padding: 4,
    borderRadius: 4,
  },
  closeText: {
    color: "#854d0e",
    fontWeight: "bold",
  },
  systemRow: {
    backgroundColor: "#f3f4f6", // Light gray
    padding: 4,
    borderRadius: 4,
  },
  systemText: {
    color: "#4b5563",
    fontStyle: "italic",
    fontSize: 12,
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
