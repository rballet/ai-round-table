'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useWSSimulator } from '../../lib/mock/MSWProvider';
import { SessionResponse } from 'shared/types/api';
import { RoundTableEvent } from 'shared/types/events';

export default function Home() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [events, setEvents] = useState<RoundTableEvent[]>([]);
  const simulator = useWSSimulator();

  useEffect(() => {
    // 1. Fetch mock REST data
    api.getSession('sess_mock_123').then(setSession).catch(console.error);

    // 2. Start mock WS Simulator
    if (simulator) {
      simulator.start('sess_mock_123', (event) => {
        setEvents((prev) => [...prev, event]);
      });

      return () => {
        simulator.stop();
      };
    }
  }, [simulator]);

  return (
    <main className="min-h-screen p-8 font-sans bg-zinc-50 dark:bg-black text-black dark:text-white">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">AI Round Table</h1>
          <p className="text-sm text-zinc-500">Phase 0: Mock Infrastructure Test</p>
        </header>

        <section className="p-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800">
          <h2 className="text-xl font-semibold mb-4">REST API Output (MSW)</h2>
          {session ? (
            <pre className="text-sm bg-zinc-100 dark:bg-zinc-950 p-4 rounded-lg overflow-auto">
              {JSON.stringify(session, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-zinc-500 animate-pulse">Fetching session mock data...</p>
          )}
        </section>

        <section className="p-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800">
          <h2 className="text-xl font-semibold mb-4">WS Simulator Output</h2>
          {events.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {events.map((ev, i) => (
                <div key={i} className="text-sm p-3 bg-zinc-100 dark:bg-zinc-950 rounded-lg">
                  <span className="font-mono font-medium text-blue-600 dark:text-blue-400">[{ev.type}]</span>
                  <span className="ml-2 text-zinc-600 dark:text-zinc-400">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500 animate-pulse">Waiting for WSSimulator events (simulator should be active)...</p>
          )}
        </section>
      </div>
    </main>
  );
}
