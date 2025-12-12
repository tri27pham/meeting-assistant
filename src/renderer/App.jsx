import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { useContext } from './hooks/useContext';

const PANEL_IDS = ['control-bar', 'live-insights', 'ai-response', 'transcription', 'settings', 'audio-meter'];

const PANEL_SIZES = {
  liveInsights: { width: 420, height: 400 },
  aiResponse: { width: 450, height: 380 },
  transcription: { width: 380, height: 350 },
};

function App() {
  // Version check log - remove after verification
  useEffect(() => {
    console.log('[App] ✅ Latest code loaded - Version check:', new Date().toISOString());
    console.log('[App] ✅ Improved LLM prompts: ACTIVE (no filtering needed)');
    console.log('[App] ✅ AI Response Panel safety checks: ACTIVE');
  }, []);

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

  const {
    isSessionActive,
    segmentCount,
    keyPointCount,
    sessionDuration,
    segments: contextSegments,
    keyPoints,
    recentTranscript,
    autoSuggestEnabled,
    startSession,
    endSession,
    clearContext,
    setAutoSuggest,
  } = useContext();

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
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  
  const [aiResponse, setAiResponse] = useState(null);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const isTestResponseRef = useRef(false);
  const isAutoSuggestRef = useRef(false);

  // Debug: Track when aiResponse changes
  useEffect(() => {
    if (aiResponse === null) {
      console.log('[App] 🔴 AI Response cleared/null');
    } else {
      console.log('[App] 🟢 AI Response set:', {
        hasContent: !!aiResponse.content,
        contentLength: aiResponse.content?.length || 0,
        isStreaming: aiResponse.isStreaming,
        action: aiResponse.action
      });
    }
  }, [aiResponse]);

  // Debug: Track when waiting state changes
  useEffect(() => {
    console.log('[App] ⏳ isWaitingForResponse:', isWaitingForResponse);
  }, [isWaitingForResponse]);


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
      if (suggestion.text && suggestion.text.trim()) {
        setAiResponse({ action: suggestion.type, content: suggestion.text, origin: suggestion.origin, isCleared: false });
      }
    });

    const unsubInsights = window.cluely.on.insightsUpdate((newInsights) => {
      setInsights(newInsights);
    });

    const unsubTrigger = window.cluely.on.triggerAISuggestion(() => {
      // Use window.cluely directly to avoid dependency on handleAskAI
      if (window.cluely?.ai) {
        window.cluely.ai.triggerAction('manual', { timestamp: Date.now() });
      }
    });

    const unsubResetLayout = window.cluely.on?.resetLayout?.(() => {
      // Reset layout - clear panel positions from localStorage
      PANEL_IDS.forEach((panelId) => {
        localStorage.removeItem(`cluely-panel-pos-${panelId}`);
        localStorage.removeItem(`cluely-panel-size-${panelId}`);
      });
      // Force remount by updating layout key
      setLayoutKey((prev) => prev + 1);
    });

    const unsubToggleTranscript = window.cluely.on?.toggleTranscript?.(() => {
      setShowTranscript(prev => !prev);
    });

    const unsubAiStreamStart = window.cluely.on?.aiStreamStart?.((data) => {
      const isTest = data.isTest === true;
      const isAutoSuggest = data.isAutoSuggest === true;
      isTestResponseRef.current = isTest;
      isAutoSuggestRef.current = isAutoSuggest;
      setIsAiLoading(true);
      setAiError(null);
      
      // Only show waiting state for real (non-test) responses
      // For auto-suggestions, only show if there's context
      // For manual requests, always show (user explicitly requested)
      if (!isTest) {
        if (isAutoSuggest && segmentCount === 0) {
          // Auto-suggest with no context - don't show generic responses
          setIsWaitingForResponse(false);
        } else {
          // Manual request or auto-suggest with context - show waiting state
          setIsWaitingForResponse(true);
        }
        // Don't set aiResponse yet - wait for actual content
      } else {
        // For test responses, don't show anything
        setIsWaitingForResponse(false);
      }
    });

    const unsubAiStreamChunk = window.cluely.on?.aiStreamChunk?.((data) => {
      try {
        // Only set response if it's not a test
        if (isTestResponseRef.current) {
          // Ignore test responses - don't show them
          return;
        }
        
        // For auto-suggestions with no context, don't show generic responses
        if (isAutoSuggestRef.current && segmentCount === 0) {
          console.log('[App] Auto-suggest response with no context - not showing');
          return;
        }
        
        // For real responses, set the response when we get content
        if (data && data.fullContent && typeof data.fullContent === 'string' && data.fullContent.trim()) {
          setIsWaitingForResponse(false);
          setAiResponse(prev => prev 
            ? { ...prev, content: data.fullContent, isStreaming: true, action: prev.action || 'Response', isCleared: false }
            : { action: 'Response', content: data.fullContent, origin: 'groq', isStreaming: true, isCleared: false }
          );
        }
      } catch (error) {
        console.error('[App] Error in aiStreamChunk handler:', error);
      }
    });

    const unsubAiStreamEnd = window.cluely.on?.aiStreamEnd?.(() => {
      try {
        setIsAiLoading(false);
        setIsWaitingForResponse(false);
        
        if (isTestResponseRef.current) {
          // Clear test response state
          isTestResponseRef.current = false;
          return;
        }
        
      setAiResponse(prev => {
        if (!prev) return null;
        // If there's no content after streaming ends, clear the response
        if (!prev.content || typeof prev.content !== 'string' || prev.content.trim() === '') {
          return null;
        }
        return { ...prev, isStreaming: false, isCleared: false };
      });
        isTestResponseRef.current = false;
        isAutoSuggestRef.current = false;
      } catch (error) {
        console.error('[App] Error in aiStreamEnd handler:', error);
        setIsAiLoading(false);
        setIsWaitingForResponse(false);
        isAutoSuggestRef.current = false;
      }
    });

    const unsubAiError = window.cluely.on?.aiError?.((data) => {
      setIsAiLoading(false);
      setIsWaitingForResponse(false);
      setAiError(data.message);
      // Only show errors for real responses (not tests)
      if (!isTestResponseRef.current) {
        setAiResponse({ action: 'Error', content: data.message, origin: 'error', isStreaming: false, isCleared: false });
      }
      isTestResponseRef.current = false;
      isAutoSuggestRef.current = false;
    });

      return () => {
      unsubTranscript?.();
      unsubSuggestion?.();
      unsubInsights?.();
      unsubTrigger?.();
      unsubResetLayout?.();
      unsubToggleTranscript?.();
      unsubAiStreamStart?.();
      unsubAiStreamChunk?.();
      unsubAiStreamEnd?.();
      unsubAiError?.();
    };
  }, [segmentCount]);

  const handleTogglePause = useCallback(async () => {
    try {
      if (isPaused) {
        if (isMeterOnly) stopMeterOnly();
        
        setIsRunning(true);
        setIsPaused(false);

        await startSession();

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
  }, [isPaused, isMeterOnly, showAudioMeter, startMicCapture, stopMicCapture, stopMeterOnly, startMeterOnly, stopSystemCapture, enableSTT, disableSTT, startSession]);

  const handleAskAI = useCallback(async () => {
    if (window.cluely) {
      await window.cluely.ai.triggerAction('manual', { timestamp: Date.now() });
    }
  }, []);

  const handleTestAI = useCallback(async () => {
    if (!window.cluely?.ai) return;

    // Create a mock context snapshot in the same format as ContextService
    const mockTranscript = "We're discussing the latest developments in AI technology. The conversation has been about machine learning models and their applications in various industries. There's been talk about how companies are integrating AI into their workflows.";
    
    const now = Date.now();
    const mockSegments = mockTranscript.split('. ').filter(s => s.trim()).map((text, i) => ({
      id: `test_seg_${i}`,
      text: text.trim() + (text.endsWith('.') ? '' : '.'),
      confidence: 0.95,
      timestamp: now - (mockTranscript.split('. ').length - i) * 5000,
      isFinal: true,
      speaker: 'unknown',
      wordCount: text.split(/\s+/).length,
    }));

    const mockContextSnapshot = {
      transcript: mockTranscript,
      segments: mockSegments,
      segmentCount: mockSegments.length,
      totalSegments: mockSegments.length,
      tokenEstimate: Math.ceil(mockTranscript.split(/\s+/).length * 1.3),
      timeRange: {
        start: mockSegments[0]?.timestamp || now,
        end: mockSegments[mockSegments.length - 1]?.timestamp || now,
        duration: (mockSegments.length - 1) * 5000,
      },
      sessionActive: true,
      sessionDuration: mockSegments.length * 5000,
    };

    console.log('[App] Test AI with mock context:', mockContextSnapshot);
    
    // Trigger AI with talking_points action using test method
    await window.cluely.ai.triggerActionTest('talking_points', mockContextSnapshot, { 
      timestamp: Date.now(),
      isTest: true,
    });
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
    setIsWaitingForResponse(false);
  }, []);

  const handleClearResponse = useCallback(() => {
    if (aiResponse && aiResponse.content && aiResponse.content.trim()) {
      // Clear content but keep the panel open by maintaining the response object
      // Only set isCleared if there was actual content to clear
      setAiResponse({
        ...aiResponse,
        content: '',
        action: aiResponse.action || 'Response',
        isStreaming: false,
        isCleared: true, // Flag to indicate content was cleared
      });
    } else {
      // If there's no content, just close the panel
      setAiResponse(null);
    }
    setIsWaitingForResponse(false);
  }, [aiResponse]);

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
          onTestAI={handleTestAI}
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
          contextState={{ segmentCount, keyPointCount, sessionDuration }}
          isRecording={isCapturing && !isPaused}
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

      {(() => {
        // Show panel only if:
        // 1. Waiting for a response, OR
        // 2. Has actual content (not empty), OR
        // 3. Is currently streaming, OR
        // 4. Was explicitly cleared (isCleared flag means there WAS content that was cleared)
        const hasContent = aiResponse?.content && typeof aiResponse.content === 'string' && aiResponse.content.trim().length > 0;
        const shouldShow = isWaitingForResponse || 
          (aiResponse && typeof aiResponse === 'object' && (
            hasContent || 
            aiResponse.isStreaming || 
            aiResponse.isCleared // If cleared, there was content before, so keep panel open
          ));
        
        // Don't show panel on initial load if there's no real activity
        // Only show if we're actively waiting, have content, or explicitly cleared
        if (shouldShow && !isWaitingForResponse && !hasContent && !aiResponse?.isStreaming && !aiResponse?.isCleared) {
          return false;
        }
        
        if (shouldShow) {
          console.log('[App] 🎯 AI Response Panel should show:', {
            isWaitingForResponse,
            hasAiResponse: !!aiResponse,
            hasContent,
            aiResponseContent: aiResponse?.content?.substring(0, 50),
            aiResponseIsStreaming: aiResponse?.isStreaming,
            isCleared: aiResponse?.isCleared
          });
        }
        return shouldShow;
      })() && (
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
            response={isWaitingForResponse && !aiResponse 
              ? { action: 'Waiting...', content: '', origin: 'groq', isStreaming: true, isWaiting: true }
              : (aiResponse && typeof aiResponse === 'object' 
                  ? { 
                      action: aiResponse.action || 'Response', 
                      content: aiResponse.content || '', 
                      origin: aiResponse.origin || 'groq', 
                      isStreaming: aiResponse.isStreaming || false,
                      isWaiting: aiResponse.isWaiting || false
                    }
                  : { action: 'Response', content: '', origin: 'groq', isStreaming: false })}
            onCopy={handleCopyResponse}
            onClear={handleClearResponse}
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
            autoSuggestEnabled={autoSuggestEnabled}
            onToggleAutoSuggest={() => setAutoSuggest(!autoSuggestEnabled)}
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
