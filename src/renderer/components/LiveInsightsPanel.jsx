import React from 'react';
import { SparkleIcon, TranscriptIcon, CopyIcon, BookIcon, GlobeIcon, ChatIcon, MeterIcon } from './Icons';
import AudioMeter from './AudioMeter';

function LiveInsightsPanel({ 
  insights, 
  actions, 
  selectedAction, 
  showTranscript,
  showAudioMeter = false,
  audioLevels = { dB: -60, peak: -60, rms: 0 },
  transcript,
  onToggleTranscript, 
  onToggleAudioMeter,
  onActionSelect,
  onCopyInsights
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

  return (
    <div className="live-insights-panel glass-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title">
          <SparkleIcon className="title-icon" />
          <span>Live insights</span>
        </div>
        <div className="panel-actions">
          <button 
            className={`header-btn icon-only ${showAudioMeter ? 'active' : ''}`}
            onClick={onToggleAudioMeter}
            aria-pressed={showAudioMeter}
            aria-label={showAudioMeter ? 'Hide audio meter' : 'Show audio meter'}
            title={showAudioMeter ? 'Hide audio meter' : 'Show audio meter'}
          >
            <MeterIcon />
          </button>
          <button 
            className="header-btn" 
            onClick={onToggleTranscript}
            aria-pressed={showTranscript}
          >
            <TranscriptIcon />
            <span>{showTranscript ? 'Hide transcript' : 'Show transcript'}</span>
          </button>
          <button 
            className="header-btn icon-only" 
            onClick={handleCopy}
            aria-label="Copy insights"
          >
            <CopyIcon />
          </button>
        </div>
      </div>

      {/* Audio Level Meter */}
      {showAudioMeter && (
        <div className="audio-meter-section">
          <AudioMeter 
            source="mic" 
            dB={audioLevels.dB}
            peak={audioLevels.peak}
            rms={audioLevels.rms}
          />
        </div>
      )}

      {/* Content - Transcript or Insights */}
      {showTranscript ? (
        <div className="transcript-view">
          {transcript.length === 0 ? (
            <p className="empty-state">Transcript will appear here as you speak...</p>
          ) : (
            transcript.map((segment, index) => (
              <div 
                key={index} 
                className={`transcript-segment ${segment.speaker}`}
              >
                <span className="speaker-label">
                  {segment.speaker === 'user' ? 'You' : 'Other'}
                </span>
                <span className="segment-text">{segment.text}</span>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          {/* Insights Summary */}
          <div className="insights-content">
            <h3 className="insights-title">{insights.title}</h3>
            <p className="insights-summary">{insights.summary}</p>
            {insights.context && (
              <p className="insights-context">{insights.context}</p>
            )}
          </div>

          {/* Actions */}
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
        </>
      )}
    </div>
  );
}

export default LiveInsightsPanel;
