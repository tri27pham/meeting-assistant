import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ControlBar from "./components/ControlBar";
import LiveInsightsPanel from "./components/LiveInsightsPanel";
import ActionsPanel from "./components/ActionsPanel";
import AIResponsePanel from "./components/AIResponsePanel";
import TranscriptPanel from "./components/TranscriptPanel";
import SettingsPanel from "./components/SettingsPanel";
import AudioMeterPanel from "./components/AudioMeterPanel";
import DraggablePanel from "./components/DraggablePanel";
import useMicrophoneCapture from "./hooks/useMicrophoneCapture";

const PANEL_IDS = [
  "control-bar",
  "live-insights",
  "actions",
  "ai-response",
  "transcript",
  "settings",
  "audio-meter",
];

const PANEL_SIZES = {
  liveInsights: { width: 420, height: 400 },
  actions: { width: 420, height: 350 }, // Same width as liveInsights
  aiResponse: { width: 450, height: 380 },
  transcript: { width: 380, height: 350 },
  audioMeter: { width: 320, height: 200 },
};

function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [sessionTime, setSessionTime] = useState(0);
  const sessionStartTimeRef = useRef(null);

  const [layoutKey, setLayoutKey] = useState(0);

  const [showTranscript, setShowTranscript] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAiResponse, setShowAiResponse] = useState(true);
  
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
      actions: {
        x:
          screenWidth -
          PANEL_SIZES.actions.width -
          margin -
          containerPadding,
        y: topOffset,
      },
      aiResponse: {
        x:
          screenWidth -
          PANEL_SIZES.aiResponse.width -
          margin -
          containerPadding,
        y: topOffset,
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
        x: screenWidth - 400 - margin - containerPadding,
        y: topOffset + PANEL_SIZES.aiResponse.height + 16,
      },
    };
  }, [layoutKey]);
  
  // Start with empty insights - will be populated by AI responses
  const [insights, setInsights] = useState({
    title: null,
    summary: null,
    context: null,
  });

  // Talking points for Live Insights Panel (suggested things to say)
  const [talkingPoints, setTalkingPoints] = useState([]);

  // Follow-up actions for Actions Panel (define, get questions, etc.)
  const [actions, setActions] = useState([]);

  const [selectedAction, setSelectedAction] = useState(null);

  const [aiResponse, setAiResponse] = useState({
    action: "Search the web for information...",
    content: `On July 14, 2025, Cognition acquired the remainder of Windsurf to integrate into its Devin platform\n\nIncludes Windsurf's agentic IDE, IP, brand, $82 M ARR, 350+ enterprise clients, and full team`,
    origin: "cloud",
  });

  const [transcript, setTranscript] = useState([]);
  const [audioLevels, setAudioLevels] = useState({
    system: 0,
    microphone: 0,
    mixed: 0,
  });

  // Microphone capture hook
  const microphoneCapture = useMicrophoneCapture({
    enabled: isRunning,
    paused: isPaused,
    onError: (error) => {
      console.error("[App] Microphone capture error:", error);
      setIsStarting(false);
    },
    onAudioLevel: (level) => {
      setAudioLevels((prev) => ({
        ...prev,
        microphone: level,
      }));
    },
    onReady: () => {
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
    },
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
      setAudioLevels(levels);
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
      setShowAiResponse((prev) => {
        const newValue = !prev;
        if (newValue && window.cluely) {
          window.cluely.ai.triggerAction("manual", {
            timestamp: Date.now(),
          }).catch((err) => {
            console.error("[App] Error triggering AI action:", err);
          });
        }
        return newValue;
      });
    });

    const unsubResetLayout = window.cluely.on?.resetLayout?.(() => {
      PANEL_IDS.forEach((panelId) => {
        localStorage.removeItem(`cluely-panel-pos-${panelId}`);
        localStorage.removeItem(`cluely-panel-size-${panelId}`);
      });
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
        if ((data.actionType === 'suggestion' || data.actionType === 'suggest') && data.suggestions) {
          // Separate talking points (general suggestions) from actions (define, get questions, etc.)
          const newTalkingPoints = [];
          const newActions = [];

          data.suggestions.forEach((suggestion) => {
            const label = suggestion.label || suggestion.text || 'Untitled';
            const type = suggestion.type || 'suggest';
            const labelLower = label.toLowerCase();
            
            // Categorize: actions are things like "define", "get questions", "get more information", etc.
            // Talking points are general conversation suggestions
            const isAction = 
              type === 'define' || 
              type === 'question' || 
              labelLower.includes('define') || 
              labelLower.includes('question') ||
              labelLower.includes('follow-up') ||
              labelLower.includes('follow up') ||
              labelLower.includes('get more') ||
              labelLower.includes('get information') ||
              labelLower.includes('search') ||
              labelLower.includes('look up') ||
              labelLower.includes('explain') ||
              labelLower.startsWith('ask ') ||
              labelLower.startsWith('get ') ||
              labelLower.startsWith('find ');
            
            if (isAction) {
              newActions.push({
                id: suggestion.id || `action-${Date.now()}-${newActions.length}`,
                type,
                label,
                icon: suggestion.icon || (type === 'question' ? 'help-circle' : type === 'define' ? 'book' : 'lightbulb'),
              });
            } else {
              newTalkingPoints.push({
                id: suggestion.id || `talking-point-${Date.now()}-${newTalkingPoints.length}`,
                label,
                text: suggestion.text || label,
              });
            }
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
      unsubTrigger?.();
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
        
        const sessionStartTime = performance.now();
        const result = await window.cluely.session.start();
        const sessionEndTime = performance.now();
        console.log(`[App] session.start() took ${(sessionEndTime - sessionStartTime).toFixed(2)}ms`, result);
        
        if (result && result.success) {
          setIsRunning(true);
          setIsPaused(false);
          setSessionTime(0);
          setTranscript([]);
          console.log("[App] Session started, waiting for microphone...");
          // Don't show transcript or hide spinner yet - wait for onReady callback from mic
        } else {
          console.error("[App] Failed to start session:", result?.error || "Unknown error");
          setIsStarting(false);
        }
      } catch (error) {
        console.error("[App] Error starting session:", error);
        setIsStarting(false);
      }
    } else if (isPaused) {
      await window.cluely.session.togglePause();
      setIsPaused(false);
    } else {
      await window.cluely.session.togglePause();
      setIsPaused(true);
    }
  }, [isRunning, isPaused]);

  const handleAskAI = useCallback(async () => {
    if (showAiResponse) {
      setShowAiResponse(false);
      if (window.cluely?.window?.mouseLeavePanel) {
        window.cluely.window.mouseLeavePanel();
      }
    } else {
      setShowAiResponse(true);
      if (window.cluely) {
        try {
          await window.cluely.ai.triggerAction("manual", {
            timestamp: Date.now(),
          });
        } catch (err) {
          console.error("[App] Error triggering AI action:", err);
      }
      }
    }
  }, [showAiResponse]);

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

  const handleCopyResponse = useCallback(() => {
    if (aiResponse?.content) {
      navigator.clipboard.writeText(aiResponse.content);
    }
  }, [aiResponse?.content]);

  const handleCloseResponse = useCallback(() => {
    setAiResponse(null);
    setShowAiResponse(false);
    if (window.cluely?.window?.mouseLeavePanel) {
      window.cluely.window.mouseLeavePanel();
    }
  }, []);

  const handleCopyInsights = useCallback(() => {}, []);

  const handleToggleSettings = useCallback(() => {
    setShowSettings((prev) => !prev);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  const handleToggleAudioMeter = useCallback((enabled) => {
    setShowAudioMeter(enabled);
    localStorage.setItem('cluely-show-audio-meter', enabled.toString());
  }, []);

  const handleResetLayout = useCallback(() => {
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
          onAskAI={handleAskAI}
          onToggleVisibility={handleToggleVisibility}
          onResetLayout={handleResetLayout}
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
          talkingPoints={talkingPoints}
          onCopyInsights={handleCopyInsights}
        />
      </DraggablePanel>

      <DraggablePanel
        key={`actions-${layoutKey}`}
        panelId="actions"
        initialPosition={defaultPositions.actions}
        initialSize={PANEL_SIZES.actions}
        minSize={{ width: 320, height: 250 }}
        maxSize={{ width: 600, height: 600 }}
        resizable={true}
      >
        <ActionsPanel
          actions={actions}
          selectedAction={selectedAction}
          onActionSelect={handleActionSelect}
        />
      </DraggablePanel>

      {showAiResponse && (
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
          <TranscriptPanel transcript={transcript} />
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
          initialSize={{ width: 400, height: 350 }}
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
