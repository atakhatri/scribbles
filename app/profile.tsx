import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { auth } from "../firebaseConfig";

const { width } = Dimensions.get("window");

export default function Profile() {
  const router = useRouter();
  const user = auth.currentUser;
  const [showSettings, setShowSettings] = useState(false);
  const slideAnim = useRef(new Animated.Value(width)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: showSettings ? 0 : width,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showSettings]);

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
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
            <Text style={styles.headerButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSettings(true)}>
            <Ionicons name="settings-sharp" size={28} color="#333" />
          </TouchableOpacity>
        </View>

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
        </View>

        {/* Settings Menu Overlay */}
        {showSettings && (
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setShowSettings(false)}
          />
        )}
        <Animated.View
          style={[
            styles.settingsPanel,
            { transform: [{ translateX: slideAnim }] },
          ]}
        >
          <Text style={styles.settingsTitle}>Settings</Text>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.menuItem} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={24} color="#d32f2f" />
            <Text style={styles.menuItemText}>Log Out</Text>
          </TouchableOpacity>
        </Animated.View>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 50,
  },
  headerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  headerButtonText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    zIndex: 10,
  },
  settingsPanel: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 250,
    backgroundColor: "#4d4d4d",
    zIndex: 20,
    padding: 20,
    paddingTop: 60,
    shadowColor: "#000",
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  settingsTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#f0f0f0",
    marginBottom: 10,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 15,
  },
  menuItemText: {
    fontSize: 18,
    color: "#d32f2f",
    fontWeight: "600",
  },
});
