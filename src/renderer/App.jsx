import React, { useState, useEffect, useCallback, useMemo } from "react";
import ControlBar from "./components/ControlBar";
import LiveInsightsPanel from "./components/LiveInsightsPanel";
import AIResponsePanel from "./components/AIResponsePanel";
import TranscriptPanel from "./components/TranscriptPanel";
import SettingsPanel from "./components/SettingsPanel";
import AudioMeterPanel from "./components/AudioMeterPanel";
import DraggablePanel from "./components/DraggablePanel";
import useMicrophoneCapture from "./hooks/useMicrophoneCapture";

const PANEL_IDS = [
  "control-bar",
  "live-insights",
  "ai-response",
  "transcript",
  "settings",
];

const PANEL_SIZES = {
  liveInsights: { width: 420, height: 400 },
  aiResponse: { width: 450, height: 380 },
  transcript: { width: 380, height: 350 },
  audioMeter: { width: 320, height: 200 },
};

function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [sessionTime, setSessionTime] = useState(0);

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
        x: screenWidth - 350 - margin - containerPadding,
        y: topOffset + PANEL_SIZES.aiResponse.height + 16,
      },
      settings: {
        x: screenWidth - 400 - margin - containerPadding,
        y: topOffset + PANEL_SIZES.aiResponse.height + 16,
      },
    };
  }, [layoutKey]);
  
  const [insights, setInsights] = useState({
    title: "Discussion about news",
    summary:
      "You started talking about how there's a lot of big startup acquisitions happening",
    context: "Neel asked you about who recently acquired Windsurf",
  });

  const [actions, setActions] = useState([
    {
      id: 1,
      type: "define",
      label: "Define startup acquisition",
      icon: "book",
    },
    {
      id: 2,
      type: "search",
      label: "Search the web for information about Windsurf acquisition",
      icon: "globe",
    },
    {
      id: 3,
      type: "followup",
      label: "Suggest follow-up questions",
      icon: "chat",
    },
    {
      id: 4,
      type: "help",
      label: "Give me helpful information",
      icon: "sparkle",
    },
  ]);

  const [selectedAction, setSelectedAction] = useState(2);

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

    return () => {
      unsubTranscript();
      if (unsubAudioLevels) unsubAudioLevels();
      unsubSuggestion?.();
      unsubInsights?.();
      unsubTrigger?.();
      unsubResetLayout?.();
      unsubToggleTranscript?.();
    };
  }, []);

  const handleTogglePause = useCallback(async () => {
    if (!window.cluely) return;
    
    if (!isRunning) {
      setIsStarting(true);
      try {
        const result = await window.cluely.session.start();
        if (result.success) {
          setIsRunning(true);
          setIsPaused(false);
          setSessionTime(0);
          setTranscript([]);
          // Don't show transcript or hide spinner yet - wait for onReady callback from mic
        } else {
          console.error("[App] Failed to start session:", result.error);
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
          actions={actions}
          selectedAction={selectedAction}
          onActionSelect={handleActionSelect}
          onCopyInsights={handleCopyInsights}
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
          initialSize={{ width: 400, height: 60 }}
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
