import { arrayUnion, doc, onSnapshot, updateDoc } from "firebase/firestore";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  GestureResponderEvent,
  PanResponder,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { db } from "../firebaseConfig";

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
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </Svg>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
  },
});

export default DrawingCanvas;
