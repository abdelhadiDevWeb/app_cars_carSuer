import React, { useState, useEffect, useRef } from 'react';
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
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { useNotifications } from '@/hooks/useNotifications';
import { apiRequest, getImageUrl, getBackendUrl } from '@/utils/backend';
import { getPadding, getFontSizes, scale } from '@/utils/responsive';
import { io, Socket } from 'socket.io-client';

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

export default function ChatScreen() {
  const { isAuthenticated, user } = useAuth();
  const { setIsViewingChat } = useChat();
  const { fetchNotifications, markChatMessagesAsRead, markMessageNotificationsAsReadForUser } = useNotifications();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState<Chat[]>([]);
  const chatsRef = useRef<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
  const isMarkingReadRef = useRef<boolean>(false);
  const lastMarkedChatIdRef = useRef<string | null>(null);

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
    if (!isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated]);

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
      
      // Check if this message is for the current chat
      if (currentChatIdRef.current && data.id_Chat === currentChatIdRef.current) {
        // Check if message already exists
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
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchChats();
      
      // Listen for refresh event from NotificationBanner to update badge in real-time
      const subscription = DeviceEventEmitter.addListener('refreshChats', () => {
        fetchChats();
      });
      
      return () => {
        subscription.remove();
      };
    }
  }, [isAuthenticated]);

  // Keep tab bar visible consistently - don't hide it
  // The tab bar should maintain the same size across all pages

  // Update chat context when viewing a chat
  useEffect(() => {
    setIsViewingChat(!!selectedChatId);
  }, [selectedChatId, setIsViewingChat]);

  // Check if userId param is provided to open a specific chat
  useEffect(() => {
    if (params.userId && chats.length > 0) {
      const chat = chats.find(c => c.otherUser.id === params.userId);
      if (chat) {
        handleChatPress(chat);
      }
    }
  }, [params.userId, chats]);

  const fetchChats = async () => {
    try {
      setLoading(true);
      const response = await apiRequest('/chat/my-chats');
      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.chats) {
          setChats(data.chats);
          // Fetch user images for all other users
          fetchUserImages(data.chats);
        }
      }
    } catch (error) {
      console.error('Error fetching chats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchUserImages = async (chatsList: Chat[]) => {
    const imagesMap: Record<string, string> = {};
    const userIds = chatsList.map(chat => chat.otherUser.id).filter(Boolean);

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
  };

  const handleChatPress = async (chat: Chat) => {
    // Prevent duplicate calls for the same chat
    if (selectedChatId === chat.id || isMarkingReadRef.current) {
      return;
    }

    setSelectedChatId(chat.id);
    setCurrentChat(chat);
    setLoadingMessages(true);
    isMarkingReadRef.current = true;
    const previousChatId = lastMarkedChatIdRef.current;
    lastMarkedChatIdRef.current = chat.id;

    try {
      // Mark chat notifications as read when entering chat (only once per chat)
      if (previousChatId !== chat.id) {
        try {
          // Update chat list FIRST to immediately update the badge
          setChats((prevChats) => {
            const updated = prevChats.map((c) =>
              c.id === chat.id || c.otherUser.id === chat.otherUser.id
                ? { ...c, unreadCount: 0 }
                : c
            );
            
            // Store in ref for event emission
            chatsRef.current = updated;
            
            // Emit event after state update (using setTimeout to avoid render cycle)
            setTimeout(() => {
              DeviceEventEmitter.emit('refreshChats', chatsRef.current);
            }, 0);
            
            return updated;
          });
          
          // Use the hook method which does optimistic update + API call
          if (markChatMessagesAsRead) {
            await markChatMessagesAsRead(chat.otherUser.id);
          }
        } catch (error) {
          console.error('Error marking chat notifications as read:', error);
        }
      }

      const response = await apiRequest('/chat/get-or-create', {
        method: 'POST',
        body: JSON.stringify({ otherUserId: chat.otherUser.id }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.chat && data.messages) {
          // Store current chat ID for socket filtering
          currentChatIdRef.current = data.chat.id;
          
          setMessages(data.messages);
          
          // Mark messages as read (only once)
          if (!data.messages.some((msg: Message) => !msg.read)) {
            // All messages already read, skip API call
            isMarkingReadRef.current = false;
          } else {
            try {
              // Update chat list FIRST to immediately update the Messages page header badge
              setChats((prevChats) => {
                const updated = prevChats.map((c) =>
                  c.id === chat.id || c.otherUser.id === chat.otherUser.id
                    ? { ...c, unreadCount: 0 }
                    : c
                );
                
                // Store in ref for event emission
                chatsRef.current = updated;
                
                // Emit event after state update (using setTimeout to avoid render cycle)
                setTimeout(() => {
                  DeviceEventEmitter.emit('refreshChats', chatsRef.current);
                }, 0);
                
                return updated;
              });
              
              // Also update currentChat state
              setCurrentChat((prevChat) =>
                prevChat ? { ...prevChat, unreadCount: 0 } : prevChat
              );
              
              await apiRequest(`/chat/${data.chat.id}/mark-read`, {
                method: 'PUT',
              });
              
              // Update local messages state to mark all unread messages as read
              setMessages((prevMessages) =>
                prevMessages.map((msg) => ({
                  ...msg,
                  read: true,
                }))
              );
              
              // Refresh notifications to update the Messages tab badge immediately
              if (fetchNotifications) {
                await fetchNotifications();
              }
            } catch (error) {
              console.error('Error marking messages as read:', error);
            } finally {
              isMarkingReadRef.current = false;
            }
          }
          
          // Scroll to bottom after messages load
          setTimeout(() => {
            messagesEndRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

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
            <View style={styles.headerTitleContainer}>
              <ThemedText style={styles.headerTitle}>Messages</ThemedText>
              {(() => {
                // Count chats with unread messages (show 1 per chat, not total count)
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
            <ThemedText style={styles.headerSubtitle}>
              {chats.length} conversation{chats.length > 1 ? 's' : ''}
            </ThemedText>
          </LinearGradient>
        </Animated.View>

        {/* Chats List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0d9488" />
            <ThemedText style={styles.loadingText}>Chargement...</ThemedText>
          </View>
        ) : chats.length === 0 ? (
          <View style={styles.emptyContainer}>
            <IconSymbol name="message" size={scale(64)} color="#9ca3af" />
            <ThemedText style={styles.emptyText}>Aucune conversation</ThemedText>
            <ThemedText style={styles.emptySubtext}>
              Vos conversations apparaîtront ici
            </ThemedText>
          </View>
        ) : (
          <ScrollView
            style={styles.chatsList}
            contentContainerStyle={styles.chatsListContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  fetchChats();
                }}
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
              bottom: Platform.OS === 'ios' 
                ? Math.max(60 + insets.bottom, 70) // Same calculation as tab bar height
                : 70, // Fixed 70px on Android
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
                    const otherUserId = currentChat.otherUser.id;
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
                          Aucun message. Commencez la conversation !
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
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    marginBottom: padding.small,
  },
  headerTitle: {
    fontSize: fontSizes['3xl'],
    fontWeight: '900',
    color: '#1f2937',
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
  headerSubtitle: {
    fontSize: fontSizes.sm,
    color: '#64748b',
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
    paddingBottom: Platform.OS === 'ios' ? 90 : 80, // Account for tab bar height consistently
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
