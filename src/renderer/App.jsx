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

const PANEL_IDS = ['control-bar', 'live-insights', 'ai-response', 'transcription', 'settings', 'audio-meter'];

const PANEL_SIZES = {
  liveInsights: { width: 420, height: 400 },
  aiResponse: { width: 450, height: 380 },
  transcription: { width: 380, height: 350 },
};

function App() {
  const [permissionsReady, setPermissionsReady] = useState(null);
  const [showPermissionSetup, setShowPermissionSetup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [sessionTime, setSessionTime] = useState(0);

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

  const [layoutKey, setLayoutKey] = useState(0);
  const [showTranscript, setShowTranscript] = useState(true);
  const [showAudioMeter, setShowAudioMeter] = useState(false);
  
  const defaultPositions = useMemo(() => {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const containerPadding = 16;
    const margin = 32;
    const topOffset = Math.floor(screenHeight * 0.10);
    
    return {
      controlBar: { x: 0, y: 16 },
      liveInsights: { x: margin - containerPadding, y: topOffset },
      aiResponse: { x: screenWidth - PANEL_SIZES.aiResponse.width - margin - containerPadding, y: topOffset },
      transcription: { x: margin - containerPadding, y: topOffset + PANEL_SIZES.liveInsights.height + 16 },
      settings: { x: screenWidth - PANEL_SIZES.aiResponse.width - margin - containerPadding, y: topOffset + PANEL_SIZES.aiResponse.height + 16 },
      audioMeter: { x: margin - containerPadding + 15, y: 25 },
    };
  }, [layoutKey]);
  
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

  useEffect(() => {
    let interval;
    if (isRunning && !isPaused) {
      interval = setInterval(() => setSessionTime((prev) => prev + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, isPaused]);

  useEffect(() => {
    if (audioError) console.error('[App] Audio capture error:', audioError);
  }, [audioError]);

  useEffect(() => {
    if (showAudioMeter && !isCapturing && !isMeterOnly) {
      startMeterOnly();
    } else if (!showAudioMeter && isMeterOnly) {
      stopMeterOnly();
    }
  }, [showAudioMeter, isCapturing, isMeterOnly, startMeterOnly, stopMeterOnly]);

  useEffect(() => {
    const checkPermissions = async () => {
      if (!window.cluely?.permissions) {
        setPermissionsReady(true);
        return;
      }

      try {
        const { ready, missing } = await window.cluely.permissions.isReady();
        if (ready) {
          setPermissionsReady(true);
          setShowPermissionSetup(false);
        } else {
          setPermissionsReady(false);
          setShowPermissionSetup(true);
        }
      } catch (error) {
        console.error('[App] Failed to check permissions:', error);
        setPermissionsReady(true);
      }
    };

    checkPermissions();
  }, []);

  const handlePermissionsComplete = useCallback(async () => {
    await preAuthorizeMic();
    setPermissionsReady(true);
    setShowPermissionSetup(false);
  }, [preAuthorizeMic]);

  const handlePermissionsSkip = useCallback(() => {
    setShowPermissionSetup(false);
  }, []);

  const handleToggleSettings = useCallback(() => {
    setShowSettings(prev => !prev);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  useEffect(() => {
    if (!window.cluely) return;

    const unsubTranscript = window.cluely.on.transcriptUpdate((segment) => {
      setLegacyTranscript((prev) => [...prev, segment]);
    });

    const unsubSuggestion = window.cluely.on.suggestion((suggestion) => {
      setAiResponse({ action: suggestion.type, content: suggestion.text, origin: suggestion.origin });
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

  const handleTogglePause = useCallback(async () => {
    try {
      if (isPaused) {
        if (isMeterOnly) stopMeterOnly();
        
        setIsRunning(true);
        setIsPaused(false);

        try {
          await startMicCapture();
        } catch (err) {
          console.error('[App] Failed to start mic capture:', err);
        }
        
        await enableSTT();
      } else {
        setIsPaused(true);
        stopMicCapture();
        stopSystemCapture();
        await disableSTT();
        
        if (showAudioMeter) startMeterOnly();
      }

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
    if (window.cluely) window.cluely.window.minimize();
  }, []);

  const handleActionSelect = useCallback(async (actionId) => {
    setSelectedAction(actionId);
    const action = actions.find((a) => a.id === actionId);
    if (action && window.cluely) {
      await window.cluely.ai.triggerAction(action.type, { label: action.label });
    }
  }, [actions]);

  const handleCopyResponse = useCallback(() => {
    if (aiResponse?.content) navigator.clipboard.writeText(aiResponse.content);
  }, [aiResponse?.content]);

  const handleCloseResponse = useCallback(() => {
    setAiResponse(null);
  }, []);

  const handleCopyInsights = useCallback(() => {}, []);

  const handleResetLayout = useCallback(() => {
    PANEL_IDS.forEach((panelId) => {
      localStorage.removeItem(`cluely-panel-pos-${panelId}`);
      localStorage.removeItem(`cluely-panel-size-${panelId}`);
    });
    setLayoutKey((prev) => prev + 1);
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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

  if (permissionsReady === null) {
    return (
      <div className="overlay-container">
        <div className="permission-setup glass-panel" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Checking permissions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay-container">
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
      
      {showAudioMeter && (
        <DraggablePanel
          key={`audio-meter-${layoutKey}`}
          panelId="audio-meter"
          initialPosition={defaultPositions.audioMeter}
          resizable={false}
          centered={false}
          className="audio-meter-panel-wrapper"
        >
          <AudioMeterPanel dB={micDB} peak={micPeak} rms={micLevel} />
        </DraggablePanel>
      )}

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
      
      <div className="shortcuts-hint">
        <kbd>⌘</kbd><kbd>/</kbd> show/hide
      </div>
    </div>
  );
}

export default App;
