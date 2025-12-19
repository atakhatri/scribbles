import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const COLORS = [
  "#000000",
  "#FF0000",
  "#2196F3",
  "#4CAF50",
  "#FFEB3B",
  "#FFFFFF",
  "#9C27B0",
  "#FF9800",
  "#795548",
  "#607D8B",
];
const STROKES = [3, 8, 15];

interface DrawingToolsProps {
  selectedColor: string;
  onColorSelect: (color: string) => void;
  selectedStroke: number;
  onStrokeSelect: (stroke: number) => void;
  selectedTool: "pen" | "fill";
  onToolSelect: (tool: "pen" | "fill") => void;
  onClose: () => void; // Parent controls closing
}

export default function DrawingTools({
  selectedColor,
  onColorSelect,
  selectedStroke,
  onStrokeSelect,
  selectedTool,
  onToolSelect,
  onClose,
}: DrawingToolsProps) {
  return (
    <View style={styles.sidebarContainer}>
      {/* Header / Close */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tools</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeIcon}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Tool Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Mode</Text>
          <View style={styles.row}>
            <TouchableOpacity
              onPress={() => onToolSelect("pen")}
              style={[
                styles.toolBtn,
                selectedTool === "pen" && styles.activeTool,
              ]}
            >
              <Text style={styles.icon}>✏️</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onToolSelect("fill")}
              style={[
                styles.toolBtn,
                selectedTool === "fill" && styles.activeTool,
              ]}
            >
              <Text style={styles.icon}>🪣</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Stroke Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Size</Text>
          <View style={styles.rowWrap}>
            {STROKES.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => onStrokeSelect(s)}
                style={[
                  styles.strokeBtn,
                  selectedStroke === s && styles.activeStrokeBtn,
                ]}
              >
                <View
                  style={[
                    styles.strokeDot,
                    {
                      width: s + 4,
                      height: s + 4,
                      backgroundColor: selectedStroke === s ? "#fff" : "#333",
                    },
                  ]}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Color Palette */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Color</Text>
          <View style={styles.colorGrid}>
            {COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => onColorSelect(c)}
                style={[
                  styles.colorBtn,
                  { backgroundColor: c },
                  selectedColor === c && styles.activeColor,
                ]}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebarContainer: {
    width: 100, // Fixed width that will push the canvas
    height: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderLeftWidth: 1,
    borderLeftColor: "#ddd",
    padding: 10,
    zIndex: 20,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 5,
  },
  headerTitle: {
    fontWeight: "bold",
    color: "#333",
    fontSize: 12,
    textTransform: "uppercase",
  },
  closeButton: {
    padding: 5,
  },
  closeIcon: {
    fontSize: 18,
    color: "#666",
  },
  scrollContent: {
    paddingBottom: 20,
  },
  section: {
    marginBottom: 15,
  },
  sectionLabel: {
    fontSize: 10,
    color: "#999",
    marginBottom: 5,
    textTransform: "uppercase",
    fontWeight: "bold",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    gap: 5,
  },
  divider: {
    height: 1,
    backgroundColor: "#eee",
    marginVertical: 10,
  },
  toolBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
  },
  activeTool: {
    backgroundColor: "#333",
  },
  icon: {
    fontSize: 18,
  },
  strokeBtn: {
    padding: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
  },
  activeStrokeBtn: {
    backgroundColor: "#333",
  },
  strokeDot: {
    borderRadius: 50,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
  },
  colorBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  activeColor: {
    borderWidth: 2,
    borderColor: "#333",
    transform: [{ scale: 1.2 }],
  },
});
