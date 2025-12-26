import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Custom hook for capturing system audio using electron-audio-loopback
 * Sends audio chunks to main process via IPC for processing
 * 
 * @param {Object} options - Configuration options
 * @param {boolean} options.enabled - Whether system audio capture is enabled
 * @param {boolean} options.paused - Whether capture is paused
 * @param {Function} options.onError - Error callback
 * @param {Function} options.onAudioLevel - Audio level callback
 * @param {Function} options.onReady - Ready callback
 * @returns {Object} - Capture state and controls
 */
export function useSystemAudioCapture({ enabled = false, paused = false, onError = null, onAudioLevel = null, onReady = null }) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState(null);
  const [hasPermission, setHasPermission] = useState(null);

  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const processorNodeRef = useRef(null);
  const hasCalledReadyRef = useRef(false);
  const firstChunkReceivedRef = useRef(false);
  const debugIntervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const lastEnabledRef = useRef(enabled);
  const lastPausedRef = useRef(paused);

  /**
   * Check system audio permission (screen recording permission on macOS)
   */
  const checkPermission = useCallback(async () => {
    try {
      // electron-audio-loopback requires screen recording permission
      // We'll check by attempting to get the stream
      if (!window.cluely?.audio?.enableLoopbackAudio) {
        setHasPermission(false);
        if (onError) onError(new Error('window.cluely.audio.enableLoopbackAudio not available. Check preload script.'));
        return false;
      }
      
      // Enable loopback, get stream, then disable
      await window.cluely.audio.enableLoopbackAudio();
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const videoTracks = stream.getVideoTracks();
      videoTracks.forEach(track => {
        track.stop();
        stream.removeTrack(track);
      });
      await window.cluely.audio.disableLoopbackAudio();
      stream.getTracks().forEach((track) => track.stop());
      setHasPermission(true);
      return true;
    } catch (err) {
      setHasPermission(false);
      if (onError) onError(err);
      return false;
    }
  }, [onError]);

  /**
   * Start system audio capture
   */
  const start = useCallback(async (force = false) => {
    console.log('[useSystemAudioCapture] start() called', { isCapturing, enabled, isStarting: isStartingRef.current, force });
    // Allow force start even if enabled is false (for explicit calls)
    if (!force && (isCapturing || !enabled || isStartingRef.current)) {
      console.log('[useSystemAudioCapture] Start called but already capturing, not enabled, or already starting.', {
        isCapturing,
        enabled,
        isStarting: isStartingRef.current,
        force,
      });
      return;
    }
    isStartingRef.current = true;

    const startTime = performance.now();
    startTimeRef.current = startTime;
    firstChunkReceivedRef.current = false;
    console.log("[useSystemAudioCapture] Starting...");
    
    try {
      // Get system audio stream using electron-audio-loopback manual mode
      // Step 1: Enable loopback audio via IPC
      if (!window.cluely?.audio?.enableLoopbackAudio) {
        throw new Error('window.cluely.audio.enableLoopbackAudio not available. Check preload script.');
      }
      
      console.log('[useSystemAudioCapture] Enabling loopback audio via IPC...');
      const enableStartTime = performance.now();
      try {
        const enableResult = await window.cluely.audio.enableLoopbackAudio();
        const enableEndTime = performance.now();
        console.log(`[useSystemAudioCapture] enableLoopbackAudio took ${(enableEndTime - enableStartTime).toFixed(2)}ms`, { result: enableResult });
      } catch (enableError) {
        console.error('[useSystemAudioCapture] Error enabling loopback audio:', enableError);
        throw enableError;
      }
      
      // Step 2: Get display media stream (electron-audio-loopback intercepts this)
      // This will show a permission dialog to the user
      console.log('[useSystemAudioCapture] Calling getDisplayMedia() - this should show a permission dialog...');
      const getUserMediaStartTime = performance.now();
      let stream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true, // Required by electron-audio-loopback
          audio: true,
        });
        const getUserMediaEndTime = performance.now();
        console.log(`[useSystemAudioCapture] getDisplayMedia took ${(getUserMediaEndTime - getUserMediaStartTime).toFixed(2)}ms`);
      } catch (getDisplayMediaError) {
        console.error('[useSystemAudioCapture] Error calling getDisplayMedia:', getDisplayMediaError);
        console.error('[useSystemAudioCapture] Error details:', {
          name: getDisplayMediaError.name,
          message: getDisplayMediaError.message,
          stack: getDisplayMediaError.stack,
        });
        // Disable loopback audio if getDisplayMedia fails
        if (window.cluely?.audio?.disableLoopbackAudio) {
          try {
            await window.cluely.audio.disableLoopbackAudio();
          } catch (disableError) {
            console.warn('[useSystemAudioCapture] Error disabling loopback audio after getDisplayMedia failure:', disableError);
          }
        }
        throw getDisplayMediaError;
      }
      
      // Step 3: Remove video tracks (we only need audio)
      const videoTracks = stream.getVideoTracks();
      videoTracks.forEach(track => {
        track.stop();
        stream.removeTrack(track);
      });
      
      // Note: We keep loopback audio enabled while capturing
      // We'll disable it in the stop() function
      
      console.log('[useSystemAudioCapture] Stream obtained:', {
        hasStream: !!stream,
        audioTracks: stream.getAudioTracks().length,
        videoTracks: stream.getVideoTracks().length,
      });

      streamRef.current = stream;
      setHasPermission(true);
      setError(null);

      // Debug: Log stream track information
      const tracks = stream.getAudioTracks();
      console.log('[useSystemAudioCapture] Stream tracks:', {
        count: tracks.length,
        trackStates: tracks.map(t => ({
          id: t.id,
          label: t.label,
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState,
          settings: t.getSettings()
        }))
      });

      // Monitor track state changes
      tracks.forEach((track, index) => {
        track.onended = () => {
          console.warn(`[useSystemAudioCapture] Track ${index} ended!`);
        };
        track.onmute = () => {
          console.warn(`[useSystemAudioCapture] Track ${index} muted!`);
        };
        track.onunmute = () => {
          console.log(`[useSystemAudioCapture] Track ${index} unmuted`);
        };
      });

      // Create AudioContext
      const audioContextStartTime = performance.now();
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext({
        sampleRate: 48000, // Match requested sample rate
      });
      audioContextRef.current = audioContext;
      const audioContextEndTime = performance.now();
      console.log(`[useSystemAudioCapture] AudioContext creation took ${(audioContextEndTime - audioContextStartTime).toFixed(2)}ms`);
      console.log('[useSystemAudioCapture] AudioContext state:', audioContext.state);
      
      // Monitor AudioContext state changes
      audioContext.onstatechange = () => {
        console.log('[useSystemAudioCapture] AudioContext state changed to:', audioContext.state);
      };

      // Force AudioContext to start
      if (audioContext.state !== 'running') {
        console.log('[useSystemAudioCapture] AudioContext is not running, forcing start...');
        try {
          const buffer = audioContext.createBuffer(1, 1, 22050);
          const source = audioContext.createBufferSource();
          source.buffer = buffer;
          source.connect(audioContext.destination);
          source.start(0);
          source.stop(0.001);
          
          await audioContext.resume();
          console.log('[useSystemAudioCapture] AudioContext forced start attempted, new state:', audioContext.state);
          
          if (audioContext.state !== 'running') {
            console.warn('[useSystemAudioCapture] AudioContext still not running, waiting 50ms and retrying...');
            await new Promise(resolve => setTimeout(resolve, 50));
            await audioContext.resume();
            console.log('[useSystemAudioCapture] AudioContext state after retry:', audioContext.state);
          }
        } catch (error) {
          console.error('[useSystemAudioCapture] Error forcing AudioContext start:', error);
        }
      }

      // Create source node from media stream
      const source = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = source;
      console.log('[useSystemAudioCapture] MediaStreamSource created');

      // Create ScriptProcessorNode for audio processing
      const bufferSize = 4096; // Buffer size in samples
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      processorNodeRef.current = processor;
      console.log('[useSystemAudioCapture] ScriptProcessorNode created, bufferSize:', bufferSize, `(~${(bufferSize / audioContext.sampleRate * 1000).toFixed(2)}ms at ${audioContext.sampleRate}Hz)`);

      // Process audio chunks
      let chunkCount = 0;
      processor.onaudioprocess = (event) => {
        if (paused) return;

        chunkCount++;
        
        // Log first chunk with detailed timing
        if (!firstChunkReceivedRef.current) {
          firstChunkReceivedRef.current = true;
          const firstChunkTime = performance.now();
          const timeSinceStart = firstChunkTime - startTimeRef.current;
          console.log('[useSystemAudioCapture] ⚡ FIRST AUDIO CHUNK RECEIVED!', {
            timeSinceStart: `${timeSinceStart.toFixed(2)}ms`,
            audioContextState: audioContext.state,
            sampleRate: audioContext.sampleRate,
            bufferSize: bufferSize
          });
        }

        // Get audio data from input buffer
        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0); // Get first channel (mono)

        // Calculate audio level (RMS)
        let sum = 0;
        let maxSample = 0;
        for (let i = 0; i < inputData.length; i++) {
          const sample = inputData[i];
          sum += sample * sample;
          maxSample = Math.max(maxSample, Math.abs(sample));
        }
        const rms = Math.sqrt(sum / inputData.length);
        const level = Math.min(1, rms * 2); // Normalize and boost for visibility

        // Log first few chunks with audio level info
        if (chunkCount <= 3) {
          console.log(`[useSystemAudioCapture] Chunk #${chunkCount}:`, {
            level: level.toFixed(4),
            rms: rms.toFixed(6),
            maxSample: maxSample.toFixed(6),
            bufferLength: inputData.length
          });
        }

        // Notify audio level callback
        if (onAudioLevel) {
          onAudioLevel(level);
        }

        // Convert Float32Array to regular array for IPC transmission
        const audioArray = Array.from(inputData);

        // Send audio chunk to main process with format info
        if (window.cluely?.audio?.sendSystemChunk) {
          window.cluely.audio.sendSystemChunk({
            data: audioArray,
            sampleRate: audioContext.sampleRate,
            channels: 1,
            bitDepth: "float32",
            timestamp: Date.now(),
          });
        }
      };

      // Connect nodes: source -> processor -> destination
      console.log('[useSystemAudioCapture] Connecting audio nodes, AudioContext state:', audioContext.state);
      source.connect(processor);
      processor.connect(audioContext.destination); // Connect to output for monitoring
      console.log('[useSystemAudioCapture] Audio nodes connected');

      // Final check: Ensure AudioContext is running
      if (audioContext.state !== 'running') {
        console.error('[useSystemAudioCapture] ⚠️ CRITICAL: AudioContext not running after connections! State:', audioContext.state);
        try {
          await audioContext.resume();
          
          if (audioContext.state !== 'running') {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            gainNode.gain.value = 0; // Silent
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.001);
            
            await new Promise(resolve => setTimeout(resolve, 10));
            await audioContext.resume();
          }
          
          console.log('[useSystemAudioCapture] AudioContext state after aggressive unlock:', audioContext.state);
        } catch (error) {
          console.error('[useSystemAudioCapture] Error unlocking AudioContext:', error);
        }
      }

      setIsCapturing(true);
      isStartingRef.current = false;
      
      // Log connection status
      const streamTracks = stream.getAudioTracks();
      console.log('[useSystemAudioCapture] Setup complete:', {
        audioContextState: audioContext.state,
        streamActive: streamTracks.length > 0 && streamTracks.every(t => t.readyState === 'live'),
        tracksCount: streamTracks.length,
        processorConnected: !!processor,
        sourceConnected: !!source,
      });

      // Start periodic debugging
      debugIntervalRef.current = setInterval(() => {
        const timeSinceStart = performance.now() - startTimeRef.current;
        const audioContext = audioContextRef.current;
        const stream = streamRef.current;
        const processor = processorNodeRef.current;
        
        const debugInfo = {
          timeSinceStart: `${timeSinceStart.toFixed(0)}ms`,
          audioContextState: audioContext?.state || 'null',
          streamActive: stream ? stream.getAudioTracks().map(t => ({
            id: t.id,
            readyState: t.readyState,
            enabled: t.enabled,
            muted: t.muted
          })) : 'null',
          processorConnected: !!processor,
          firstChunkReceived: firstChunkReceivedRef.current,
          isCapturing: isCapturing,
          paused: paused
        };

        if (!firstChunkReceivedRef.current && Math.floor(timeSinceStart / 2000) !== Math.floor((timeSinceStart - 100) / 2000)) {
          console.warn('[useSystemAudioCapture] 🔍 DEBUG CHECK (no audio yet):', debugInfo);
          
          if (audioContext && audioContext.state === 'suspended') {
            console.warn('[useSystemAudioCapture] ⚠️ AudioContext is SUSPENDED - attempting to resume...');
            audioContext.resume().then(() => {
              console.log('[useSystemAudioCapture] AudioContext resumed, new state:', audioContext.state);
            }).catch(err => {
              console.error('[useSystemAudioCapture] Failed to resume AudioContext:', err);
            });
          }
        }
      }, 100);

      // Set timeout warnings
      setTimeout(() => {
        if (!firstChunkReceivedRef.current) {
          console.error('[useSystemAudioCapture] ⚠️ WARNING: No audio chunks received after 5 seconds!');
        }
      }, 5000);

      setTimeout(() => {
        if (!firstChunkReceivedRef.current) {
          console.error('[useSystemAudioCapture] ⚠️ CRITICAL: No audio chunks received after 15 seconds!');
        }
      }, 15000);
      
      // Call onReady once stream is connected
      if (!hasCalledReadyRef.current && onReady) {
        hasCalledReadyRef.current = true;
        const readyTime = performance.now();
        const totalTime = readyTime - startTime;
        console.log(`[useSystemAudioCapture] Stream connected and ready (${totalTime.toFixed(2)}ms), calling onReady`);
        onReady();
      } else {
        const totalTime = performance.now() - startTime;
        console.log(`[useSystemAudioCapture] Total start() took ${totalTime.toFixed(2)}ms`);
      }
    } catch (err) {
      console.error("[useSystemAudioCapture] Error starting capture:", err);
      console.error("[useSystemAudioCapture] Error details:", {
        message: err.message,
        stack: err.stack,
        name: err.name,
        enabled: enabled,
        isCapturing: isCapturing,
        isStarting: isStartingRef.current,
        hasIPC: !!window.cluely?.audio?.enableLoopbackAudio,
      });
      setError(err);
      setHasPermission(false);
      setIsCapturing(false);
      isStartingRef.current = false;
      if (onError) onError(err);
    }
  }, [enabled, isCapturing, paused, onError, onAudioLevel, onReady]);

  /**
   * Stop system audio capture
   */
  const stop = useCallback(async () => {
    if (!isCapturing || isStoppingRef.current) {
      console.log("[useSystemAudioCapture] Stop called but not capturing or already stopping.");
      return;
    }
    isStoppingRef.current = true;

    try {
      hasCalledReadyRef.current = false;
      firstChunkReceivedRef.current = false;

      // Stop debug interval
      if (debugIntervalRef.current) {
        clearInterval(debugIntervalRef.current);
        debugIntervalRef.current = null;
      }

      // Disconnect and cleanup audio nodes
      if (processorNodeRef.current) {
        processorNodeRef.current.disconnect();
        processorNodeRef.current.onaudioprocess = null;
        processorNodeRef.current = null;
      }

      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close().catch((err) => {
          console.warn("[useSystemAudioCapture] Error closing AudioContext:", err);
        });
        audioContextRef.current = null;
      }

      // Stop all tracks in the stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        streamRef.current = null;
      }

      // Disable loopback audio when stopping (restore normal getDisplayMedia behavior)
      if (window.cluely?.audio?.disableLoopbackAudio) {
        try {
          await window.cluely.audio.disableLoopbackAudio();
          console.log('[useSystemAudioCapture] Loopback audio disabled');
        } catch (error) {
          console.warn('[useSystemAudioCapture] Error disabling loopback audio:', error);
        }
      }

      setIsCapturing(false);
      setError(null);
      isStoppingRef.current = false;
    } catch (err) {
      console.error("[useSystemAudioCapture] Error stopping capture:", err);
      setError(err);
      isStoppingRef.current = false;
      if (onError) onError(err);
    }
  }, [isCapturing, onError]);

  /**
   * Toggle capture (start if stopped, stop if started)
   */
  const toggle = useCallback(() => {
    if (isCapturing) {
      stop();
    } else {
      start();
    }
  }, [isCapturing, start, stop]);

  // Auto-start/stop based on enabled prop
  useEffect(() => {
    const enabledChanged = lastEnabledRef.current !== enabled;
    const pausedChanged = lastPausedRef.current !== paused;
    
    if (!enabledChanged && !pausedChanged) {
      return; // No change, don't restart
    }
    
    lastEnabledRef.current = enabled;
    lastPausedRef.current = paused;

    // Prevent multiple simultaneous start/stop calls
    if (enabled && !isCapturing && !paused && !isStartingRef.current) {
      isStartingRef.current = true;
      start().finally(() => {
        isStartingRef.current = false;
      });
    } else if (!enabled && isCapturing && !isStoppingRef.current) {
      isStoppingRef.current = true;
      stop().finally(() => {
        isStoppingRef.current = false;
      });
    } else if (enabled && isCapturing && paused && !isStoppingRef.current) {
      // Paused while capturing - stop processing but keep stream alive
      console.log('[useSystemAudioCapture] Paused while capturing, keeping stream alive');
    }
  }, [enabled, isCapturing, paused, start, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    isCapturing,
    error,
    hasPermission,
    start,
    stop,
    toggle,
    checkPermission,
  };
}

export default useSystemAudioCapture;

