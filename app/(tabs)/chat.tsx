import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useNavigation, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from 'react-i18next';
import { apiRequest, getImageUrl, getBackendUrl } from '@/utils/backend';
import { getPadding, getFontSizes, scale } from '@/utils/responsive';
import { pageTitleBlockStyles } from '@/utils/pageTitleStyles';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { io, Socket } from 'socket.io-client';
import {
  consumePendingChatOpenUserId,
  peekPendingChatOpenUserId,
} from '@/utils/pendingChatOpen';
import { getUserIdString } from '@/utils/openChatWithUser';

const padding = getPadding();
const fontSizes = getFontSizes();

interface Chat {
  id: string;
  otherUser: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    profileImage?: string;
  };
  lastMessage: {
    id: string;
    message: string;
    id_sender: {
      id: string;
      firstName: string;
      lastName: string;
    };
    createdAt: string;
  } | null;
  unreadCount: number;
  updatedAt: string;
}

interface Message {
  id: string;
  id_Chat: string;
  message: string;
  id_sender: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    profileImage?: string;
  };
  id_reciver: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    profileImage?: string;
  };
  read: boolean;
  createdAt: string;
}

function getParamUserId(raw: string | string[] | undefined): string | null {
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ? String(value) : null;
}

function buildChatFromGetOrCreateResponse(
  data: {
    chat: {
      id: string;
      id_user1: { id: string; firstName?: string; lastName?: string; email?: string; profileImage?: string | null };
      id_user2: { id: string; firstName?: string; lastName?: string; email?: string; profileImage?: string | null };
      updatedAt?: string;
    };
  },
  otherUserId: string,
  myId: string,
): Chat {
  const u1 = data.chat.id_user1;
  const u2 = data.chat.id_user2;
  const otherUser =
    String(u1.id) === myId ? u2 : String(u2.id) === myId ? u1 : String(u1.id) === otherUserId ? u1 : u2;

  return {
    id: String(data.chat.id),
    otherUser: {
      id: String(otherUser?.id || otherUserId),
      firstName: otherUser?.firstName || '',
      lastName: otherUser?.lastName || '',
      email: otherUser?.email || '',
      profileImage: otherUser?.profileImage || undefined,
    },
    lastMessage: null,
    unreadCount: 0,
    updatedAt: data.chat.updatedAt || new Date().toISOString(),
  };
}

