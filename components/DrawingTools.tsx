import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

interface DrawingToolsProps {
  selectedColor: string;
  onSelectColor: (color: string) => void;
  strokeWidth: number;
  onSelectWidth: (width: number) => void;
  onClear: () => void;
  onUndo: () => void;
}

const COLORS = [
  "#000000", // Black
  "#FF0000", // Red
  "#22C55E", // Green
  "#3B82F6", // Blue
  "#EAB308", // Yellow
  "#F97316", // Orange
  "#A855F7", // Purple
  "#EC4899", // Pink
  "#FFFFFF", // Eraser
];

const WIDTHS = [2, 5, 8, 12, 16];

export default function DrawingTools({
  selectedColor,
  onSelectColor,
  strokeWidth,
  onSelectWidth,
  onClear,
  onUndo,
}: DrawingToolsProps) {
  return (
    <View style={styles.container}>
      {/* Color Picker */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.colorsContainer}
        contentContainerStyle={styles.colorsContent}
      >
        {COLORS.map((color) => (
          <TouchableOpacity
            key={color}
            style={[
              styles.colorSwatch,
              { backgroundColor: color },
              selectedColor === color && styles.selectedColor,
              color === "#FFFFFF" && styles.eraserSwatch, // Border for white/eraser
            ]}
            onPress={() => onSelectColor(color)}
          />
        ))}
      </ScrollView>

      {/* Tools Row */}
      <View style={styles.toolsRow}>
        {/* Width Selector */}
        <View style={styles.widthSelector}>
          {WIDTHS.map((width) => (
            <TouchableOpacity
              key={width}
              style={[
                styles.widthButton,
                strokeWidth === width && styles.selectedWidth,
              ]}
              onPress={() => onSelectWidth(width)}
            >
              <View
                style={{
                  width: Math.min(width, 20), // Cap visual size slightly
                  height: Math.min(width, 20),
                  borderRadius: width / 2,
                  backgroundColor:
                    selectedColor === "#FFFFFF" ? "#000" : selectedColor,
                  opacity: selectedColor === "#FFFFFF" ? 0.3 : 1,
                }}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity onPress={onUndo} style={styles.actionButton}>
            <Ionicons name="arrow-undo" size={20} color="#4B5563" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onClear}
            style={[styles.actionButton, styles.clearButton]}
          >
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "white",
    padding: 12,
    borderRadius: 8,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  colorsContainer: {
    maxHeight: 50,
  },
  colorsContent: {
    gap: 8,
    paddingRight: 10,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  eraserSwatch: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  selectedColor: {
    borderColor: "#4F46E5", // Indigo-600 ring
    transform: [{ scale: 1.1 }],
  },
  toolsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  widthSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    padding: 4,
    gap: 2,
  },
  widthButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
  },
  selectedWidth: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  clearButton: {
    backgroundColor: "#FEF2F2", // Light red bg
  },
});
