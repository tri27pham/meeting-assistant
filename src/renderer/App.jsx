import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ControlBar from './components/ControlBar';
import LiveInsightsPanel from './components/LiveInsightsPanel';
import AIResponsePanel from './components/AIResponsePanel';
import TranscriptionPanel from './components/TranscriptionPanel';
import AudioMeterPanel from './components/AudioMeterPanel';
import DraggablePanel from './components/DraggablePanel';
import PermissionSetup from './components/PermissionSetup';
import SettingsPanel from './components/SettingsPanel';
import { useAudioCapture } from './hooks/useAudioCapture';
import { useSTT } from './hooks/useSTT';

// Panel IDs for localStorage keys
const PANEL_IDS = ['control-bar', 'live-insights', 'ai-response', 'transcription', 'settings', 'audio-meter'];

// Default panel sizes
const PANEL_SIZES = {
  liveInsights: { width: 420, height: 400 },
  aiResponse: { width: 450, height: 380 },
  transcription: { width: 380, height: 350 },
};

function App() {
  // Permission state - determines if we show setup or main UI
  const [permissionsReady, setPermissionsReady] = useState(null); // null = loading, false = show setup, true = ready
  const [showPermissionSetup, setShowPermissionSetup] = useState(false);

  // Settings panel state
  const [showSettings, setShowSettings] = useState(false);

  // Session state
  const [isRunning, setIsRunning] = useState(false); // Start paused, user must press play
  const [isPaused, setIsPaused] = useState(true);
  const [sessionTime, setSessionTime] = useState(0);

  // Audio capture hook
  const {
    isMicCapturing,
    isSystemCapturing,
    isCapturing,
    isMeterOnly,
    isMeterActive,
    micLevel,
    systemLevel,
    micDB,
    micPeak,
    error: audioError,
    preAuthorizeMic,
    startMicCapture,
    stopMicCapture,
    startMeterOnly,
    stopMeterOnly,
    startSystemCapture,
    stopSystemCapture,
    startAllCapture,
    stopAllCapture,
  } = useAudioCapture();

  // STT (Speech-to-Text) hook
  const {
    isEnabled: sttEnabled,
    isReady: sttReady,
    currentTranscript,
    transcriptions,
    error: sttError,
    setApiKey: setSTTApiKey,
    enable: enableSTT,
    disable: disableSTT,
    clear: clearSTT,
  } = useSTT();

  // Layout reset key - incrementing this forces panels to remount
  const [layoutKey, setLayoutKey] = useState(0);

  // UI state
  const [showTranscript, setShowTranscript] = useState(true); // Show by default now
  const [showAudioMeter, setShowAudioMeter] = useState(false); // Audio meter hidden by default
  
  // Calculate default positions based on screen size
  const defaultPositions = useMemo(() => {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    // Container has 16px padding, panels are positioned relative to content area
    // For equal visual margins from screen edges:
    // - Left panel: x = margin - containerPadding (to offset the padding)
    // - Right panel: x = screenWidth - panelWidth - margin - containerPadding
    const containerPadding = 16;
    const margin = 32; // Visual margin from screen edge
    const topOffset = Math.floor(screenHeight * 0.10); // 10% from top (was 80px, moved down 5%)
    
    return {
      controlBar: {
        x: 0, // Centered via CSS and centered prop
        y: 16
      },
      liveInsights: {
        x: margin - containerPadding, // 16px from container = 32px from screen
        y: topOffset
      },
      aiResponse: {
        x: screenWidth - PANEL_SIZES.aiResponse.width - margin - containerPadding,
        y: topOffset
      },
      transcription: {
        x: margin - containerPadding,
        y: topOffset + PANEL_SIZES.liveInsights.height + 16 // Below live insights
      },
      settings: {
        x: screenWidth - PANEL_SIZES.aiResponse.width - margin - containerPadding,
        y: topOffset + PANEL_SIZES.aiResponse.height + 16 // Below AI response
      },
      audioMeter: {
        x: margin - containerPadding + 15, // Slightly right of live insights alignment
        y: 25 // Higher up
      },
    };
  }, [layoutKey]); // Recalculate when layout resets
  
  // Data state (received from backend)
  const [insights, setInsights] = useState({
    title: 'Discussion about news',
    summary: 'You started talking about how there\'s a lot of big startup acquisitions happening',
    context: 'Neel asked you about who recently acquired Windsurf',
  });

  const [actions, setActions] = useState([
    { id: 1, type: 'define', label: 'Define startup acquisition', icon: 'book' },
    { id: 2, type: 'search', label: 'Search the web for information about Windsurf acquisition', icon: 'globe' },
    { id: 3, type: 'followup', label: 'Suggest follow-up questions', icon: 'chat' },
    { id: 4, type: 'help', label: 'Give me helpful information', icon: 'sparkle' },
  ]);

  const [selectedAction, setSelectedAction] = useState(2);
  
  const [aiResponse, setAiResponse] = useState({
    action: 'Search the web for information...',
    content: `On July 14, 2025, Cognition acquired the remainder of Windsurf to integrate into its Devin platform\n\nIncludes Windsurf's agentic IDE, IP, brand, $82 M ARR, 350+ enterprise clients, and full team`,
    origin: 'cloud',
  });

  const [legacyTranscript, setLegacyTranscript] = useState([]);

  // Timer effect
  useEffect(() => {
    let interval;
    if (isRunning && !isPaused) {
      interval = setInterval(() => {
        setSessionTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, isPaused]);

  // Log audio errors
  useEffect(() => {
    if (audioError) {
      console.error('[App] Audio capture error:', audioError);
    }
  }, [audioError]);

  // Manage meter-only mode based on showAudioMeter state
  useEffect(() => {
    if (showAudioMeter && !isCapturing && !isMeterOnly) {
      // Audio meter shown but not recording - start meter-only mode
      startMeterOnly();
    } else if (!showAudioMeter && isMeterOnly) {
      // Audio meter hidden and in meter-only mode - stop it
      stopMeterOnly();
    }
  }, [showAudioMeter, isCapturing, isMeterOnly, startMeterOnly, stopMeterOnly]);

  // Check permissions on mount
  useEffect(() => {
    const checkPermissions = async () => {
      if (!window.cluely?.permissions) {
        // API not available - assume ready (for development/testing)
        console.log('[App] Permissions API not available, skipping check');
        setPermissionsReady(true);
        return;
      }

      try {
        const { ready, missing } = await window.cluely.permissions.isReady();
        console.log('[App] Permission check:', { ready, missing });
        
        if (ready) {
          setPermissionsReady(true);
          setShowPermissionSetup(false);
        } else {
          setPermissionsReady(false);
          setShowPermissionSetup(true);
        }
      } catch (error) {
        console.error('[App] Failed to check permissions:', error);
        // On error, assume ready to not block the user
        setPermissionsReady(true);
      }
    };

    checkPermissions();
  }, []);

  // Handler for when permissions are granted
  const handlePermissionsComplete = useCallback(async () => {
    // Pre-authorize microphone while window is still interactive
    // This prevents crashes when calling getUserMedia in transparent windows
    await preAuthorizeMic();
    
    setPermissionsReady(true);
    setShowPermissionSetup(false);
  }, [preAuthorizeMic]);

  // Handler for skipping permission setup
  const handlePermissionsSkip = useCallback(() => {
    setShowPermissionSetup(false);
    // Note: App may have limited functionality
  }, []);

  // Settings handlers
  // Toggle settings panel (clicking icon when open will close it)
  const handleToggleSettings = useCallback(() => {
    setShowSettings(prev => !prev);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  // Backend event listeners
  useEffect(() => {
    if (!window.cluely) return;

    const unsubTranscript = window.cluely.on.transcriptUpdate((segment) => {
      setLegacyTranscript((prev) => [...prev, segment]);
    });

    const unsubSuggestion = window.cluely.on.suggestion((suggestion) => {
      setAiResponse({
        action: suggestion.type,
        content: suggestion.text,
        origin: suggestion.origin,
      });
    });

    const unsubInsights = window.cluely.on.insightsUpdate((newInsights) => {
      setInsights(newInsights);
    });

    const unsubTrigger = window.cluely.on.triggerAISuggestion(() => {
      handleAskAI();
    });

    const unsubResetLayout = window.cluely.on?.resetLayout?.(() => {
      handleResetLayout();
    });

    const unsubToggleTranscript = window.cluely.on?.toggleTranscript?.(() => {
      setShowTranscript(prev => !prev);
    });

    return () => {
      unsubTranscript?.();
      unsubSuggestion?.();
      unsubInsights?.();
      unsubTrigger?.();
      unsubResetLayout?.();
      unsubToggleTranscript?.();
    };
  }, []);

  // Handlers
  const handleTogglePause = useCallback(async () => {
    try {
      if (isPaused) {
        // Currently paused, start capturing
        console.log('[App] Starting audio capture...');
        
        // Stop meter-only mode if active (full capture will take over)
        if (isMeterOnly) {
          stopMeterOnly();
        }
        
        setIsRunning(true);
        setIsPaused(false);

        // Start mic capture (wrapped in try-catch)
        try {
          await startMicCapture();
        } catch (err) {
          console.error('[App] Failed to start mic capture:', err);
        }
        
        // Enable STT (local mode is always ready)
        await enableSTT();
      } else {
        // Currently running, stop capturing
        console.log('[App] Stopping audio capture...');
        setIsPaused(true);
        stopMicCapture();
        stopSystemCapture();
        
        // Disable STT
        await disableSTT();
        
        // Restart meter-only mode if audio meter is shown
        if (showAudioMeter) {
          startMeterOnly();
        }
      }

      // Also notify backend
      if (window.cluely?.session?.togglePause) {
        await window.cluely.session.togglePause();
      }
    } catch (err) {
      console.error('[App] Error in handleTogglePause:', err);
    }
  }, [isPaused, isMeterOnly, showAudioMeter, startMicCapture, stopMicCapture, stopMeterOnly, startMeterOnly, stopSystemCapture, enableSTT, disableSTT]);

  const handleAskAI = useCallback(async () => {
    if (window.cluely) {
      await window.cluely.ai.triggerAction('manual', { timestamp: Date.now() });
    }
  }, []);

  const handleToggleVisibility = useCallback(() => {
    if (window.cluely) {
      window.cluely.window.minimize();
    }
  }, []);

  const handleActionSelect = useCallback(async (actionId) => {
    setSelectedAction(actionId);
    const action = actions.find((a) => a.id === actionId);
    if (action && window.cluely) {
      await window.cluely.ai.triggerAction(action.type, { label: action.label });
    }
  }, [actions]);

  const handleCopyResponse = useCallback(() => {
    if (aiResponse?.content) {
      navigator.clipboard.writeText(aiResponse.content);
    }
  }, [aiResponse?.content]);

  const handleCloseResponse = useCallback(() => {
    setAiResponse(null);
  }, []);

  const handleCopyInsights = useCallback(() => {
    // Visual feedback could be added here
  }, []);

  // Reset all panel positions and sizes
  const handleResetLayout = useCallback(() => {
    // Clear all panel position and size data from localStorage
    PANEL_IDS.forEach((panelId) => {
      localStorage.removeItem(`cluely-panel-pos-${panelId}`);
      localStorage.removeItem(`cluely-panel-size-${panelId}`);
    });
    
    // Increment key to force panels to remount with default values
    setLayoutKey((prev) => prev + 1);
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Show permission setup if permissions are missing
  if (showPermissionSetup) {
    return (
      <div className="overlay-container">
        <DraggablePanel
          panelId="permission-setup"
          initialPosition={{ x: 0, y: 0 }}
          resizable={false}
          centered={true}
          className="permission-setup-panel"
        >
          <PermissionSetup 
            onComplete={handlePermissionsComplete}
            onSkip={handlePermissionsSkip}
          />
        </DraggablePanel>
      </div>
    );
  }

  // Show loading state while checking permissions
  if (permissionsReady === null) {
    return (
      <div className="overlay-container">
        <div className="permission-setup glass-panel" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Checking permissions...</p>
        </div>
      </div>
    );
  }

  // Main app UI
  return (
    <div className="overlay-container">
      {/* Control Bar - centered at top, draggable but not resizable */}
      <DraggablePanel 
        key={`control-bar-${layoutKey}`}
        panelId="control-bar"
        initialPosition={defaultPositions.controlBar}
        resizable={false}
        centered={true}
        className="control-bar-panel"
      >
        <ControlBar
          isPaused={isPaused}
          sessionTime={formatTime(sessionTime)}
          audioLevel={micLevel}
          isCapturing={isCapturing}
          onTogglePause={handleTogglePause}
          onAskAI={handleAskAI}
          onToggleVisibility={handleToggleVisibility}
          onOpenSettings={handleToggleSettings}
        />
      </DraggablePanel>
      
      {/* Live Insights Panel - 1/4 down from top, left aligned */}
      <DraggablePanel
        key={`live-insights-${layoutKey}`}
        panelId="live-insights"
        initialPosition={defaultPositions.liveInsights}
        initialSize={PANEL_SIZES.liveInsights}
        minSize={{ width: 320, height: 300 }}
        maxSize={{ width: 600, height: 700 }}
        resizable={true}
      >
        <LiveInsightsPanel
          insights={insights}
          actions={actions}
          selectedAction={selectedAction}
          onActionSelect={handleActionSelect}
          onCopyInsights={handleCopyInsights}
        />
      </DraggablePanel>

      {/* Live Transcription Panel - Below live insights */}
      {showTranscript && (
        <DraggablePanel
          key={`transcription-${layoutKey}`}
          panelId="transcription"
          initialPosition={defaultPositions.transcription}
          initialSize={PANEL_SIZES.transcription}
          minSize={{ width: 300, height: 200 }}
          maxSize={{ width: 500, height: 600 }}
          resizable={true}
        >
          <TranscriptionPanel
            transcriptions={transcriptions}
            isRecording={isCapturing && !isPaused}
            onClear={clearSTT}
          />
        </DraggablePanel>
      )}

      {/* AI Response Panel - 1/4 down from top, right aligned */}
      {aiResponse && (
        <DraggablePanel 
          key={`ai-response-${layoutKey}`}
          panelId="ai-response"
          initialPosition={defaultPositions.aiResponse}
          initialSize={PANEL_SIZES.aiResponse}
          minSize={{ width: 340, height: 280 }}
          maxSize={{ width: 650, height: 700 }}
          resizable={true}
        >
          <AIResponsePanel
            response={aiResponse}
            onCopy={handleCopyResponse}
            onClose={handleCloseResponse}
          />
        </DraggablePanel>
      )}
      
      {/* Audio Meter Panel - above live insights */}
      {showAudioMeter && (
        <DraggablePanel
          key={`audio-meter-${layoutKey}`}
          panelId="audio-meter"
          initialPosition={defaultPositions.audioMeter}
          resizable={false}
          centered={false}
          className="audio-meter-panel-wrapper"
        >
          <AudioMeterPanel
            dB={micDB}
            peak={micPeak}
            rms={micLevel}
          />
        </DraggablePanel>
      )}

      {/* Settings Panel - below AI Response panel */}
      {showSettings && (
        <DraggablePanel
          key={`settings-${layoutKey}`}
          panelId="settings"
          initialPosition={defaultPositions.settings}
          resizable={false}
          centered={false}
          className="settings-panel-wrapper"
        >
          <SettingsPanel 
            onClose={handleCloseSettings}
            showAudioMeter={showAudioMeter}
            onToggleAudioMeter={() => setShowAudioMeter(!showAudioMeter)}
          />
        </DraggablePanel>
      )}
      
      {/* Keyboard shortcuts hint */}
      <div className="shortcuts-hint">
        <kbd>⌘</kbd><kbd>/</kbd> show/hide
      </div>
    </div>
  );
}

export default App;
