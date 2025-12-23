import React from "react";
import {
  SparkleIcon,
  CopyIcon,
  LightbulbIcon,
} from "./Icons";

function LiveInsightsPanel({
  insights,
  talkingPoints,
  onCopyInsights,
}) {

  const handleCopy = () => {
    const text = `${insights.title}\n\n${insights.summary}${insights.context ? "\n\n" + insights.context : ""}`;
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
            className="header-btn icon-only"
            onClick={handleCopy}
            aria-label="Copy insights"
          >
            <CopyIcon />
          </button>
        </div>
      </div>

          {/* Summary or relevant recent points */}
          {(insights.title || insights.summary || insights.context) ? (
            <div className="insights-content">
              {insights.title && <h3 className="insights-title">{insights.title}</h3>}
              {insights.summary && <p className="insights-summary">{insights.summary}</p>}
              {insights.context && (
                <p className="insights-context">{insights.context}</p>
              )}
            </div>
          ) : (
            <div className="insights-content">
              <div className="insights-empty">
                <p>No insights yet. Start speaking to generate AI-powered insights.</p>
              </div>
            </div>
          )}

          {/* Suggested talking points */}
          <div className="talking-points-section">
            <h4 className="talking-points-title">Suggested Talking Points</h4>
            {talkingPoints && talkingPoints.length > 0 ? (
              <div className="talking-points-list">
                {talkingPoints.map((point) => (
                  <div key={point.id} className="talking-point-item">
                    <LightbulbIcon className="talking-point-icon" />
                    <span className="talking-point-label">{point.label || point.text || 'Untitled'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="talking-points-empty">
                <p>No talking points yet. Keep talking to generate suggestions.</p>
              </div>
            )}
          </div>
    </div>
  );
}

export default LiveInsightsPanel;
