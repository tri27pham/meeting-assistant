import React from 'react';

function AudioMeterPanel({ dB = -60, peak = -60, rms = 0 }) {
  // Convert dB to percentage for bar display (0 dB = 100%, -60 dB = 0%)
  const dbToPercent = (db) => Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  
  const levelPercent = dbToPercent(dB);
  const peakPercent = dbToPercent(peak);

  // Color based on level
  const getBarColor = (percent) => {
    if (percent > 95) return '#ff4444'; // Clipping (red)
    if (percent > 80) return '#ff8844'; // Hot (orange)
    if (percent > 50) return '#44ff44'; // Good (green)
    return '#44aaff'; // Low (blue)
  };

  // Status indicator
  const getStatus = () => {
    if (peak >= -1) return { text: 'CLIP', color: '#ff4444' };
    if (dB >= -12) return { text: 'Good', color: '#44ff44' };
    if (dB >= -30) return { text: 'OK', color: '#ffff44' };
    if (dB >= -50) return { text: 'Low', color: '#ff8844' };
    return { text: '—', color: '#666666' };
  };

  const status = getStatus();

  return (
    <div className="audio-meter-panel glass-panel">
      <div className="audio-meter-slim">
        <span className="audio-meter-slim-label">🎤</span>
        <div className="audio-meter-slim-bar-container">
          <div 
            className="audio-meter-slim-bar" 
            style={{ 
              width: `${levelPercent}%`,
              backgroundColor: getBarColor(levelPercent),
            }}
          />
          <div 
            className="audio-meter-slim-peak"
            style={{ left: `${peakPercent}%` }}
          />
        </div>
        <span className="audio-meter-slim-db">{dB.toFixed(0)} dB</span>
        <span className="audio-meter-slim-status" style={{ color: status.color }}>
          {status.text}
        </span>
      </div>
    </div>
  );
}

export default AudioMeterPanel;
