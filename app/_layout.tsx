import AnimatedPreloader from "@/components/animatedPreloader";
import { Stack, useRouter, useSegments } from "expo-router";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { Animated, AppState, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "../context/ToastContext";
import { auth, db } from "../firebaseConfig";

export default function RootLayout() {
  const [authInitialized, setAuthInitialized] = useState(false);
  const [splashAnimationFinished, setSplashAnimationFinished] = useState(false);
  const [splashMounted, setSplashMounted] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const segments = useSegments();
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const initializing = !authInitialized || !splashAnimationFinished;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthInitialized(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSplashAnimationFinished(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!initializing) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => setSplashMounted(false));
    }
  }, [initializing]);

  // Auth Guard
  useEffect(() => {
    if (initializing) return;

    const inAuthGroup = segments[0] === "auth";

    if (user && inAuthGroup) {
      router.replace("/");
    }
  }, [user, initializing, segments]);

  // Online Status Tracker
  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, "users", user.uid);

    const setOnline = async () => {
      try {
        await updateDoc(userRef, {
          isOnline: true,
          lastSeen: Date.now(),
        });
      } catch (e) {
        // ignore
      }
    };

    const setOffline = async () => {
      try {
        await updateDoc(userRef, {
          isOnline: false,
          lastSeen: Date.now(),
        });
      } catch (e) {}
    };

    setOnline();
    const interval = setInterval(setOnline, 30000); // Heartbeat 30s

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        setOnline();
      } else if (nextAppState === "background") {
        setOffline();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
      setOffline();
    };
  }, [user]);

  return (
    <ToastProvider>
      <SafeAreaProvider>
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="auth/login" />
            <Stack.Screen name="auth/register" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="friends" />
            <Stack.Screen name="game/[id]" />
          </Stack>
          {splashMounted && (
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                { opacity: fadeAnim, zIndex: 9999, backgroundColor: "#fff" },
              ]}
            >
              <AnimatedPreloader />
            </Animated.View>
          )}
        </View>
      </SafeAreaProvider>
    </ToastProvider>
  );
}
