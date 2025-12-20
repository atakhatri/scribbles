<<<<<<< HEAD
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
=======
import { arrayUnion, doc, onSnapshot, updateDoc } from "firebase/firestore";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
>>>>>>> c542d9b36a0754b217908210bf8205353cde4d51
import {
  GestureResponderEvent,
  PanResponder,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { db } from "../firebaseConfig";

<<<<<<< HEAD
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
=======
export interface DrawingCanvasRef {
  clear: () => void;
}

interface DrawingCanvasProps {
  gameId: string;
  isDrawer: boolean;
  selectedColor: string;
  strokeWidth: number;
}

const DrawingCanvas = forwardRef<DrawingCanvasRef, DrawingCanvasProps>(
  ({ gameId, isDrawer, selectedColor, strokeWidth }, ref) => {
    const [paths, setPaths] = useState<string[]>([]);
    const [currentPath, setCurrentPath] = useState<string>("");
    const currentPathRef = useRef<string>("");

    // Listen for drawing updates from Firestore
    useEffect(() => {
      if (!gameId) return;
      const unsub = onSnapshot(doc(db, "games", gameId), (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          if (data.paths) {
            setPaths(data.paths);
          } else {
            setPaths([]);
          }
        }
      });
      return () => unsub();
    }, [gameId]);

    useImperativeHandle(ref, () => ({
      clear: async () => {
        setPaths([]);
        setCurrentPath("");
        if (isDrawer) {
          try {
            await updateDoc(doc(db, "games", gameId), {
              paths: [],
            });
          } catch (e) {
            console.error("Error clearing canvas:", e);
          }
        }
      },
    }));

    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => isDrawer,
        onMoveShouldSetPanResponder: () => isDrawer,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          const { locationX, locationY } = evt.nativeEvent;
          const startPath = `M${locationX},${locationY}`;
          currentPathRef.current = startPath;
          setCurrentPath(startPath);
        },
        onPanResponderMove: (evt: GestureResponderEvent) => {
          const { locationX, locationY } = evt.nativeEvent;
          const newPoint = ` L${locationX},${locationY}`;
          currentPathRef.current += newPoint;
          setCurrentPath(currentPathRef.current);
        },
        onPanResponderRelease: async () => {
          if (currentPathRef.current) {
            const newPathData = {
              d: currentPathRef.current,
              stroke: selectedColor,
              strokeWidth: strokeWidth,
            };

            try {
              await updateDoc(doc(db, "games", gameId), {
                paths: arrayUnion(JSON.stringify(newPathData)),
              });
            } catch (error) {
              console.error("Error saving path:", error);
            }

            setCurrentPath("");
            currentPathRef.current = "";
          }
        },
      })
    ).current;

    return (
      <View style={styles.container} {...panResponder.panHandlers}>
        <Svg style={StyleSheet.absoluteFill}>
          {paths.map((pathStr, index) => {
            let d = pathStr;
            let stroke = "#000";
            let width = 3;

            try {
              const data = JSON.parse(pathStr);
              d = data.d;
              stroke = data.stroke;
              width = data.strokeWidth;
            } catch (e) {
              // Fallback for legacy simple strings
            }

            return (
              <Path
                key={index}
                d={d}
                stroke={stroke}
                strokeWidth={width}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {currentPath ? (
            <Path
              d={currentPath}
              stroke={selectedColor}
              strokeWidth={strokeWidth}
>>>>>>> c542d9b36a0754b217908210bf8205353cde4d51
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
<<<<<<< HEAD
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
=======
          ) : null}
        </Svg>
>>>>>>> c542d9b36a0754b217908210bf8205353cde4d51
      </View>

<<<<<<< HEAD
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

=======
>>>>>>> c542d9b36a0754b217908210bf8205353cde4d51
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
  },
});

export default DrawingCanvas;
