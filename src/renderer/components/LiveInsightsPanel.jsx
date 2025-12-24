import React from "react";
import {
  SparkleIcon,
  CloseIcon,
} from "./Icons";

function LiveInsightsPanel({
  insights,
  onCopyInsights,
  onClose,
}) {

  return (
    <div className="live-insights-panel glass-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title">
          <SparkleIcon className="title-icon" />
          <span>LIVE INSIGHTS</span>
        </div>
        <div className="panel-actions">
          <button 
            className="header-btn icon-only close-btn" 
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

          {/* Bullet-pointed insights */}
          {insights && insights.bullets && insights.bullets.length > 0 ? (
          <div className="insights-content">
              <ul className="insights-bullets">
                {insights.bullets.map((bullet, index) => (
                  <li key={index} className="insights-bullet-item">
                    {bullet}
                  </li>
                ))}
              </ul>
          </div>
          ) : (insights && (insights.title || insights.summary)) ? (
            // Fallback for old format
            <div className="insights-content">
              {insights.title && <h3 className="insights-title">{insights.title}</h3>}
              {insights.summary && <p className="insights-summary">{insights.summary}</p>}
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
