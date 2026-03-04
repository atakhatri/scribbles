import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { getAuth, signOut, updateProfile } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const UPDATE_JSON_URL =
  "https://gist.githubusercontent.com/atakhatri/14928794d017d4b66a845d2afb58f487/raw/version.json";

const AVATAR_GRADIENTS = [
  ["#FF9A9E", "#FECFEF"], // Pink
  ["#a18cd1", "#fbc2eb"], // Purple
  ["#84fab0", "#8fd3f4"], // Aqua
  ["#fccb90", "#d57eeb"], // Sunset
  ["#e0c3fc", "#8ec5fc"], // Lavender
  ["#f093fb", "#f5576c"], // Red/Pink
  ["#4facfe", "#00f2fe"], // Blue
  ["#43e97b", "#38f9d7"], // Green
  ["#FF6B6B", "#FFD166"], // Orange/Red
  ["#a8edea", "#fed6e3"], // Pastel
  ["#c471ed", "#f64f59"], // Violet/Red
  ["#00c6fb", "#005bea"], // Deep Blue
  ["#f83600", "#f9d423"], // Sunset Orange/Yellow
  ["#6a11cb", "#2575fc"], // Royal Purple/Blue
  ["#FF5F6D", "#FFC371"], // Peach/Pink
  ["#20bf55", "#01baef"], // Green/Blue
] as const;

