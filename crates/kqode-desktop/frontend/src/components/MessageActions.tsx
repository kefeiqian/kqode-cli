import { useEffect, useRef, useState } from "react";
import { CopyIcon } from "./Icons";

const COPY_FEEDBACK_MS = 1600;

type CopyStatus = "idle" | "copied" | "error";

type MessageActionsProps = {
  content: string;
  model?: string;
};

async function copyText(content: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(content);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("clipboard copy was rejected");
  }
}

export function MessageActions({ content, model }: MessageActionsProps) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = async () => {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    try {
      await copyText(content);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    resetTimer.current = window.setTimeout(
      () => setStatus("idle"),
      COPY_FEEDBACK_MS,
    );
  };

  const label =
    status === "copied" ? "Copied" : status === "error" ? "Copy failed" : "Copy";

  return (
    <div className="message-actions">
      <button
        aria-label="Copy message"
        className={`copy-message-button ${status}`}
        onClick={() => void copy()}
        title={label}
        type="button"
      >
        <CopyIcon />
        <span>{label}</span>
      </button>
      {model && <span className="message-model">{model}</span>}
    </div>
  );
}
