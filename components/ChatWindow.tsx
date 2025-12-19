import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
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
import { auth, db } from "../firebaseConfig";

interface ChatMessage {
  id: string;
  text: string;
  sender: string;
  createdAt: any;
  isSystem?: boolean;
}

interface ChatProps {
  roomId: string;
  currentWord: string;
  isDrawer: boolean;
  roundEndTime: number | null; // New prop for scoring
}

export default function ChatWindow({
  roomId,
  currentWord,
  isDrawer,
  roundEndTime,
}: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const flatListRef = useRef<FlatList>(null);

  // 1. LISTEN for messages
  useEffect(() => {
    if (!roomId) return;

    const msgsRef = collection(db, "rooms", roomId, "messages");
    const q = query(msgsRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedMsgs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ChatMessage[];
      setMessages(loadedMsgs);
      setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
    });

    return () => unsubscribe();
  }, [roomId]);

  // 2. SEND Message
  const sendMessage = async () => {
    if (!inputText.trim()) return;

    const textToSend = inputText.trim();
    const user = auth.currentUser;
    const msgsRef = collection(db, "rooms", roomId, "messages");

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
      });
    } else {
      // Normal message
      await addDoc(msgsRef, {
        text: textToSend,
        sender: user?.displayName || "Anon",
        createdAt: serverTimestamp(),
        isSystem: false,
      });
    }

    setInputText("");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
      style={styles.container}
    >
      <View style={styles.chatArea}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View
              style={[styles.messageRow, item.isSystem && styles.systemRow]}
            >
              {!item.isSystem && (
                <Text style={styles.sender}>{item.sender}: </Text>
              )}
              <Text
                style={[styles.messageText, item.isSystem && styles.systemText]}
              >
                {item.text}
              </Text>
            </View>
          )}
        />
      </View>

      <View style={styles.inputArea}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={isDrawer ? "Chat..." : "Type guess here..."}
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity onPress={sendMessage} style={styles.sendButton}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderColor: "#ddd",
  },
  chatArea: { flex: 1, padding: 10 },
  messageRow: { flexDirection: "row", marginBottom: 4 },
  systemRow: {
    backgroundColor: "#d4edda",
    padding: 5,
    borderRadius: 4,
    justifyContent: "center",
  },
  sender: { fontWeight: "bold", color: "#555" },
  messageText: { color: "#333" },
  systemText: { color: "#155724", fontWeight: "bold" },
  inputArea: { flexDirection: "row", padding: 10, backgroundColor: "#f9f9f9" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: "white",
    marginRight: 10,
  },
  sendButton: { justifyContent: "center", paddingHorizontal: 15 },
  sendButtonText: { color: "#007AFF", fontWeight: "bold" },
});
