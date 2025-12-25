import { Canvas, Path, SkPath, Skia } from "@shopify/react-native-skia";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import { GestureResponderEvent, StyleSheet, View } from "react-native";
import { db } from "../firebaseConfig";

interface DrawingCanvasProps {
  gameId: string;
  isMyTurn: boolean;
  strokeColor?: string;
  strokeWidth?: number;
}

// Helper to reconstruct SkPath from SVG string safely
const stringToPath = (svgString: string): SkPath | null => {
  try {
    return Skia.Path.MakeFromSVGString(svgString);
  } catch (e) {
    console.warn("Failed to parse SVG string:", e);
    return null;
  }
};

export default function DrawingCanvas({
  gameId,
  isMyTurn,
  strokeColor = "#000000",
  strokeWidth = 4,
}: DrawingCanvasProps) {
  // Local state for paths that have been saved/synced
  const [completedPaths, setCompletedPaths] = useState<
    { skPath: SkPath; color: string; strokeWidth: number }[]
  >([]);

  // We use a Ref for the current path to ensure immediate access inside the touch callback
  const currentPathRef = useRef<{
    path: SkPath;
    color: string;
    strokeWidth: number;
  } | null>(null);

  // State to force re-render while drawing so the user sees the line
  const [, setTick] = useState(0);

  // 1. LISTEN TO SUBCOLLECTION for scalable data syncing
  useEffect(() => {
    if (!gameId) return;

    const q = query(
      collection(db, "games", gameId, "drawings"),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const paths: { skPath: SkPath; color: string; strokeWidth: number }[] =
          [];

        snapshot.docs.forEach((doc) => {
          const data = doc.data();

          // STRICT VALIDATION: Ensure data types are correct before creating Skia objects
          if (typeof data.path === "string") {
            const skPath = stringToPath(data.path);
            if (skPath) {
              paths.push({
                skPath,
                // Fallback to defaults if color/width are missing or invalid
                color: typeof data.color === "string" ? data.color : "#000000",
                strokeWidth:
                  typeof data.strokeWidth === "number" &&
                  !isNaN(data.strokeWidth)
                    ? data.strokeWidth
                    : 4,
              });
            }
          }
        });
        setCompletedPaths(paths);
      },
      (error) => {
        console.error("Error fetching drawings:", error);
      }
    );

    return () => unsubscribe();
  }, [gameId]);

  // Universal Touch Handlers using standard React Native events
  const onTouchStart = (e: GestureResponderEvent) => {
    if (!isMyTurn) return;
    const { locationX, locationY } = e.nativeEvent;

    const newPath = Skia.Path.Make();
    newPath.moveTo(locationX, locationY);

    currentPathRef.current = {
      path: newPath,
      color: strokeColor,
      strokeWidth: strokeWidth,
    };
    setTick((t) => t + 1);
  };

  const onTouchMove = (e: GestureResponderEvent) => {
    if (!isMyTurn || !currentPathRef.current) return;
    const { locationX, locationY } = e.nativeEvent;

    currentPathRef.current.path.lineTo(locationX, locationY);
    setTick((t) => t + 1);
  };

  const onTouchEnd = async () => {
    if (!isMyTurn || !currentPathRef.current) return;

    const pathData = currentPathRef.current.path.toSVGString();
    const pathColor = currentPathRef.current.color;
    const pathWidth = currentPathRef.current.strokeWidth;

    // Reset ref immediately
    currentPathRef.current = null;
    setTick((t) => t + 1);

    if (gameId) {
      try {
        await addDoc(collection(db, "games", gameId, "drawings"), {
          path: pathData,
          color: pathColor,
          strokeWidth: pathWidth,
          timestamp: serverTimestamp(),
        });
      } catch (error) {
        console.error("Error saving stroke:", error);
      }
    }
  };

  return (
    <View
      style={styles.container}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* We pointerEvents="none" on the Canvas so touches pass through 
         to the parent View's handlers, avoiding conflict.
      */}
      <Canvas style={styles.canvas} pointerEvents="none">
        {/* Render completed paths from DB */}
        {completedPaths.map((p, index) => {
          // Double check path validity during render
          if (!p.skPath) return null;
          return (
            <Path
              key={index}
              path={p.skPath}
              color={p.color}
              style="stroke"
              strokeWidth={p.strokeWidth}
              strokeCap="round"
              strokeJoin="round"
            />
          );
        })}

        {/* Render the current path being drawn */}
        {currentPathRef.current && currentPathRef.current.path && (
          <Path
            path={currentPathRef.current.path}
            color={currentPathRef.current.color}
            style="stroke"
            strokeWidth={currentPathRef.current.strokeWidth}
            strokeCap="round"
            strokeJoin="round"
          />
        )}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    margin: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  canvas: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
});
