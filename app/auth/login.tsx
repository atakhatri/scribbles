import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useToast } from "../../context/ToastContext";
import { auth, db } from "../../firebaseConfig";

// Helper function to get user-friendly error messages
const getErrorMessage = (errorCode: string): string => {
  const errorMap: { [key: string]: string } = {
    "auth/user-not-found": "Email not found",
    "auth/wrong-password": "Incorrect password",
    "auth/invalid-email": "Invalid email address",
    "auth/user-disabled": "Account is disabled",
    "auth/too-many-requests": "Too many attempts. Try again later",
    "auth/operation-not-allowed": "Operation not allowed",
    "auth/invalid-credential": "Invalid credentials",
    "permission-denied":
      "Permission denied while reading user data. Try logging in with email instead of username.",
    unavailable: "Firebase service unavailable. Try again in a moment.",
  };
  return errorMap[errorCode] || "Login failed. Please try again";
};

export default function Login() {
  const router = useRouter();
  const { showToast, playSound } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Load saved credentials on mount
  useEffect(() => {
    const loadCredentials = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem("savedEmail");
        const savedPassword = await AsyncStorage.getItem("savedPassword");
        const savedRememberMe = await AsyncStorage.getItem("rememberMe");

        if (savedRememberMe === "true" && savedEmail && savedPassword) {
          setEmail(savedEmail);
          setPassword(savedPassword);
          setRememberMe(true);
        }
      } catch (error) {
        console.error("Error loading saved credentials:", error);
      }
    };
    loadCredentials();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      showToast({ message: "Please fill in all fields", type: "error" });
      return;
    }

    setLoading(true);
    try {
      let loginEmail = email.trim().toLowerCase();

      // Check if input is a username (doesn't contain @)
      if (!loginEmail.includes("@")) {
        // Query Firestore to find user by username
        const usersSnapshot = await db
          .collection("users")
          .where("username", "==", loginEmail)
          .limit(1)
          .get();

        if (usersSnapshot.empty) {
          showToast({ message: "Username not found", type: "error" });
          setLoading(false);
          return;
        }

        // Get email from the user document
        const userDoc = usersSnapshot.docs[0];
        loginEmail = userDoc.data().email;
      }

      await auth.signInWithEmailAndPassword(loginEmail, password);

      // Save or clear credentials based on rememberMe
      if (rememberMe) {
        await AsyncStorage.setItem("savedEmail", email.trim());
        await AsyncStorage.setItem("savedPassword", password);
        await AsyncStorage.setItem("rememberMe", "true");
      } else {
        await AsyncStorage.removeItem("savedEmail");
        await AsyncStorage.removeItem("savedPassword");
        await AsyncStorage.removeItem("rememberMe");
      }

      playSound(require("../../assets/sounds/intro.mp3"));
      router.replace("/"); // Go back to Lobby
    } catch (error: any) {
      const errorCode = error?.code || "unknown-error";
      const friendlyMessage = getErrorMessage(errorCode);
      showToast({
        message: `${friendlyMessage} (${errorCode})`,
        type: "error",
      });
      console.error("Login error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require("../../assets/images/login.jpeg")}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <View style={styles.containerTransparent}>
        <Text style={styles.title}>Welcome Back</Text>

        <TextInput
          style={styles.input}
          placeholder="Email or Username"
          placeholderTextColor={"#999"}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          editable={!loading}
        />

        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
            placeholderTextColor={"#999"}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            editable={!loading}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => {
              playSound(require("../../assets/sounds/blink.mp3"));
              setShowPassword(!showPassword);
            }}
          >
            <Text style={styles.eyeIcon}>{showPassword ? "👁" : "👁‍🗨"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.loginRow}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              handleLogin();
              playSound(require("../../assets/sounds/click.mp3"));
            }}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Log In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.rememberMeContainer}
            onPress={() => {
              playSound(require("../../assets/sounds/lock.mp3"));
              setRememberMe(!rememberMe);
            }}
            disabled={loading}
          >
            <View
              style={[styles.checkbox, rememberMe && styles.checkboxChecked]}
            >
              {rememberMe && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.rememberMeText}>Remember Me</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => {
            playSound(require("../../assets/sounds/click.mp3"));
            router.push("/auth/register");
          }}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>
            Don&apos;t have an account?
            <Text style={{ color: "#ffeeb0", fontWeight: "bold" }}>
              {" "}
              Sign Up
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: { flex: 1 },
  containerTransparent: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(255, 255, 255, 0)",
  },
  title: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 30,
    textAlign: "center",
    textTransform: "uppercase",
    opacity: 1,
  },
  input: {
    backgroundColor: "#fff8f2ff",
    borderColor: "#333",
    borderWidth: 2,
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    color: "#000",
    fontSize: 16,
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
    borderRadius: 10,
    overflow: "hidden",
  },
  passwordInput: {
    flex: 1,
    backgroundColor: "#fff8f2ff",
    borderColor: "#333",
    borderWidth: 2,
    padding: 15,
    borderRadius: 10,
    color: "#000",
    fontSize: 16,
  },
  eyeButton: {
    position: "absolute",
    right: 12,
    padding: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  eyeIcon: {
    fontSize: 20,
  },
  loginRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 15,
  },
  button: {
    backgroundColor: "#333",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    minWidth: 100,
  },
  buttonText: { color: "white", fontWeight: "bold", fontSize: 16 },
  rememberMeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: "#333",
    borderRadius: 4,
    backgroundColor: "#fff8f2ff",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#333",
  },
  checkmark: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  rememberMeText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  linkButton: { marginTop: 20, alignItems: "flex-start", marginBottom: 5 },
  linkText: {
    color: "#fff",
    opacity: 1,
    fontSize: 16,
    fontWeight: "bold",
    textDecorationLine: "none",
  },
});
