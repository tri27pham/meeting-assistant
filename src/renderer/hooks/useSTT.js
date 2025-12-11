/**
 * useSTT.js
 * 
 * React hook for managing Speech-to-Text functionality with Deepgram.
 * Supports real-time streaming transcription.
 */

import { useState, useEffect, useCallback } from 'react';

export function useSTT() {
  // Connection state
  const [isEnabled, setIsEnabled] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  
  // Transcription state
  const [transcriptions, setTranscriptions] = useState([]);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState(null);

  // Set API key
  const setApiKey = useCallback(async (apiKey) => {
    if (!window.cluely?.stt) return false;
    
    try {
      await window.cluely.stt.setApiKey(apiKey);
      setIsReady(true);
      setError(null);
      return true;
    } catch (err) {
      console.error('[useSTT] Failed to set API key:', err);
      setError(err.message);
      return false;
    }
  }, []);

  // Enable STT (connect to Deepgram)
  const enable = useCallback(async () => {
    if (!window.cluely?.stt) return;
    
    try {
      await window.cluely.stt.setEnabled(true);
      setIsEnabled(true);
      setError(null);
    } catch (err) {
      console.error('[useSTT] Failed to enable:', err);
      setError(err.message);
    }
  }, []);

  // Disable STT (disconnect)
  const disable = useCallback(async () => {
    if (!window.cluely?.stt) return;
    
    try {
      await window.cluely.stt.setEnabled(false);
      setIsEnabled(false);
      setInterimText('');
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
      setInterimText('');
    } catch (err) {
      console.error('[useSTT] Failed to clear:', err);
    }
  }, []);

  // Get full transcript as string
  const getFullTranscript = useCallback(() => {
    const final = transcriptions.map(t => t.text).join(' ');
    return interimText ? `${final} ${interimText}`.trim() : final;
  }, [transcriptions, interimText]);

  // Check initial state
  const checkReady = useCallback(async () => {
    if (!window.cluely?.stt) return;
    
    try {
      const state = await window.cluely.stt.getState();
      setIsReady(state.hasApiKey);
      setIsEnabled(state.isEnabled);
      setIsConnected(state.isConnected);
    } catch (err) {
      console.error('[useSTT] Failed to check state:', err);
    }
  }, []);

  // Set up event listeners
  useEffect(() => {
    if (!window.cluely?.on) {
      return;
    }

    // Final transcription
    const unsubTranscription = window.cluely.on.sttTranscription?.((result) => {
      console.log('[useSTT] Final:', result.text);
      setTranscriptions(prev => [...prev, result]);
      setInterimText(''); // Clear interim when final arrives
    });

    // Interim (partial) transcription
    const unsubInterim = window.cluely.on.sttInterim?.((result) => {
      setInterimText(result.text);
    });

    // Connection status
    const unsubConnected = window.cluely.on.sttConnected?.(() => {
      console.log('[useSTT] Connected');
      setIsConnected(true);
      setError(null);
    });

    const unsubDisconnected = window.cluely.on.sttDisconnected?.((info) => {
      console.log('[useSTT] Disconnected:', info);
      setIsConnected(false);
    });

    // Errors
    const unsubError = window.cluely.on.sttError?.((err) => {
      console.error('[useSTT] Error:', err);
      setError(err.message);
    });

    // Check initial state
    checkReady();

    return () => {
      unsubTranscription?.();
      unsubInterim?.();
      unsubConnected?.();
      unsubDisconnected?.();
      unsubError?.();
    };
  }, [checkReady]);

  return {
    // State
    isEnabled,
    isConnected,
    isReady,
    transcriptions,
    interimText,
    currentTranscript: getFullTranscript(),
    error,
    
    // Actions
    setApiKey,
    enable,
    disable,
    clear,
    checkReady,
  };
}

export default useSTT;
