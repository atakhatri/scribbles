import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  GestureResponderEvent,
  PanResponder,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { db } from "../firebaseConfig";

interface Point {
  x: number;
  y: number;
}

interface DrawingLine {
  id: string;
  path: string;
  color: string;
}

export default function DrawingCanvas({
  roomId,
  isReadOnly,
}: {
  roomId: string;
  isReadOnly: boolean;
}) {
  const [remotePaths, setRemotePaths] = useState<DrawingLine[]>([]);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);

  // 1. REFS: Use refs to track current state for PanResponder
  // This fixes the "Stale Closure" bug where it thought isReadOnly was always true
  const isReadOnlyRef = useRef(isReadOnly);
  const currentPathRef = useRef<Point[]>([]);

  // Update the ref whenever the prop changes
  useEffect(() => {
    isReadOnlyRef.current = isReadOnly;
  }, [isReadOnly]);

  // 2. LISTEN
  useEffect(() => {
    if (!roomId) return;
    const linesRef = collection(db, "rooms", roomId, "lines");
    const q = query(linesRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedLines: DrawingLine[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        path: doc.data().path,
        color: doc.data().color,
      }));
      setRemotePaths(loadedLines);
    });

    return () => unsubscribe();
  }, [roomId]);

  // 3. SEND
  const uploadLine = async (pathString: string) => {
    try {
      const linesRef = collection(db, "rooms", roomId, "lines");
      await addDoc(linesRef, {
        path: pathString,
        color: "black",
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error uploading line:", error);
    }
  };

  const handleRelease = () => {
    // Always check the Ref to ensure we aren't blocked
    if (isReadOnlyRef.current) return;

    const points = currentPathRef.current;
    if (points.length > 0) {
      const pathString = pointsToSvgPath(points);
      uploadLine(pathString);
      currentPathRef.current = [];
      setCurrentPath([]);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      // Check the REF (isReadOnlyRef.current) instead of the prop
      onStartShouldSetPanResponder: () => !isReadOnlyRef.current,
      onMoveShouldSetPanResponder: () => !isReadOnlyRef.current,

      onPanResponderGrant: (evt: GestureResponderEvent) => {
        if (isReadOnlyRef.current) return;
        const { locationX, locationY } = evt.nativeEvent;
        const newPoint = { x: locationX, y: locationY };
        currentPathRef.current = [newPoint];
        setCurrentPath([newPoint]);
      },

      onPanResponderMove: (evt: GestureResponderEvent) => {
        if (isReadOnlyRef.current) return;
        const { locationX, locationY } = evt.nativeEvent;
        const newPoint = { x: locationX, y: locationY };
        currentPathRef.current.push(newPoint);
        setCurrentPath((prev) => [...prev, newPoint]);
      },

      onPanResponderRelease: handleRelease,
      onPanResponderTerminate: handleRelease,
    })
  ).current;

  const pointsToSvgPath = (points: Point[]) => {
    if (points.length === 0) return "";
    const start = `M ${points[0].x} ${points[0].y}`;
    const lines = points
      .slice(1)
      .map((p) => `L ${p.x} ${p.y}`)
      .join(" ");
    return `${start} ${lines}`;
  };

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Svg style={StyleSheet.absoluteFill}>
        {remotePaths.map((line) => (
          <Path
            key={line.id}
            d={line.path}
            stroke={line.color}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {currentPath.length > 0 && (
          <Path
            d={pointsToSvgPath(currentPath)}
            stroke="red"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    margin: 10,
    borderRadius: 10,
    overflow: "hidden",
  },
});
