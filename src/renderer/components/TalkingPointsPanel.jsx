import React from "react";
import {
  LightbulbIcon,
  ChatIcon,
} from "./Icons";

function TalkingPointsPanel({
  talkingPoints,
}) {
  return (
    <div className="talking-points-panel glass-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title">
          <ChatIcon className="title-icon" />
          <span>SUGGESTED TALKING POINTS</span>
        </div>
      </div>

      {/* Talking points section */}
      <div className="panel-content">
        {talkingPoints && talkingPoints.length > 0 ? (
          <div className="talking-points-section">
            <div className="talking-points-list">
              {talkingPoints.map((point) => (
                <div key={point.id} className="talking-point-item">
                  <LightbulbIcon className="talking-point-icon" />
                  <span className="talking-point-label">{point.label || point.text || 'Untitled'}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="talking-points-section">
            <div className="talking-points-empty">
              <p>No talking points yet. Keep talking to generate suggestions.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TalkingPointsPanel;

