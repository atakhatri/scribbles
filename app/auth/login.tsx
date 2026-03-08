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
import { auth } from "../../firebaseConfig";

export default function Login() {
  const router = useRouter();
  const { showToast, playSound } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await auth.signInWithEmailAndPassword(email, password);
      playSound(require("../../assets/sounds/intro.mp3"));
      router.replace("/"); // Go back to Lobby
    } catch (error: any) {
      showToast({ message: error.message, type: "error" });
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
          placeholder="Email"
          placeholderTextColor={"#333"}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={"#333"}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={styles.button}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Log In</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push("/auth/register")}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>
            Don't have an account?
            <Text style={{ color: "#ffeeb0", fontWeight: "bold" }}>
              {" "}
              Sign Up
            </Text>
          </Text>
        </TouchableOpacity>

        {/* <TouchableOpacity
          onPress={() => router.back()}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>Cancel</Text>
        </TouchableOpacity> */}
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
  },
  button: {
    backgroundColor: "#333",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
    width: "35%",
    alignSelf: "flex-start",
  },
  buttonText: { color: "white", fontWeight: "bold", fontSize: 16 },
  linkButton: { marginTop: 20, alignItems: "flex-start", marginBottom: 5 },
  linkText: {
    color: "#fff",
    opacity: 1,
    fontSize: 16,
    fontWeight: "bold",
    textDecorationLine: "none",
  },
});
