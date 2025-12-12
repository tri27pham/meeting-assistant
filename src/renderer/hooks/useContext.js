import { useState, useEffect, useCallback } from 'react';

export function useContext() {
  const [state, setState] = useState({
    isSessionActive: false,
    segmentCount: 0,
    keyPointCount: 0,
    sessionDuration: 0,
  });
  
  const [autoSuggestEnabled, setAutoSuggestEnabledState] = useState(true);
  const [segments, setSegments] = useState([]);
  const [keyPoints, setKeyPoints] = useState([]);
  const [recentTranscript, setRecentTranscript] = useState('');

  useEffect(() => {
    if (!window.cluely?.on) return;

    const unsubSegment = window.cluely.on.contextSegmentAdded?.((segment) => {
      setSegments(prev => [...prev.slice(-99), segment]);
      setState(prev => ({ ...prev, segmentCount: prev.segmentCount + 1 }));
      setRecentTranscript(prev => {
        const updated = prev + ' ' + segment.text;
        return updated.split(' ').slice(-100).join(' ').trim();
      });
    });

    const unsubSessionStarted = window.cluely.on.contextSessionStarted?.(() => {
      setState(prev => ({ ...prev, isSessionActive: true, segmentCount: 0, keyPointCount: 0, sessionDuration: 0 }));
      setSegments([]);
      setKeyPoints([]);
      setRecentTranscript('');
    });

    const unsubSessionEnded = window.cluely.on.contextSessionEnded?.((data) => {
      setState(prev => ({ ...prev, isSessionActive: false }));
    });

    const unsubKeyPoint = window.cluely.on.contextKeyPoint?.((keyPoint) => {
      setKeyPoints(prev => [...prev, keyPoint]);
      setState(prev => ({ ...prev, keyPointCount: prev.keyPointCount + 1 }));
    });

    const unsubCleared = window.cluely.on.contextCleared?.(() => {
      setSegments([]);
      setKeyPoints([]);
      setRecentTranscript('');
      setState(prev => ({ ...prev, segmentCount: 0, keyPointCount: 0 }));
    });

    return () => {
      unsubSegment?.();
      unsubSessionStarted?.();
      unsubSessionEnded?.();
      unsubKeyPoint?.();
      unsubCleared?.();
    };
  }, []);

  useEffect(() => {
    let interval;
    if (state.isSessionActive) {
      interval = setInterval(() => {
        setState(prev => ({ ...prev, sessionDuration: prev.sessionDuration + 1000 }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [state.isSessionActive]);

  const refreshState = useCallback(async () => {
    if (!window.cluely?.context) return;
    
    try {
      const contextState = await window.cluely.context.getState();
      setState(contextState);
    } catch (err) {
      console.error('[useContext] Failed to refresh state:', err);
    }
  }, []);

  const getSnapshot = useCallback(async (options = {}) => {
    if (!window.cluely?.context) return null;
    
    try {
      return await window.cluely.context.getSnapshot(options);
    } catch (err) {
      console.error('[useContext] Failed to get snapshot:', err);
      return null;
    }
  }, []);

  const startSession = useCallback(async () => {
    if (!window.cluely?.context) return;
    
    try {
      await window.cluely.context.startSession();
    } catch (err) {
      console.error('[useContext] Failed to start session:', err);
    }
  }, []);

  const endSession = useCallback(async () => {
    if (!window.cluely?.context) return null;
    
    try {
      const result = await window.cluely.context.endSession();
      return result.summary;
    } catch (err) {
      console.error('[useContext] Failed to end session:', err);
      return null;
    }
  }, []);

  const clearContext = useCallback(async () => {
    if (!window.cluely?.context) return;
    
    try {
      await window.cluely.context.clear();
      setSegments([]);
      setKeyPoints([]);
      setRecentTranscript('');
    } catch (err) {
      console.error('[useContext] Failed to clear context:', err);
    }
  }, []);

  const addKeyPoint = useCallback(async (text, metadata = {}) => {
    if (!window.cluely?.context) return null;
    
    try {
      return await window.cluely.context.addKeyPoint(text, metadata);
    } catch (err) {
      console.error('[useContext] Failed to add key point:', err);
      return null;
    }
  }, []);

  const setAutoSuggest = useCallback(async (enabled) => {
    if (!window.cluely?.context) return;
    
    try {
      await window.cluely.context.setAutoSuggest(enabled);
      setAutoSuggestEnabledState(enabled);
    } catch (err) {
      console.error('[useContext] Failed to set auto-suggest:', err);
    }
  }, []);

  const setAutoSuggestConfig = useCallback(async (config) => {
    if (!window.cluely?.context) return;
    
    try {
      await window.cluely.context.setAutoSuggestConfig(config);
    } catch (err) {
      console.error('[useContext] Failed to set auto-suggest config:', err);
    }
  }, []);

  // Load initial auto-suggest state
  useEffect(() => {
    const loadAutoSuggestState = async () => {
      if (!window.cluely?.context) return;
      try {
        const state = await window.cluely.context.getAutoSuggestState();
        setAutoSuggestEnabledState(state.enabled);
      } catch (err) {
        console.error('[useContext] Failed to load auto-suggest state:', err);
      }
    };
    loadAutoSuggestState();
  }, []);

  return {
    ...state,
    segments,
    keyPoints,
    recentTranscript,
    autoSuggestEnabled,
    refreshState,
    getSnapshot,
    startSession,
    endSession,
    clearContext,
    addKeyPoint,
    setAutoSuggest,
    setAutoSuggestConfig,
  };
}
