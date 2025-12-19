// components/ChatWindow.tsx
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
import { auth, db } from "../firebaseConfig";

interface ChatMessage {
  id: string;
  text: string;
  sender: string; // User ID or Name
  createdAt: any;
  isSystem?: boolean; // True if it's a "User won!" message
}

interface ChatProps {
  roomId: string;
  currentWord: string; // We need this to check for the win
  isDrawer: boolean; // Drawer shouldn't be able to guess their own word!
}

export default function ChatWindow({
  roomId,
  currentWord,
  isDrawer,
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

      // Auto-scroll to bottom when new message arrives
      setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
    });

    return () => unsubscribe();
  }, [roomId]);

  // 2. SEND Message (and check for WIN)
  const sendMessage = async () => {
    if (!inputText.trim()) return;

    const textToSend = inputText.trim();
    const user = auth.currentUser;
    const msgsRef = collection(db, "rooms", roomId, "messages");

    // 🏆 WIN CONDITION CHECK 🏆
    // If it's not the drawer, and the guess matches the word (case-insensitive)
    const isWin =
      !isDrawer &&
      currentWord &&
      textToSend.toUpperCase() === currentWord.toUpperCase();

    if (isWin) {
      // 1. Post the "Winner" system message
      await addDoc(msgsRef, {
        text: `🎉 ${user?.uid.slice(
          0,
          4
        )} GUESSED THE WORD! The word was "${currentWord}"`,
        sender: "SYSTEM",
        createdAt: serverTimestamp(),
        isSystem: true,
      });

      // 2. Reveal the word logic could go here (optional)
      // For now, we just announce it.
    } else {
      // Normal chat message
      await addDoc(msgsRef, {
        text: textToSend,
        sender: user?.uid.slice(0, 6) || "Anon",
        createdAt: serverTimestamp(),
        isSystem: false,
      });
    }

    setInputText("");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={100}
      style={styles.container}
    >
      <View style={styles.chatArea}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View
              style={[
                styles.messageRow,
                item.isSystem && styles.systemRow, // Highlight system messages
              ]}
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
          placeholder={
            isDrawer ? "Chat with players..." : "Type your guess here..."
          }
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
  chatArea: {
    flex: 1,
    padding: 10,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  systemRow: {
    backgroundColor: "#d4edda", // Light green background for winners
    padding: 5,
    borderRadius: 4,
    justifyContent: "center",
  },
  sender: {
    fontWeight: "bold",
    color: "#555",
  },
  messageText: {
    color: "#333",
  },
  systemText: {
    color: "#155724", // Dark green text
    fontWeight: "bold",
  },
  inputArea: {
    flexDirection: "row",
    padding: 10,
    backgroundColor: "#f9f9f9",
  },
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
  sendButton: {
    justifyContent: "center",
    paddingHorizontal: 15,
  },
  sendButtonText: {
    color: "#007AFF",
    fontWeight: "bold",
  },
});
