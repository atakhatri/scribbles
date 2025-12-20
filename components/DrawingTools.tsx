import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

interface DrawingToolsProps {
  selectedColor: string;
  onSelectColor: (color: string) => void;
  strokeWidth: number;
  onSelectStrokeWidth: (width: number) => void;
  isEraser: boolean;
  toggleEraser: () => void;
  onClear: () => void;
}

const COLORS = [
  "#000000",
  "#FF0000",
  "#00FF00",
  "#0000FF",
  "#FFFF00",
  "#FF00FF",
  "#00FFFF",
  "#FFA500",
  "#800080",
  "#A52A2A",
  "#FFFFFF",
];
const STROKES = [3, 6, 9, 12];

export default function DrawingTools({
  selectedColor,
  onSelectColor,
  strokeWidth,
  onSelectStrokeWidth,
  isEraser,
  toggleEraser,
  onClear,
}: DrawingToolsProps) {
  const handleColorSelect = (color: string) => {
    // If we are currently erasing, switch back to drawing mode when a color is picked
    if (isEraser) {
      toggleEraser();
    }
    onSelectColor(color);
  };

  return (
    <View style={styles.container}>
      {/* Colors */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.colorsContainer}
      >
        {COLORS.map((color) => {
          if (color === "#FFFFFF") return null; // Skip white in swatch list, handled by eraser
          return (
            <TouchableOpacity
              key={color}
              style={[
                styles.colorSwatch,
                { backgroundColor: color },
                selectedColor === color && !isEraser && styles.selectedSwatch,
              ]}
              onPress={() => handleColorSelect(color)}
            />
          );
        })}
      </ScrollView>

      {/* Tools Row */}
      <View style={styles.toolsRow}>
        {/* Stroke Sizes */}
        <View style={styles.strokeContainer}>
          {STROKES.map((width) => (
            <TouchableOpacity
              key={width}
              style={[
                styles.strokeButton,
                strokeWidth === width && styles.selectedStroke,
              ]}
              onPress={() => onSelectStrokeWidth(width)}
            >
              <View
                style={[
                  styles.strokeDot,
                  {
                    width: width > 15 ? 15 : width,
                    height: width > 15 ? 15 : width,
                    borderRadius: width / 2,
                    backgroundColor: "#333",
                  },
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {/* Eraser Toggle */}
          <TouchableOpacity
            style={[styles.toolButton, isEraser && styles.activeTool]}
            onPress={toggleEraser}
          >
            <MaterialCommunityIcons
              name={isEraser ? "eraser" : "eraser-variant"}
              size={22}
              color={isEraser ? "#333" : "#666"}
            />
          </TouchableOpacity>

          {/* Clear Canvas */}
          <TouchableOpacity style={styles.toolButton} onPress={onClear}>
            <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  colorsContainer: {
    flexDirection: "row",
    marginBottom: 10,
    paddingHorizontal: 5,
    maxHeight: 40,
  },
  colorSwatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  selectedSwatch: {
    borderWidth: 2,
    borderColor: "#333",
    transform: [{ scale: 1.1 }],
    zIndex: 10,
  },
  toolsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  strokeContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 20,
    padding: 4,
  },
  strokeButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
    marginHorizontal: 2,
  },
  selectedStroke: {
    backgroundColor: "#e0e0e0",
    borderWidth: 1,
    borderColor: "#ccc",
  },
  strokeDot: {
    backgroundColor: "black",
  },
  actionsContainer: {
    flexDirection: "row",
    gap: 12,
  },
  toolButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#eee",
  },
  activeTool: {
    backgroundColor: "#dbeafe", // Light blue tint
    borderColor: "#3b82f6",
  },
});
