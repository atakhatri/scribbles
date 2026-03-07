import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";
import { useToast } from "../context/ToastContext";

interface Player {
  uid: string;
  displayName: string;
  points: number;
  avatar?: string | null;
  avatarGradientIndex?: number;
}

interface PodiumProps {
  players: Player[]; // sorted desc
  onExit?: () => void;
  onPlayAgain?: () => void;
}

const AVATAR_GRADIENTS = [
  ["#FF9A9E", "#FECFEF"], // Pink
  ["#a18cd1", "#fbc2eb"], // Purple
  ["#84fab0", "#8fd3f4"], // Aqua
  ["#fccb90", "#d57eeb"], // Sunset
  ["#e0c3fc", "#8ec5fc"], // Lavender
  ["#f093fb", "#f5576c"], // Red/Pink
  ["#4facfe", "#00f2fe"], // Blue
  ["#43e97b", "#38f9d7"], // Green
  ["#FF6B6B", "#FFD166"], // Orange/Red
  ["#a8edea", "#fed6e3"], // Pastel
  ["#c471ed", "#f64f59"], // Violet/Red
  ["#00c6fb", "#005bea"], // Deep Blue
  ["#f83600", "#f9d423"], // Sunset Orange/Yellow
  ["#6a11cb", "#2575fc"], // Royal Purple/Blue
  ["#FF5F6D", "#FFC371"], // Peach/Pink
  ["#20bf55", "#01baef"], // Green/Blue
] as const;

const getAvatarGradient = (uid: string) => {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
};

