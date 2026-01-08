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
      imageStyle={{ borderRadius: 12 }}
    >
      <View style={styles.overlay} />
      <Text style={styles.title}>Game Over</Text>
      <View style={styles.podiumRow}>
        <View style={styles.pillarWrap}>
          {second ? (
            <View style={[styles.pillar, styles.silverPillar]}>
              {second.avatar ? (
                <Image source={{ uri: second.avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder} />
              )}
              <Text style={styles.name}>{second.displayName}</Text>
              <Text style={styles.score}>{second.points} pts</Text>
            </View>
          ) : (
            <View style={[styles.pillar, styles.silverPillarPlaceholder]} />
          )}
        </View>

        <View style={styles.pillarWrapCenter}>
          {first ? (
            <View style={[styles.pillar, styles.goldPillar]}>
              {first.avatar ? (
                <Image
                  source={{ uri: first.avatar }}
                  style={styles.avatarLarge}
                />
              ) : (
                <View style={styles.avatarLargePlaceholder} />
              )}
              <Text style={styles.nameLarge}>{first.displayName}</Text>
              <Text style={styles.scoreLarge}>{first.points} pts</Text>
            </View>
          ) : (
            <View style={[styles.pillar, styles.goldPillarPlaceholder]} />
          )}
        </View>

        <View style={styles.pillarWrap}>
          {third ? (
            <View style={[styles.pillar, styles.bronzePillar]}>
              {third.avatar ? (
                <Image source={{ uri: third.avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder} />
              )}
              <Text style={styles.name}>{third.displayName}</Text>
              <Text style={styles.score}>{third.points} pts</Text>
            </View>
          ) : (
            <View style={[styles.pillar, styles.bronzePillarPlaceholder]} />
          )}
        </View>
      </View>

      <View style={styles.buttonsRow}>
        <TouchableOpacity
          style={[styles.button, styles.exitButton]}
          onPress={onExit}
        >
          <Text style={styles.buttonText}>Exit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.playAgainButton]}
          onPress={onPlayAgain}
        >
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
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 24,
    color: "#111827",
  },
  podiumRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    width: "100%",
    gap: 12,
  },
  pillarWrap: {
    flex: 1,
    alignItems: "center",
  },
  pillarWrapCenter: {
    flex: 1.2,
    alignItems: "center",
  },
  pillar: {
    width: "90%",
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 8,
  },
  goldPillar: {
    backgroundColor: "#FEF3C7",
    borderColor: "#F59E0B",
    borderWidth: 2,
  },
  silverPillar: {
    backgroundColor: "#EEF2FF",
    borderColor: "#6366F1",
    borderWidth: 1,
  },
  bronzePillar: {
    backgroundColor: "#FFF7ED",
    borderColor: "#D97706",
    borderWidth: 1,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 8,
  },
  avatarLarge: {
    width: 86,
    height: 86,
    borderRadius: 43,
    marginBottom: 10,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#E5E7EB",
    marginBottom: 8,
  },
  avatarLargePlaceholder: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: "#E5E7EB",
    marginBottom: 10,
  },
  name: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  score: {
    fontSize: 12,
    color: "#6B7280",
  },
  nameLarge: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  scoreLarge: {
    fontSize: 14,
    color: "#6B7280",
  },
  buttonsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    width: "100%",
    justifyContent: "center",
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 140,
    alignItems: "center",
  },
  exitButton: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  playAgainButton: {
    backgroundColor: "#4338CA",
  },
  buttonText: {
    fontWeight: "700",
    color: "#111827",
  },
  goldPillarPlaceholder: { backgroundColor: "#F8FAFC", height: 180 },
  silverPillarPlaceholder: { backgroundColor: "#F8FAFC", height: 140 },
  bronzePillarPlaceholder: { backgroundColor: "#F8FAFC", height: 120 },
});
