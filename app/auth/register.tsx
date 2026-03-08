import { useRouter } from "expo-router";
import React, { useState } from "react";
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
import { auth, db, firestore } from "../../firebaseConfig";

// Helper function to get user-friendly error messages
const getErrorMessage = (errorCode: string): string => {
  const errorMap: { [key: string]: string } = {
    "auth/email-already-in-use": "Email already registered",
    "auth/invalid-email": "Invalid email address",
    "auth/weak-password": "Password should be at least 6 characters",
    "auth/user-disabled": "Account is disabled",
    "auth/operation-not-allowed": "Operation not allowed",
    "auth/too-many-requests": "Too many attempts. Try again later",
    "permission-denied":
      "Account created, but profile write was blocked by Firestore rules.",
    unavailable: "Firebase service unavailable. Try again in a moment.",
  };
  return errorMap[errorCode] || "Registration failed. Please try again";
};

export default function Register() {
  const router = useRouter();
  const { showToast, playSound } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleRegister = async () => {
    if (!email || !password || !username) {
      showToast({ message: "Please fill in all fields", type: "error" });
      return;
    }

    setLoading(true);
    try {
      // 1. Create Auth User
      const userCredential = await auth.createUserWithEmailAndPassword(
        email,
        password,
      );
      const user = userCredential.user;

      // 2. Create Firestore User Profile
      await db.collection("users").doc(user.uid).set({
        username: username,
        email: email,
        createdAt: firestore.FieldValue.serverTimestamp(),
        friends: [],
      });

      // 3. Update Auth Profile (for quicker access)
      await user.updateProfile({ displayName: username });

      // 4. Go to Lobby
      router.replace("/");
    } catch (error: any) {
      const errorCode = error?.code || "unknown-error";
      const friendlyMessage = getErrorMessage(errorCode);
      showToast({
        message: `${friendlyMessage} (${errorCode})`,
        type: "error",
      });
      console.error("Registration error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require("../../assets/images/register.jpeg")}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <View style={styles.containerTransparent}>
        <Text style={styles.title}>Create Account</Text>

        <TextInput
          style={styles.input}
          placeholder="Username (e.g., DrawingMaster)"
          placeholderTextColor={"#999"}
          value={username}
          onChangeText={setUsername}
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
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

        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            handleRegister();
          }}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign Up</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            playSound(require("../../assets/sounds/click.mp3"));
            router.push("/auth/login");
          }}
        >
          <Text style={styles.linkText}>
            Already have an account?
            <Text
              style={{ color: "#ffeeb0", fontWeight: "bold" }}
              onPress={() => {
                router.replace("/auth/login");
              }}
            >
              {" "}
              Sign In
            </Text>{" "}
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
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 30,
    textAlign: "center",
    textTransform: "uppercase",
    opacity: 1,
  },
  input: {
    backgroundColor: "white",
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
    backgroundColor: "white",
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
  button: {
    backgroundColor: "#333",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
    width: "35%",
  },
  buttonText: { color: "white", fontWeight: "bold", fontSize: 16 },
  linkText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
    textAlign: "center",
    alignSelf: "flex-start",
    marginTop: 20,
  },
});
