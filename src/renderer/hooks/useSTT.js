/**
 * useSTT.js
 * 
 * React hook for managing Speech-to-Text functionality.
 * Supports both local Whisper (Transformers.js) and OpenAI API.
 */

import { useState, useEffect, useCallback } from 'react';

export function useSTT() {
  const [mode, setModeState] = useState('local'); // 'local' or 'api'
  const [isEnabled, setIsEnabled] = useState(false);
  const [isReady, setIsReady] = useState(true); // Local mode is always ready
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [transcriptions, setTranscriptions] = useState([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [error, setError] = useState(null);

  // Check STT state
  const checkReady = useCallback(async () => {
    if (!window.cluely?.stt) return;
    
    try {
      const state = await window.cluely.stt.getState();
      setModeState(state.mode);
      setIsReady(state.isReady);
      setIsEnabled(state.isEnabled);
      setIsModelLoaded(state.isModelLoaded);
      setIsLoadingModel(state.isLoadingModel);
    } catch (err) {
      console.error('[useSTT] Failed to check state:', err);
    }
  }, []);

  // Set mode
  const setMode = useCallback(async (newMode) => {
    if (!window.cluely?.stt) return false;
    
    try {
      await window.cluely.stt.setMode(newMode);
      setModeState(newMode);
      // Local mode is always ready
      setIsReady(newMode === 'local' ? true : false);
      return true;
    } catch (err) {
      console.error('[useSTT] Failed to set mode:', err);
      setError(err.message);
      return false;
    }
  }, []);

  // Set API key (for API mode)
  const setApiKey = useCallback(async (apiKey) => {
    if (!window.cluely?.stt) return false;
    
    try {
      await window.cluely.stt.setApiKey(apiKey);
      if (mode === 'api') {
        setIsReady(true);
      }
      return true;
    } catch (err) {
      console.error('[useSTT] Failed to set API key:', err);
      setError(err.message);
      return false;
    }
  }, [mode]);

  // Enable STT
  const enable = useCallback(async () => {
    if (!window.cluely?.stt) return;
    
    try {
      await window.cluely.stt.setEnabled(true);
      setIsEnabled(true);
    } catch (err) {
      console.error('[useSTT] Failed to enable:', err);
      setError(err.message);
    }
  }, []);

  // Disable STT
  const disable = useCallback(async () => {
    if (!window.cluely?.stt) return;
    
    try {
      await window.cluely.stt.setEnabled(false);
      setIsEnabled(false);
    } catch (err) {
      console.error('[useSTT] Failed to disable:', err);
    }
  }, []);

  // Clear transcriptions
  const clear = useCallback(async () => {
    if (!window.cluely?.stt) return;
    
    try {
      await window.cluely.stt.clear();
      setTranscriptions([]);
      setCurrentTranscript('');
    } catch (err) {
      console.error('[useSTT] Failed to clear:', err);
    }
  }, []);

  // Load existing transcriptions
  const loadTranscriptions = useCallback(async () => {
    if (!window.cluely?.stt) return;
    
    try {
      const results = await window.cluely.stt.getTranscriptions();
      setTranscriptions(results);
      setCurrentTranscript(results.map(t => t.text).join(' '));
    } catch (err) {
      console.error('[useSTT] Failed to load transcriptions:', err);
    }
  }, []);

  // Set up event listeners
  useEffect(() => {
    if (!window.cluely?.on) {
      console.log('[useSTT] window.cluely.on not available yet');
      return;
    }
    
    console.log('[useSTT] Setting up event listeners');

    // Listen for new transcriptions
    const unsubTranscription = window.cluely.on.sttTranscription?.((result) => {
      console.log('[useSTT] Received transcription:', result);
      setTranscriptions(prev => {
        const newTranscriptions = [...prev, result];
        console.log('[useSTT] Updated transcriptions count:', newTranscriptions.length);
        return newTranscriptions;
      });
      setCurrentTranscript(prev => prev ? `${prev} ${result.text}` : result.text);
    });

    // Listen for errors
    const unsubError = window.cluely.on.sttError?.((err) => {
      console.error('[useSTT] Error:', err);
      setError(err.message);
    });

    console.log('[useSTT] Listeners set up:', { 
      hasTranscription: !!unsubTranscription, 
      hasError: !!unsubError 
    });

    // Check initial state
    checkReady();

    return () => {
      console.log('[useSTT] Cleaning up listeners');
      unsubTranscription?.();
      unsubError?.();
    };
  }, [checkReady]);

  return {
    // State
    mode,
    isEnabled,
    isReady,
    isModelLoaded,
    isLoadingModel,
    transcriptions,
    currentTranscript,
    error,
    
    // Actions
    setMode,
    setApiKey,
    enable,
    disable,
    clear,
    loadTranscriptions,
    checkReady,
  };
}

export default useSTT;
