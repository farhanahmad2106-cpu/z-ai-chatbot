import { useAuthStore } from '../stores/useAuthStore';
import { getBaseUrl } from './baseUrl';
import { TelemetrySnapshot } from '../types/chat';

export type { TelemetrySnapshot };

export const subscribeToMetrics = (
  onMetrics: (metrics: TelemetrySnapshot) => void,
  onError: (error: string) => void
) => {
  const token = useAuthStore.getState().token;
  const url = `${getBaseUrl()}/api/v1/metrics/live`;

  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  if (token) {
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  }

  let seenBytes = 0;

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

        // Backend emits event: metrics  — skip event type lines
        if (trimmed.startsWith('event:')) continue;

        if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.substring(5).trim();
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) {
              onError(parsed.error);
            } else {
              onMetrics(parsed as TelemetrySnapshot);
            }
          } catch (_) {
            // Ignore partial SSE chunks
          }
        }
      }
    }
  };

  xhr.onerror = () => {
    onError('Failed to connect to metrics stream. Is the backend running?');
  };

  xhr.send();

  return () => {
    xhr.abort();
  };
};
