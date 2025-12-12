import React from 'react';
import { SparkleIcon, CopyIcon, BookIcon, GlobeIcon, ChatIcon, MicIcon } from './Icons';

function LiveInsightsPanel({ 
  insights, 
  actions, 
  selectedAction, 
  onActionSelect,
  onCopyInsights,
  contextState,
  isRecording
}) {
  const getActionIcon = (iconType) => {
    switch (iconType) {
      case 'book': return <BookIcon />;
      case 'globe': return <GlobeIcon />;
      case 'chat': return <ChatIcon />;
      case 'sparkle': return <SparkleIcon />;
      default: return <SparkleIcon />;
    }
  };

  const handleCopy = () => {
    const text = `${insights.title}\n\n${insights.summary}${insights.context ? '\n\n' + insights.context : ''}`;
    navigator.clipboard.writeText(text);
    onCopyInsights?.();
  };

  const formatDuration = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="live-insights-panel glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <SparkleIcon className="title-icon" />
          <span>Live insights</span>
          {isRecording && (
            <span className="recording-indicator">
              <span className="recording-dot" />
              Recording
            </span>
          )}
        </div>
        <div className="panel-actions">
          <button 
            className="header-btn icon-only" 
            onClick={handleCopy}
            aria-label="Copy insights"
          >
            <CopyIcon />
          </button>
        </div>
      </div>

      {contextState && contextState.segmentCount > 0 && (
        <div className="context-stats">
          <div className="context-stat">
            <MicIcon className="stat-icon" />
            <span className="stat-value">{contextState.segmentCount}</span>
            <span className="stat-label">segments</span>
          </div>
          {contextState.sessionDuration > 0 && (
            <div className="context-stat">
              <span className="stat-value">{formatDuration(contextState.sessionDuration)}</span>
              <span className="stat-label">duration</span>
            </div>
          )}
          {contextState.keyPointCount > 0 && (
            <div className="context-stat">
              <SparkleIcon className="stat-icon" />
              <span className="stat-value">{contextState.keyPointCount}</span>
              <span className="stat-label">key points</span>
            </div>
          )}
        </div>
      )}

      <div className="insights-content">
        <h3 className="insights-title">{insights.title}</h3>
        <p className="insights-summary">{insights.summary}</p>
        {insights.context && (
          <p className="insights-context">{insights.context}</p>
        )}
      </div>

      <div className="actions-section">
        <h4 className="actions-title">Actions</h4>
        <div className="actions-list">
          {actions.map((action) => (
            <button
              key={action.id}
              className={`action-item ${selectedAction === action.id ? 'selected' : ''}`}
              onClick={() => onActionSelect(action.id)}
              aria-pressed={selectedAction === action.id}
            >
              <span className={`action-icon ${action.icon}`}>
                {getActionIcon(action.icon)}
              </span>
              <span className="action-label">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LiveInsightsPanel;
