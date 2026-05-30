import { useAuthStore } from '../stores/useAuthStore';
import { getBaseUrl } from './baseUrl';

export const apiClient = {
  get: async (path: string, options: RequestInit = {}) => {
    const token = useAuthStore.getState().token;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${getBaseUrl()}${path}`, {
      method: 'GET',
      ...options,
      headers,
    });
    if (!response.ok) {
      let errorDetail = `Request failed with status ${response.status}`;
      try {
        const errRes = await response.json();
        errorDetail = errRes.detail || errorDetail;
      } catch (_) {}
      throw new Error(errorDetail);
    }
    if (response.status === 204) return undefined;
    return response.json();
  },

  post: async (path: string, body?: any, options: RequestInit = {}) => {
    const token = useAuthStore.getState().token;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${getBaseUrl()}${path}`, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      ...options,
      headers,
    });
    if (!response.ok) {
      let errorDetail = `Request failed with status ${response.status}`;
      try {
        const errRes = await response.json();
        errorDetail = errRes.detail || errorDetail;
      } catch (_) {}
      throw new Error(errorDetail);
    }
    if (response.status === 204) return undefined;
    return response.json();
  },

  delete: async (path: string, options: RequestInit = {}) => {
    const token = useAuthStore.getState().token;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${getBaseUrl()}${path}`, {
      method: 'DELETE',
      ...options,
      headers,
    });
    if (!response.ok) {
      let errorDetail = `Request failed with status ${response.status}`;
      try {
        const errRes = await response.json();
        errorDetail = errRes.detail || errorDetail;
      } catch (_) {}
      throw new Error(errorDetail);
    }
    return undefined;
  },
};
