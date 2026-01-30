import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface Player {
  uid: string;
  displayName: string;
  points: number;
  avatar?: string | null;
}

interface PodiumProps {
  players: Player[]; // sorted desc
  onExit?: () => void;
  onPlayAgain?: () => void;
}

export default function Podium({ players, onExit, onPlayAgain }: PodiumProps) {
  const first = players[0] || null;
  const second = players[1] || null;
  const third = players[2] || null;

  return (
    <ImageBackground
      source={require("../assets/images/game_over.jpeg")}
      style={styles.container}
      imageStyle={{ borderRadius: 12, opacity: 1 }}
    >
      <View style={styles.overlay} />
      <Text style={styles.title}>🏆 Game Over 🏆</Text>

      <View style={styles.podiumRow}>
        {/* 2nd Place */}
        <View style={styles.column}>
          {second ? (
            <>
              <View style={styles.avatarContainer}>
                {second.avatar ? (
                  <Image
                    source={{ uri: second.avatar }}
                    style={styles.avatar}
                  />
                ) : (
                  <View
                    style={[
                      styles.avatarPlaceholder,
                      { backgroundColor: "#9CA3AF" },
                    ]}
                  >
                    <Text style={styles.avatarInitials}>
                      {second.displayName.charAt(0)}
                    </Text>
                  </View>
                )}
                <View
                  style={[styles.rankBadge, { backgroundColor: "#9CA3AF" }]}
                >
                  <Text style={styles.rankText}>2</Text>
                </View>
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {second.displayName}
              </Text>
              <Text style={styles.score}>{second.points} pts</Text>
            </>
          ) : null}
          <View style={[styles.bar, styles.silverBar]} />
        </View>

        {/* 1st Place */}
        <View style={styles.columnCenter}>
          {first ? (
            <>
              <Ionicons
                name="trophy"
                size={32}
                color="#F59E0B"
                style={styles.crown}
              />
              <View style={styles.avatarContainer}>
                {first.avatar ? (
                  <Image
                    source={{ uri: first.avatar }}
                    style={styles.avatarLarge}
                  />
                ) : (
                  <View
                    style={[
                      styles.avatarLargePlaceholder,
                      { backgroundColor: "#FCD34D" },
                    ]}
                  >
                    <Text style={styles.avatarInitialsLarge}>
                      {first.displayName.charAt(0)}
                    </Text>
                  </View>
                )}
                <View
                  style={[styles.rankBadge, { backgroundColor: "#F59E0B" }]}
                >
                  <Text style={styles.rankText}>1</Text>
                </View>
              </View>
              <Text style={styles.nameLarge} numberOfLines={1}>
                {first.displayName}
              </Text>
              <Text style={styles.scoreLarge}>{first.points} pts</Text>
            </>
          ) : null}
          <View style={[styles.bar, styles.goldBar]} />
        </View>

        {/* 3rd Place */}
        <View style={styles.column}>
          {third ? (
            <>
              <View style={styles.avatarContainer}>
                {third.avatar ? (
                  <Image source={{ uri: third.avatar }} style={styles.avatar} />
                ) : (
                  <View
                    style={[
                      styles.avatarPlaceholder,
                      { backgroundColor: "#D97706" },
                    ]}
                  >
                    <Text style={styles.avatarInitials}>
                      {third.displayName.charAt(0)}
                    </Text>
                  </View>
                )}
                <View
                  style={[styles.rankBadge, { backgroundColor: "#D97706" }]}
                >
                  <Text style={styles.rankText}>3</Text>
                </View>
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {third.displayName}
              </Text>
              <Text style={styles.score}>{third.points} pts</Text>
            </>
          ) : null}
          <View style={[styles.bar, styles.bronzeBar]} />
        </View>
      </View>

      <View style={styles.buttonsRow}>
        <TouchableOpacity
          style={[styles.button, styles.exitButton]}
          onPress={onExit}
        >
          <Ionicons name="exit-outline" size={20} color="#EF4444" />
          <Text style={[styles.buttonText, { color: "#EF4444" }]}>Exit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.playAgainButton]}
          onPress={onPlayAgain}
        >
          <Ionicons name="refresh" size={20} color="white" />
          <Text style={[styles.buttonText, { color: "white" }]}>
            Play Again
          </Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    borderRadius: 12,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(73, 73, 73, 0.21)",
    borderRadius: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    marginBottom: 30,
    color: "#111827",
    textShadowColor: "rgba(0,0,0,0.1)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  podiumRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    width: "100%",
    gap: 16,
    marginBottom: 20,
  },
  column: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  columnCenter: {
    flex: 1.3,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    marginTop: 8,
    boxShadow: "0px 2px 4px rgba(0,0,0,0.1)",
    elevation: 3,
  },
  goldBar: {
    backgroundColor: "#FCD34D", // Amber-300
    height: 160,
    borderWidth: 1,
    borderColor: "#101010",
  },
  silverBar: {
    backgroundColor: "#E5E7EB", // Gray-200
    height: 110,
    borderWidth: 1,
    borderColor: "#101010",
  },
  bronzeBar: {
    backgroundColor: "#FDBA74", // Orange-300
    height: 80,
    borderWidth: 1,
    borderColor: "#101010",
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 4,
    alignItems: "center",
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: "#101010",
  },
  avatarLarge: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 4,
    borderColor: "#101010",
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#101010",
  },
  avatarLargePlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "#101010",
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
  },
  avatarInitialsLarge: {
    fontSize: 32,
    fontWeight: "bold",
    color: "white",
  },
  rankBadge: {
    position: "absolute",
    bottom: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
  },
  rankText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  crown: {
    marginBottom: -12,
    zIndex: 10,
    boxShadow: "0px 2px 2px rgba(0,0,0,0.2)",
  },
  name: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
    textAlign: "center",
  },
  score: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
    marginBottom: 4,
  },
  nameLarge: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 2,
    textAlign: "center",
  },
  scoreLarge: {
    fontSize: 14,
    color: "#4B5563",
    fontWeight: "700",
    marginBottom: 4,
  },
  buttonsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
    width: "100%",
    justifyContent: "center",
  },
  button: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    minWidth: 140,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 2px 3px rgba(0,0,0,0.1)",
    elevation: 5,
  },
  exitButton: {
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: "#252525",
  },
  playAgainButton: {
    backgroundColor: "#ffac27",
    color: "white",
    borderWidth: 2,
    borderColor: "#252525",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "900",
  },
});
