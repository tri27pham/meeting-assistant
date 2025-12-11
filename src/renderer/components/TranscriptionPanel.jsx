import React, { useEffect, useRef } from 'react';

/**
 * TranscriptionPanel Component
 * 
 * Displays live speech-to-text transcription with auto-scroll.
 */

function TranscriptionPanel({ 
  transcriptions = [], 
  isRecording = false,
  onClear,
}) {
  const scrollRef = useRef(null);
  
  // Debug: log when transcriptions change
  useEffect(() => {
    console.log('[TranscriptionPanel] Transcriptions updated:', transcriptions.length);
  }, [transcriptions]);

  // Auto-scroll to bottom when new transcriptions arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptions]);

  // Format timestamp
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="transcription-panel">
      {/* Header */}
      <div className="transcription-header">
        <div className="transcription-title">
          <span className={`recording-dot ${isRecording ? 'active' : ''}`} />
          <h3>Live Transcription</h3>
        </div>
        {transcriptions.length > 0 && (
          <button 
            className="transcription-clear-btn"
            onClick={onClear}
            title="Clear transcription"
          >
            Clear
          </button>
        )}
      </div>

      {/* Content */}
      <div className="transcription-content" ref={scrollRef}>
        {transcriptions.length === 0 ? (
          <div className="transcription-empty">
            <p>
              {isRecording 
                ? 'Listening... Start speaking to see transcription.' 
                : 'Press play to start transcription.'}
            </p>
          </div>
        ) : (
          <div className="transcription-entries">
            {transcriptions.map((entry, index) => (
              <div key={entry.id || index} className="transcription-entry">
                <span className="transcription-time">
                  {formatTime(entry.timestamp)}
                </span>
                <span className="transcription-text">
                  {entry.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with status */}
      <div className="transcription-footer">
        <span className="transcription-status">
          {isRecording ? (
            <>
              <span className="status-dot active" />
              Recording
            </>
          ) : (
            <>
              <span className="status-dot" />
              Paused
            </>
          )}
        </span>
        <span className="transcription-count">
          {transcriptions.length} segment{transcriptions.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

export default TranscriptionPanel;