export default function Podium({ players, onExit, onPlayAgain }: PodiumProps) {
  const { playSound } = useToast();
  const first = players[0] || null;
  const second = players[1] || null;
  const third = players[2] || null;
  const rest = players.slice(3);
  const { width } = Dimensions.get("window");

  // Animation Values
  const goldHeight = useRef(new Animated.Value(0)).current;
  const silverHeight = useRef(new Animated.Value(0)).current;
  const bronzeHeight = useRef(new Animated.Value(0)).current;

  const winnersOpacity = useRef(new Animated.Value(0)).current;
  const winnersScale = useRef(new Animated.Value(0.5)).current;
  const winnersTranslateY = useRef(new Animated.Value(50)).current;

  const listOpacity = useRef(new Animated.Value(0)).current;
  const listTranslateY = useRef(new Animated.Value(50)).current;

  const buttonsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    playSound(require("../assets/sounds/victory.mp3"));

    Animated.sequence([
      Animated.delay(500), // Brief pause before starting
      // 1. Pillars rise
      Animated.parallel([
        Animated.timing(silverHeight, {
          toValue: 110,
          duration: 1000,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false, // height doesn't support native driver
        }),
        Animated.timing(goldHeight, {
          toValue: 160,
          duration: 1000,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(bronzeHeight, {
          toValue: 80,
          duration: 1000,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]),
      // 2. Winners pop in
      Animated.parallel([
        Animated.timing(winnersOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(winnersScale, {
          toValue: 1,
          friction: 6,
          useNativeDriver: true,
        }),
        Animated.timing(winnersTranslateY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      // 3. List & Buttons slide in
      Animated.parallel([
        Animated.timing(listOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(listTranslateY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(buttonsOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  return (
    <ImageBackground
      source={require("../assets/images/game_over.jpeg")}
      style={styles.container}
      imageStyle={{ opacity: 1 }}
    >
      <View style={styles.overlay} />
      <ConfettiCannon
        count={200}
        origin={{ x: width / 2, y: -20 }}
        fadeOut={true}
      />
      <View style={styles.contentContainer}>
        <Text style={styles.title}>🏆 Game Over 🏆</Text>

        <View style={styles.podiumRow}>
          {/* 2nd Place */}
          <View style={styles.column}>
            <Animated.View
              style={{
                opacity: winnersOpacity,
                transform: [
                  { scale: winnersScale },
                  { translateY: winnersTranslateY },
                ],
                alignItems: "center",
              }}
            >
              {second ? (
                <>
                  <View style={styles.avatarContainer}>
                    {second.avatar ? (
                      <Image
                        source={{ uri: second.avatar }}
                        style={styles.avatar}
                      />
                    ) : (
                      <LinearGradient
                        colors={
                          second.avatarGradientIndex !== undefined &&
                          second.avatarGradientIndex >= 0 &&
                          second.avatarGradientIndex < AVATAR_GRADIENTS.length
                            ? AVATAR_GRADIENTS[second.avatarGradientIndex]
                            : getAvatarGradient(second.uid)
                        }
                        style={styles.avatarPlaceholder}
                      >
                        <Text style={styles.avatarInitials}>
                          {second.displayName.charAt(0).toUpperCase()}
                        </Text>
                      </LinearGradient>
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
            </Animated.View>
            <Animated.View
              style={[styles.bar, styles.silverBar, { height: silverHeight }]}
            />
          </View>

          {/* 1st Place */}
          <View style={styles.columnCenter}>
            <Animated.View
              style={{
                opacity: winnersOpacity,
                transform: [
                  { scale: winnersScale },
                  { translateY: winnersTranslateY },
                ],
                alignItems: "center",
              }}
            >
              {first ? (
                <>
                  <Ionicons
                    name="trophy"
                    size={32}
                    color="#ffffff"
                    style={styles.crown}
                  />
                  <View style={styles.avatarContainer}>
                    {first.avatar ? (
                      <Image
                        source={{ uri: first.avatar }}
                        style={styles.avatarLarge}
                      />
                    ) : (
                      <LinearGradient
                        colors={
                          first.avatarGradientIndex !== undefined &&
                          first.avatarGradientIndex >= 0 &&
                          first.avatarGradientIndex < AVATAR_GRADIENTS.length
                            ? AVATAR_GRADIENTS[first.avatarGradientIndex]
                            : getAvatarGradient(first.uid)
                        }
                        style={styles.avatarLargePlaceholder}
                      >
                        <Text style={styles.avatarInitialsLarge}>
                          {first.displayName.charAt(0).toUpperCase()}
                        </Text>
                      </LinearGradient>
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
            </Animated.View>
            <Animated.View
              style={[styles.bar, styles.goldBar, { height: goldHeight }]}
            />
          </View>

          {/* 3rd Place */}
          <View style={styles.column}>
            <Animated.View
              style={{
                opacity: winnersOpacity,
                transform: [
                  { scale: winnersScale },
                  { translateY: winnersTranslateY },
                ],
                alignItems: "center",
              }}
            >
              {third ? (
                <>
                  <View style={styles.avatarContainer}>
                    {third.avatar ? (
                      <Image
                        source={{ uri: third.avatar }}
                        style={styles.avatar}
                      />
                    ) : (
                      <LinearGradient
                        colors={
                          third.avatarGradientIndex !== undefined &&
                          third.avatarGradientIndex >= 0 &&
                          third.avatarGradientIndex < AVATAR_GRADIENTS.length
                            ? AVATAR_GRADIENTS[third.avatarGradientIndex]
                            : getAvatarGradient(third.uid)
                        }
                        style={styles.avatarPlaceholder}
                      >
                        <Text style={styles.avatarInitials}>
                          {third.displayName.charAt(0).toUpperCase()}
                        </Text>
                      </LinearGradient>
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
            </Animated.View>
            <Animated.View
              style={[styles.bar, styles.bronzeBar, { height: bronzeHeight }]}
            />
          </View>
        </View>

        {/* Rest of Players List */}
        {rest.length > 0 && (
          <Animated.View
            style={[
              styles.restListContainer,
              {
                opacity: listOpacity,
                transform: [{ translateY: listTranslateY }],
              },
            ]}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.restListContent}
            >
              {rest.map((p, index) => (
                <View key={p.uid} style={styles.restRow}>
                  <View style={styles.restRankBadge}>
                    <Text style={styles.restRankText}>{index + 4}</Text>
                  </View>
                  {p.avatar ? (
                    <Image
                      source={{ uri: p.avatar }}
                      style={styles.restAvatar}
                    />
                  ) : (
                    <LinearGradient
                      colors={
                        p.avatarGradientIndex !== undefined &&
                        p.avatarGradientIndex >= 0 &&
                        p.avatarGradientIndex < AVATAR_GRADIENTS.length
                          ? AVATAR_GRADIENTS[p.avatarGradientIndex]
                          : getAvatarGradient(p.uid)
                      }
                      style={styles.restAvatarPlaceholder}
                    >
                      <Text style={styles.restAvatarText}>
                        {p.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </LinearGradient>
                  )}
                  <Text style={styles.restName} numberOfLines={1}>
                    {p.displayName}
                  </Text>
                  <Text style={styles.restScore}>{p.points} pts</Text>
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        <Animated.View style={[styles.buttonsRow, { opacity: buttonsOpacity }]}>
          <TouchableOpacity
            style={[styles.button, styles.exitButton]}
            onPress={onExit}
          >
            <Ionicons name="exit-outline" size={20} color="#333" />
            <Text style={styles.buttonText}>Exit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.playAgainButton]}
            onPress={onPlayAgain}
          >
            <Ionicons name="refresh" size={20} color="#333" />
            <Text style={styles.buttonText}>Play Again</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(73, 73, 73, 0.21)",
  },
  contentContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    paddingTop: 60,
    width: "100%",
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
    flexShrink: 0,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  goldBar: {
    backgroundColor: "#FCD34D", // Amber-300
    borderWidth: 1,
    borderColor: "#101010",
  },
  silverBar: {
    backgroundColor: "#E5E7EB", // Gray-200
    borderWidth: 1,
    borderColor: "#101010",
  },
  bronzeBar: {
    backgroundColor: "#FDBA74", // Orange-300
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
    marginBottom: 0,
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
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
  // Rest List Styles
  restListContainer: {
    flex: 1,
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 16,
    marginBottom: 20,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#333",
  },
  restListContent: {
    padding: 10,
  },
  restRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  restRankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  restRankText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 12,
  },
  restAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#333",
  },
  restAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#333",
  },
  restAvatarText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "white",
  },
  restName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  restScore: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  buttonsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: "auto",
    width: "100%",
    justifyContent: "center",
    paddingBottom: 20,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 5,
    borderWidth: 2,
    borderColor: "#333",
  },
  exitButton: {
    backgroundColor: "#fee2e2",
  },
  playAgainButton: {
    backgroundColor: "#4ECDC4",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#333",
  },
});
