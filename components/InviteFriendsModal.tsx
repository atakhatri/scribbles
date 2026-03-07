import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { arrayUnion, doc, getDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useToast } from "../context/ToastContext";
import GRADIENTS from "../data/gradients";
import { auth, db } from "../firebaseConfig";

const AVATAR_GRADIENTS = GRADIENTS;

const getAvatarGradient = (uid: string) => {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
};

export default function InviteFriendsModal({
  visible,
  onClose,
  roomId,
}: {
  visible: boolean;
  onClose: () => void;
  roomId: string;
}) {
  const [friends, setFriends] = useState<any[]>([]);
  const { showToast } = useToast();
  const [invitedIds, setInviteIds] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) {
      setInviteIds([]);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const me = auth.currentUser;
        if (!me) return;
        const meDoc = await getDoc(doc(db, "users", me.uid));
        const fIds: string[] = meDoc.exists() ? meDoc.data().friends || [] : [];
        const profiles: any[] = [];
        for (const id of fIds) {
          try {
            const d = await getDoc(doc(db, "users", id));
            if (d.exists()) profiles.push({ id: d.id, ...(d.data() || {}) });
          } catch (e) {
            // ignore
          }
        }
        if (mounted) setFriends(profiles);
      } catch (e) {
        console.error("InviteFriendsModal fetch error", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [visible]);

  const sendInvite = async (targetId: string) => {
    if (invitedIds.includes(targetId)) return;
    try {
      const inviterName = auth.currentUser?.displayName || "A player";
      await updateDoc(doc(db, "users", targetId), {
        gameInvites: arrayUnion({ roomId, inviterName, timestamp: Date.now() }),
      });
      setInviteIds((prev) => [...prev, targetId]);
      showToast({ message: "Invite sent!", type: "success" });
    } catch (e) {
      console.error("Failed to send invite", e);
      showToast({ message: "Failed to send invite", type: "error" });
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Invite Friends</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={friends}
            keyExtractor={(i) => i.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isInvited = invitedIds.includes(item.id);
              return (
                <View style={styles.row}>
                  <View style={styles.userInfo}>
                    <LinearGradient
                      colors={
                        item.avatarGradientIndex !== undefined &&
                        item.avatarGradientIndex >= 0 &&
                        item.avatarGradientIndex < AVATAR_GRADIENTS.length
                          ? (AVATAR_GRADIENTS[item.avatarGradientIndex] as any)
                          : (getAvatarGradient(item.id) as any)
                      }
                      style={styles.avatar}
                    >
                      <Text style={styles.avatarText}>
                        {item.username?.[0]?.toUpperCase() ||
                          item.displayName?.[0]?.toUpperCase() ||
                          "?"}
                      </Text>
                    </LinearGradient>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.username || item.displayName || item.id}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.inviteBtn, isInvited && styles.invitedBtn]}
                    onPress={() => sendInvite(item.id)}
                    disabled={isInvited}
                  >
                    <Text
                      style={[
                        styles.inviteText,
                        isInvited && styles.invitedText,
                      ]}
                    >
                      {isInvited ? "Sent" : "Invite"}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>No friends found.</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fffaeeff",
    borderRadius: 24,
    padding: 20,
    maxHeight: "70%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  title: { fontSize: 22, fontWeight: "800", color: "#333" },
  closeButton: {
    padding: 8,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 20,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "bold", color: "#333" },
  name: { fontSize: 16, fontWeight: "600", color: "#333", flex: 1 },
  inviteBtn: {
    backgroundColor: "#333",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 80,
    alignItems: "center",
  },
  invitedBtn: {
    backgroundColor: "#e0e0e0",
  },
  inviteText: { color: "white", fontWeight: "bold", fontSize: 14 },
  invitedText: { color: "#888" },
  empty: {
    textAlign: "center",
    color: "#888",
    marginTop: 30,
    fontStyle: "italic",
  },
});
