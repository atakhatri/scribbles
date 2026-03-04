import { Ionicons } from "@expo/vector-icons";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { db } from "../firebaseConfig";

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  isCorrectGuess: boolean;
  isCloseGuess?: boolean;
  isSystem?: boolean;
  systemType?: string; // 'join' | 'leave' etc.
  timestamp: any;
}

export interface ChatUser {
  uid: string;
  displayName: string | null;
}

interface ChatProps {
  gameId: string;
  currentUser: ChatUser | null;
  currentWord: string;
  isDrawer: boolean;
  guesses: string[];
  onCorrectGuess: (userId: string) => Promise<void>;
  avoidKeyboard?: boolean;
}

const FadingMessage = ({
  item,
  rowStyle,
  nameStyle,
  textStyle,
}: {
  item: ChatMessage;
  rowStyle: StyleProp<ViewStyle>;
  nameStyle: StyleProp<TextStyle>;
  textStyle: StyleProp<TextStyle>;
}) => {
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const heightAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (measuredHeight !== null) {
      heightAnim.setValue(measuredHeight);
      Animated.sequence([
        Animated.delay(30000),
        Animated.parallel([
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: false, // Height does not support native driver
          }),
          Animated.timing(heightAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: false,
          }),
        ]),
      ]).start();
    }
  }, [measuredHeight]);

  return (
    <Animated.View
      onLayout={(e) => {
        if (measuredHeight === null) {
          setMeasuredHeight(e.nativeEvent.layout.height);
        }
      }}
      style={[
        rowStyle,
        {
          opacity: opacityAnim,
          height: measuredHeight !== null ? heightAnim : undefined,
          overflow: "hidden",
        },
      ]}
    >
      <Text style={nameStyle}>{item.userName}:</Text>
      <Text style={textStyle}>{item.text}</Text>
    </Animated.View>
  );
};

const getLevenshteinDistance = (a: string, b: string) => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1),
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

