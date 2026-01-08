import React, { useMemo, useRef, useState } from "react";
import {
  Dimensions,
  GestureResponderEvent,
  PanResponder,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";

const { width, height } = Dimensions.get("window");

// Optimization: Round points to 1 decimal place to save huge amounts of space
const round = (num: number) => Math.round(num * 10) / 10;

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  path: string; // The SVG path string (d attribute)
  color: string;
  width: number;
}

interface DrawingCanvasProps {
  color: string;
  strokeWidth: number;
  enabled: boolean;
  strokes: Stroke[]; // External strokes (from DB)
  onStrokeFinished: (newStroke: Stroke) => void;
}

export default function DrawingCanvas({
  color,
  strokeWidth,
  enabled,
  strokes, // These are the committed strokes from the game state
  onStrokeFinished,
}: DrawingCanvasProps) {
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const currentPathRef = useRef<string>(""); // Ref to keep track of current path string for optimization

  // --- SMOOTHING ALGORITHM ---
  // Converts raw points into a smooth SVG Path using Quadratic Bezier curves
  const pointsToSvg = (points: Point[]) => {
    if (points.length === 0) return "";
    if (points.length < 2) {
      return `M ${round(points[0].x)},${round(points[0].y)} L ${round(
        points[0].x
      )},${round(points[0].y)}`;
    }

    let d = `M ${round(points[0].x)},${round(points[0].y)}`;

    // Loop through points and create curves to midpoints
    for (let i = 1; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      d += ` Q ${round(p1.x)},${round(p1.y)} ${round(midX)},${round(midY)}`;
    }

    // Connect the last point
    const last = points[points.length - 1];
    d += ` L ${round(last.x)},${round(last.y)}`;
    return d;
  };

  // Recreate PanResponder when `enabled` or color/width/onStrokeFinished change
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => enabled,
        onMoveShouldSetPanResponder: () => enabled,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          const { locationX, locationY } = evt.nativeEvent;
          const startPoint = { x: locationX, y: locationY };
          setCurrentPoints([startPoint]);
        },
        onPanResponderMove: (evt: GestureResponderEvent) => {
          const { locationX, locationY } = evt.nativeEvent;
          setCurrentPoints((prev) => {
            const last = prev[prev.length - 1];
            if (!last) return [{ x: locationX, y: locationY }];

            const dist = Math.sqrt(
              Math.pow(locationX - last.x, 2) + Math.pow(locationY - last.y, 2)
            );
            if (dist > 2) {
              return [...prev, { x: locationX, y: locationY }];
            }
            return prev;
          });
        },
        onPanResponderRelease: () => {
          setCurrentPoints((finalPoints) => {
            if (finalPoints.length > 0) {
              const d = pointsToSvg(finalPoints);
              const newStroke: Stroke = {
                path: d,
                color: color,
                width: strokeWidth,
              };
              onStrokeFinished(newStroke);
            }
            return [];
          });
        },
      }),
    [enabled, color, strokeWidth, onStrokeFinished]
  );

  // Calculate current path string for rendering the "live" line
  const currentPathSvg = pointsToSvg(currentPoints);

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Svg style={StyleSheet.absoluteFill}>
        {/* 1. Render Commited Strokes (from DB/History) */}
        {strokes.map((stroke, index) => (
          <Path
            key={index}
            d={stroke.path}
            stroke={stroke.color}
            strokeWidth={stroke.width}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* 2. Render Current "Live" Stroke */}
        {currentPoints.length > 0 && (
          <Path
            d={currentPathSvg}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.8} // Slightly transparent while drawing
          />
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 8,
    overflow: "hidden",
    borderColor: "#e2e8f0",
    borderWidth: 1,
  },
});