export default function ProfileScreen() {
  const router = useRouter();
  const auth = getAuth();
  const db = getFirestore();
  const user = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [stats, setStats] = useState({ wins: 0, totalGames: 0, score: 0 });
  const [activeTab, setActiveTab] = useState<"profile" | "settings">("profile");
  const [selectedGradientIndex, setSelectedGradientIndex] = useState(-1);
  const [nameError, setNameError] = useState("");

  const currentAppVersion = Constants.expoConfig?.version || "1.0.0";

  // Deterministic gradient based on UID
  const getDefaultGradientIndex = (uid: string | undefined) => {
    if (!uid) return 0;
    let hash = 0;
    for (let i = 0; i < uid.length; i++) {
      hash = uid.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % AVATAR_GRADIENTS.length;
  };

  const currentGradientIndex =
    selectedGradientIndex >= 0 &&
    selectedGradientIndex < AVATAR_GRADIENTS.length
      ? selectedGradientIndex
      : getDefaultGradientIndex(user?.uid);

  // REAL-TIME SYNC: Listen to user document changes
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Set up a real-time listener for the user's document in Firestore
    const userDocRef = doc(db, "users", user.uid);

    const unsubscribe = onSnapshot(
      userDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setStats({
            wins: data.wins || 0,
            totalGames: data.totalGames || 0,
            score: data.totalScore || 0,
          });
          if (data.avatarGradientIndex !== undefined) {
            setSelectedGradientIndex(data.avatarGradientIndex);
          }
          // Sync display name if it changed elsewhere
          if (
            data.displayName &&
            data.displayName !== displayName &&
            !updating
          ) {
            setDisplayName(data.displayName);
          }
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to user data:", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  const handleGradientSelect = async (index: number) => {
    setSelectedGradientIndex(index);
    if (user) {
      await updateDoc(doc(db, "users", user.uid), {
        avatarGradientIndex: index,
      });
    }
  };

  const handleUpdateProfile = async () => {
    setNameError("");
    if (!user || !displayName.trim()) return;
    setUpdating(true);
    try {
      const newName = displayName.trim();

      // Check for uniqueness
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("displayName", "==", newName));
      const querySnapshot = await getDocs(q);

      if (
        !querySnapshot.empty &&
        querySnapshot.docs.some((d) => d.id !== user.uid)
      ) {
        setNameError("This username is already taken.");
        setUpdating(false);
        return;
      }

      await updateProfile(user, { displayName: newName });
      await updateDoc(doc(db, "users", user.uid), { displayName: newName });
      Alert.alert("Success", "Profile updated successfully!");
    } catch (error) {
      Alert.alert("Error", "Failed to update profile.");
    } finally {
      setUpdating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/auth/login");
    } catch (error) {
      Alert.alert("Error", "Failed to sign out.");
    }
  };

  const checkForUpdates = async () => {
    setCheckingUpdate(true);
    try {
      const response = await fetch(
        `${UPDATE_JSON_URL}?cache_bust=${Date.now()}`,
        {
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
            Expires: "0",
          },
        },
      );

      const data = await response.json();
      const remoteVersion = data.version;
      const apkUrl = data.apkUrl;

      if (remoteVersion !== currentAppVersion) {
        Alert.alert(
          "Update Available",
          `A new version (${remoteVersion}) is available.\n\nWould you like to download the latest APK?`,
          [
            { text: "Later", style: "cancel" },
            { text: "Download Now", onPress: () => Linking.openURL(apkUrl) },
          ],
        );
      } else {
        Alert.alert(
          "Up to Date",
          `You are running the latest version (${currentAppVersion}).`,
        );
      }
    } catch (error) {
      Alert.alert("Error", "Could not check for updates.");
    } finally {
      setCheckingUpdate(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* RESTORED BACKGROUND: Using blurRadius directly on Image for reliability */}
      <Image
        source={require("../assets/images/profile.jpeg")}
        style={styles.backgroundImage}
        blurRadius={20}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "rgba(0, 0, 0, 0)" },
        ]}
      />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={28} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profileHeader}>
            <LinearGradient
              colors={AVATAR_GRADIENTS[currentGradientIndex]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarContainer}
            >
              <Text style={styles.avatarText}>
                {user?.displayName?.charAt(0).toUpperCase() ||
                  user?.email?.charAt(0).toUpperCase()}
              </Text>
            </LinearGradient>
            <Text style={styles.userName}>{user?.displayName || "User"}</Text>
            <Text style={styles.userEmail}>
              {user?.email || "Guest Account"}
            </Text>
          </View>

          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === "profile" && styles.activeTab]}
              onPress={() => setActiveTab("profile")}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "profile" && styles.activeTabText,
                ]}
              >
                Stats
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "settings" && styles.activeTab]}
              onPress={() => setActiveTab("settings")}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "settings" && styles.activeTabText,
                ]}
              >
                Settings
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === "profile" ? (
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={styles.iconCircle}>
                  <Ionicons name="trophy" size={24} color="#FFD700" />
                </View>
                <Text style={styles.statValue}>{stats.wins}</Text>
                <Text style={styles.statLabel}>Wins</Text>
              </View>
              <View style={styles.statCard}>
                <View style={styles.iconCircle}>
                  <Ionicons name="game-controller" size={24} color="#4ECDC4" />
                </View>
                <Text style={styles.statValue}>{stats.totalGames}</Text>
                <Text style={styles.statLabel}>Played</Text>
              </View>
              <View style={styles.statCard}>
                <View style={styles.iconCircle}>
                  <Ionicons name="star" size={24} color="#FF9F43" />
                </View>
                <Text style={styles.statValue}>{stats.score}</Text>
                <Text style={styles.statLabel}>Total Score</Text>
              </View>
            </View>
          ) : (
            <View style={styles.settingsContainer}>
              <Text style={styles.inputLabel}>Avatar Color</Text>
              <View style={styles.gradientSelector}>
                {AVATAR_GRADIENTS.map((colors, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => handleGradientSelect(index)}
                  >
                    <LinearGradient
                      colors={colors}
                      style={[
                        styles.gradientOption,
                        currentGradientIndex === index &&
                          styles.selectedGradientOption,
                      ]}
                    >
                      {currentGradientIndex === index && (
                        <Ionicons name="checkmark" size={28} color="white" />
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Display Name</Text>
              <View style={styles.inputGroup}>
                <TextInput
                  style={styles.input}
                  value={displayName}
                  onChangeText={(text) => {
                    setDisplayName(text);
                    setNameError("");
                  }}
                  placeholder="Enter name"
                  placeholderTextColor="#999"
                />
                <TouchableOpacity
                  style={[styles.saveButton, { opacity: updating ? 0.7 : 1 }]}
                  onPress={handleUpdateProfile}
                  disabled={updating}
                >
                  {updating ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
              {nameError ? (
                <Text style={styles.errorText}>{nameError}</Text>
              ) : null}

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.settingItem}
                onPress={checkForUpdates}
              >
                <View style={styles.settingInfo}>
                  <Ionicons
                    name="cloud-download-outline"
                    size={22}
                    color="white"
                  />
                  <Text style={styles.settingText}>Software Update</Text>
                </View>
                {checkingUpdate ? (
                  <ActivityIndicator size="small" color="#FF6B6B" />
                ) : (
                  <Text style={styles.versionText}>v{currentAppVersion}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.logoutItem]}
                onPress={handleLogout}
              >
                <View style={styles.settingInfo}>
                  <Ionicons name="log-out-outline" size={22} color="#FF6B6B" />
                  <Text style={[styles.settingText, { color: "#FF6B6B" }]}>
                    Logout
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000a3",
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    resizeMode: "cover",
    opacity: 0.6,
    justifyContent: "center",
    alignItems: "center",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: { width: 40, height: 40, justifyContent: "center" },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "white",
    letterSpacing: 1,
  },
  scrollContent: { paddingBottom: 40 },
  profileHeader: { alignItems: "center", marginTop: 10, marginBottom: 30 },
  avatarContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
    borderWidth: 4,
    borderColor: "rgba(255, 255, 255, 0)",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 5,
  },
  avatarText: { fontSize: 44, fontWeight: "bold", color: "#333" },
  userName: {
    fontSize: 26,
    fontWeight: "bold",
    color: "white",
    marginBottom: 5,
  },
  userEmail: { fontSize: 14, color: "rgba(255, 255, 255, 0.64)" },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.1)",
    marginHorizontal: 25,
    borderRadius: 20,
    padding: 5,
    marginBottom: 25,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 15 },
  activeTab: { backgroundColor: "#ff861c" },
  tabText: {
    color: "rgba(255, 255, 255, 0.71)",
    fontWeight: "700",
    fontSize: 15,
  },
  activeTabText: { color: "#333", fontWeight: "800" },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 25,
  },
  statCard: {
    width: "48%",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  statValue: { fontSize: 24, fontWeight: "800", color: "#eeeeee" },
  statLabel: {
    fontSize: 16,
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
    fontWeight: "600",
  },
  gradientSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 25,
  },
  gradientOption: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  selectedGradientOption: {
    borderWidth: 3,
    borderColor: "white",
    borderRadius: 33,
  },
  settingsContainer: { paddingHorizontal: 25 },
  inputLabel: {
    color: "rgba(255, 255, 255, 0.71)",
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "600",
  },
  inputGroup: {
    marginBottom: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 15,
    padding: 12,
    color: "white",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    width: "73%",
    height: 50,
  },
  saveButton: {
    backgroundColor: "#00ffee",
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: "center",
    shadowColor: "#4ECDC4",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    width: "25%",
    height: 50,
    justifyContent: "center",
    elevation: 10,
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: 14,
    marginTop: -15,
    marginBottom: 15,
    fontWeight: "bold",
  },
  saveButtonText: { color: "#333", fontWeight: "800", fontSize: 16 },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.3)",
    marginVertical: 15,
  },
  settingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  settingInfo: { flexDirection: "row", alignItems: "center" },
  settingText: {
    color: "white",
    fontSize: 16,
    marginLeft: 15,
    fontWeight: "600",
  },
  versionText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    fontWeight: "500",
  },
  logoutItem: {
    marginTop: 5,
    marginBottom: 30,
    backgroundColor: "rgba(255, 107, 107, 0.25)",
    borderRadius: 15,
    paddingHorizontal: 0,
    paddingVertical: 10,
    width: "35%",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF6B6B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 15,
  },
});
