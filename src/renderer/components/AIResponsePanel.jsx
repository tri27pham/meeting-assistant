import React from 'react';
import { GlobeIcon, CopyIcon, CloseIcon } from './Icons';

function AIResponsePanel({ response, onCopy, onClose }) {
  return (
    <div className="ai-response-panel glass-panel glass-panel-elevated">
      {/* Header */}
      <div className="panel-header">
        <div className="response-header-top">
          <div className="panel-title">
            <span className="response-label">AI response</span>
          </div>
          <div className="panel-actions">
            {response && (
              <button 
                className="header-btn icon-only" 
                onClick={onCopy} 
                aria-label="Copy response"
              >
                <CopyIcon />
              </button>
            )}
            <button 
              className="header-btn icon-only close-btn" 
              onClick={onClose} 
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
        
        {/* Action badge */}
        {response && (
          <div className="response-action-badge">
            <GlobeIcon />
            <span>{response.action || 'Response'}</span>
          </div>
        )}
      </div>

      {/* Response content */}
      <div className="response-content">
        {response ? (
          response.content.split('\n\n').map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))
        ) : (
          <p style={{ color: 'var(--text-secondary)', padding: '20px', textAlign: 'center' }}>
            Waiting for response...
          </p>
        )}
      </div>

      {/* Footer with origin */}
      {response?.origin && (
        <div className="response-footer">
          <span className={`origin-badge ${response.origin}`}>
            {response.origin === 'cloud' ? '☁️ Cloud' : '💻 Local'}
          </span>
        </div>
      )}
    </div>
  );
}

export default AIResponsePanel;
