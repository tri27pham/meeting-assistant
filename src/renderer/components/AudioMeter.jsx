import React from 'react';

/**
 * AudioMeter - Visual dB meter for monitoring audio input levels
 * 
 * Displays:
 * - Real-time dB level (dBFS - decibels relative to full scale)
 * - Peak level indicator
 * - Visual bar meter with color coding
 * - Quality indicator (Good/Low/Clipping)
 * 
 * Props:
 * - dB: Current dB level (-60 to 0)
 * - peak: Peak dB level (-60 to 0)
 * - rms: RMS level (0 to 1)
 * - source: 'mic' or 'system'
 */
function AudioMeter({ 
  dB = -60, 
  peak = -60, 
  rms = 0, 
  source = 'mic' 
}) {
  // Convert dB to percentage for bar display (0 dB = 100%, -60 dB = 0%)
  const dbToPercent = (db) => Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  
  const levelPercent = dbToPercent(dB);
  const peakPercent = dbToPercent(peak);

  // Determine quality/status
  const getStatus = () => {
    if (peak >= -1) return { text: 'CLIPPING', color: '#ff4444' };
    if (dB >= -12) return { text: 'Good', color: '#44ff44' };
    if (dB >= -30) return { text: 'OK', color: '#ffff44' };
    if (dB >= -50) return { text: 'Low', color: '#ff8844' };
    return { text: 'Silent', color: '#888888' };
  };

  const status = getStatus();

  // Color gradient for the bar
  const getBarColor = (percent) => {
    if (percent > 95) return '#ff4444'; // Clipping (red)
    if (percent > 80) return '#ff8844'; // Hot (orange)
    if (percent > 50) return '#44ff44'; // Good (green)
    return '#44aaff'; // Low (blue)
  };

  return (
    <div className="audio-meter">
      <div className="audio-meter-header">
        <span className="audio-meter-title">{source === 'mic' ? '🎤 Mic' : '🔊 System'}</span>
        <span className="audio-meter-status" style={{ color: status.color }}>
          {status.text}
        </span>
      </div>
      
      {/* Visual bar meter */}
      <div className="audio-meter-bar-container">
        <div 
          className="audio-meter-bar" 
          style={{ 
            width: `${levelPercent}%`,
            backgroundColor: getBarColor(levelPercent),
          }}
        />
        {/* Peak indicator */}
        <div 
          className="audio-meter-peak"
          style={{ left: `${peakPercent}%` }}
        />
        {/* Scale markers */}
        <div className="audio-meter-scale">
          <span style={{ left: '0%' }}>-60</span>
          <span style={{ left: '50%' }}>-30</span>
          <span style={{ left: '80%' }}>-12</span>
          <span style={{ left: '100%' }}>0</span>
        </div>
      </div>

      {/* Numeric display */}
      <div className="audio-meter-values">
        <div className="audio-meter-value">
          <span className="audio-meter-label">Level</span>
          <span className="audio-meter-number">{dB.toFixed(1)} dB</span>
        </div>
        <div className="audio-meter-value">
          <span className="audio-meter-label">Peak</span>
          <span className="audio-meter-number">{peak.toFixed(1)} dB</span>
        </div>
        <div className="audio-meter-value">
          <span className="audio-meter-label">RMS</span>
          <span className="audio-meter-number">{(rms * 100).toFixed(1)}%</span>
        </div>
      </div>

      {/* Guidance text */}
      <div className="audio-meter-guide">
        {dB < -50 && <span>Speak louder or move closer to mic</span>}
        {dB >= -50 && dB < -30 && <span>Audio is a bit quiet</span>}
        {dB >= -30 && dB < -12 && <span>Good level - ideal for speech</span>}
        {dB >= -12 && peak < -1 && <span>Strong signal</span>}
        {peak >= -1 && <span>⚠️ Too loud - may clip/distort</span>}
      </div>
    </div>
  );
}

export default AudioMeter;
