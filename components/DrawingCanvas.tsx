import * as MediaLibrary from "expo-media-library";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
} from "firebase/firestore";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Alert,
  GestureResponderEvent,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
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

export interface DrawingCanvasRef {
  undo: () => void;
  redo: () => void;
  resetHistory: () => void;
  saveImage: () => void;
}

const DrawingCanvas = forwardRef<DrawingCanvasRef, Props>(
  ({ roomId, isReadOnly, canvasColor, onBackgroundChange }, ref) => {
    const [remotePaths, setRemotePaths] = useState<DrawingLine[]>([]);
    const [currentPath, setCurrentPath] = useState<Point[]>([]);

    // Undo/Redo History
    const [history, setHistory] = useState<{ id: string; data: any }[]>([]);
    const [redoStack, setRedoStack] = useState<any[]>([]);

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

    const viewRef = useRef<View>(null);

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
        const lineData = {
          path: pathString,
          color: selectedColorRef.current,
          width: selectedStrokeRef.current,
          timestamp: serverTimestamp(),
        };
        const docRef = await addDoc(linesRef, lineData);

        // Add to history for Undo
        setHistory((prev) => [...prev, { id: docRef.id, data: lineData }]);
        setRedoStack([]); // Clear redo stack on new action
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
          if (isReadOnlyRef.current || selectedToolRef.current === "fill")
            return;

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

    // Expose Undo/Redo to Parent
    useImperativeHandle(ref, () => ({
      undo: async () => {
        if (history.length === 0) return;
        const lastItem = history[history.length - 1];
        const newHistory = history.slice(0, -1);
        setHistory(newHistory);

        // Push to Redo Stack
        setRedoStack((prev) => [...prev, lastItem.data]);

        // Delete from Firestore
        try {
          await deleteDoc(doc(db, "rooms", roomId, "lines", lastItem.id));
        } catch (e) {
          console.error("Undo failed", e);
        }
      },
      redo: async () => {
        if (redoStack.length === 0) return;
        const lastRedo = redoStack[redoStack.length - 1];
        const newRedoStack = redoStack.slice(0, -1);
        setRedoStack(newRedoStack);

        // Re-upload to Firestore
        try {
          const linesRef = collection(db, "rooms", roomId, "lines");
          // Use new timestamp to maintain order
          const lineData = { ...lastRedo, timestamp: serverTimestamp() };
          const docRef = await addDoc(linesRef, lineData);

          setHistory((prev) => [...prev, { id: docRef.id, data: lineData }]);
        } catch (e) {
          console.error("Redo failed", e);
        }
      },
      resetHistory: () => {
        setHistory([]);
        setRedoStack([]);
      },
      saveImage: async () => {
        try {
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status !== "granted") {
            Alert.alert(
              "Permission needed",
              "Please allow access to save images."
            );
            return;
          }

          const uri = await captureRef(viewRef, {
            format: "png",
            quality: 1,
          });

          await MediaLibrary.saveToLibraryAsync(uri);
          Alert.alert("Saved!", "Drawing saved to your gallery.");
        } catch (e) {
          console.error("Save failed", e);
          Alert.alert("Error", "Failed to save drawing.");
        }
      },
    }));

    return (
      <View style={styles.rootContainer}>
        {/* Canvas Area - Shrinks when sidebar is open */}
        <View
          ref={viewRef}
          collapsable={false}
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
);

export default DrawingCanvas;

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    flexDirection: "row",
    borderWidth: 2,
    borderColor: "#333",
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
    width: 48,
    height: 48,
    borderRadius: 40,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },
  floatingButtonIcon: {
    fontSize: 24,
  },
});
