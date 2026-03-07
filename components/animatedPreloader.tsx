import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";

export default function AnimatedPreloader() {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    // 1. Initial smooth fade-in and scale up (like Apple's hello screen)
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 20,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // 2. Continuous gentle "breathing" pulse effect
      Animated.loop(
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.05,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    });
  }, []);

  return (
    <View style={styles.container}>
      <Animated.Text style={[styles.text, { opacity, transform: [{ scale }] }]}>
        Scribbles
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a", // Sleek black background
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    color: "#ffdda3",
    fontSize: 56,
    // Using built-in marker/handwritten fonts for the "doodle" aesthetic
    fontFamily: Platform.select({
      ios: "Noteworthy", // Excellent built-in marker font for iOS
      android: "casual", // Built-in handwriting style for Android
      default: "cursive",
    }),
    fontWeight: "bold",
    letterSpacing: 2,
  },
});
