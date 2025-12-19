import { useRouter } from "expo-router";
import { onAuthStateChanged, signInAnonymously, User } from "firebase/auth";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../firebaseConfig";

export default function Index() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roomCode, setRoomCode] = useState("");

  // 1. Handle Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setLoading(false);
      } else {
        signInAnonymously(auth).catch((error) => {
          Alert.alert("Error", "Could not sign in anonymously");
          console.error(error);
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Navigation Functions
  const createRoom = () => {
    // Generate a random 4-letter room code (e.g., "ABCD")
    const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    router.push(`/game/${randomCode}`);
  };

  const joinRoom = () => {
    if (roomCode.trim().length === 0) {
      Alert.alert("Required", "Please enter a room code first.");
      return;
    }
    router.push(`/game/${roomCode.toUpperCase()}`);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4a90e2" />
        <Text style={{ marginTop: 20 }}>Signing in...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Scribbles</Text>
        <Text style={styles.subtitle}>Multiplayer Drawing Game</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Join a Friend</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter Room Code"
            value={roomCode}
            onChangeText={setRoomCode}
            autoCapitalize="characters"
            maxLength={6}
          />
          <TouchableOpacity style={styles.buttonPrimary} onPress={joinRoom}>
            <Text style={styles.buttonText}>Join Room</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <Text style={styles.dividerText}>OR</Text>
          </View>

          <TouchableOpacity style={styles.buttonSecondary} onPress={createRoom}>
            <Text style={styles.buttonTextSecondary}>Create New Room</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.userId}>Player ID: {user?.uid.slice(0, 6)}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#4a90e2", // Nice blue background
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 48,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    marginBottom: 40,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
    color: "#333",
  },
  input: {
    backgroundColor: "#f0f0f0",
    padding: 15,
    borderRadius: 10,
    fontSize: 18,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  buttonPrimary: {
    backgroundColor: "#333",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  divider: {
    alignItems: "center",
    marginVertical: 20,
  },
  dividerText: {
    color: "#999",
    fontWeight: "bold",
  },
  buttonSecondary: {
    backgroundColor: "transparent",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#333",
  },
  buttonTextSecondary: {
    color: "#333",
    fontWeight: "bold",
    fontSize: 16,
  },
  userId: {
    textAlign: "center",
    marginTop: 20,
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
  },
});
