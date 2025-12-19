// app/game/[id].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ChatWindow from "../../components/ChatWindow"; // 👈 Import Chat
import DrawingCanvas from "../../components/DrawingCanvas";
import { auth, db } from "../../firebaseConfig";

const WORDS = ["CAT", "DOG", "PIZZA", "SUN", "CAR", "HOUSE", "TREE", "BOOK"];

export default function GameRoom() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const roomId = Array.isArray(id) ? id[0] : id;
  const currentUser = auth.currentUser;

  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [currentWord, setCurrentWord] = useState<string>("");

  const isDrawer = currentUser?.uid === drawerId;

  useEffect(() => {
    if (!roomId) return;
    const roomRef = doc(db, "rooms", roomId);
    setDoc(roomRef, { active: true }, { merge: true });

    const unsubscribe = onSnapshot(roomRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setDrawerId(data.drawerId);
        setCurrentWord(data.word || "");
      }
    });
    return () => unsubscribe();
  }, [roomId]);

  const startGame = async () => {
    const randomWord = WORDS[Math.floor(Math.random() * WORDS.length)];
    const roomRef = doc(db, "rooms", roomId);
    await updateDoc(roomRef, { drawerId: currentUser?.uid, word: randomWord });
    clearBoard();
  };

  const clearBoard = async () => {
    const linesRef = collection(db, "rooms", roomId, "lines");
    const snapshot = await getDocs(linesRef);
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  };

  const getDisplayWord = () => {
    if (!currentWord) return "Waiting to start...";
    if (isDrawer) return `Draw: ${currentWord}`;
    return `Guess: ${currentWord
      .split("")
      .map(() => "_")
      .join(" ")}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. Header Area */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Room: {roomId}</Text>
          <Text style={styles.wordDisplay}>{getDisplayWord()}</Text>
        </View>
        <View style={styles.headerButtons}>
          {isDrawer && (
            <TouchableOpacity onPress={clearBoard} style={styles.clearButton}>
              <Text style={styles.buttonText}>Clear</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.leaveButton}
          >
            <Text style={styles.buttonText}>Leave</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Controls Area */}
      {!currentWord && (
        <View style={styles.controls}>
          <TouchableOpacity onPress={startGame} style={styles.startButton}>
            <Text style={styles.startButtonText}>Start Game</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 3. The Drawing Area (Fixed Height) */}
      <View style={styles.canvasArea}>
        <DrawingCanvas roomId={roomId} isReadOnly={!isDrawer} />
      </View>

      {/* 4. The Chat Area (Takes remaining space) */}
      <View style={styles.chatContainer}>
        <ChatWindow
          roomId={roomId}
          currentWord={currentWord}
          isDrawer={isDrawer}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    padding: 15,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerButtons: { flexDirection: "row", gap: 10 },
  title: { fontSize: 14, color: "#666" },
  wordDisplay: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginTop: 5,
  },
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

  // Layout Logic
  canvasArea: {
    height: "50%", // Canvas takes top 50%
    width: "100%",
  },
  chatContainer: {
    flex: 1, // Chat takes the rest
  },
});
