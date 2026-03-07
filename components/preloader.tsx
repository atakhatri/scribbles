import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Easing, StyleSheet, View } from "react-native";
import Svg, {
  Defs,
  G,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";

const { width } = Dimensions.get("window");
const AnimatedText = Animated.createAnimatedComponent(SvgText);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

export default function Preloader() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 2000,
          easing: Easing.out(Easing.elastic(1)),
          useNativeDriver: false,
        }),
        Animated.delay(500),
        Animated.timing(progress, {
          toValue: 2,
          duration: 1500,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const strokeDashoffsetText = progress.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [1000, 0, -1000],
  });

  const strokeDashoffsetLine = progress.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [300, 0, -300],
  });

  const fillOpacity = progress.interpolate({
    inputRange: [0, 0.7, 1, 1.5, 2],
    outputRange: [0, 0, 1, 0, 0],
  });

  const pencilX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [70, 330],
  });

  const pencilY = progress.interpolate({
    inputRange: [0, 0.3, 0.5, 0.7, 1],
    outputRange: [130, 145, 130, 115, 130],
  });

  const pencilRotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-30, -10],
  });

  const pencilOpacity = progress.interpolate({
    inputRange: [0, 1, 1.1],
    outputRange: [1, 1, 0],
  });

  return (
    <View style={styles.container}>
      <Svg height="300" width={width} viewBox="0 0 400 200">
        <Defs>
          <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#ff8000" stopOpacity="1" />
            <Stop offset="1" stopColor="#ffcc00" stopOpacity="1" />
          </LinearGradient>
        </Defs>

        <AnimatedPath
          d="M 100 130 Q 150 160 200 130 T 300 130"
          fill={"transparent"}
          stroke="#ff8000"
          strokeWidth="8"
          strokeLinecap="butt"
          strokeLinejoin="miter"
          strokeDasharray={300}
          strokeDashoffset={strokeDashoffsetLine}
          opacity={1}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
  },
});
