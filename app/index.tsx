import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../firebaseConfig";

// Generate numbers 1-20 for the wheel
const ROUND_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1);

export default function Index() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roomCode, setRoomCode] = useState("");
  const [username, setUsername] = useState("Loading...");
  const [showRoundModal, setShowRoundModal] = useState(false);

  // Round Selection State
  const [selectedRounds, setSelectedRounds] = useState(2);
  const [customRounds, setCustomRounds] = useState("");
  const [useCustomInput, setUseCustomInput] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  // 1. Listen for Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        const docRef = doc(db, "users", currentUser.uid);
        try {
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setUsername(docSnap.data().username);
          } else {
            setUsername(currentUser.displayName || "Player");
          }
        } catch (e) {
          console.error("Error fetching profile", e);
          setUsername(currentUser.displayName || "Player");
        }
      }
      setLoading(false);
    });

    // Check onboarding status
    const checkOnboarding = async () => {
      try {
        const value = await AsyncStorage.getItem("hasSeenOnboarding");
        if (value === "true") {
          setHasSeenOnboarding(true);
        }
      } catch (e) {
        console.error("Error reading onboarding status", e);
      }
    };
    checkOnboarding();
    return () => unsubscribe();
  }, []);

  // 2. Navigation Functions
  const handleCreateRoom = () => {
    let roundsToPlay = selectedRounds;

    if (useCustomInput) {
      const parsed = parseInt(customRounds);
      if (isNaN(parsed) || parsed < 1 || parsed > 20) {
        Alert.alert(
          "Invalid Rounds",
          "Please enter a number between 1 and 20."
        );
        return;
      }
      roundsToPlay = parsed;
    }

    const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    setShowRoundModal(false);
    // Reset modal state
    setCustomRounds("");
    setUseCustomInput(false);

    router.push({
      pathname: "/game/[id]",
      params: { id: randomCode, rounds: roundsToPlay },
    });
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
      </View>
    );
  }

  // ---------------- RENDER: LOGGED IN LOBBY ----------------
  if (user) {
    return (
      <ImageBackground
        source={require("../assets/images/main_inner.jpeg")}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.welcomeText}>Welcome, {username} !</Text>
            <TouchableOpacity onPress={() => router.push("/profile")}>
              <View style={styles.profileIcon}>
                <Text style={styles.profileIconText}>
                  {username[0]?.toUpperCase() || "U"}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.title}>Scribbles</Text>

            <View style={styles.card}>
              <Text style={styles.label}>Join a Game</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter Room Code"
                placeholderTextColor={"#333"}
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
              <TouchableOpacity
                style={styles.buttonSecondary}
                onPress={() => setShowRoundModal(true)}
              >
                <Text style={styles.buttonTextSecondary}>Create New Room</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Round Selection Modal */}
          <Modal
            visible={showRoundModal}
            transparent
            animationType="slide"
            onRequestClose={() => setShowRoundModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Game Settings</Text>
                <Text style={styles.modalSubtitle}>Number of Rounds</Text>

                {!useCustomInput ? (
                  <View style={styles.pickerContainer}>
                    <View style={styles.pickerWindow} pointerEvents="none" />
                    <ScrollView
                      style={styles.scroller}
                      contentContainerStyle={styles.scrollerContent}
                      showsVerticalScrollIndicator={false}
                      snapToInterval={50}
                      decelerationRate="fast"
                      onMomentumScrollEnd={(e) => {
                        const offsetY = e.nativeEvent.contentOffset.y;
                        const index = Math.round(offsetY / 50);
                        if (ROUND_OPTIONS[index])
                          setSelectedRounds(ROUND_OPTIONS[index]);
                      }}
                    >
                      <View style={{ height: 75 }} />
                      {ROUND_OPTIONS.map((r) => (
                        <View key={r} style={styles.scrollItem}>
                          <Text
                            style={[
                              styles.scrollItemText,
                              selectedRounds === r && styles.selectedItemText,
                            ]}
                          >
                            {r}
                          </Text>
                        </View>
                      ))}
                      <View style={{ height: 75 }} />
                    </ScrollView>
                  </View>
                ) : (
                  <TextInput
                    style={styles.customInput}
                    placeholder="Type rounds (1-50)"
                    placeholderTextColor={"#333"}
                    keyboardType="number-pad"
                    value={customRounds}
                    onChangeText={setCustomRounds}
                    autoFocus
                  />
                )}

                <TouchableOpacity
                  onPress={() => setUseCustomInput(!useCustomInput)}
                  style={styles.toggleInputBtn}
                >
                  <Text style={styles.toggleInputText}>
                    {useCustomInput ? "Switch to List" : "Type Manually"}
                  </Text>
                </TouchableOpacity>

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    onPress={() => setShowRoundModal(false)}
                    style={styles.cancelBtn}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCreateRoom}
                    style={styles.confirmBtn}
                  >
                    <Text style={styles.confirmText}>Start Game</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  // ---------------- RENDER: LANDING SCREEN ----------------
  return (
    <ImageBackground
      source={require("../assets/images/main_bg.jpeg")}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.containerTransparent}>
        <View style={styles.content}>
          <Text style={styles.title}>Scribbles</Text>
          <Text style={styles.subtitle}>Draw. Guess. Win.</Text>

          <TouchableOpacity
            style={styles.buttonPrimary}
            onPress={() => router.push("/auth/login")}
          >
            <Text style={styles.buttonText}>Log In</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buttonSecondary, { marginTop: 15 }]}
            onPress={() => router.push("/auth/register")}
          >
            <Text style={styles.buttonTextSecondary}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  containerTransparent: {
    flex: 1,
    backgroundColor: "rgba(255, 247, 225, 0.7)",
  },
  backgroundImage: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 40,
  },
  welcomeText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 8,
    borderRadius: 10,
    marginLeft: 5,
  },
  profileIcon: {
    width: 48,
    height: 48,
    borderRadius: 40,
    backgroundColor: "#ffeeeeff",
    justifyContent: "center",
    alignItems: "center",
  },
  profileIconText: { color: "#333", fontWeight: "bold", fontSize: 22 },
  content: { flex: 1, justifyContent: "center", padding: 20 },
  title: {
    fontSize: 64,
    fontWeight: "bold",
    color: "white",
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "rgba(0, 0, 0, 0.8)",
    textAlign: "center",
    marginBottom: 40,
  },
  card: {
    backgroundColor: "#dddddd95",
    borderRadius: 20,
    padding: 30,
    elevation: 8,
  },
  label: { fontSize: 18, fontWeight: "900", marginBottom: 10, color: "black" },
  input: {
    backgroundColor: "#fff9f2ff",

    padding: 15,
    borderRadius: 10,
    fontSize: 18,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: "#333",
    color: "#333",
  },
  buttonPrimary: {
    backgroundColor: "#333",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: { color: "white", fontWeight: "bold", fontSize: 20 },
  buttonSecondary: {
    backgroundColor: "#33333370",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#333",
  },
  buttonTextSecondary: { color: "white", fontWeight: "bold", fontSize: 20 },
  divider: { alignItems: "center", marginVertical: 20 },
  dividerText: { color: "#333", fontSize: 18, fontWeight: "bold" },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fffaeeff",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
  },
  modalSubtitle: { fontSize: 16, color: "#666", marginBottom: 20 },

  // Suitcase Lock Picker Styles
  pickerContainer: {
    height: 200,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    backgroundColor: "#fff9f2ff",
    borderRadius: 10,
    overflow: "hidden",
  },
  pickerWindow: {
    position: "absolute",
    top: 75,
    height: 50,
    width: "80%",
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: "#e27d4aff",
    zIndex: 10,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
  },
  scroller: { width: "100%" },
  scrollerContent: { alignItems: "center" },
  scrollItem: {
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  scrollItemText: { fontSize: 24, color: "#ccc", fontWeight: "bold" },
  selectedItemText: { color: "#333", fontSize: 32 },

  customInput: {
    width: "80%",
    height: 50,
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 18,
    textAlign: "center",
    marginBottom: 20,
  },

  toggleInputBtn: { marginBottom: 20 },
  toggleInputText: {
    color: "#333",
    fontSize: 16,
    fontWeight: "600",
    textDecorationLine: "underline",
  },

  modalButtons: { flexDirection: "row", gap: 10, width: "100%" },
  cancelBtn: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    backgroundColor: "#333",
    alignItems: "center",
  },
  cancelText: { color: "#ddd", fontWeight: "bold" },
  confirmBtn: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    backgroundColor: "#e27d4aff",
    alignItems: "center",
  },
  confirmText: { color: "white", fontWeight: "bold" },
});
