import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ChatContextType {
  isViewingChat: boolean;
  setIsViewingChat: (value: boolean) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isViewingChat, setIsViewingChat] = useState(false);

  return (
    <ChatContext.Provider value={{ isViewingChat, setIsViewingChat }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
