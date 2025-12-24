import React, { useEffect, useRef } from "react";
import { CopyIcon, CloseIcon } from "./Icons";

function TranscriptPanel({ transcript = [], onClose }) {
  const contentRef = useRef(null);

  // Auto-scroll to bottom when new transcript arrives
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [transcript]);

  const handleCopy = () => {
    const fullText = transcript
      .map((segment) => segment.text)
      .join(" ")
      .trim();
    if (fullText) {
      navigator.clipboard.writeText(fullText);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="transcript-panel glass-panel">
      <div className="panel-content" ref={contentRef}>
        {transcript.length === 0 ? (
          <p
            style={{
              color: "var(--text-secondary)",
              padding: "20px",
              textAlign: "center",
            }}
          >
            Transcript will appear here as you speak...
          </p>
        ) : (
          <div className="transcript-segments">
            {transcript.map((segment, index) => (
              <div
                key={index}
                className={`transcript-segment ${segment.isFinal ? "final" : "interim"}`}
              >
                {segment.timestamp && (
                  <span className="transcript-time">{formatTime(segment.timestamp)}</span>
                )}
                <span className="transcript-text">{segment.text}</span>
                {!segment.isFinal && (
                  <span className="transcript-indicator">...</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TranscriptPanel;
