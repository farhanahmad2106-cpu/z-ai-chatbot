import { useAuthStore } from '../stores/useAuthStore';
import { getBaseUrl } from './baseUrl';
import { Conversation, Message } from '../types/chat';

const request = async (path: string, options: RequestInit = {}) => {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = 'API Request failed';
    try {
      const errRes = await response.json();
      errorDetail = errRes.detail || errorDetail;
    } catch (_) {}
    throw new Error(errorDetail);
  }

  if (response.status === 204) return undefined;
  return response.json();
};

export const ChatService = {
  listConversations: async (): Promise<Conversation[]> => {
    return request('/api/v1/chat/conversations');
  },

  createConversation: async (
    title = 'New Chat',
    modelId?: string,
    systemPrompt?: string
  ): Promise<Conversation> => {
    return request('/api/v1/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({ title, model_id: modelId, system_prompt: systemPrompt }),
    });
  },

  deleteConversation: async (id: string): Promise<void> => {
    return request(`/api/v1/chat/conversations/${id}`, {
      method: 'DELETE',
    });
  },

  listMessages: async (conversationId: string): Promise<Message[]> => {
    return request(`/api/v1/chat/conversations/${conversationId}/messages`);
  },
};
