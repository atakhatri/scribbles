import {
  Canvas,
  Path,
  Picture,
  SkPath,
  SkPicture,
  Skia,
} from "@shopify/react-native-skia";
import React, { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import {
  PanResponder,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

// Define the shape of a path
export interface DrawingPath {
  path: SkPath;
  color: string;
  strokeWidth: number;
}

interface DrawingCanvasProps {
  paths: DrawingPath[];
  currentPath?: DrawingPath | null;
  onStrokeStart?: (x: number, y: number) => void;
  onStrokeActive?: (x: number, y: number) => void;
  onStrokeEnd?: () => void;
  // The snapshot data can be a Uint8Array (buffer) or a Base64 string from Firebase
  initialSnapshot?: Uint8Array | string | null;
  isReadOnly?: boolean;
  style?: any;
  gameId?: string; // Add optional props if your GameScreen passes them, to avoid errors
  forwardedRef?: any;
}

const DrawingCanvas = forwardRef<any, DrawingCanvasProps>(
  (
    {
      paths = [], // Default to empty array to prevent map of undefined error
      currentPath,
      onStrokeStart,
      onStrokeActive,
      onStrokeEnd,
      initialSnapshot,
      isReadOnly = false,
      style,
    },
    ref
  ) => {
    const { width, height } = useWindowDimensions();

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      clear: () => {
        // Logic handled by parent state (paths prop), this is just a placeholder to prevent crash
      },
      undo: () => {
        // Logic handled by parent state (paths prop), this is just a placeholder to prevent crash
      },
    }));

    // Helper to convert Base64 to Uint8Array safely
    const safeMakePicture = (data: any): SkPicture | null => {
      if (!data) return null;

      try {
        let buffer: Uint8Array | null = null;

        if (typeof data === "string") {
          try {
            // Handle Base64 string from Firebase
            // This simple conversion works for standard base64
            const binaryString = atob(data);
            const len = binaryString.length;
            buffer = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              buffer[i] = binaryString.charCodeAt(i);
            }
          } catch (base64Error) {
            console.warn(
              "DrawingCanvas: Failed to decode base64 string",
              base64Error
            );
            return null;
          }
        } else if (data instanceof Uint8Array) {
          buffer = data;
        } else if (data instanceof ArrayBuffer) {
          buffer = new Uint8Array(data);
        } else if (Array.isArray(data)) {
          // Handle standard JS arrays (e.g. from JSON serialization)
          buffer = new Uint8Array(data);
        } else {
          // If it's some other object (like an ordinary array-like object), try to cast
          try {
            // @ts-ignore
            buffer = new Uint8Array(data);
          } catch (castError) {
            console.warn(
              "DrawingCanvas: Data is not convertible to Uint8Array",
              castError
            );
            return null;
          }
        }

        // Check if buffer is valid before calling Skia
        if (buffer && buffer.length > 0) {
          return Skia.Picture.MakePicture(buffer);
        }
      } catch (e) {
        console.warn(
          "DrawingCanvas: Failed to create picture from snapshot:",
          e
        );
      }
      return null;
    };

    // Memoize the picture so we don't try to recreate it on every render
    const backgroundPicture = useMemo(() => {
      return safeMakePicture(initialSnapshot);
    }, [initialSnapshot]);

    // Use PanResponder instead of Skia's useTouchHandler to avoid version/type issues
    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => !isReadOnly,
        onMoveShouldSetPanResponder: () => !isReadOnly,
        onPanResponderGrant: (evt) => {
          if (isReadOnly) return;
          const { locationX, locationY } = evt.nativeEvent;
          if (onStrokeStart) onStrokeStart(locationX, locationY);
        },
        onPanResponderMove: (evt) => {
          if (isReadOnly) return;
          const { locationX, locationY } = evt.nativeEvent;
          if (onStrokeActive) onStrokeActive(locationX, locationY);
        },
        onPanResponderRelease: () => {
          if (isReadOnly) return;
          if (onStrokeEnd) onStrokeEnd();
        },
        onPanResponderTerminate: () => {
          if (isReadOnly) return;
          if (onStrokeEnd) onStrokeEnd();
        },
      })
    ).current;

    return (
      // Attach the PanResponder to the container View
      <View style={[styles.container, style]} {...panResponder.panHandlers}>
        {/* Pass pointerEvents="none" to the Canvas so the parent View receives 
         the touch events first. This ensures PanResponder works smoothly.
      */}
        <Canvas style={{ flex: 1 }} pointerEvents="none">
          {/* Render the saved background picture if it exists */}
          {backgroundPicture && <Picture picture={backgroundPicture} />}

          {/* Render completed paths */}
          {paths.map((p, index) => (
            <Path
              key={index}
              path={p.path}
              color={p.color}
              style="stroke"
              strokeWidth={p.strokeWidth}
              strokeCap="round"
              strokeJoin="round"
            />
          ))}

          {/* Render the current path being drawn */}
          {currentPath && (
            <Path
              path={currentPath.path}
              color={currentPath.color}
              style="stroke"
              strokeWidth={currentPath.strokeWidth}
              strokeCap="round"
              strokeJoin="round"
            />
          )}
        </Canvas>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
});

export default DrawingCanvas;
