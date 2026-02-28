'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { WSSimulator } from './simulator';

export const WSSimulatorContext = createContext<WSSimulator | null>(null);

export function useWSSimulator() {
    return useContext(WSSimulatorContext);
}

export function MSWProvider({ children }: { children: React.ReactNode }) {
    const [isReady, setIsReady] = useState(false);
    const simulatorRef = useRef<WSSimulator | null>(null);

    useEffect(() => {
        const isMock = process.env.NEXT_PUBLIC_USE_MOCK === 'true';

        if (!isMock) {
            setIsReady(true);
            return;
        }

        // Dynamic import to ensure MSW only runs in browser and is excluded from production bundles
        import('./browser').then(({ worker }) => {
            worker.start({ onUnhandledRequest: 'bypass' }).then(() => {
                setIsReady(true);
            });
        });

        if (!simulatorRef.current) {
            simulatorRef.current = new WSSimulator();
            // Optionally start simulator globally, or let specific hooks start it given a session id
        }

        return () => {
            if (simulatorRef.current) {
                simulatorRef.current.stop();
            }
        };
    }, []);

    if (!isReady) {
        return null; // Or a global loading spinner
    }

    return (
        <WSSimulatorContext.Provider value={simulatorRef.current}>
            {children}
        </WSSimulatorContext.Provider>
    );
}