export default function ChatScreen() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading, user, token } = useAuth();
  const { setIsViewingChat } = useChat();
  const { markChatMessagesAsRead, markMessageNotificationsAsReadForUser } = useNotifications();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState<Chat[]>([]);
  const chatsRef = useRef<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [userImages, setUserImages] = useState<Record<string, string>>({});
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const messagesEndRef = useRef<ScrollView>(null);
  const socketRef = useRef<Socket | null>(null);
  const currentChatIdRef = useRef<string | null>(null);
  const currentOtherUserIdRef = useRef<string | null>(null);
  const lastMarkedChatIdRef = useRef<string | null>(null);
  const openingUserIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const lastMessagesFetchRef = useRef(0);
  const handleChatPressRef = useRef<(chat: Chat, opts?: { force?: boolean }) => Promise<void>>(async () => {});
  const openConversationWithUserRef = useRef<(otherUserId: string) => Promise<void>>(async () => {});

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    currentOtherUserIdRef.current = currentChat?.otherUser?.id
      ? String(currentChat.otherUser.id)
      : null;
  }, [currentChat?.otherUser?.id]);

  const getCurrentUserId = useCallback(() => {
    return String(user?._id || (user as { id?: string })?.id || '');
  }, [user]);

  const fetchUserImages = useCallback(async (chatsList: Chat[]) => {
    const imagesMap: Record<string, string> = {};
    const userIds = chatsList.map((chat) => chat.otherUser.id).filter(Boolean);

    await Promise.all(
      userIds.map(async (userId) => {
        try {
          const response = await apiRequest(`/user-image/${userId}`);
          if (response.ok) {
            const data = await response.json();
            if (data.ok && data.userImage?.image) {
              imagesMap[userId] = getImageUrl(data.userImage.image) || '';
            }
          }
        } catch (error) {
          console.error(`Error fetching image for user ${userId}:`, error);
        }
      })
    );

    setUserImages(imagesMap);
  }, []);

  const fetchChats = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await apiRequest('/chat/my-chats');
      const data = await response.json().catch(() => null);
      if (response.ok && data?.ok && Array.isArray(data.chats)) {
        setChats(data.chats);
        void fetchUserImages(data.chats);
      } else if (!response.ok) {
        console.error('Failed to fetch chats:', data?.message || response.status);
      }
    } catch (error) {
      console.error('Error fetching chats:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fetchUserImages]);

  const refreshChatsList = useCallback(async () => {
    await fetchChats(true);
  }, [fetchChats]);

  const { refreshing, onRefresh } = usePullToRefresh(refreshChatsList);

  // Update chat list directly when receiving a new message via socket
  const updateChatWithNewMessage = (messageData: any) => {
    const senderId = typeof messageData.id_sender === 'object' 
      ? (messageData.id_sender.id || messageData.id_sender._id) 
      : messageData.id_sender;
    const receiverId = typeof messageData.id_reciver === 'object'
      ? (messageData.id_reciver.id || messageData.id_reciver._id)
      : messageData.id_reciver;
    
    const currentUserId = user?._id || (user as any)?.id;
    
    // Determine the other user (the one who sent the message if we're the receiver, or vice versa)
    const otherUserId = receiverId === currentUserId || receiverId?.toString() === currentUserId?.toString() 
      ? senderId 
      : receiverId;
    
    setChats((prevChats) => {
      // Find the chat with this other user
      const chatIndex = prevChats.findIndex(
        (chat) => {
          const chatOtherUserId = chat.otherUser.id?.toString();
          const otherUserIdStr = otherUserId?.toString();
          return chatOtherUserId === otherUserIdStr;
        }
      );
      
      if (chatIndex === -1) {
        // Chat not found, might need to fetch chats (but don't do full refresh)
        // For now, just return previous chats
        return prevChats;
      }
      
      const updatedChats = [...prevChats];
      const chat = updatedChats[chatIndex];
      
      // Update the chat with new last message and increment unread count if we're the receiver
      const isReceiver = receiverId === currentUserId || receiverId?.toString() === currentUserId?.toString();
      const isCurrentChat = currentChatIdRef.current === messageData.id_Chat;
      
      // Check if this message was already processed (prevent double counting)
      const messageAlreadyProcessed = chat.lastMessage?.id === messageData.id;
      
      // Calculate unread count
      let newUnreadCount = chat.unreadCount;
      if (isCurrentChat) {
        // If viewing this chat, unread count should be 0
        newUnreadCount = 0;
      } else if (isReceiver && !messageData.read && !messageAlreadyProcessed) {
        // Only increment if: we're the receiver, message is unread, and we haven't processed this message yet
        newUnreadCount = chat.unreadCount + 1;
      }
      
      updatedChats[chatIndex] = {
        ...chat,
        id: messageData.id_Chat ? String(messageData.id_Chat) : chat.id,
        lastMessage: {
          id: messageData.id,
          message: messageData.message,
          id_sender: {
            id: senderId?.toString() || '',
            firstName: typeof messageData.id_sender === 'object' ? (messageData.id_sender.firstName || '') : '',
            lastName: typeof messageData.id_sender === 'object' ? (messageData.id_sender.lastName || '') : '',
          },
          createdAt: messageData.createdAt,
        },
        // Only increment unread count if we're the receiver and not viewing this chat
        unreadCount: newUnreadCount,
        updatedAt: new Date().toISOString(),
      };
      
      // Move updated chat to the top (most recent)
      const [updatedChat] = updatedChats.splice(chatIndex, 1);
      updatedChats.unshift(updatedChat);
      
      // Store in ref for event emission
      chatsRef.current = updatedChats;
      
      // Emit event after state update (using setTimeout to avoid render cycle)
      setTimeout(() => {
        DeviceEventEmitter.emit('refreshChats', chatsRef.current);
      }, 0);
      
      return updatedChats;
    });
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [authLoading, isAuthenticated, router]);

  // Keep ref in sync with state
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  // Setup Socket.IO connection
  useEffect(() => {
    if (!isAuthenticated || !user?._id) {
      return;
    }
    
    // Close existing socket if any
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    const backendUrl = getBackendUrl();
    const socket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      auth: token ? { token } : undefined,
    });

    socket.on('connect', () => {
      console.log('Socket connected for chat');
      const userId = user._id || (user as any).id;
      if (userId) {
        socket.emit('join_user', userId);
      }
    });

    socket.on('new_message', (data: any) => {
      console.log('New message received via socket:', data);
      
      // Update the chat list directly without refreshing
      updateChatWithNewMessage(data);

      const senderId = typeof data.id_sender === 'object'
        ? String(data.id_sender.id || data.id_sender._id || '')
        : String(data.id_sender || '');
      const receiverId = typeof data.id_reciver === 'object'
        ? String(data.id_reciver.id || data.id_reciver._id || '')
        : String(data.id_reciver || '');
      const openOtherUserId = currentOtherUserIdRef.current;
      const isOpenConversation =
        !!openOtherUserId &&
        (senderId === openOtherUserId || receiverId === openOtherUserId);

      if (isOpenConversation) {
        if (data.id_Chat && String(data.id_Chat) !== String(currentChatIdRef.current)) {
          currentChatIdRef.current = String(data.id_Chat);
          setSelectedChatId(String(data.id_Chat));
        }

        setMessages((prev) => {
          const exists = prev.some((m) => m.id === data.id);
          if (exists) return prev;
          
          // Add new message
          return [...prev, {
            id: data.id,
            id_Chat: data.id_Chat,
            message: data.message,
            id_sender: data.id_sender,
            id_reciver: data.id_reciver,
            read: data.read,
            createdAt: data.createdAt,
          }];
        });

        // Update currentChat state if it exists
        setCurrentChat((prevChat) => {
          if (!prevChat) return prevChat;
          
          return {
            ...prevChat,
            lastMessage: {
              id: data.id,
              message: data.message,
              id_sender: {
                id: typeof data.id_sender === 'object' ? (data.id_sender.id || data.id_sender._id) : data.id_sender,
                firstName: typeof data.id_sender === 'object' ? (data.id_sender.firstName || '') : '',
                lastName: typeof data.id_sender === 'object' ? (data.id_sender.lastName || '') : '',
              },
              createdAt: data.createdAt,
            },
            // Don't increment unread count if we're viewing the chat
            unreadCount: 0,
          };
        });
        
        // Also update the chat list to ensure unread count is 0 when viewing the chat
        const senderId = typeof data.id_sender === 'object' 
          ? (data.id_sender.id || data.id_sender._id) 
          : data.id_sender;
        
        setChats((prevChats) => {
          const updated = prevChats.map((c) => {
            const chatOtherUserId = c.otherUser.id?.toString();
            const senderIdStr = senderId?.toString();
            
            if (chatOtherUserId === senderIdStr) {
              return { ...c, unreadCount: 0 };
            }
            return c;
          });
          
          // Store in ref for event emission
          chatsRef.current = updated;
          
          // Emit event after state update (using setTimeout to avoid render cycle)
          setTimeout(() => {
            DeviceEventEmitter.emit('refreshChats', chatsRef.current);
          }, 0);
          
          return updated;
        });
        
        // Mark message notifications as read when viewing the chat (for badge update)
        if (markMessageNotificationsAsReadForUser && senderId) {
          markMessageNotificationsAsReadForUser(senderId);
        }

        // Scroll to bottom
        setTimeout(() => {
          messagesEndRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    });

    socket.on('new_notification', (notificationData: any) => {
      console.log('New notification received via socket:', notificationData);
      
      // If it's a message notification, update the chat unread count
      if (notificationData.type === 'message') {
        const senderId = notificationData.id_sender?.id || notificationData.id_sender?._id || notificationData.id_sender;
        
        if (senderId) {
          setChats((prevChats) => {
            const chatIndex = prevChats.findIndex(
              (chat) => {
                const chatOtherUserId = chat.otherUser.id?.toString();
                const senderIdStr = senderId?.toString();
                return chatOtherUserId === senderIdStr;
              }
            );
            
            if (chatIndex === -1) {
              // Chat not found, return previous chats
              return prevChats;
            }
            
            const updatedChats = [...prevChats];
            const chat = updatedChats[chatIndex];
            
            // Check if we're currently viewing this chat
            const isViewingThisChat = currentChatIdRef.current && 
              (chat.id === currentChatIdRef.current || 
               chat.otherUser.id?.toString() === senderId?.toString());
            
            // For message notifications, don't increment unread count here
            // The new_message handler (updateChatWithNewMessage) already handles unread count increment
            // This prevents double counting when both new_message and new_notification events fire
            if (isViewingThisChat) {
              // If viewing this chat, ensure unread count is 0
              updatedChats[chatIndex] = {
                ...chat,
                unreadCount: 0,
              };
            }
            // Note: We don't increment here for message notifications because updateChatWithNewMessage already handles it
            
            return updatedChats;
          });
        }
      }
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socketRef.current = socket;

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [isAuthenticated, user, token]);

  useEffect(() => {
    if (isAuthenticated) {
      // Listen for refresh event from NotificationBanner to update badge in real-time
      const subscription = DeviceEventEmitter.addListener(
        'refreshChats',
        (updatedChats?: any[]) => {
          // If chats are provided, update local state without hitting the backend again.
          if (updatedChats && Array.isArray(updatedChats)) {
            setChats(updatedChats as any);
            chatsRef.current = updatedChats as any;
            return;
          }
          // Fallback: refresh from backend only when payload is missing.
          void fetchChats(true);
        }
      );

      return () => {
        subscription.remove();
      };
    }
  }, [isAuthenticated, fetchChats]);

  useFocusEffect(
    useCallback(() => {
      if (authLoading || !isAuthenticated) return;
      if (selectedChatId && currentChat) {
        const now = Date.now();
        const shouldReload =
          messagesRef.current.length === 0 || now - lastMessagesFetchRef.current > 5000;
        if (shouldReload) {
          void handleChatPressRef.current(
            { ...currentChat, id: selectedChatId },
            { force: true, silent: true },
          );
        }
        return;
      }
      void fetchChats(chats.length === 0 ? false : true);
    }, [authLoading, isAuthenticated, selectedChatId, currentChat, fetchChats, chats.length]),
  );

  const fetchMessagesForChat = useCallback(
    async (chat: Chat, opts?: { force?: boolean; silent?: boolean }) => {
      const chatId = String(chat.id);
      const otherUserId = String(chat.otherUser.id);
      const force = opts?.force ?? false;
      const silent = opts?.silent ?? false;

      if (
        !force &&
        selectedChatId === chatId &&
        currentChatIdRef.current === chatId &&
        messagesRef.current.length > 0 &&
        !loadingMessages
      ) {
        return;
      }

      if (!silent) {
        setSelectedChatId(chatId);
        setCurrentChat(chat);
        setMessages([]);
        setLoadingMessages(true);
      }

      currentChatIdRef.current = chatId;
      lastMarkedChatIdRef.current = chatId;
      lastMessagesFetchRef.current = Date.now();

      setChats((prevChats) => {
        const updated = prevChats.map((c) =>
          String(c.id) === chatId || String(c.otherUser.id) === otherUserId
            ? { ...c, unreadCount: 0 }
            : c,
        );
        chatsRef.current = updated;
        return updated;
      });

      void markChatMessagesAsRead?.(otherUserId);

      try {
        let serverChatId = chatId;
        let loadedMessages: Message[] = [];

        const messagesRes = await apiRequest(`/chat/${encodeURIComponent(chatId)}/messages`);
        const messagesData = await messagesRes.json().catch(() => null);

        if (messagesRes.ok && messagesData?.ok) {
          loadedMessages = Array.isArray(messagesData.messages) ? messagesData.messages : [];
        }

        const needsFallback =
          loadedMessages.length === 0 &&
          (!messagesRes.ok || chat.lastMessage || messagesRes.status === 404);

        if (needsFallback) {
          const createRes = await apiRequest('/chat/get-or-create', {
            method: 'POST',
            body: JSON.stringify({ otherUserId }),
          });
          const createData = await createRes.json().catch(() => null);
          if (createRes.ok && createData?.ok && createData.chat) {
            serverChatId = String(createData.chat.id);
            loadedMessages = Array.isArray(createData.messages) ? createData.messages : [];
          } else if (!messagesRes.ok) {
            console.error(
              'Failed to load chat messages:',
              createData?.message || messagesData?.message || messagesRes.status,
            );
            if (!silent) setMessages([]);
            return;
          }
        }

        currentChatIdRef.current = serverChatId;
        if (!silent) {
          setSelectedChatId(serverChatId);
          setCurrentChat((prevChat) =>
            prevChat
              ? { ...prevChat, id: serverChatId, unreadCount: 0 }
              : { ...chat, id: serverChatId, unreadCount: 0 },
          );
        }
        setMessages(loadedMessages);

        if (serverChatId !== chatId) {
          setChats((prevChats) =>
            prevChats.map((c) =>
              String(c.otherUser.id) === otherUserId
                ? { ...c, id: serverChatId, unreadCount: 0 }
                : c,
            ),
          );
        }

        setTimeout(() => {
          messagesEndRef.current?.scrollToEnd({ animated: !silent });
        }, 50);
      } catch (error) {
        console.error('Error fetching messages:', error);
        if (!silent) setMessages([]);
      } finally {
        if (!silent) setLoadingMessages(false);
      }
    },
    [loadingMessages, markChatMessagesAsRead, selectedChatId],
  );

  const handleChatPress = async (chat: Chat, opts?: { force?: boolean; silent?: boolean }) => {
    await fetchMessagesForChat(chat, opts);
  };
  handleChatPressRef.current = handleChatPress;

  // Update chat context when viewing a chat
  useEffect(() => {
    setIsViewingChat(!!selectedChatId);

    const activeOtherUserId =
      selectedChatId && currentChat?.otherUser?.id ? currentChat.otherUser.id : null;
    DeviceEventEmitter.emit('activeChatChanged', {
      isViewingChat: !!selectedChatId,
      otherUserId: activeOtherUserId,
    });

    return () => {
      setIsViewingChat(false);
      DeviceEventEmitter.emit('activeChatChanged', {
        isViewingChat: false,
        otherUserId: null,
      });
    };
  }, [selectedChatId, currentChat, setIsViewingChat]);

  const openConversationWithUser = useCallback(
    async (otherUserId: string) => {
      const normalizedId = String(otherUserId);
      const myId = getCurrentUserId();
      if (!myId || myId === normalizedId) return;

      if (
        selectedChatId &&
        currentChat &&
        String(currentChat.otherUser.id) === normalizedId &&
        messagesRef.current.length > 0
      ) {
        return;
      }

      const existing = chats.find((c) => String(c.otherUser.id) === normalizedId);
      if (existing) {
        await handleChatPressRef.current(existing);
        return;
      }

      setLoadingMessages(true);
      setSelectedChatId(null);
      setCurrentChat(null);
      setMessages([]);

      try {
        const response = await apiRequest('/chat/get-or-create', {
          method: 'POST',
          body: JSON.stringify({ otherUserId: normalizedId }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok || !data?.chat) {
          console.error('Failed to open chat:', data?.message || response.status);
          return;
        }

        const serverChatId = String(data.chat.id);
        const loadedMessages = Array.isArray(data.messages) ? data.messages : [];
        const chat = buildChatFromGetOrCreateResponse(data, normalizedId, myId);
        currentChatIdRef.current = serverChatId;
        lastMarkedChatIdRef.current = serverChatId;

        setChats((prev) => {
          const withoutDuplicate = prev.filter(
            (c) => String(c.otherUser.id) !== normalizedId,
          );
          return [{ ...chat, id: serverChatId }, ...withoutDuplicate];
        });
        void fetchUserImages([{ ...chat, id: serverChatId }]);

        setSelectedChatId(serverChatId);
        setCurrentChat({ ...chat, id: serverChatId });
        setMessages(loadedMessages);

        void markChatMessagesAsRead?.(normalizedId);

        setTimeout(() => {
          messagesEndRef.current?.scrollToEnd({ animated: true });
        }, 50);
      } catch (error) {
        console.error('Error opening chat with user:', error);
      } finally {
        setLoadingMessages(false);
      }
    },
    [
      chats,
      currentChat,
      selectedChatId,
      getCurrentUserId,
      fetchUserImages,
      markChatMessagesAsRead,
    ],
  );
  openConversationWithUserRef.current = openConversationWithUser;

  const resolveIncomingOpenUserId = useCallback((): string | null => {
    return (
      getParamUserId(params.userId as string | string[] | undefined) ||
      peekPendingChatOpenUserId()
    );
  }, [params.userId]);

  const tryOpenRequestedConversation = useCallback(async () => {
    const targetUserId = resolveIncomingOpenUserId();
    if (!targetUserId || !isAuthenticated || !user || !token) return;
    if (openingUserIdRef.current === targetUserId) return;

    openingUserIdRef.current = targetUserId;
    try {
      await openConversationWithUserRef.current(targetUserId);
    } finally {
      openingUserIdRef.current = null;
      consumePendingChatOpenUserId();
      router.setParams({ userId: '' });
    }
  }, [resolveIncomingOpenUserId, isAuthenticated, user, token, router]);

  useEffect(() => {
    void tryOpenRequestedConversation();
  }, [tryOpenRequestedConversation]);

  useFocusEffect(
    useCallback(() => {
      void tryOpenRequestedConversation();
    }, [tryOpenRequestedConversation]),
  );

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !currentChat || sendingMessage) return;

    const messageText = newMessage.trim();
    setNewMessage('');
    setSendingMessage(true);
    
    try {
      const response = await apiRequest('/chat/get-or-create', {
        method: 'POST',
        body: JSON.stringify({ otherUserId: currentChat.otherUser.id }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.chat) {
          // Store chat ID if not already stored
          currentChatIdRef.current = data.chat.id;
          
          // Send the message (backend will save to DB and emit via socket)
          const sendResponse = await apiRequest('/chat/send-message', {
            method: 'POST',
            body: JSON.stringify({
              id_Chat: data.chat.id,
              message: messageText,
              id_reciver: currentChat.otherUser.id,
            }),
          });

          if (sendResponse.ok) {
            const sendData = await sendResponse.json();
            if (sendData.ok && sendData.message) {
              // Add message optimistically (socket will also send it, but this ensures immediate UI update)
              setMessages(prev => {
                const exists = prev.some((m) => m.id === sendData.message.id);
                if (exists) return prev;
                return [...prev, sendData.message];
              });
              
              // Update chat list locally instead of fetching (socket will also update it)
              // No need to fetch, socket updateChatWithNewMessage handles it
              
              // Scroll to bottom
              setTimeout(() => {
                messagesEndRef.current?.scrollToEnd({ animated: true });
              }, 100);
            }
          } else {
            // If send failed, restore message text
            setNewMessage(messageText);
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Restore message text on error
      setNewMessage(messageText);
    } finally {
      setSendingMessage(false);
    }
  };

  const getOtherUserInitials = (chat: Chat) => {
    const firstName = chat.otherUser.firstName || '';
    const lastName = chat.otherUser.lastName || '';
    if (firstName && lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    if (firstName) {
      return firstName.substring(0, 2).toUpperCase();
    }
    if (chat.otherUser.email) {
      return chat.otherUser.email.substring(0, 2).toUpperCase();
    }
    return 'U';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Hier';
    } else if (days < 7) {
      return date.toLocaleDateString('fr-FR', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
  };

  if (authLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#0d9488" />
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        {/* Header */}
        <Animated.View
          entering={FadeInDown.duration(600).springify()}
          style={styles.header}
        >
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
            style={styles.headerGradient}
          >
            <View style={pageTitleBlockStyles.block}>
              <View style={styles.headerTitleContainer}>
                <ThemedText style={[pageTitleBlockStyles.cardTitle, styles.headerTitleInRow]}>
                  {t('tabs.messages')}
                </ThemedText>
                {(() => {
                  const chatsWithUnread = chats.filter((chat) => (chat.unreadCount || 0) > 0).length;
                  return chatsWithUnread > 0 ? (
                    <View style={styles.headerBadge}>
                      <ThemedText style={styles.headerBadgeText}>
                        {chatsWithUnread > 9 ? '9+' : chatsWithUnread}
                      </ThemedText>
                    </View>
                  ) : null;
                })()}
              </View>
              <ThemedText style={pageTitleBlockStyles.cardSubtitle}>
                {t('chat.conversationsCount', { count: chats.length })}
              </ThemedText>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Chats List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0d9488" />
            <ThemedText style={styles.loadingText}>{t('common.loading')}</ThemedText>
          </View>
        ) : chats.length === 0 ? (
          <View style={styles.emptyContainer}>
            <IconSymbol name="message" size={scale(64)} color="#9ca3af" />
            <ThemedText style={styles.emptyText}>{t('chat.emptyTitle')}</ThemedText>
            <ThemedText style={styles.emptySubtext}>
              {t('chat.emptyBody')}
            </ThemedText>
          </View>
        ) : (
          <ScrollView
            style={styles.chatsList}
            contentContainerStyle={[
              styles.chatsListContent,
              {
                paddingBottom: Platform.OS === 'ios' 
                  ? 90 
                  : 80 + Math.max(insets.bottom, 0), // Account for tab bar height + Android nav bar
              }
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#0d9488"
                colors={['#0d9488']}
              />
            }
          >
            {chats.map((chat) => (
              <Animated.View
                key={chat.id}
                entering={FadeInDown.duration(600).delay(chats.indexOf(chat) * 50).springify()}
              >
                <TouchableOpacity
                  onPress={() => handleChatPress(chat)}
                  style={[
                    styles.chatItem,
                    selectedChatId === chat.id && styles.chatItemSelected,
                  ]}
                  activeOpacity={0.7}
                >
                  {/* Avatar */}
                  <View style={styles.chatAvatarContainer}>
                    {userImages[chat.otherUser.id] ? (
                      <Image
                        source={{ uri: userImages[chat.otherUser.id] }}
                        style={styles.chatAvatar}
                        contentFit="cover"
                      />
                    ) : (
                      <LinearGradient
                        colors={['#0d9488', '#14b8a6']}
                        style={styles.chatAvatarGradient}
                      >
                        <ThemedText style={styles.chatAvatarText}>
                          {getOtherUserInitials(chat)}
                        </ThemedText>
                      </LinearGradient>
                    )}
                    {chat.unreadCount > 0 && (
                      <View style={styles.unreadBadge}>
                        <ThemedText style={styles.unreadBadgeText}>
                          {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
                        </ThemedText>
                      </View>
                    )}
                  </View>

                  {/* Chat Info */}
                  <View style={styles.chatInfo}>
                    <View style={styles.chatInfoHeader}>
                      <ThemedText style={styles.chatName} numberOfLines={1}>
                        {chat.otherUser.firstName && chat.otherUser.lastName
                          ? `${chat.otherUser.firstName} ${chat.otherUser.lastName}`
                          : chat.otherUser.email}
                      </ThemedText>
                      {chat.lastMessage && (
                        <ThemedText style={styles.chatDate}>
                          {formatDate(chat.lastMessage.createdAt)}
                        </ThemedText>
                      )}
                    </View>
                    {chat.lastMessage && (
                      <ThemedText
                        style={[
                          styles.chatLastMessage,
                          chat.unreadCount > 0 && styles.chatLastMessageUnread,
                        ]}
                        numberOfLines={1}
                      >
                        {(() => {
                          const senderId = typeof chat.lastMessage.id_sender === 'object' 
                            ? chat.lastMessage.id_sender.id 
                            : chat.lastMessage.id_sender;
                          const currentUserId = user?._id || (user as any)?.id;
                          return senderId === currentUserId ? 'Vous: ' : '';
                        })()}
                        {chat.lastMessage.message}
                      </ThemedText>
                    )}
                  </View>

                  {/* Arrow */}
                  <IconSymbol
                    name="chevron.right"
                    size={scale(20)}
                    color="#9ca3af"
                  />
                </TouchableOpacity>
              </Animated.View>
            ))}
          </ScrollView>
        )}

        {/* Messages View - Show when a chat is selected */}
        {selectedChatId && currentChat && (
          <View style={[
            styles.messagesContainer,
            {
              // Tab bar is hidden while viewing a conversation,
              // so use full height and keep only safe-area bottom spacing.
              bottom: Math.max(insets.bottom, 6),
            }
          ]}>
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
              <View style={styles.messagesHeader}>
                <TouchableOpacity
                  onPress={() => {
                    setSelectedChatId(null);
                    setCurrentChat(null);
                    setMessages([]);
                    currentChatIdRef.current = null;
                  }}
                  style={styles.backButton}
                >
                  <IconSymbol name="chevron.left" size={scale(24)} color="#1f2937" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const otherUserId = getUserIdString(currentChat.otherUser.id);
                    if (otherUserId) {
                      router.push(`/user/${otherUserId}` as any);
                    }
                  }}
                  style={styles.messagesHeaderInfo}
                  activeOpacity={0.7}
                >
                  {userImages[currentChat.otherUser.id] ? (
                    <Image
                      source={{ uri: userImages[currentChat.otherUser.id] }}
                      style={styles.messagesHeaderAvatar}
                      contentFit="cover"
                    />
                  ) : (
                    <LinearGradient
                      colors={['#0d9488', '#14b8a6']}
                      style={styles.messagesHeaderAvatarGradient}
                    >
                      <ThemedText style={styles.messagesHeaderAvatarText}>
                        {getOtherUserInitials(currentChat)}
                      </ThemedText>
                    </LinearGradient>
                  )}
                  <ThemedText style={styles.messagesTitle} numberOfLines={1}>
                    {currentChat.otherUser.firstName && currentChat.otherUser.lastName
                      ? `${currentChat.otherUser.firstName} ${currentChat.otherUser.lastName}`
                      : currentChat.otherUser.email}
                  </ThemedText>
                  <IconSymbol name="chevron.right" size={scale(16)} color="#9ca3af" />
                </TouchableOpacity>
              </View>
              {loadingMessages ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#0d9488" />
                </View>
              ) : (
                <>
                  <ScrollView
                    ref={messagesEndRef}
                    style={styles.messagesList}
                    contentContainerStyle={styles.messagesListContent}
                    onContentSizeChange={() => {
                      messagesEndRef.current?.scrollToEnd({ animated: true });
                    }}
                    keyboardShouldPersistTaps="handled"
                  >
                    {messages.length === 0 ? (
                      <View style={styles.emptyMessages}>
                        <ThemedText style={styles.emptyMessagesText}>
                          {t('chat.emptyMessages')}
                        </ThemedText>
                      </View>
                    ) : (
                      messages.map((message) => {
                        const senderId = typeof message.id_sender === 'object' ? message.id_sender.id : message.id_sender;
                        const isMyMessage = senderId === user?._id || senderId === (user as any)?.id;
                        return (
                          <View
                            key={message.id}
                            style={[
                              styles.messageBubble,
                              isMyMessage ? styles.messageBubbleRight : styles.messageBubbleLeft,
                            ]}
                          >
                            <LinearGradient
                              colors={
                                isMyMessage
                                  ? ['#0d9488', '#14b8a6']
                                  : ['#f3f4f6', '#e5e7eb']
                              }
                              style={styles.messageBubbleGradient}
                            >
                              <ThemedText
                                style={[
                                  styles.messageText,
                                  isMyMessage && styles.messageTextRight,
                                ]}
                              >
                                {message.message}
                              </ThemedText>
                              <ThemedText
                                style={[
                                  styles.messageTime,
                                  isMyMessage && styles.messageTimeRight,
                                ]}
                              >
                                {new Date(message.createdAt).toLocaleTimeString('fr-FR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </ThemedText>
                            </LinearGradient>
                          </View>
                        );
                      })
                    )}
                  </ScrollView>
                  {/* Message Input */}
                  <View style={styles.messageInputContainer}>
                    <View style={styles.messageInputWrapper}>
                      <TextInput
                        style={styles.messageInput}
                        placeholder="Écrivez votre message..."
                        placeholderTextColor="#9ca3af"
                        value={newMessage}
                        onChangeText={setNewMessage}
                        multiline
                        maxLength={500}
                        editable={!sendingMessage}
                        returnKeyType="send"
                        onSubmitEditing={handleSendMessage}
                      />
                    </View>
                    <TouchableOpacity
                      onPress={handleSendMessage}
                      disabled={!newMessage.trim() || sendingMessage}
                      style={[
                        styles.sendButton,
                        (!newMessage.trim() || sendingMessage) && styles.sendButtonDisabled,
                      ]}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={['#0d9488', '#14b8a6']}
                        style={styles.sendButtonGradient}
                      >
                        {sendingMessage ? (
                          <ActivityIndicator color="#ffffff" size="small" />
                        ) : (
                          <IconSymbol name="paperplane.fill" size={scale(20)} color="#ffffff" />
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </KeyboardAvoidingView>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    flex: 1,
  },
  header: {
    marginBottom: padding.medium,
    borderRadius: scale(24),
    overflow: 'hidden',
    marginHorizontal: padding.horizontal,
    marginTop: padding.medium,
  },
  headerGradient: {
    padding: padding.large,
    alignItems: 'center',
    width: '100%',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: scale(8),
    width: '100%',
  },
  headerTitleInRow: {
    marginBottom: 0,
    flexShrink: 1,
  },
  headerBadge: {
    backgroundColor: '#ef4444',
    borderRadius: scale(12),
    minWidth: scale(24),
    height: scale(24),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(8),
    borderWidth: scale(2),
    borderColor: '#ffffff',
    ...Platform.select({
      ios: {
        shadowColor: '#ef4444',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  headerBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: fontSizes.xs,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: padding.large * 2,
  },
  loadingText: {
    fontSize: fontSizes.md,
    color: '#64748b',
    marginTop: padding.medium,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: padding.large * 2,
  },
  emptyText: {
    fontSize: fontSizes.xl,
    fontWeight: '700',
    color: '#1f2937',
    marginTop: padding.large,
  },
  emptySubtext: {
    fontSize: fontSizes.md,
    color: '#64748b',
    marginTop: padding.small,
  },
  chatsList: {
    flex: 1,
  },
  chatsListContent: {
    padding: padding.medium,
    paddingBottom: Platform.OS === 'ios' ? 90 : 80, // Base padding, will be adjusted inline
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: padding.medium,
    backgroundColor: '#ffffff',
    borderRadius: scale(16),
    marginBottom: padding.small,
    borderWidth: scale(1),
    borderColor: '#e5e7eb',
  },
  chatItemSelected: {
    borderColor: '#0d9488',
    borderWidth: scale(2),
    backgroundColor: '#f0fdfa',
  },
  chatAvatarContainer: {
    position: 'relative',
    marginRight: padding.medium,
  },
  chatAvatar: {
    width: scale(56),
    height: scale(56),
    borderRadius: scale(28),
  },
  chatAvatarGradient: {
    width: scale(56),
    height: scale(56),
    borderRadius: scale(28),
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatAvatarText: {
    fontSize: fontSizes.lg,
    fontWeight: '700',
    color: '#ffffff',
  },
  unreadBadge: {
    position: 'absolute',
    top: scale(-6),
    right: scale(-6),
    backgroundColor: '#ef4444',
    borderRadius: scale(11),
    minWidth: scale(22),
    height: scale(22),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(4),
    borderWidth: scale(2.5),
    borderColor: '#ffffff',
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#ef4444',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  unreadBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: fontSizes.xs,
    includeFontPadding: false,
    textAlignVertical: 'center',
    width: '100%',
    letterSpacing: 0.2,
  },
  chatInfo: {
    flex: 1,
    marginRight: padding.small,
  },
  chatInfoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: scale(4),
  },
  chatName: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: '#1f2937',
    flex: 1,
  },
  chatDate: {
    fontSize: fontSizes.xs,
    color: '#9ca3af',
    marginLeft: padding.small,
  },
  chatLastMessage: {
    fontSize: fontSizes.sm,
    color: '#64748b',
  },
  chatLastMessageUnread: {
    fontWeight: '600',
    color: '#1f2937',
  },
  messagesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // Account for tab bar height: 60px base + safe area bottom (consistent with tab bar height calculation)
    bottom: 0, // Will be adjusted dynamically via style prop
    backgroundColor: '#ffffff',
    zIndex: 100,
  },
  messagesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: padding.medium,
    borderBottomWidth: scale(1),
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  backButton: {
    padding: scale(4),
    marginRight: padding.small,
  },
  messagesTitle: {
    fontSize: fontSizes.xl,
    fontWeight: '700',
    color: '#1f2937',
  },
  messagesList: {
    flex: 1,
  },
  messagesListContent: {
    padding: padding.medium,
    paddingBottom: padding.large, // Reduced padding since tab bar is visible
  },
  messageBubble: {
    maxWidth: '75%',
    marginBottom: padding.small,
  },
  messageBubbleLeft: {
    alignSelf: 'flex-start',
  },
  messageBubbleRight: {
    alignSelf: 'flex-end',
  },
  messageBubbleGradient: {
    padding: padding.medium,
    borderRadius: scale(16),
    borderTopLeftRadius: scale(4),
    borderTopRightRadius: scale(4),
  },
  messageText: {
    fontSize: fontSizes.md,
    color: '#1f2937',
    marginBottom: scale(4),
  },
  messageTextRight: {
    color: '#ffffff',
  },
  messageTime: {
    fontSize: fontSizes.xs,
    color: '#64748b',
    alignSelf: 'flex-end',
  },
  messageTimeRight: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  messagesHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: padding.small,
    flex: 1,
  },
  messagesHeaderAvatar: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
  },
  messagesHeaderAvatarGradient: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesHeaderAvatarText: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: '#ffffff',
  },
  emptyMessages: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: padding.large * 2,
  },
  emptyMessagesText: {
    fontSize: fontSizes.md,
    color: '#9ca3af',
  },
  messageInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: padding.medium,
    borderTopWidth: scale(1),
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    gap: padding.small,
  },
  messageInputWrapper: {
    flex: 1,
    minHeight: scale(44),
    maxHeight: scale(100),
  },
  messageInput: {
    flex: 1,
    minHeight: scale(44),
    maxHeight: scale(100),
    backgroundColor: '#f3f4f6',
    borderRadius: scale(22),
    paddingHorizontal: padding.medium,
    paddingVertical: padding.small,
    fontSize: fontSizes.md,
    color: '#1f2937',
    borderWidth: scale(1),
    borderColor: '#e5e7eb',
    textAlignVertical: 'top',
  },
  sendButton: {
    width: scale(44),
    height: scale(44),
    borderRadius: scale(22),
    overflow: 'hidden',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