export default function ChatWindow({
  gameId,
  currentUser,
  currentWord,
  isDrawer,
  guesses,
  onCorrectGuess,
  avoidKeyboard = true,
}: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [historyVisible, setHistoryVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const historyListRef = useRef<FlatList>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  useEffect(() => {
    if (!gameId) return;

    const messagesRef = collection(db, "games", gameId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: ChatMessage[] = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as ChatMessage);
      });
      setMessages(msgs);
      setTimeout(
        () => flatListRef.current?.scrollToEnd({ animated: true }),
        100,
      );
    });

    return () => unsubscribe();
  }, [gameId]);

  // Scroll to bottom when keyboard opens to keep latest messages visible
  useEffect(() => {
    const kbdShow = Keyboard.addListener("keyboardDidShow", () => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });
    return () => kbdShow.remove();
  }, []);

  const handleSend = async () => {
    if (!inputText.trim() || !currentUser) return;

    const text = inputText.trim();
    const isGuess = text.toLowerCase() === currentWord.toLowerCase();
    const alreadyGuessed = guesses.includes(currentUser.uid);

    const dist = getLevenshteinDistance(
      text.toLowerCase(),
      currentWord.toLowerCase(),
    );
    const isClose =
      dist > 0 &&
      ((currentWord.length <= 5 && dist === 1) ||
        (currentWord.length > 5 && dist <= 2));

    // If it's a correct guess
    if (isGuess && !isDrawer) {
      if (alreadyGuessed) {
        setInputText("");
        return;
      }
      // Don't show the word in chat, show a system message or specific style
      await addDoc(collection(db, "games", gameId, "messages"), {
        userId: currentUser.uid,
        userName: currentUser.displayName || "Player",
        text: "Correctly guessed the word!",
        isCorrectGuess: true,
        timestamp: serverTimestamp(),
      });

      await onCorrectGuess(currentUser.uid);
    } else if (isClose && !isDrawer && !alreadyGuessed) {
      // Close guess - send system message but don't reveal text
      await addDoc(collection(db, "games", gameId, "messages"), {
        userId: currentUser.uid,
        userName: currentUser.displayName || "Player",
        text: `${currentUser.displayName || "Player"} is close!`,
        isCloseGuess: true,
        timestamp: serverTimestamp(),
      });
    } else {
      // Normal message
      await addDoc(collection(db, "games", gameId, "messages"), {
        userId: currentUser.uid,
        userName: currentUser.displayName || "Player",
        text: text,
        isCorrectGuess: false,
        timestamp: serverTimestamp(),
      });
    }

    setInputText("");
  };

  const getMessageStyles = (item: ChatMessage) => {
    const isCorrect = item.isCorrectGuess;
    const isClose = item.isCloseGuess;
    const isSystem = item.isSystem;
    const systemType = (item as any).systemType;
    const text = (item.text || "").toString();

    // In case messages were written without the boolean flags, infer from text
    const inferredIsCorrect = isCorrect || /correctly guessed/i.test(text);
    const inferredIsClose = isClose || /is close/i.test(text);

    let rowStyle: StyleProp<ViewStyle> = styles.messageRow;
    let textStyle: StyleProp<TextStyle> = styles.messageText;
    let nameStyle: StyleProp<TextStyle> = styles.userName;

    if (inferredIsCorrect) {
      rowStyle = [styles.messageRow, styles.correctRow];
      textStyle = [styles.messageText, styles.correctText];
      nameStyle = [styles.userName, styles.correctText];
    } else if (isClose) {
      rowStyle = [styles.messageRow, styles.closeRow];
      textStyle = [styles.messageText, styles.closeText];
      nameStyle = [styles.userName, styles.closeText];
    } else if (isSystem) {
      if (systemType === "join") {
        rowStyle = [styles.messageRow, styles.joinRow];
        textStyle = [styles.messageText, styles.joinText];
        nameStyle = [styles.userName, styles.joinText];
      } else if (systemType === "leave") {
        rowStyle = [styles.messageRow, styles.leaveRow];
        textStyle = [styles.messageText, styles.leaveText];
        nameStyle = [styles.userName, styles.leaveText];
      } else {
        rowStyle = [styles.messageRow, styles.systemRow];
        textStyle = [styles.messageText, styles.systemText];
        nameStyle = [styles.userName, styles.systemText];
      }
    }
    return { rowStyle, textStyle, nameStyle };
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const { rowStyle, textStyle, nameStyle } = getMessageStyles(item);
    return (
      <FadingMessage
        item={item}
        rowStyle={rowStyle}
        nameStyle={nameStyle}
        textStyle={textStyle}
      />
    );
  };

  const renderHistoryItem = ({ item }: { item: ChatMessage }) => {
    const { rowStyle, textStyle, nameStyle } = getMessageStyles(item);
    return (
      <View style={[rowStyle, { marginBottom: 8 }]}>
        <Text style={nameStyle}>{item.userName}:</Text>
        <Text style={textStyle}>{item.text}</Text>
      </View>
    );
  };

  const scrollToBottom = () => {
    historyListRef.current?.scrollToEnd({ animated: true });
    setShowScrollBottom(false);
  };

  const handleScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const isCloseToBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - 50;

    setShowScrollBottom(!isCloseToBottom);
  };

  return (
    <KeyboardAvoidingView
      enabled={avoidKeyboard}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 100}
      style={styles.container}
      pointerEvents="box-none"
    >
      <View style={styles.inputContainer} pointerEvents="auto">
        <TouchableOpacity
          style={styles.historyButton}
          onPress={() => setHistoryVisible(true)}
        >
          <Ionicons name="time" size={36} color="#555" />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={
            isDrawer ? "Chat with players..." : "Type your guess here..."
          }
          placeholderTextColor="#999"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
          {/* <Text style={styles.sendText}>Send</Text> */}
          <Text style={styles.sendText}>➤</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        ref={flatListRef}
        data={messages.slice(-5)}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        pointerEvents="box-none"
      />

      <Modal
        visible={historyVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setHistoryVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setHistoryVisible(false)}
          />
          <View style={styles.historyPanel}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Chat History</Text>
              <TouchableOpacity onPress={() => setHistoryVisible(false)}>
                <View style={styles.closeButton}>
                  <Ionicons name="close" size={24} color="#333" />
                </View>
              </TouchableOpacity>
            </View>
            <FlatList
              ref={historyListRef}
              data={messages}
              renderItem={renderHistoryItem}
              keyExtractor={(item) => item.id}
              style={styles.historyList}
              contentContainerStyle={styles.historyContent}
              showsVerticalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
            />
            {showScrollBottom && (
              <TouchableOpacity
                style={styles.scrollToBottomButton}
                onPress={scrollToBottom}
              >
                <Ionicons name="arrow-down" size={20} color="white" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "ffffff00",
    borderRadius: 0,
  },
  list: {
    flex: 1,
    backgroundColor: "#ffffff00",
    paddingBottom: 30,
  },
  listContent: {
    padding: 10,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 2,
    flexWrap: "wrap",
  },
  userName: {
    fontWeight: "bold",
    marginRight: 6,
    color: "#333",
  },
  messageText: {
    color: "#333",
  },
  correctRow: {
    backgroundColor: "#dcfce7", // Light green bg for correct guesses
    padding: 4,
    borderRadius: 4,
  },
  correctText: {
    color: "#166534",
    fontWeight: "bold",
  },
  closeRow: {
    backgroundColor: "#fef9c3", // Light yellow
    padding: 4,
    borderRadius: 4,
  },
  closeText: {
    color: "#854d0e",
    fontWeight: "bold",
  },
  systemRow: {
    backgroundColor: "#f3f4f6", // Light gray
    padding: 4,
    borderRadius: 4,
  },
  systemText: {
    color: "#4b5563",
    fontStyle: "italic",
    fontSize: 12,
  },
  joinRow: {
    backgroundColor: "#DBEAFE", // Light blue
    padding: 4,
    borderRadius: 4,
  },
  joinText: {
    color: "#1E40AF",
    fontWeight: "700",
  },
  leaveRow: {
    backgroundColor: "#FEE2E2", // Light red
    padding: 4,
    borderRadius: 4,
  },
  leaveText: {
    color: "#991B1B",
    fontWeight: "700",
  },
  inputContainer: {
    flexDirection: "row",
    padding: 10,
    borderBottomWidth: 2,
    borderBottomColor: "#101010",
    alignItems: "center",
  },
  historyButton: {
    marginRight: 8,
    padding: 2,
    backgroundColor: "#a7a7a789",
    borderRadius: 20,
  },
  input: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginRight: 10,
    fontSize: 16,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#101010",
  },
  sendButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#1d1d1d",
    borderRadius: 20,
  },
  sendText: {
    color: "white",
    fontWeight: "800",
    fontSize: 18,
    transform: [{ rotate: "-45deg" }, { translateX: 1 }, { translateY: -1 }],
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  historyPanel: {
    backgroundColor: "white",
    height: "70%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    paddingBottom: 0,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  closeButton: {
    padding: 5,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  historyList: {
    flex: 1,
  },
  historyContent: {
    paddingBottom: 60,
  },
  scrollToBottomButton: {
    position: "absolute",
    bottom: 20,
    right: 20,
    backgroundColor: "#333",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
});
