import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import React from "react";
import {
  Alert,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
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
    <ImageBackground
      source={require("../assets/images/profile.jpeg")}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <SafeAreaProvider style={styles.container}>
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
      </SafeAreaProvider>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,

    backgroundColor: "#ffffff83",
  },
  backgroundImage: { flex: 1 },
  card: {
    backgroundColor: "transparent",
    borderRadius: 20,
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    marginTop: 40,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  avatarText: { fontSize: 40, fontWeight: "bold", color: "#fffdf6ff" },
  username: { fontSize: 30, fontWeight: "bold", color: "#333" },
  email: { fontSize: 20, fontWeight: "400", color: "black", marginBottom: 20 },
  divider: {
    height: 2,
    width: "100%",
    backgroundColor: "#333",
    marginVertical: 20,
  },
  button: {
    width: "100%",
    padding: 15,
    borderRadius: 10,
    backgroundColor: "#f0f0f0",
    marginBottom: 10,
    alignItems: "center",
    borderColor: "#333",
    borderWidth: 2,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    textTransform: "uppercase",
  },
  logoutButton: { backgroundColor: "#ffebee" },
  logoutText: { color: "#d32f2f" },
  backButton: { marginTop: 10 },
  backText: { color: "#333", fontWeight: "bold", fontSize: 16 },
});
