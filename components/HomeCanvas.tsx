import { Ionicons } from "@expo/vector-icons";
import { Accelerometer } from "expo-sensors";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  GestureResponderEvent,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, {
  Defs,
  Path,
  Stop,
  LinearGradient as SvgLinearGradient,
} from "react-native-svg";
import { useToast } from "../context/ToastContext";
import GRADIENTS from "../data/gradients";

const STROKE_WIDTHS = [5, 8, 12, 16];
const COLORS = GRADIENTS;
const AnimatedPath = Animated.createAnimatedComponent(Path);

// Helper to get a random item from an array
const getRandom = <T,>(arr: readonly T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

// Helper to convert points to an SVG path string
const pointsToSvg = (points: { x: number; y: number }[]) => {
  if (points.length === 0) return "";
  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    d += ` Q ${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${midX.toFixed(
      1,
    )},${midY.toFixed(1)}`;
  }
  if (points.length > 1) {
    const last = points[points.length - 1];
    d += ` L ${last.x.toFixed(1)},${last.y.toFixed(1)}`;
  }
  return d;
};

interface Stroke {
  path: string;
  gradient: readonly string[];
  gradientId: string;
  width: number;
}

export default function HomeCanvas() {
  const { playSound } = useToast();
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const pointsRef = useRef<{ x: number; y: number }[]>([]);
  const strokeDataRef = useRef<Stroke | null>(null);
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const [isDrawing, setIsDrawing] = useState(false);

  // Persistence & Shake Logic
  const [persistMode, setPersistMode] = useState(false);
  const [completedStrokes, setCompletedStrokes] = useState<Stroke[]>([]);
  const persistModeRef = useRef(false); // Ref to access inside PanResponder
  const promptOpacity = useRef(new Animated.Value(1)).current;

  const togglePersist = () => {
    const newVal = !persistMode;
    setPersistMode(newVal);
    persistModeRef.current = newVal;
    if (!newVal) setCompletedStrokes([]); // Clear when turning off
  };

  useEffect(() => {
    if (persistMode) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(promptOpacity, {
            toValue: 0.4,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(promptOpacity, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => {
        pulse.stop();
        promptOpacity.setValue(1);
      };
    } else {
      promptOpacity.setValue(1);
    }
  }, [persistMode]);

  useEffect(() => {
    if (!persistMode) return;

    let lastShake = 0;
    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      const totalForce = Math.abs(x) + Math.abs(y) + Math.abs(z);
      if (totalForce > 2.5) {
        // Shake threshold
        const now = Date.now();
        if (now - lastShake > 1000) {
          lastShake = now;
          setCompletedStrokes((prev) => {
            if (prev.length > 0) {
              playSound(require("../assets/sounds/vanish.mp3"));
            }
            return [];
          });
        }
      }
    });
    Accelerometer.setUpdateInterval(100);

    return () => subscription && subscription.remove();
  }, [persistMode]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          setIsDrawing(true);
          opacityAnim.setValue(1);
          const newStroke: Stroke = {
            path: "",
            gradient: getRandom(COLORS),
            gradientId: `grad-${Date.now()}-${Math.random()}`,
            width: getRandom(STROKE_WIDTHS),
          };
          strokeDataRef.current = newStroke;
          const { locationX, locationY } = evt.nativeEvent;
          pointsRef.current = [{ x: locationX, y: locationY }];
          newStroke.path = pointsToSvg(pointsRef.current);
          setCurrentStroke(newStroke);
        },
        onPanResponderMove: (evt: GestureResponderEvent) => {
          const { locationX, locationY } = evt.nativeEvent;
          pointsRef.current.push({ x: locationX, y: locationY });
          if (strokeDataRef.current) {
            const updatedStroke = {
              ...strokeDataRef.current,
              path: pointsToSvg(pointsRef.current),
            };
            strokeDataRef.current = updatedStroke;
            setCurrentStroke(updatedStroke);
          }
        },
        onPanResponderRelease: () => {
          const strokeToSave = strokeDataRef.current;
          pointsRef.current = [];
          strokeDataRef.current = null;

          if (persistModeRef.current && strokeToSave) {
            // Persist Mode: Save stroke, don't fade
            setCompletedStrokes((prev) => [...prev, strokeToSave]);
            setCurrentStroke(null);
            setIsDrawing(false);
          } else {
            // Default Mode: Fade out
            Animated.timing(opacityAnim, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }).start(() => {
              setCurrentStroke(null);
              setIsDrawing(false);
            });
          }
        },
      }),
    [],
  );

  return (
    <View style={styles.container}>
      <View style={styles.canvas} {...panResponder.panHandlers}>
        <Svg style={StyleSheet.absoluteFill}>
          {/* Render Completed Strokes (Persisted) */}
          {completedStrokes.map((stroke) => (
            <React.Fragment key={stroke.gradientId}>
              <Defs>
                <SvgLinearGradient
                  id={stroke.gradientId}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <Stop offset="0%" stopColor={stroke.gradient[0]} />
                  <Stop offset="100%" stopColor={stroke.gradient[1]} />
                </SvgLinearGradient>
              </Defs>
              <Path
                d={stroke.path}
                stroke={`url(#${stroke.gradientId})`}
                strokeWidth={stroke.width}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </React.Fragment>
          ))}

          {/* Render Current Stroke (Animated) */}
          {currentStroke && (
            <Defs>
              <SvgLinearGradient
                id={currentStroke.gradientId}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <Stop offset="0%" stopColor={currentStroke.gradient[0]} />
                <Stop offset="100%" stopColor={currentStroke.gradient[1]} />
              </SvgLinearGradient>
            </Defs>
          )}
          {currentStroke && (
            <AnimatedPath
              d={currentStroke.path}
              stroke={`url(#${currentStroke.gradientId})`}
              strokeWidth={currentStroke.width}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={opacityAnim}
            />
          )}
        </Svg>
        {!isDrawing && !currentStroke && completedStrokes.length === 0 && (
          <Animated.View
            style={[styles.promptContainer, { opacity: promptOpacity }]}
            pointerEvents="none"
          >
            <Ionicons
              name={persistMode ? "phone-portrait-outline" : "brush-outline"}
              size={20}
              color="#ffffff90"
            />
            <Text style={styles.promptText}>
              {persistMode ? "Shake to clear doodles" : "Doodle here for fun!"}
            </Text>
          </Animated.View>
        )}

        {/* Toggle Button */}
        <TouchableOpacity
          style={styles.toggleButton}
          onPress={togglePersist}
          activeOpacity={0.7}
        >
          <Ionicons
            name={persistMode ? "phone-portrait-outline" : "lock-open-outline"}
            size={20}
            color="#ffffff90"
          />
          {persistMode && (
            <View style={styles.shakeBadge}>
              <Ionicons name="flash" size={8} color="#333" />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 0,
    marginHorizontal: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  canvas: {
    width: "100%",
    height: 540,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  promptContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  promptText: {
    color: "#ffffff90",
    fontSize: 16,
    fontWeight: "500",
    fontStyle: "italic",
  },
  toggleButton: {
    position: "absolute",
    top: 10,
    right: 10,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
  },
  shakeBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "#FFD700",
    width: 12,
    height: 12,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
});
