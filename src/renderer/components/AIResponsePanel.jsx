import React from 'react';
import { GlobeIcon, CopyIcon, CloseIcon, SparkleIcon, ClearIcon } from './Icons';

function AIResponsePanel({ response, onCopy, onClose, onClear }) {
  if (!response || typeof response !== 'object') return null;

  const getOriginLabel = (origin) => {
    switch (origin) {
      case 'groq': return '⚡ Groq';
      case 'cloud': return '☁️ Cloud';
      case 'error': return '❌ Error';
      default: return '💻 Local';
    }
  };

  const getActionIcon = () => {
    if (response.isStreaming) return <SparkleIcon className="streaming-icon" />;
    return <GlobeIcon />;
  };

  return (
    <div className={`ai-response-panel glass-panel glass-panel-elevated ${response.isStreaming ? 'streaming' : ''}`}>
      <div className="panel-header">
        <div className="response-header-top">
          <div className="panel-title">
            <span className="response-label">AI response</span>
            {response.isStreaming && <span className="streaming-indicator" />}
          </div>
          <div className="panel-actions">
            <button 
              className="header-btn icon-only" 
              onClick={onCopy} 
              aria-label="Copy response"
              disabled={response.isStreaming}
            >
              <CopyIcon />
            </button>
            <button 
              className="header-btn icon-only" 
              onClick={onClear} 
              aria-label="Clear response"
              disabled={response.isStreaming}
            >
              <ClearIcon />
            </button>
            <button 
              className="header-btn icon-only close-btn" 
              onClick={onClose} 
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
        
        <div className="response-action-badge">
          {getActionIcon()}
          <span>{response.action || 'Response'}</span>
        </div>
      </div>

      <div className="response-content">
        {response.content && typeof response.content === 'string' && response.content.trim() ? (
          <div className="response-text">
            {response.content.split('\n').map((line, index) => {
              const trimmed = line.trim();
              if (!trimmed) return <br key={index} />;
              
              // Check if it's a bullet point
              if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
                return (
                  <div key={index} className="response-bullet">
                    {trimmed}
                  </div>
                );
              }
              
              return <p key={index}>{trimmed}</p>;
            })}
          </div>
        ) : response.isCleared ? (
          <p className="loading-text" style={{ opacity: 0.5, fontStyle: 'italic' }}>Response cleared</p>
        ) : response.isWaiting ? (
          <p className="loading-text">Waiting for response...</p>
        ) : response.isStreaming ? (
          <p className="loading-text">Generating response...</p>
        ) : null}
        {(response.isStreaming || response.isWaiting) && <span className="cursor-blink">▋</span>}
      </div>

      {response.origin && (
        <div className="response-footer">
          <span className={`origin-badge ${response.origin}`}>
            {getOriginLabel(response.origin)}
          </span>
        </div>
      )}
    </div>
  );
}

export default AIResponsePanel;
