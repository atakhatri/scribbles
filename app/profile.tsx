import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as IntentLauncher from "expo-intent-launcher";
import { useRouter } from "expo-router";
import { onAuthStateChanged, signOut, updateProfile } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadString,
} from "firebase/storage";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  ImageBackground,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
// Import from your local configuration file
import { auth, db } from "../firebaseConfig";

// ---------------------------------------------------------
// 🚨 IMPORTANT: INSTALL DEPENDENCIES
// Run this in your terminal to ensure these packages are installed:
// npx expo install expo-file-system expo-intent-launcher expo-constants expo-image-picker
// ---------------------------------------------------------

const { width } = Dimensions.get("window");

// --- Configuration ---
// REPLACE with your actual version JSON URL
const UPDATE_JSON_URL =
  "https://gist.githubusercontent.com/atakhatri/14928794d017d4b66a845d2afb58f487/raw/version.json";

export default function Profile() {
  const router = useRouter();

  // Auth State
  const [user, setUser] = useState(auth.currentUser);

  // UI State
  const [showSettings, setShowSettings] = useState(false);
  const [avatar, setAvatar] = useState(user?.photoURL || null);

  // Update & Download State
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isChecking, setIsChecking] = useState(false);

  // Animation
  const slideAnim = useRef(new Animated.Value(width)).current;

  // --- Auth Listener ---
  useEffect(() => {
    // Listen for auth state changes to ensure we have the user object
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser?.photoURL) {
        setAvatar(currentUser.photoURL);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: showSettings ? 0 : width,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showSettings]);

  // --- Avatar Logic ---
  const handlePickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled && result.assets[0].uri) {
        await uploadAvatar(result.assets[0].uri);
      }
    } catch (e) {
      console.error("Image Picker Error:", e);
      Alert.alert("Error", "Could not pick image.");
    }
  };

  const uploadAvatar = async (uri: string) => {
    if (!user) return;
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64",
      });

      // Get storage instance (uses default app initialized in firebaseConfig)
      const storage = getStorage();
      const storageRef = ref(storage, `avatars/${user.uid}_${Date.now()}`);

      await uploadString(storageRef, base64, "base64");
      const downloadURL = await getDownloadURL(storageRef);

      await updateProfile(user, { photoURL: downloadURL });

      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        avatarUrl: downloadURL,
        photoURL: downloadURL,
      });

      setAvatar(downloadURL);
      Alert.alert("Success", "Avatar updated!");
    } catch (error) {
      console.error("Avatar Upload Error:", error);
      Alert.alert("Error", "Failed to upload avatar.");
    }
  };

  // --- Update Logic ---
  const handleCheckUpdate = async () => {
    if (Platform.OS !== "android") {
      Alert.alert(
        "Not Supported",
        "In-app APK updates are currently only supported on Android.",
      );
      return;
    }

    // Check for Expo Go
    if (Constants.appOwnership === "expo") {
      Alert.alert(
        "Development Mode",
        "APK updates cannot be tested in Expo Go. Please use a standalone build.",
      );
      return;
    }

    setIsChecking(true);
    try {
      const res = await fetch(UPDATE_JSON_URL, {
        headers: { "Cache-Control": "no-cache" },
      });

      if (!res.ok) throw new Error("Failed to fetch version info");

      const data = await res.json();

      // Get current version safely
      const currentVersion = Constants.expoConfig?.version || "1.0.0";

      if (data.version && data.version !== currentVersion) {
        Alert.alert(
          "Update Available",
          `Version ${data.version} is available. Download now?`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Update",
              onPress: () => downloadAndInstall(data.apkUrl),
            },
          ],
        );
      } else {
        Alert.alert("Up to date", "You are using the latest version.");
      }
    } catch (e) {
      console.error(e);
      Alert.alert(
        "Error",
        "Failed to check for updates. Please try again later.",
      );
    } finally {
      setIsChecking(false);
    }
  };

  const downloadAndInstall = async (url: string) => {
    if (!url) {
      Alert.alert("Error", "Invalid update URL.");
      return;
    }

    setIsDownloading(true);
    setDownloadProgress(0);

    // FIX: Using 'any' type to bypass TypeScript version mismatch errors for DownloadProgressData
    const callback = (downloadProgress: any) => {
      if (downloadProgress.totalBytesExpectedToWrite === 0) return;
      const progress =
        downloadProgress.totalBytesWritten /
        downloadProgress.totalBytesExpectedToWrite;
      setDownloadProgress(progress);
    };

    // FIX: Casting FileSystem to 'any' to safely access documentDirectory if types are missing
    const docDir = (FileSystem as any).documentDirectory;

    if (!docDir) {
      Alert.alert("Error", "Device storage unavailable.");
      setIsDownloading(false);
      return;
    }

    const downloadResumable = FileSystem.createDownloadResumable(
      url,
      docDir + "update.apk",
      {},
      callback,
    );

    try {
      const result = await downloadResumable.downloadAsync();

      if (result?.uri) {
        const contentUri = await FileSystem.getContentUriAsync(result.uri);

        await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
          data: contentUri,
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
          type: "application/vnd.android.package-archive",
        });
      }
    } catch (e) {
      console.error("Download/Install Error:", e);
      Alert.alert(
        "Error",
        "Download or installation failed. Please check permissions.",
      );
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.replace("/");
    } catch (error) {
      Alert.alert("Error", "Failed to sign out");
    }
  };

  // Render Logic
  const getInitials = (name: string | null | undefined) => {
    return name ? name.charAt(0).toUpperCase() : "?";
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
          <TouchableOpacity onPress={handlePickAvatar} style={styles.avatar}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>
                {getInitials(user?.displayName)}
              </Text>
            )}
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={14} color="white" />
            </View>
          </TouchableOpacity>

          <Text style={styles.username}>
            {user?.displayName || "Anonymous Player"}
          </Text>
          <Text style={styles.email}>{user?.email || "No email linked"}</Text>

          <View style={styles.divider} />

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

          {/* Update Button Logic */}
          {isDownloading ? (
            <View style={styles.downloadContainer}>
              <Text style={styles.downloadText}>
                Downloading: {Math.round(downloadProgress * 100)}%
              </Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${downloadProgress * 100}%` },
                  ]}
                />
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleCheckUpdate}
              disabled={isChecking}
            >
              {isChecking ? (
                <ActivityIndicator size="small" color="#333" />
              ) : (
                <Ionicons
                  name="cloud-download-outline"
                  size={24}
                  color="#333"
                />
              )}
              <Text style={[styles.menuItemText, { color: "#333" }]}>
                {isChecking ? "Checking..." : "Check for Updates"}
              </Text>
            </TouchableOpacity>
          )}

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
    backgroundColor: "rgba(255, 255, 255, 0.5)",
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
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    position: "relative",
    borderWidth: 3,
    borderColor: "white",
    boxShadow: "0px 2px 4px rgba(0,0,0,0.3)",
    elevation: 5,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 50,
  },
  avatarText: { fontSize: 40, fontWeight: "bold", color: "#fffdf6ff" },
  editBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#4F46E5",
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
  },
  username: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
  },
  email: {
    fontSize: 20,
    fontWeight: "400",
    color: "black",
    marginBottom: 20,
    textAlign: "center",
  },
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
    backgroundColor: "#e0e0e0",
    zIndex: 20,
    padding: 20,
    paddingTop: 60,
    boxShadow: "-2px 0px 5px rgba(0,0,0,0.2)",
    elevation: 5,
  },
  settingsTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 15,
  },
  menuItemText: {
    fontSize: 16,
    color: "#333",
    fontWeight: "600",
  },
  downloadContainer: {
    paddingVertical: 15,
  },
  downloadText: {
    color: "#333",
    marginBottom: 5,
    fontWeight: "600",
    fontSize: 14,
  },
  progressBar: {
    height: 8,
    backgroundColor: "#999",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#4F46E5",
  },
});
