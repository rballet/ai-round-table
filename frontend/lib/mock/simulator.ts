import { RoundTableEvent } from 'shared/types/events';

export class WSSimulator {
    private timer: NodeJS.Timeout | null = null;
    private eventIndex = 0;

    start(sessionId: string, onEvent: (event: RoundTableEvent) => void): void {
        console.log(`Starting WS simulator for session: ${sessionId}`);

        // Skeleton implementation
        const runSimulationSequence = () => {
            // In a full implementation, this would emit a sequence of events
            // e.g. SESSION_START -> THINK_START -> TOKEN_GRANTED -> etc.
            // For now, it just simulates an active connection.
        };

        this.timer = setTimeout(runSimulationSequence, 1000);
    }

    stop(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
