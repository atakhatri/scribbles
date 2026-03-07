import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  ImageSourcePropType,
  StyleSheet,
  View,
} from "react-native";

const { width, height } = Dimensions.get("window");

interface AnimatedBackgroundProps {
  source: ImageSourcePropType;
  children?: React.ReactNode;
  overlayOpacity?: number; // Adjust this to make the background darker/lighter
}

export default function AnimatedBackground({
  source,
  children,
  overlayOpacity = 0.55, // Default dark overlay so text remains readable
}: AnimatedBackgroundProps) {
  // Animation values
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(1.05)).current;

  useEffect(() => {
    // 1. Slow drifting movement (Panning around subtly)
    const panAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pan, {
          toValue: { x: -18, y: -14 },
          duration: 6000,
          easing: Easing.inOut(Easing.elastic(1)),
          useNativeDriver: true,
        }),
        Animated.timing(pan, {
          toValue: { x: 12, y: 16 },
          duration: 7000,
          easing: Easing.inOut(Easing.elastic(1)),
          useNativeDriver: true,
        }),
        Animated.timing(pan, {
          toValue: { x: 0, y: 0 },
          duration: 8000,
          easing: Easing.inOut(Easing.elastic(1)),
          useNativeDriver: true,
        }),
      ]),
    );

    // 2. Very subtle zoom in and out (Breathing effect)
    const scaleAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.25,
          duration: 12000,
          easing: Easing.inOut(Easing.elastic(1)),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.05,
          duration: 14000,
          easing: Easing.inOut(Easing.elastic(1)),
          useNativeDriver: true,
        }),
      ]),
    );

    panAnimation.start();
    scaleAnimation.start();

    return () => {
      panAnimation.stop();
      scaleAnimation.stop();
    };
  }, [pan, scale]);

  return (
    <View style={styles.container}>
      <Animated.Image
        source={source}
        style={[
          styles.backgroundImage,
          {
            transform: [
              { translateX: pan.x },
              { translateY: pan.y },
              { scale: scale },
            ],
          },
        ]}
        resizeMode="cover"
      />
      {/* Dark overlay to make the foreground UI (buttons/text) pop */}
      <View
        style={[
          styles.overlay,
          { backgroundColor: `rgba(0,0,0,${overlayOpacity})` },
        ]}
      />

      {/* Foreground Content (Your Home Screen Buttons, etc.) */}
      <View style={styles.contentContainer}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    overflow: "hidden",
  },
  backgroundImage: {
    position: "absolute",
    // Make the image slightly larger than the screen so the edges don't show when it pans
    width: width * 1.2,
    height: height * 1.2,
    top: -height * 0.1,
    left: -width * 0.1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  contentContainer: {
    flex: 1,
    zIndex: 1, // Ensures content sits safely above the animated background
  },
});
