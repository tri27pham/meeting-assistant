import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ControlBar from './components/ControlBar';
import LiveInsightsPanel from './components/LiveInsightsPanel';
import AIResponsePanel from './components/AIResponsePanel';
import DraggablePanel from './components/DraggablePanel';

// Panel IDs for localStorage keys
const PANEL_IDS = ['control-bar', 'live-insights', 'ai-response'];

// Default panel sizes
const PANEL_SIZES = {
  liveInsights: { width: 420, height: 400 },
  aiResponse: { width: 450, height: 380 },
};

function App() {
  // Session state
  const [isRunning, setIsRunning] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [sessionTime, setSessionTime] = useState(0);

  // Layout reset key - incrementing this forces panels to remount
  const [layoutKey, setLayoutKey] = useState(0);

  // UI state
  const [showTranscript, setShowTranscript] = useState(false);
  
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

  const [transcript, setTranscript] = useState([]);

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

  // Backend event listeners
  useEffect(() => {
    if (!window.cluely) return;

    const unsubTranscript = window.cluely.on.transcriptUpdate((segment) => {
      setTranscript((prev) => [...prev, segment]);
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

    return () => {
      unsubTranscript?.();
      unsubSuggestion?.();
      unsubInsights?.();
      unsubTrigger?.();
      unsubResetLayout?.();
    };
  }, []);

  // Handlers
  const handleTogglePause = useCallback(async () => {
    if (window.cluely) {
      await window.cluely.session.togglePause();
    }
    setIsPaused((prev) => !prev);
  }, []);

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
          onTogglePause={handleTogglePause}
          onAskAI={handleAskAI}
          onToggleVisibility={handleToggleVisibility}
          onResetLayout={handleResetLayout}
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
          showTranscript={showTranscript}
          transcript={transcript}
          onToggleTranscript={() => setShowTranscript(!showTranscript)}
          onActionSelect={handleActionSelect}
          onCopyInsights={handleCopyInsights}
        />
      </DraggablePanel>
      
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
      
      {/* Keyboard shortcuts hint */}
      <div className="shortcuts-hint">
        <kbd>⌘</kbd><kbd>/</kbd> show/hide · <kbd>⌘</kbd><kbd>\</kbd> reset layout
      </div>
    </div>
  );
}

export default App;
