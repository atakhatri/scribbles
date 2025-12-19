import { useRouter } from "expo-router";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
            setUsername("Player");
          }
        } catch (e) {
          console.error("Error fetching profile", e);
          setUsername("Player");
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Navigation Functions
  const handleCreateRoom = () => {
    let roundsToPlay = selectedRounds;

    if (useCustomInput) {
      const parsed = parseInt(customRounds);
      if (isNaN(parsed) || parsed < 1 || parsed > 50) {
        Alert.alert(
          "Invalid Rounds",
          "Please enter a number between 1 and 50."
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
      pathname: `/game/${randomCode}`,
      params: { rounds: roundsToPlay },
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
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.welcomeText}>Welcome, {username}!</Text>
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
    );
  }

  // ---------------- RENDER: LANDING SCREEN ----------------
  return (
    <SafeAreaView style={styles.container}>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#4a90e2" },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 40,
  },
  welcomeText: { color: "white", fontSize: 18, fontWeight: "bold" },
  profileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
  },
  profileIconText: { color: "#4a90e2", fontWeight: "bold", fontSize: 18 },
  content: { flex: 1, justifyContent: "center", padding: 20 },
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
    elevation: 8,
  },
  label: { fontSize: 16, fontWeight: "600", marginBottom: 10, color: "#333" },
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
  buttonText: { color: "white", fontWeight: "bold", fontSize: 16 },
  buttonSecondary: {
    backgroundColor: "#5d5d5dff",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  buttonTextSecondary: { color: "white", fontWeight: "bold", fontSize: 16 },
  divider: { alignItems: "center", marginVertical: 20 },
  dividerText: { color: "#999", fontWeight: "bold" },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "white",
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
    backgroundColor: "#f8f9fa",
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
    borderColor: "#4a90e2",
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
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 18,
    textAlign: "center",
    marginBottom: 20,
  },

  toggleInputBtn: { marginBottom: 20 },
  toggleInputText: { color: "#4a90e2", fontSize: 14, fontWeight: "600" },

  modalButtons: { flexDirection: "row", gap: 10, width: "100%" },
  cancelBtn: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
  },
  cancelText: { color: "#666", fontWeight: "bold" },
  confirmBtn: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    backgroundColor: "#4a90e2",
    alignItems: "center",
  },
  confirmText: { color: "white", fontWeight: "bold" },
});
