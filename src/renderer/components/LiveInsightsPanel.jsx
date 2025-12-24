import React from "react";
import {
  SparkleIcon,
  CopyIcon,
  LightbulbIcon,
} from "./Icons";

function LiveInsightsPanel({
  insights,
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
    </div>
  );
}

export default LiveInsightsPanel;
