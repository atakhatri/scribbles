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
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { db } from "../firebaseConfig";
import DrawingTools from "./DrawingTools";

interface Point {
  x: number;
  y: number;
}

interface DrawingLine {
  id: string;
  path: string;
  color: string;
  width: number;
}

interface Props {
  roomId: string;
  isReadOnly: boolean;
  canvasColor: string;
  onBackgroundChange: (color: string) => void;
}

export default function DrawingCanvas({
  roomId,
  isReadOnly,
  canvasColor,
  onBackgroundChange,
}: Props) {
  const [remotePaths, setRemotePaths] = useState<DrawingLine[]>([]);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);

  // Drawing State
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [selectedStroke, setSelectedStroke] = useState(3);
  const [selectedTool, setSelectedTool] = useState<"pen" | "fill">("pen");
  const [isToolsOpen, setIsToolsOpen] = useState(true); // Control sidebar visibility here

  // Refs
  const isReadOnlyRef = useRef(isReadOnly);
  const currentPathRef = useRef<Point[]>([]);
  const selectedColorRef = useRef(selectedColor);
  const selectedStrokeRef = useRef(selectedStroke);
  const selectedToolRef = useRef(selectedTool);

  // Sync Refs
  useEffect(() => {
    isReadOnlyRef.current = isReadOnly;
  }, [isReadOnly]);
  useEffect(() => {
    selectedColorRef.current = selectedColor;
  }, [selectedColor]);
  useEffect(() => {
    selectedStrokeRef.current = selectedStroke;
  }, [selectedStroke]);
  useEffect(() => {
    selectedToolRef.current = selectedTool;
  }, [selectedTool]);

  // 1. LISTEN for Lines
  useEffect(() => {
    if (!roomId) return;
    const linesRef = collection(db, "rooms", roomId, "lines");
    const q = query(linesRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedLines: DrawingLine[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        path: doc.data().path,
        color: doc.data().color,
        width: doc.data().width || 3,
      }));
      setRemotePaths(loadedLines);
    });

    return () => unsubscribe();
  }, [roomId]);

  // 2. UPLOAD Line
  const uploadLine = async (pathString: string) => {
    try {
      const linesRef = collection(db, "rooms", roomId, "lines");
      await addDoc(linesRef, {
        path: pathString,
        color: selectedColorRef.current,
        width: selectedStrokeRef.current,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error uploading line:", error);
    }
  };

  const handleRelease = () => {
    if (isReadOnlyRef.current) return;
    if (selectedToolRef.current === "fill") return;

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
      onStartShouldSetPanResponder: () => !isReadOnlyRef.current,
      onMoveShouldSetPanResponder: () => !isReadOnlyRef.current,

      onPanResponderGrant: (evt: GestureResponderEvent) => {
        if (isReadOnlyRef.current) return;

        if (selectedToolRef.current === "fill") {
          onBackgroundChange(selectedColorRef.current);
          return;
        }

        const { locationX, locationY } = evt.nativeEvent;
        const newPoint = { x: locationX, y: locationY };
        currentPathRef.current = [newPoint];
        setCurrentPath([newPoint]);
      },

      onPanResponderMove: (evt: GestureResponderEvent) => {
        if (isReadOnlyRef.current || selectedToolRef.current === "fill") return;

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
    <View style={styles.rootContainer}>
      {/* Canvas Area - Shrinks when sidebar is open */}
      <View
        style={[styles.canvasContainer, { backgroundColor: canvasColor }]}
        {...panResponder.panHandlers}
      >
        <Svg style={StyleSheet.absoluteFill}>
          {remotePaths.map((line) => (
            <Path
              key={line.id}
              d={line.path}
              stroke={line.color}
              strokeWidth={line.width}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {currentPath.length > 0 && (
            <Path
              d={pointsToSvgPath(currentPath)}
              stroke={selectedColor}
              strokeWidth={selectedStroke}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </Svg>

        {/* Open Tools Button (Only when closed & writable) */}
        {!isReadOnly && !isToolsOpen && (
          <TouchableOpacity
            style={styles.floatingButton}
            onPress={() => setIsToolsOpen(true)}
          >
            <Text style={styles.floatingButtonIcon}>🎨</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Sidebar Panel - Sits next to canvas */}
      {!isReadOnly && isToolsOpen && (
        <DrawingTools
          selectedColor={selectedColor}
          onColorSelect={setSelectedColor}
          selectedStroke={selectedStroke}
          onStrokeSelect={setSelectedStroke}
          selectedTool={selectedTool}
          onToolSelect={setSelectedTool}
          onClose={() => setIsToolsOpen(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#ddd",
    margin: 10,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  canvasContainer: {
    flex: 1, // Takes all available space, shrinking when sibling appears
    position: "relative",
  },
  floatingButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    zIndex: 20,
  },
  floatingButtonIcon: {
    fontSize: 20,
  },
});
