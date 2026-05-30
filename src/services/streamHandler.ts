import { useAuthStore } from '../stores/useAuthStore';
import { getBaseUrl } from './baseUrl';

export interface StreamOptions {
  onToken: (token: string) => void;
  onError: (error: string) => void;
  onDone: () => void;
}

export const streamMessage = (
  conversationId: string,
  content: string,
  options: StreamOptions
) => {
  const token = useAuthStore.getState().token;
  const url = `${getBaseUrl()}/api/v1/chat/message`;

  const xhr = new XMLHttpRequest();
  xhr.open('POST', url, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  if (token) {
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  }

  let seenBytes = 0;
  let doneCalled = false;

  xhr.onreadystatechange = () => {
    if (xhr.readyState === 3 || xhr.readyState === 4) {
      const responseText = xhr.responseText;
      if (!responseText) return;

      const newText = responseText.substring(seenBytes);
      seenBytes = responseText.length;

      const lines = newText.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Parse event type line  e.g. "event: token"
        let eventType = 'data';
        if (trimmed.startsWith('event:')) {
          eventType = trimmed.substring(6).trim();
          continue;
        }

        if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.substring(5).trim();

          if (dataStr === '[DONE]') {
            if (!doneCalled) {
              doneCalled = true;
              options.onDone();
            }
            continue;
          }

          try {
            const parsed = JSON.parse(dataStr);
            // Backend emits { "token": "..." } on event: token
            // and { "error": "..." } on event: error
            if (parsed.token !== undefined) {
              options.onToken(parsed.token);
            } else if (parsed.error !== undefined) {
              options.onError(parsed.error);
            }
          } catch (_) {
            // Ignore partial JSON chunks mid-stream
          }
        }
      }
    }

    if (xhr.readyState === 4) {
      if (xhr.status >= 400) {
        try {
          const errRes = JSON.parse(xhr.responseText);
          options.onError(errRes.detail || 'Request failed');
        } catch (_) {
          options.onError(`HTTP Error ${xhr.status}`);
        }
      }
    }
  };

  xhr.onerror = () => {
    options.onError('Network connection error. Is the local backend running?');
  };

  xhr.send(JSON.stringify({ conversation_id: conversationId, content }));

  return () => {
    xhr.abort();
  };
};
