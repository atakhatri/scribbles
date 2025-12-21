import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface DrawingToolsProps {
  selectedColor: string;
  onSelectColor: (color: string) => void;
  strokeWidth: number;
  onSelectStrokeWidth: (width: number) => void;
  isEraser: boolean;
  toggleEraser: () => void;
  onClear: () => void;
  onUndo: () => void;
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
  onUndo,
}: DrawingToolsProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customHex, setCustomHex] = useState(selectedColor);

  const handleColorSelect = (color: string) => {
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

        {/* Custom Color Picker Button */}
        <TouchableOpacity
          style={[styles.colorSwatch, styles.addColorButton]}
          onPress={() => {
            setCustomHex(selectedColor);
            setShowColorPicker(true);
          }}
        >
          <Ionicons name="color-palette-outline" size={18} color="#333" />
        </TouchableOpacity>
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
          {/* Eraser Toggle
          <TouchableOpacity
            style={[styles.toolButton, isEraser && styles.activeTool]}
            onPress={toggleEraser}
          >
            <MaterialCommunityIcons
              name={isEraser ? "eraser" : "eraser-variant"}
              size={22}
              color={isEraser ? "#333" : "#666"}
            />
          </TouchableOpacity> */}

          {/* Undo Button */}
          <TouchableOpacity style={styles.toolButton} onPress={onUndo}>
            <Ionicons name="arrow-undo-outline" size={22} color="#333" />
          </TouchableOpacity>

          {/* Clear Canvas */}
          <TouchableOpacity style={styles.toolButton} onPress={onClear}>
            <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Custom Color Modal */}
      <Modal
        visible={showColorPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowColorPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Custom Color</Text>
            <View
              style={[styles.colorPreview, { backgroundColor: customHex }]}
            />
            <TextInput
              style={styles.hexInput}
              value={customHex}
              onChangeText={setCustomHex}
              placeholder="#000000"
              autoCapitalize="characters"
              maxLength={7}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtn}
                onPress={() => setShowColorPicker(false)}
              >
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.confirmBtn]}
                onPress={() => {
                  handleColorSelect(customHex);
                  setShowColorPicker(false);
                }}
              >
                <Text style={[styles.btnText, { color: "white" }]}>Select</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  addColorButton: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9f9f9",
    borderStyle: "dashed",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 16,
    width: "80%",
    alignItems: "center",
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    color: "#333",
  },
  colorPreview: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#ddd",
    elevation: 2,
  },
  hexInput: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    fontSize: 16,
    textAlign: "center",
    color: "#333",
    backgroundColor: "#f9f9f9",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    justifyContent: "center",
  },
  modalBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
    minWidth: 100,
    alignItems: "center",
  },
  confirmBtn: {
    backgroundColor: "#333",
  },
  btnText: {
    fontWeight: "600",
    color: "#333",
  },
});
