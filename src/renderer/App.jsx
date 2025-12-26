import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ControlBar from "./components/ControlBar";
import LiveInsightsPanel from "./components/LiveInsightsPanel";
import TalkingPointsPanel from "./components/TalkingPointsPanel";
import ActionsPanel from "./components/ActionsPanel";
import TranscriptPanel from "./components/TranscriptPanel";
import SettingsPanel from "./components/SettingsPanel";
import AudioMeterPanel from "./components/AudioMeterPanel";
import DraggablePanel from "./components/DraggablePanel";
import useMicrophoneCapture from "./hooks/useMicrophoneCapture";
import useSystemAudioCapture from "./hooks/useSystemAudioCapture";

const PANEL_IDS = [
  "control-bar",
  "live-insights",
  "talking-points",
  "actions",
  "transcript",
  "settings",
  "audio-meter",
];

const PANEL_SIZES = {
  liveInsights: { width: 400, height: 250 },
  talkingPoints: { width: 450, height: 280 },
  actions: { width: 450, height: 250 }, 
  transcript: { width: 400, height: 200 },
  audioMeter: { width: 320, height: 200 },
  settings: { width: 450, height: 200 },
};

function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [sessionTime, setSessionTime] = useState(0);
  const sessionStartTimeRef = useRef(null);

  const [layoutKey, setLayoutKey] = useState(0);

  const [showLiveInsights, setShowLiveInsights] = useState(true);
  const [showTalkingPoints, setShowTalkingPoints] = useState(true);
  const [showActions, setShowActions] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Load audio meter visibility preference from localStorage
  const [showAudioMeter, setShowAudioMeter] = useState(() => {
    const saved = localStorage.getItem('cluely-show-audio-meter');
    return saved !== null ? saved === 'true' : true; // default to true
  });
  
  const defaultPositions = useMemo(() => {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    const containerPadding = 16;
    const margin = 32;
    const topOffset = Math.floor(screenHeight * 0.1);
    
    return {
      controlBar: {
        x: 0,
        y: 16,
      },
      liveInsights: {
        x: margin - containerPadding,
        y: topOffset,
      },
      talkingPoints: {
        x:
          screenWidth -
          PANEL_SIZES.talkingPoints.width -
          margin -
          containerPadding,
        y: topOffset,
      },
      actions: {
        x:
          screenWidth -
          PANEL_SIZES.actions.width -
          margin -
          containerPadding,
        y: topOffset + PANEL_SIZES.talkingPoints.height + 24, // Position below talking points with spacing
      },
      transcript: {
        x: margin - containerPadding,
        y: topOffset + PANEL_SIZES.liveInsights.height + 16,
      },
      audioMeter: {
        x: margin - containerPadding,
        y: 16,
      },
      settings: {
        x:
          screenWidth -
          PANEL_SIZES.actions.width -
          margin -
          containerPadding,
        y: topOffset + PANEL_SIZES.talkingPoints.height + 24 + PANEL_SIZES.actions.height + 24, // Position below actions panel with spacing
      },
    };
  }, [layoutKey]);
  
  // Start with empty insights - will be populated by AI responses
  const [insights, setInsights] = useState(null);

  // Talking points for Live Insights Panel (suggested things to say)
  const [talkingPoints, setTalkingPoints] = useState([]);

  // Follow-up actions for Actions Panel (define, get questions, etc.)
  const [actions, setActions] = useState([]);

  const [selectedAction, setSelectedAction] = useState(null);

  const [transcript, setTranscript] = useState([]);
  const [audioLevels, setAudioLevels] = useState({
    system: 0,
    microphone: 0,
    mixed: 0,
  });

  // Memoize callbacks to prevent hook from restarting unnecessarily
  const handleMicError = useCallback((error) => {
    console.error("[App] Microphone capture error:", error);
    setIsStarting(false);
  }, []);

  const handleMicAudioLevel = useCallback((level) => {
    setAudioLevels((prev) => ({
      ...prev,
      microphone: level,
    }));
  }, []);

  const handleMicReady = useCallback(() => {
    // Mic is capturing audio, everything is ready
    try {
      const readyTime = performance.now();
      const startTime = sessionStartTimeRef.current || readyTime;
      console.log(`[App] Microphone ready, total initialization: ${(readyTime - startTime).toFixed(2)}ms`);
    } catch (e) {
      console.log("[App] Microphone ready");
    }
    setIsStarting(false);
    setShowTranscript(true);
  }, []);

  // System audio callbacks
  const handleSystemError = useCallback((error) => {
    console.error("[App] System audio capture error:", error);
    console.error("[App] Error details:", {
      message: error.message,
      stack: error.stack,
      hasElectronAudioLoopback: !!window.electronAudioLoopback,
    });
  }, []);

  const handleSystemAudioLevel = useCallback((level) => {
    setAudioLevels((prev) => ({
      ...prev,
      system: level,
    }));
  }, []);

  const handleSystemReady = useCallback(() => {
    console.log("[App] System audio ready");
  }, []);

  // Microphone capture hook
  const microphoneCapture = useMicrophoneCapture({
    enabled: isRunning,
    paused: isPaused,
    onError: handleMicError,
    onAudioLevel: handleMicAudioLevel,
    onReady: handleMicReady,
  });

  // System audio capture hook
  const systemAudioCapture = useSystemAudioCapture({
    enabled: isRunning,
    paused: isPaused,
    onError: handleSystemError,
    onAudioLevel: handleSystemAudioLevel,
    onReady: handleSystemReady,
  });

  useEffect(() => {
    let interval;
    if (isRunning && !isPaused && !isStarting) {
      interval = setInterval(() => {
        setSessionTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, isPaused, isStarting]);

  // Check electron-audio-loopback availability on mount
  useEffect(() => {
    if (window.cluely?.audio?.enableLoopbackAudio) {
      console.log('[App] electron-audio-loopback IPC methods are available');
    } else {
      console.warn('[App] electron-audio-loopback is NOT available - system audio capture will not work');
      console.warn('[App] This may be due to:');
      console.warn('[App] 1. Package not installed (npm install electron-audio-loopback)');
      console.warn('[App] 2. initMain() not called in main process');
      console.warn('[App] 3. IPC methods not exposed in preload script');
      console.warn('[App] 4. Screen recording permission not granted (macOS)');
    }
  }, []);

  // Start session on mount

  useEffect(() => {
    if (!window.cluely) return;

    const unsubTranscript = window.cluely.on.transcriptUpdate((segment) => {
      setTranscript((prev) => {
        // If it's an interim result, replace the last interim segment
        if (!segment.isFinal) {
          // Remove last interim segment if it exists
          const withoutLastInterim = prev.filter((s, i) => 
            i !== prev.length - 1 || s.isFinal
          );
          return [...withoutLastInterim, segment];
        }
        // If it's final, remove any interim and add the final version
        const withoutInterim = prev.filter(s => s.isFinal);
        return [...withoutInterim, segment];
      });
    });

    const unsubAudioLevels = window.cluely.on?.audioLevelsUpdate?.((levels) => {
      setAudioLevels((prev) => ({
        ...prev,
        system: levels.system,
        mixed: levels.mixed,
        // Microphone level is updated by useMicrophoneCapture hook,
        // so we only update system and mixed from main process
      }));
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

    const unsubResetLayout = window.cluely.on?.resetLayout?.(() => {
      // Close settings panel if open
      setShowSettings(false);
      
      // Restore live insights, talking points, and actions panels to default positions
      setShowLiveInsights(true);
      setShowTalkingPoints(true);
      setShowActions(true);
      
      PANEL_IDS.forEach((panelId) => {
        localStorage.removeItem(`cluely-panel-pos-${panelId}`);
        localStorage.removeItem(`cluely-panel-size-${panelId}`);
      });
      
      // Also reset audio meter panel
      localStorage.removeItem(`cluely-panel-pos-audio-meter`);
      localStorage.removeItem(`cluely-panel-size-audio-meter`);
      
      setLayoutKey((prev) => prev + 1);
    });

    const unsubToggleTranscript = window.cluely.on?.toggleTranscript?.(() => {
      setShowTranscript((prev) => !prev);
    });

    // Listen to AI response events to update talking points and actions
    let unsubAIResponse = null;
    if (window.cluely && window.cluely.on && window.cluely.on.aiResponse) {
      unsubAIResponse = window.cluely.on.aiResponse((data) => {
        // Accept 'suggestion' or 'suggest' action types (both are talking point suggestions)
        if ((data.actionType === 'suggestion' || data.actionType === 'suggest')) {
          // Update insights if provided
          if (data.insights && !data.isPartial) {
            setInsights(data.insights);
          }

          // Separate talking points (general suggestions) from actions (define, get questions, etc.)
          if (!data.suggestions) return;
          
          const newTalkingPoints = [];
          const newActions = [];

          data.suggestions.forEach((suggestion) => {
            const label = suggestion.label || suggestion.text || 'Untitled';
            const type = suggestion.type || 'suggest';
            
            // Use the type field from AI service: 'action' = follow-up action, 'suggest' = talking point
            if (type === 'action') {
              // This is a follow-up action (app should perform this)
              newActions.push({
                id: suggestion.id || `action-${Date.now()}-${newActions.length}`,
                type: 'action',
                label,
                icon: suggestion.icon || 'lightbulb',
              });
            } else {
              // This is a talking point (user can read verbatim)
              newTalkingPoints.push({
                id: suggestion.id || `talking-point-${Date.now()}-${newTalkingPoints.length}`,
                label,
                text: suggestion.text || label,
              });
            }
          });

          // Debug logging
          console.log('[App] Categorized suggestions:', {
            total: data.suggestions.length,
            actions: newActions.length,
            talkingPoints: newTalkingPoints.length,
            actionLabels: newActions.map(a => a.label),
            talkingPointLabels: newTalkingPoints.map(t => t.label)
          });

          if (data.isPartial) {
            // Merge partial suggestions
            if (newTalkingPoints.length > 0) {
              setTalkingPoints((prev) => {
                const partialIds = new Set(newTalkingPoints.map((p) => p.id));
                const existing = prev.filter((p) => !partialIds.has(p.id));
                return [...existing, ...newTalkingPoints];
              });
            }
            if (newActions.length > 0) {
              setActions((prev) => {
                const partialIds = new Set(newActions.map((a) => a.id));
                const existing = prev.filter((a) => !partialIds.has(a.id));
                return [...existing, ...newActions];
              });
            }
          } else {
            // Replace with complete suggestions
            if (newTalkingPoints.length > 0) {
              setTalkingPoints(() => [...newTalkingPoints]);
            }
            if (newActions.length > 0) {
              setActions(() => [...newActions]);
            }
          }
        }
      });
    }

    // Listen to AI error events
    let unsubAIError = null;
    if (window.cluely && window.cluely.on && window.cluely.on.aiError) {
      unsubAIError = window.cluely.on.aiError((error) => {
        console.error('[App] AI error:', error);
      });
    }

    return () => {
      unsubTranscript();
      if (unsubAudioLevels) unsubAudioLevels();
      unsubSuggestion?.();
      unsubInsights?.();
      unsubResetLayout?.();
      unsubToggleTranscript?.();
      unsubAIResponse?.();
      unsubAIError?.();
    };
  }, []);

  const handleTogglePause = useCallback(async () => {
    console.log("[App] handleTogglePause called", { isRunning, isPaused, isStarting, hasCluely: !!window.cluely });
    if (!window.cluely) {
      console.error("[App] window.cluely is not available");
      return;
    }
    
    if (!isRunning) {
      try {
        const startTime = performance.now();
        sessionStartTimeRef.current = startTime;
        console.log("[App] Starting session...");
        setIsStarting(true);
        
        // CRITICAL: Start microphone and system audio capture IMMEDIATELY on user interaction
        // This ensures AudioContext is unlocked with user gesture (required by browser autoplay policy)
        console.log("[App] Enabling microphone and system audio capture immediately (user interaction)...");
        setIsRunning(true); // Enable hooks immediately to unlock AudioContext
        setIsPaused(false);
        
        // Start system audio capture immediately on user interaction
        // Pass force=true to bypass enabled check since we're calling it explicitly
        console.log("[App] Attempting to start system audio capture...");
        systemAudioCapture.start(true).catch((error) => {
          console.error("[App] Failed to start system audio capture:", error);
        });
        
        const sessionStartTime = performance.now();
        const result = await window.cluely.session.start();
        const sessionEndTime = performance.now();
        console.log(`[App] session.start() took ${(sessionEndTime - sessionStartTime).toFixed(2)}ms`, result);
        
        if (result && result.success) {
          setSessionTime(0);
          setTranscript([]);
          console.log("[App] Session started, microphone should be initializing...");
          // Don't show transcript or hide spinner yet - wait for onReady callback from mic
        } else {
          console.error("[App] Failed to start session:", result?.error || "Unknown error");
          setIsStarting(false);
          setIsRunning(false); // Disable if session start failed
        }
      } catch (error) {
        console.error("[App] Error starting session:", error);
        setIsStarting(false);
        setIsRunning(false); // Disable if error
      }
    } else if (isPaused) {
      await window.cluely.session.togglePause();
      setIsPaused(false);
      } else {
        await window.cluely.session.togglePause();
        setIsPaused(true);
      }
  }, [isRunning, isPaused, systemAudioCapture]);


  const handleToggleVisibility = useCallback(() => {
    if (window.cluely) {
      window.cluely.window.minimize();
    }
  }, []);

  const handleActionSelect = useCallback(
    async (actionId) => {
    setSelectedAction(actionId);
    const action = actions.find((a) => a.id === actionId);
    if (action && window.cluely) {
        await window.cluely.ai.triggerAction(action.type, {
          label: action.label,
        });
    }
    },
    [actions],
  );

  const handleCopyInsights = useCallback(() => {}, []);

  const handleToggleSettings = useCallback(() => {
    setShowSettings((prev) => {
      const willShow = !prev;
      if (willShow) {
        // Clear saved size and position so panel uses default when opened
        localStorage.removeItem('cluely-panel-size-settings');
        localStorage.removeItem('cluely-panel-pos-settings');
      }
      return willShow;
    });
  }, []);

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  const handleCloseLiveInsights = useCallback(() => {
    setShowLiveInsights(false);
  }, []);

  const handleCloseTalkingPoints = useCallback(() => {
    setShowTalkingPoints(false);
  }, []);

  const handleCloseActions = useCallback(() => {
    setShowActions(false);
  }, []);

  const handleCloseTranscript = useCallback(() => {
    setShowTranscript(false);
  }, []);

  const handleCloseAudioMeter = useCallback(() => {
    setShowAudioMeter(false);
    localStorage.setItem('cluely-show-audio-meter', 'false');
  }, []);

  const handleToggleAudioMeter = useCallback((enabled) => {
    setShowAudioMeter(enabled);
    localStorage.setItem('cluely-show-audio-meter', enabled.toString());
  }, []);

  const handleResetLayout = useCallback(() => {
    // Close settings panel if open
    setShowSettings(false);
    
    // Restore live insights, talking points, and actions panels to default positions
    setShowLiveInsights(true);
    setShowTalkingPoints(true);
    setShowActions(true);
    
    PANEL_IDS.forEach((panelId) => {
      localStorage.removeItem(`cluely-panel-pos-${panelId}`);
      localStorage.removeItem(`cluely-panel-size-${panelId}`);
    });
    
    // Also reset audio meter panel
    localStorage.removeItem(`cluely-panel-pos-audio-meter`);
    localStorage.removeItem(`cluely-panel-size-audio-meter`);

    setLayoutKey((prev) => prev + 1);
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

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
          isRunning={isRunning}
          isPaused={isPaused}
          isStarting={isStarting}
          sessionTime={formatTime(sessionTime)}
          onTogglePause={handleTogglePause}
          onToggleVisibility={handleToggleVisibility}
          onResetLayout={handleResetLayout}
          onOpenSettings={handleToggleSettings}
        />
      </DraggablePanel>
      
      {showLiveInsights && (
        <DraggablePanel
          key={`live-insights-${layoutKey}`}
          panelId="live-insights"
          initialPosition={defaultPositions.liveInsights}
          initialSize={PANEL_SIZES.liveInsights}
          minSize={{ width: 280, height: 200 }}
          maxSize={{ width: 500, height: 500 }}
          resizable={true}
        >
          <LiveInsightsPanel
            insights={insights}
            onCopyInsights={handleCopyInsights}
            onClose={handleCloseLiveInsights}
          />
        </DraggablePanel>
      )}

      {showTalkingPoints && (
        <DraggablePanel
          key={`talking-points-${layoutKey}`}
          panelId="talking-points"
          initialPosition={defaultPositions.talkingPoints}
          initialSize={PANEL_SIZES.talkingPoints}
          minSize={{ width: 280, height: 150 }}
          maxSize={{ width: 500, height: 400 }}
          resizable={true}
        >
          <TalkingPointsPanel
            talkingPoints={talkingPoints}
            onClose={handleCloseTalkingPoints}
          />
        </DraggablePanel>
      )}

      {showActions && (
        <DraggablePanel
          key={`actions-${layoutKey}`}
          panelId="actions"
          initialPosition={defaultPositions.actions}
          initialSize={PANEL_SIZES.actions}
          minSize={{ width: 320, height: 180 }}
          maxSize={{ width: 700, height: 450 }}
          resizable={true}
        >
          <ActionsPanel
            actions={actions}
            selectedAction={selectedAction}
            onActionSelect={handleActionSelect}
            onClose={handleCloseActions}
          />
        </DraggablePanel>
      )}
      
      {showTranscript && (
        <DraggablePanel
          key={`transcript-${layoutKey}`}
          panelId="transcript"
          initialPosition={defaultPositions.transcript}
          initialSize={PANEL_SIZES.transcript}
          minSize={{ width: 300, height: 200 }}
          maxSize={{ width: 500, height: 600 }}
          resizable={true}
        >
          <TranscriptPanel transcript={transcript} onClose={handleCloseTranscript} />
        </DraggablePanel>
      )}

      {showAudioMeter && (
        <DraggablePanel
          key={`audio-meter-${layoutKey}`}
          panelId="audio-meter"
          initialPosition={defaultPositions.audioMeter}
          initialSize={{ width: 325, height: 60 }}
          minSize={{ width: 300, height: 60 }}
          maxSize={{ width: 600, height: 60 }}
          resizable={true}
        >
          <AudioMeterPanel audioLevels={audioLevels} />
        </DraggablePanel>
      )}

      {showSettings && (
        <DraggablePanel
          key={`settings-${layoutKey}`}
          panelId="settings"
          initialPosition={defaultPositions.settings}
          initialSize={PANEL_SIZES.settings}
          minSize={{ width: 320, height: 280 }}
          maxSize={{ width: 600, height: 700 }}
          resizable={true}
        >
          <SettingsPanel 
            onClose={handleCloseSettings}
            showAudioMeter={showAudioMeter}
            onToggleAudioMeter={handleToggleAudioMeter}
          />
        </DraggablePanel>
      )}
      
      <div className="shortcuts-hint">
        <kbd>⌘</kbd>
        <kbd>/</kbd> show/hide · <kbd>⌘</kbd>
        <kbd>\</kbd> reset layout
      </div>
    </div>
  );
}

export default App;
