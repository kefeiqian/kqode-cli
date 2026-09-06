import type { PendingTurn } from "../types";
import { SteerIcon, TrashIcon } from "./Icons";
import "./QueuedTurns.css";

type QueuedTurnsProps = {
  messages: PendingTurn[];
  onDelete: (turnId: string) => Promise<void>;
  onSteer: (turnId: string) => Promise<void>;
};

export function QueuedTurns({
  messages,
  onDelete,
  onSteer,
}: QueuedTurnsProps) {
  const queuedMessages = messages.filter((message) => !message.isActive);
  if (queuedMessages.length === 0) return null;

  return (
    <div className="queued-turns" aria-label="Pending messages">
      {queuedMessages.map((message) => (
        <div className="queued-turn" key={message.id}>
          <span className="queued-turn-branch" aria-hidden />
          <span className="queued-turn-content">{message.content}</span>
          <div className="queued-turn-actions">
            <button
              aria-label={`Steer with: ${message.content}`}
              onClick={() => void onSteer(message.id)}
              title="Run this message next"
              type="button"
            >
              <SteerIcon />
              <span>Steer</span>
            </button>
            <button
              aria-label={`Delete queued message: ${message.content}`}
              onClick={() => void onDelete(message.id)}
              title="Delete queued message"
              type="button"
            >
              <TrashIcon />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
