import React, { useEffect, useState } from "react";

function AudioMeterPanel({ audioLevels = { system: 0, microphone: 0, mixed: 0 } }) {
  const [peakLevels, setPeakLevels] = useState({
    system: 0,
    microphone: 0,
    mixed: 0,
  });

  // Update peak levels with decay
  useEffect(() => {
    setPeakLevels((prev) => ({
      system: Math.max(audioLevels.system, prev.system * 0.95),
      microphone: Math.max(audioLevels.microphone, prev.microphone * 0.95),
      mixed: Math.max(audioLevels.mixed, prev.mixed * 0.95),
    }));
  }, [audioLevels]);

  const renderMeter = (label, level, peakLevel) => {
    const percentage = Math.min(100, Math.max(0, level * 100));
    const peakPercentage = Math.min(100, Math.max(0, peakLevel * 100));

    return (
      <div className="audio-meter-item">
        <div className="audio-meter-label">{label}</div>
        <div className="audio-meter-bar-container">
          <div className="audio-meter-bar-bg">
            <div
              className="audio-meter-bar-fill"
              style={{
                width: `${percentage}%`,
              }}
            />
            {peakPercentage > 0 && (
              <div
                className="audio-meter-bar-peak"
                style={{
                  left: `${peakPercentage}%`,
                }}
              />
            )}
          </div>
          <div className="audio-meter-value">{Math.round(percentage)}%</div>
        </div>
      </div>
    );
  };

  return (
    <div className="audio-meter-panel glass-panel">
      <div className="audio-meter-container">
        {renderMeter("System", audioLevels.system, peakLevels.system)}
        {renderMeter("Mic", audioLevels.microphone, peakLevels.microphone)}
      </div>
    </div>
  );
}

export default AudioMeterPanel;
