import React from 'react';

function TranscriptPanel() {
  return (
    <div className="transcript-panel glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span>Live transcript</span>
        </div>
        <div className="panel-actions">
          {/* Actions can be added here later */}
        </div>
      </div>
      <div className="panel-content">
        <p style={{ color: 'var(--text-secondary)', padding: '20px', textAlign: 'center' }}>
          Transcript will appear here
        </p>
      </div>
    </div>
  );
}

export default TranscriptPanel;
