import AnimatedPreloader from "@/components/animatedPreloader";
import { FirebaseAuthTypes } from "@react-native-firebase/auth";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, AppState, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "../context/ToastContext";
import { auth, db } from "../firebaseConfig";

export default function RootLayout() {
  const [authInitialized, setAuthInitialized] = useState(false);
  const [splashAnimationFinished, setSplashAnimationFinished] = useState(false);
  const [splashMounted, setSplashMounted] = useState(true);
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const router = useRouter();
  const segments = useSegments();
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const initializing = !authInitialized || !splashAnimationFinished;

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
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

    let userRef: any;
    let intervalId: NodeJS.Timeout;
    let subscription: any;

    const initializeStatusTracker = async () => {
      // Determine which collection the user belongs to
      try {
        const usersDocSnap = await db.collection("users").doc(user.uid).get();
        const collectionName = usersDocSnap.exists ? "users" : "guestUsers";
        userRef = db.collection(collectionName).doc(user.uid);
      } catch (e) {
        // Default to users collection
        userRef = db.collection("users").doc(user.uid);
      }

      const setOnline = async () => {
        try {
          await userRef.update({
            isOnline: true,
            lastSeen: Date.now(),
          });
        } catch (e) {
          // ignore - document might not exist yet
        }
      };

      const setOffline = async () => {
        try {
          await userRef.update({
            isOnline: false,
            lastSeen: Date.now(),
          });
        } catch (e) {
          // ignore
        }
      };

      setOnline();
      intervalId = setInterval(setOnline, 30000); // Heartbeat every 30s

      subscription = AppState.addEventListener("change", (nextAppState) => {
        if (nextAppState === "active") {
          setOnline();
        } else if (nextAppState === "background") {
          setOffline();
        }
      });
    };

    initializeStatusTracker();

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (subscription) subscription.remove();

      // Set offline on unmount
      if (userRef) {
        userRef
          .update({
            isOnline: false,
            lastSeen: Date.now(),
          })
          .catch(() => {});
      }
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
            <Stack.Screen name="pages/profile" />
            <Stack.Screen name="pages/friends" />
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
