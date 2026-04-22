'use client';

import { useEffect } from 'react';
import { RoundTableEvent } from 'shared/types/events';
import { useWSSimulator } from '../../lib/mock/MSWProvider';
import { useSessionStore } from '@/store/sessionStore';

function toWebSocketBaseUrl(apiBaseUrl: string): string {
  if (apiBaseUrl.startsWith('https://')) {
    return apiBaseUrl.replace('https://', 'wss://');
  }
  return apiBaseUrl.replace('http://', 'ws://');
}

export function useWebSocket(sessionId: string | null) {
  const simulator = useWSSimulator();
  const handleEvent = useSessionStore((state) => state.handleEvent);
  const setConnectionState = useSessionStore((state) => state.setConnectionState);
  const isConnected = useSessionStore((state) => state.isConnected);
  const connectionError = useSessionStore((state) => state.connectionError);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const useMock = process.env.NEXT_PUBLIC_USE_MOCK === 'true';

    if (useMock) {
      if (!simulator) {
        return;
      }

      setConnectionState(true);
      simulator.start(sessionId, (event) => {
        handleEvent(event);
      });

      return () => {
        simulator.stop();
        setConnectionState(false);
      };
    }

    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const wsBaseUrl =
      process.env.NEXT_PUBLIC_WS_URL || toWebSocketBaseUrl(apiBaseUrl);
    const wsUrl = `${wsBaseUrl}/sessions/${sessionId}/stream`;
    const ws = new WebSocket(wsUrl);
    let heartbeat: NodeJS.Timeout | null = null;

    ws.onopen = () => {
      setConnectionState(true);
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, 20000);
    };

    ws.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as RoundTableEvent;
        handleEvent(event);
      } catch {
        setConnectionState(false, 'Received invalid WebSocket payload');
      }
    };

    ws.onerror = () => {
      setConnectionState(false, 'WebSocket error');
    };

    ws.onclose = () => {
      setConnectionState(false);
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    };

    return () => {
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      ws.close();
    };
  }, [sessionId, simulator, handleEvent, setConnectionState]);

  return { isConnected, connectionError };
}
