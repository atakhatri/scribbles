import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import React from "react";
import {
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../firebaseConfig";

export default function Profile() {
  const router = useRouter();
  const user = auth.currentUser;

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.replace("/"); // Go back to main screen
    } catch (error) {
      Alert.alert("Error", "Failed to sign out");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.displayName ? user.displayName[0].toUpperCase() : "?"}
          </Text>
        </View>

        <Text style={styles.username}>
          {user?.displayName || "Anonymous Player"}
        </Text>
        <Text style={styles.email}>{user?.email || "No email linked"}</Text>

        <View style={styles.divider} />

        {/* 👇 UPDATED: Links to Friends Screen */}
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push("/friends")}
        >
          <Text style={styles.buttonText}>My Friends</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.logoutButton]}
          onPress={handleSignOut}
        >
          <Text style={[styles.buttonText, styles.logoutText]}>Log Out</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>Back to Lobby</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 30,
    alignItems: "center",
    elevation: 5,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#4a90e2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },
  avatarText: { fontSize: 36, fontWeight: "bold", color: "white" },
  username: { fontSize: 24, fontWeight: "bold", color: "#333" },
  email: { fontSize: 14, color: "#666", marginBottom: 20 },
  divider: {
    height: 1,
    width: "100%",
    backgroundColor: "#eee",
    marginVertical: 20,
  },
  button: {
    width: "100%",
    padding: 15,
    borderRadius: 10,
    backgroundColor: "#f0f0f0",
    marginBottom: 10,
    alignItems: "center",
  },
  buttonText: { fontSize: 16, fontWeight: "600", color: "#333" },
  logoutButton: { backgroundColor: "#ffebee" },
  logoutText: { color: "#d32f2f" },
  backButton: { marginTop: 10 },
  backText: { color: "#666" },
});
