import Preloader from "@/components/preloader";
import { useToast } from "@/context/ToastContext";
import GRADIENTS from "@/data/gradients";
import { cleanupGuestAccount } from "@/utils/guestAuth";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system";
import * as IntentLauncher from "expo-intent-launcher";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { deleteUser, getAuth, signOut, updateProfile } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

const UPDATE_JSON_URL =
  "https://gist.githubusercontent.com/atakhatri/14928794d017d4b66a845d2afb58f487/raw/version.json";

const AVATAR_GRADIENTS = GRADIENTS;

export default function ProfileScreen() {
  const router = useRouter();
  const auth = getAuth();
  const db = getFirestore();
  const user = auth.currentUser;
  const { showToast, showAlert, playSound } = useToast();
  const { width } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [stats, setStats] = useState({ wins: 0, totalGames: 0, score: 0 });
  const [recentGames, setRecentGames] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"profile" | "settings">("profile");
  const [selectedGradientIndex, setSelectedGradientIndex] = useState(-1);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const winRateAnim = useRef(new Animated.Value(0)).current;
  const tabAnim = useRef(new Animated.Value(0)).current;

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
    // Check if user is a guest by checking both collections
    const checkUserCollection = async () => {
      // First try users collection
      let userDocRef = doc(db, "users", user.uid);
      let docSnap = await getDoc(userDocRef);

      if (!docSnap.exists()) {
        // Try guestUsers collection
        userDocRef = doc(db, "guestUsers", user.uid);
        docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
          setIsGuest(true);
        }
      } else {
        setIsGuest(false);
      }

      return userDocRef;
    };

    let unsubscribe: (() => void) | undefined;

    checkUserCollection().then((userDocRef) => {
      unsubscribe = onSnapshot(
        userDocRef,
        async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setStats({
              wins: data.wins || 0,
              totalGames: data.totalGames || 0,
              score: data.totalScore || 0,
            });

            // Fetch recent games based on references in user doc
            const recentGameRefs = data.recentGames || [];
            if (recentGameRefs.length > 0) {
              const gameIds = recentGameRefs.map((ref: any) => ref.gameId);
              const gamesRef = collection(db, "games");
              const q = query(gamesRef, where("__name__", "in", gameIds));
              const gamesSnap = await getDocs(q);
              const gamesData = gamesSnap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
              }));
              // Sort games based on the order in the user's recentGames array
              const sortedGames = gameIds
                .map((id: string) => gamesData.find((game) => game.id === id))
                .filter(Boolean); // Filter out any games that might have been deleted
              setRecentGames(sortedGames);
            } else {
              setRecentGames([]);
            }

            if (data.avatarGradientIndex !== undefined) {
              setSelectedGradientIndex(data.avatarGradientIndex);
            }
            // Sync display name if it changed elsewhere
            if (
              (data.username || data.displayName) &&
              (data.username || data.displayName) !== displayName &&
              !updating
            ) {
              setDisplayName(data.username || data.displayName);
            }
          }
          setLoading(false);
        },
        (error) => {
          console.error("Error listening to user data:", error);
          setLoading(false);
        },
      );
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  // Animate Win Rate
  useEffect(() => {
    const target =
      stats.totalGames > 0 ? (stats.wins / stats.totalGames) * 100 : 0;
    Animated.timing(winRateAnim, {
      toValue: target,
      duration: 1500,
      easing: Easing.out(Easing.exp),
      useNativeDriver: false,
    }).start();
  }, [stats]);

  const handleTabChange = (tab: "profile" | "settings") => {
    setActiveTab(tab);
    playSound(require("../../assets/sounds/lock.mp3"));
    Animated.spring(tabAnim, {
      toValue: tab === "profile" ? 0 : 1,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  };

  const handleGradientSelect = async (index: number) => {
    playSound(require("../../assets/sounds/lock.mp3"));
    setSelectedGradientIndex(index);
    if (user) {
      const collection = isGuest ? "guestUsers" : "users";
      await updateDoc(doc(db, collection, user.uid), {
        avatarGradientIndex: index,
      });
    }
  };

  const handleUpdateProfile = async () => {
    const newName = displayName.trim();
    if (!user || !newName) return;

    if (newName === user.displayName) return;

    setUpdating(true);
    try {
      // Check uniqueness across both users and guestUsers collections
      const usersRef = collection(db, "users");
      const guestUsersRef = collection(db, "guestUsers");
      const lowerName = newName.toLowerCase();

      // Check against usernameLower (case-insensitive) and username (exact legacy) in both collections
      const qUsersLower = query(
        usersRef,
        where("usernameLower", "==", lowerName),
      );
      const qUsersExact = query(usersRef, where("username", "==", newName));
      const qGuestUsersLower = query(
        guestUsersRef,
        where("usernameLower", "==", lowerName),
      );
      const qGuestUsersExact = query(
        guestUsersRef,
        where("username", "==", newName),
      );

      const [
        snapUsersLower,
        snapUsersExact,
        snapGuestUsersLower,
        snapGuestUsersExact,
      ] = await Promise.all([
        getDocs(qUsersLower),
        getDocs(qUsersExact),
        getDocs(qGuestUsersLower),
        getDocs(qGuestUsersExact),
      ]);

      const isTaken =
        snapUsersLower.docs.some((d) => d.id !== user.uid) ||
        snapUsersExact.docs.some((d) => d.id !== user.uid) ||
        snapGuestUsersLower.docs.some((d) => d.id !== user.uid) ||
        snapGuestUsersExact.docs.some((d) => d.id !== user.uid);

      if (isTaken) {
        showToast({
          message: "This display name is already taken.",
          type: "error",
        });
        setUpdating(false);
        return;
      }

      await updateProfile(user, { displayName: newName });

      const collectionName = isGuest ? "guestUsers" : "users";
      await updateDoc(doc(db, collectionName, user.uid), {
        displayName: newName,
        username: newName,
        usernameLower: lowerName,
      });
      showToast({ message: "Profile updated successfully!", type: "success" });
    } catch (error) {
      showToast({ message: "Failed to update profile.", type: "error" });
    } finally {
      setUpdating(false);
    }
  };

  const handleLogout = async () => {
    setShowLogoutModal(true);
    playSound(require("../../assets/sounds/lock.mp3"));
  };

  const confirmLogout = async () => {
    try {
      if (isGuest && user) {
        // For guest users: cleanup their account completely
        await cleanupGuestAccount(user.uid);
        // Delete the auth account
        await deleteUser(user);
        router.replace("/");
      } else {
        // For regular users: just sign out
        await signOut(auth);
        router.replace("/auth/login");
      }
    } catch (error) {
      console.error("Logout error:", error);
      showToast({ message: "Failed to sign out.", type: "error" });
    }
  };

  const handleDownloadAndInstall = async (url: string) => {
    if (Platform.OS === "android") {
      try {
        setIsDownloading(true);
        setDownloadProgress(0);

        const downloadResumable = FileSystem.createDownloadResumable(
          url,
          ((FileSystem as any).documentDirectory ?? "") + "update.apk",
          {},
          (progress) => {
            const p =
              progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
            setDownloadProgress(p);
          },
        );
        const downloadRes = await downloadResumable.downloadAsync();

        setIsDownloading(false);

        if (!downloadRes || !downloadRes.uri)
          throw new Error("Download failed");

        const contentUri = await FileSystem.getContentUriAsync(downloadRes.uri);
        await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
          data: contentUri,
          flags: 1,
          type: "application/vnd.android.package-archive",
        });

        // Delete the APK file after a short delay to save space
        // (Giving the package installer time to read the file)
        setTimeout(async () => {
          try {
            await FileSystem.deleteAsync(downloadRes.uri, { idempotent: true });
          } catch (e) {}
        }, 10000);
      } catch (e) {
        setIsDownloading(false);
        Linking.openURL(url);
      }
    } else {
      Linking.openURL(url);
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
        playSound(require("../../assets/sounds/pop.mp3"));
        showAlert({
          title: "Update Available",
          message: `A new version (${remoteVersion}) is available.\n\nWould you like to download the latest APK?`,
          buttons: [
            { text: "Later", style: "cancel" },
            {
              text: "Download Now",
              onPress: () => handleDownloadAndInstall(apkUrl),
            },
          ],
        });
      } else {
        showToast({
          message: `You are running the latest version (${currentAppVersion}).`,
          type: "success",
        });
      }
    } catch (error) {
      showToast({ message: "Could not check for updates.", type: "error" });
    } finally {
      setCheckingUpdate(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Preloader />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* RESTORED BACKGROUND: Using blurRadius directly on Image for reliability */}
      <Image
        source={require("../../assets/images/profile.jpeg")}
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
          onPress={() => {
            router.back();
            playSound(require("../../assets/sounds/lock.mp3"));
          }}
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

          {isGuest && (
            <View style={styles.guestWarningBanner}>
              <Ionicons name="warning" size={20} color="#ff9800" />
              <Text style={styles.guestWarningText}>
                Guest Account: Create a permanent account to keep your progress!
              </Text>
            </View>
          )}

          <View style={styles.tabContainer}>
            <Animated.View
              style={[
                styles.activeTabIndicator,
                {
                  left: tabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", "50%"],
                  }),
                },
              ]}
            >
              <View style={styles.activeTabInner} />
            </Animated.View>
            <TouchableOpacity
              style={styles.tab}
              onPress={() => handleTabChange("profile")}
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
              style={styles.tab}
              onPress={() => handleTabChange("settings")}
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

          <View style={{ overflow: "hidden" }}>
            <Animated.View
              style={{
                flexDirection: "row",
                width: width * 2,
                transform: [
                  {
                    translateX: tabAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -width],
                    }),
                  },
                ],
              }}
            >
              <View style={{ width }}>
                <View style={styles.statsContainer}>
                  {/* Hero Stat: Total Score */}
                  <LinearGradient
                    colors={["#6a11cb", "#2575fc"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.heroStatCard}
                  >
                    <View>
                      <Text style={styles.heroStatLabel}>Total Score</Text>
                      <Text style={styles.heroStatValue}>{stats.score}</Text>
                    </View>
                    <Ionicons
                      name="ribbon"
                      size={80}
                      color="rgba(255,255,255,0.2)"
                      style={styles.heroStatIcon}
                    />
                  </LinearGradient>

                  <View style={styles.subStatsRow}>
                    {/* Wins */}
                    <LinearGradient
                      colors={["#f093fb", "#f5576c"]}
                      style={styles.subStatCard}
                    >
                      <View style={styles.subStatHeader}>
                        <Ionicons name="trophy" size={24} color="white" />
                        <Text style={styles.subStatLabel}>Wins</Text>
                      </View>
                      <Text style={styles.subStatValue}>{stats.wins}</Text>
                    </LinearGradient>

                    {/* Games Played */}
                    <LinearGradient
                      colors={["#4facfe", "#00f2fe"]}
                      style={styles.subStatCard}
                    >
                      <View style={styles.subStatHeader}>
                        <Ionicons
                          name="game-controller"
                          size={24}
                          color="white"
                        />
                        <Text style={styles.subStatLabel}>Played</Text>
                      </View>
                      <Text style={styles.subStatValue}>
                        {stats.totalGames}
                      </Text>
                    </LinearGradient>
                  </View>
                  {/* Win Rate Bar */}
                  <View style={styles.winRateContainer}>
                    <View style={styles.winRateHeader}>
                      <Text style={styles.winRateLabel}>Win Rate</Text>
                      <Text style={styles.winRatePercent}>
                        {stats.totalGames > 0
                          ? Math.round((stats.wins / stats.totalGames) * 100)
                          : 0}
                        %
                      </Text>
                    </View>
                    <View style={styles.progressBarBg}>
                      <Animated.View
                        style={[
                          styles.progressBarFill,
                          {
                            width: winRateAnim.interpolate({
                              inputRange: [0, 100],
                              outputRange: ["0%", "100%"],
                            }),
                          },
                        ]}
                      >
                        <LinearGradient
                          colors={["#43e97b", "#38f9d7"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={{ flex: 1 }}
                        />
                      </Animated.View>
                    </View>
                  </View>

                  {/* Recent Games List */}
                  <View style={styles.recentGamesContainer}>
                    <Text style={styles.sectionTitle}>Recent Games</Text>
                    {recentGames.length === 0 ? (
                      <Text style={styles.emptyText}>No games played yet.</Text>
                    ) : (
                      recentGames.map((game) => {
                        const myScore = game.scores?.[user?.uid || ""] || 0;
                        const allScores = Object.values(game.scores || {});
                        const maxScore =
                          allScores.length > 0
                            ? Math.max(...(allScores as number[]))
                            : 0;
                        const isWinner = myScore > 0 && myScore === maxScore;

                        return (
                          <View key={game.id} style={styles.gameRow}>
                            <View style={styles.gameIcon}>
                              <Ionicons
                                name="game-controller-outline"
                                size={20}
                                color="#fff"
                              />
                            </View>
                            <View style={styles.gameInfo}>
                              <Text style={styles.gameId}>
                                {game.id.substring(0, 4)}
                              </Text>
                              <Text style={styles.gameDate}>
                                {game.createdAt
                                  ? new Date(
                                      game.createdAt,
                                    ).toLocaleDateString()
                                  : "--/--/----"}
                              </Text>
                            </View>
                            <View style={styles.gameScore}>
                              {isWinner && (
                                <Ionicons
                                  name="trophy"
                                  size={16}
                                  color="#FFD700"
                                />
                              )}
                              <Text style={styles.scoreValue}>
                                {myScore} pts
                              </Text>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                </View>
              </View>
              <View style={{ width }}>
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
                            <Ionicons
                              name="checkmark"
                              size={28}
                              color="white"
                            />
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
                      onChangeText={setDisplayName}
                      placeholder="Enter name"
                      placeholderTextColor="#999"
                    />
                    <TouchableOpacity
                      style={[
                        styles.saveButton,
                        { opacity: updating ? 0.7 : 1 },
                      ]}
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
                      <Text style={styles.settingText}>Check for Updates</Text>
                    </View>
                    {checkingUpdate ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.versionText}>
                        v{currentAppVersion}
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.logoutItem]}
                    onPress={handleLogout}
                  >
                    <View style={styles.settingInfo}>
                      <Ionicons
                        name="log-out-outline"
                        size={22}
                        color="#ff0000"
                      />
                      <Text style={[styles.settingText, { color: "#ff0000" }]}>
                        Logout
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Download Progress Modal */}
      <Modal visible={isDownloading} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Downloading Update...</Text>
            <View style={styles.progressBarContainer}>
              <View
                style={[
                  styles.progressBar,
                  { width: `${downloadProgress * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {Math.round(downloadProgress * 100)}%
            </Text>
          </View>
        </View>
      </Modal>

      {/* Logout Confirmation Modal */}
      <Modal visible={showLogoutModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Log Out?</Text>
            <Text style={styles.modalSubtitle}>
              Are you sure you want to sign out?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => {
                  setShowLogoutModal(false);
                }}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  confirmLogout();
                  playSound(require("../../assets/sounds/intro.mp3"));
                }}
                style={styles.confirmBtn}
              >
                <Text style={styles.confirmText}>Log Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    fontSize: 20,
    fontWeight: "900",
    color: "white",
    letterSpacing: 1,
    textTransform: "uppercase",
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
  guestWarningBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 152, 0, 0.2)",
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#ff9800",
    gap: 10,
  },
  guestWarningText: {
    flex: 1,
    color: "#ff9800",
    fontSize: 12,
    fontWeight: "600",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.1)",
    marginHorizontal: 25,
    borderRadius: 20,
    marginBottom: 25,
    position: "relative",
    height: 54,
  },
  activeTabIndicator: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "50%",
  },
  activeTabInner: {
    flex: 1,
    backgroundColor: "#ff861c",
    borderRadius: 15,
    margin: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  tab: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 15,
    zIndex: 1,
  },
  tabText: {
    color: "rgba(255, 255, 255, 0.71)",
    fontWeight: "700",
    fontSize: 15,
  },
  activeTabText: { color: "#333", fontWeight: "800" },
  statsContainer: {
    paddingHorizontal: 25,
  },
  heroStatCard: {
    width: "100%",
    borderRadius: 25,
    padding: 25,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#6a11cb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  heroStatLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 5,
  },
  heroStatValue: {
    color: "white",
    fontSize: 42,
    fontWeight: "bold",
  },
  heroStatIcon: {
    position: "absolute",
    right: -15,
    bottom: -15,
    transform: [{ rotate: "15deg" }],
  },
  subStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  subStatCard: {
    width: "48%",
    borderRadius: 20,
    padding: 15,
    height: 110,
    justifyContent: "space-between",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  subStatHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  subStatLabel: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  subStatValue: {
    color: "white",
    fontSize: 28,
    fontWeight: "bold",
  },
  winRateContainer: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 15,
  },
  winRateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  winRateLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    fontWeight: "600",
  },
  winRatePercent: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  progressBarBg: {
    height: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
    overflow: "hidden",
  },
  recentGamesContainer: {
    marginTop: 25,
    marginBottom: 20,
  },
  sectionTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
  },
  gameRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: 15,
    borderRadius: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  gameIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  gameInfo: { flex: 1 },
  gameId: { color: "white", fontWeight: "bold", fontSize: 16 },
  gameDate: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 2 },
  gameScore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "flex-end",
  },
  scoreValue: { color: "#43e97b", fontWeight: "bold", fontSize: 16 },
  emptyText: {
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
    fontStyle: "italic",
    marginTop: 10,
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
    backgroundColor: "rgba(255, 20, 20, 0.2)",
    borderRadius: 15,
    paddingHorizontal: 0,
    paddingVertical: 10,
    width: "35%",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF6B6B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    width: "80%",
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 20,
    textAlign: "center",
    fontWeight: "600",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 15,
    width: "100%",
  },
  cancelBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#ddd",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#333",
  },
  cancelText: { color: "#333", fontWeight: "bold" },
  confirmBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#FF6B6B",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#333",
  },
  confirmText: {
    color: "white",
    fontWeight: "bold",
  },
  progressBarContainer: {
    width: "100%",
    height: 10,
    backgroundColor: "#eee",
    borderRadius: 5,
    overflow: "hidden",
    marginVertical: 10,
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#4ECDC4",
  },
  progressText: {
    color: "#666",
    fontWeight: "600",
  },
});
