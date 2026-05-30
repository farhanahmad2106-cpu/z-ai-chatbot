import { create } from 'zustand';
import { Conversation, Message } from '../types/chat';
import { ChatService } from '../services/ChatService';
import { streamMessage } from '../services/streamHandler';

interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Message[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  activeModelId: string | null;
  abortActiveStream: (() => void) | null;

  loadConversations: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  startNewConversation: (title?: string, modelId?: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  stopGeneration: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  isLoading: false,
  isGenerating: false,
  error: null,
  activeModelId: null,
  abortActiveStream: null,

  loadConversations: async () => {
    set({ isLoading: true, error: null });
    try {
      const convs = await ChatService.listConversations();
      set({ conversations: convs, isLoading: false });
      if (convs.length > 0 && !get().currentConversationId) {
        await get().selectConversation(convs[0].id);
      }
    } catch (err: any) {
      set({ error: err.message || 'Failed to load conversations', isLoading: false });
    }
  },

  selectConversation: async (id: string) => {
    set({ currentConversationId: id, isLoading: true, error: null });
    try {
      const msgs = await ChatService.listMessages(id);
      const conversations = get().conversations;
      const currentConv = conversations.find(c => c.id === id);
      set({ 
        messages: msgs, 
        activeModelId: currentConv?.model_id || null,
        isLoading: false 
      });
    } catch (err: any) {
      set({ error: err.message || 'Failed to load messages', isLoading: false });
    }
  },

  startNewConversation: async (title = 'New Chat', modelId) => {
    set({ isLoading: true, error: null });
    try {
      const newConv = await ChatService.createConversation(title, modelId);
      set(state => ({
        conversations: [newConv, ...state.conversations],
        currentConversationId: newConv.id,
        messages: [],
        activeModelId: newConv.model_id,
        isLoading: false
      }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to create conversation', isLoading: false });
    }
  },

  deleteConversation: async (id: string) => {
    try {
      await ChatService.deleteConversation(id);
      set(state => {
        const nextConvs = state.conversations.filter(c => c.id !== id);
        let nextSelectedId = state.currentConversationId;
        if (state.currentConversationId === id) {
          nextSelectedId = nextConvs.length > 0 ? nextConvs[0].id : null;
        }
        return {
          conversations: nextConvs,
          currentConversationId: nextSelectedId,
        };
      });
      const selectedId = get().currentConversationId;
      if (selectedId) {
        await get().selectConversation(selectedId);
      } else {
        set({ messages: [] });
      }
    } catch (err: any) {
      set({ error: err.message || 'Failed to delete conversation' });
    }
  },

  sendMessage: async (content: string) => {
    const { currentConversationId, isGenerating } = get();
    if (!currentConversationId || isGenerating) return;

    const tempUserMsg: Message = {
      id: Math.random().toString(36).substring(7),
      conversation_id: currentConversationId,
      role: 'user',
      content,
      token_count: 0,
      is_error: false,
      tool_name: null,
      tool_args: null,
      created_at: new Date().toISOString()
    };

    const tempAssistantId = Math.random().toString(36).substring(7);
    const tempAssistantMsg: Message = {
      id: tempAssistantId,
      conversation_id: currentConversationId,
      role: 'assistant',
      content: '',
      token_count: 0,
      is_error: false,
      tool_name: null,
      tool_args: null,
      created_at: new Date().toISOString()
    };

    set(state => ({
      messages: [...state.messages, tempUserMsg, tempAssistantMsg],
      isGenerating: true,
      error: null
    }));

    const abort = streamMessage(currentConversationId, content, {
      onToken: (token: string) => {
        set(state => {
          const updatedMessages = state.messages.map(msg => {
            if (msg.id === tempAssistantId) {
              return { ...msg, content: msg.content + token };
            }
            return msg;
          });
          return { messages: updatedMessages };
        });
      },
      onError: (err: string) => {
        set(state => {
          const updatedMessages = state.messages.map(msg => {
            if (msg.id === tempAssistantId) {
              return { ...msg, content: msg.content + `\n[Error: ${err}]`, is_error: true };
            }
            return msg;
          });
          return { messages: updatedMessages, isGenerating: false, abortActiveStream: null };
        });
      },
      onDone: () => {
        set({ isGenerating: false, abortActiveStream: null });
        get().loadConversations();
      }
    });

    set({ abortActiveStream: abort });
  },

  stopGeneration: () => {
    const { abortActiveStream } = get();
    if (abortActiveStream) {
      abortActiveStream();
      set({ isGenerating: false, abortActiveStream: null });
    }
  }
}));
