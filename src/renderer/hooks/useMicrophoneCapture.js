import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Custom hook for capturing microphone audio using Web Audio API
 * Sends audio chunks to main process via IPC for processing
 * 
 * @param {Object} options - Configuration options
 * @param {boolean} options.enabled - Whether microphone capture is enabled
 * @param {boolean} options.paused - Whether capture is paused
 * @param {Function} options.onError - Error callback
 * @returns {Object} - Capture state and controls
 */
export function useMicrophoneCapture({ enabled = false, paused = false, onError = null, onAudioLevel = null, onReady = null }) {
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

  // Audio constraints (matching audioConfig.js settings)
  const audioConstraints = {
    channelCount: 1, // Request mono if possible
    sampleRate: 48000, // Request 48kHz (will be resampled to 16kHz in main process)
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };

  /**
   * Check microphone permission
   */
  const checkPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
   * Start microphone capture
   */
  const start = useCallback(async () => {
    if (isCapturing || !enabled) {
      console.log('[useMicrophoneCapture] start() called but already capturing or not enabled', { isCapturing, enabled });
      return;
    }

    const startTime = performance.now();
    startTimeRef.current = startTime;
    firstChunkReceivedRef.current = false;
    console.log("[useMicrophoneCapture] Starting...");
    
    try {
      // Request microphone access
      const getUserMediaStartTime = performance.now();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
      const getUserMediaEndTime = performance.now();
      console.log(`[useMicrophoneCapture] getUserMedia took ${(getUserMediaEndTime - getUserMediaStartTime).toFixed(2)}ms`);

      streamRef.current = stream;
      setHasPermission(true);
      setError(null);

      // Debug: Log stream track information and set up event listeners
      const tracks = stream.getAudioTracks();
      console.log('[useMicrophoneCapture] Stream tracks:', {
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
          console.warn(`[useMicrophoneCapture] Track ${index} ended!`);
        };
        track.onmute = () => {
          console.warn(`[useMicrophoneCapture] Track ${index} muted!`);
        };
        track.onunmute = () => {
          console.log(`[useMicrophoneCapture] Track ${index} unmuted`);
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
      console.log(`[useMicrophoneCapture] AudioContext creation took ${(audioContextEndTime - audioContextStartTime).toFixed(2)}ms`);
      console.log('[useMicrophoneCapture] AudioContext state:', audioContext.state);
      
      // Monitor AudioContext state changes
      audioContext.onstatechange = () => {
        console.log('[useMicrophoneCapture] AudioContext state changed to:', audioContext.state);
      };

      // CRITICAL: Force AudioContext to start by creating and playing a silent oscillator
      // This "unlocks" the AudioContext and ensures it's in 'running' state
      // Browser autoplay policies often suspend AudioContext until audio is played
      if (audioContext.state !== 'running') {
        console.log('[useMicrophoneCapture] AudioContext is not running, state:', audioContext.state, '- forcing start...');
        try {
          // Create a very short silent audio buffer and play it to unlock AudioContext
          const buffer = audioContext.createBuffer(1, 1, 22050);
          const source = audioContext.createBufferSource();
          source.buffer = buffer;
          source.connect(audioContext.destination);
          source.start(0);
          source.stop(0.001); // Stop immediately
          
          // Also try resume
          await audioContext.resume();
          console.log('[useMicrophoneCapture] AudioContext forced start attempted, new state:', audioContext.state);
          
          // If still not running, wait a bit and try again
          if (audioContext.state !== 'running') {
            console.warn('[useMicrophoneCapture] AudioContext still not running, waiting 50ms and retrying...');
            await new Promise(resolve => setTimeout(resolve, 50));
            await audioContext.resume();
            console.log('[useMicrophoneCapture] AudioContext state after retry:', audioContext.state);
          }
        } catch (error) {
          console.error('[useMicrophoneCapture] Error forcing AudioContext start:', error);
        }
      }

      // Create source node from media stream
      const source = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = source;
      console.log('[useMicrophoneCapture] MediaStreamSource created');

      // Create ScriptProcessorNode for audio processing
      // Note: ScriptProcessorNode is deprecated but widely supported
      // For better performance, AudioWorkletNode could be used but requires more setup
      const bufferSize = 4096; // Buffer size in samples
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      processorNodeRef.current = processor;
      console.log('[useMicrophoneCapture] ScriptProcessorNode created, bufferSize:', bufferSize, `(~${(bufferSize / audioContext.sampleRate * 1000).toFixed(2)}ms at ${audioContext.sampleRate}Hz)`);

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
          console.log('[useMicrophoneCapture] ⚡ FIRST AUDIO CHUNK RECEIVED!', {
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
          console.log(`[useMicrophoneCapture] Chunk #${chunkCount}:`, {
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
        // IPC can't directly send TypedArrays, so we convert to regular array
        const audioArray = Array.from(inputData);

        // Send audio chunk to main process with format info
        if (window.cluely?.audio?.sendMicrophoneChunk) {
          window.cluely.audio.sendMicrophoneChunk({
            data: audioArray,
            sampleRate: audioContext.sampleRate,
            channels: 1,
            bitDepth: "float32",
            timestamp: Date.now(),
          });
        }
      };

      // Connect nodes: source -> processor -> destination (for monitoring, optional)
      // CRITICAL: ScriptProcessorNode only processes when connected to a destination
      // AND AudioContext is in 'running' state
      console.log('[useMicrophoneCapture] Connecting audio nodes, AudioContext state:', audioContext.state);
      source.connect(processor);
      processor.connect(audioContext.destination); // Connect to output for monitoring
      console.log('[useMicrophoneCapture] Audio nodes connected');

      // Final check: Ensure AudioContext is running after connections
      // This is CRITICAL - ScriptProcessorNode won't fire if AudioContext is suspended
      if (audioContext.state !== 'running') {
        console.error('[useMicrophoneCapture] ⚠️ CRITICAL: AudioContext not running after connections! State:', audioContext.state);
        console.error('[useMicrophoneCapture] ScriptProcessorNode will NOT fire until AudioContext is running!');
        console.error('[useMicrophoneCapture] Attempting aggressive unlock...');
        
        try {
          // Method 1: Try resume
          await audioContext.resume();
          
          // Method 2: If still not running, create and play silent audio to unlock
          if (audioContext.state !== 'running') {
            console.log('[useMicrophoneCapture] Creating silent oscillator to unlock AudioContext...');
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            gainNode.gain.value = 0; // Silent
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.001); // Stop immediately
            
            // Wait a bit for it to process
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Try resume again
            await audioContext.resume();
          }
          
          console.log('[useMicrophoneCapture] AudioContext state after aggressive unlock:', audioContext.state);
          
          // If STILL not running, this is a serious problem
          if (audioContext.state !== 'running') {
            console.error('[useMicrophoneCapture] ⚠️ AudioContext STILL not running after all attempts! This will prevent audio processing.');
            console.error('[useMicrophoneCapture] Possible causes:');
            console.error('[useMicrophoneCapture] 1. Browser autoplay policy blocking audio');
            console.error('[useMicrophoneCapture] 2. User interaction required to start audio');
            console.error('[useMicrophoneCapture] 3. AudioContext creation failed');
            console.error('[useMicrophoneCapture] 4. Electron-specific audio restrictions');
          }
        } catch (error) {
          console.error('[useMicrophoneCapture] Error unlocking AudioContext:', error);
        }
      }

      setIsCapturing(true);
      
      // Log connection status for debugging
      const streamTracks = stream.getAudioTracks();
      console.log('[useMicrophoneCapture] Setup complete:', {
        audioContextState: audioContext.state,
        streamActive: streamTracks.length > 0 && streamTracks.every(t => t.readyState === 'live'),
        tracksCount: streamTracks.length,
        processorConnected: !!processor,
        sourceConnected: !!source,
        destinationConnected: processor && audioContext.destination
      });

      // Start periodic debugging to track state
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
          processorOnaudioprocess: processor ? (processor.onaudioprocess ? 'set' : 'NOT SET') : 'null',
          firstChunkReceived: firstChunkReceivedRef.current,
          isCapturing: isCapturing,
          paused: paused
        };

        // Log every 2 seconds until first chunk is received
        if (!firstChunkReceivedRef.current && Math.floor(timeSinceStart / 2000) !== Math.floor((timeSinceStart - 100) / 2000)) {
          console.warn('[useMicrophoneCapture] 🔍 DEBUG CHECK (no audio yet):', debugInfo);
          
          // If AudioContext is suspended, try to resume it automatically
          if (audioContext && audioContext.state === 'suspended') {
            console.warn('[useMicrophoneCapture] ⚠️ AudioContext is SUSPENDED - attempting to resume...');
            audioContext.resume().then(() => {
              console.log('[useMicrophoneCapture] AudioContext resumed, new state:', audioContext.state);
            }).catch(err => {
              console.error('[useMicrophoneCapture] Failed to resume AudioContext:', err);
            });
          }
          
          // If AudioContext is suspended, try to resume it
          if (audioContext && audioContext.state === 'suspended') {
            console.warn('[useMicrophoneCapture] ⚠️ AudioContext is SUSPENDED - attempting to resume...');
            audioContext.resume().then(() => {
              console.log('[useMicrophoneCapture] AudioContext resumed, new state:', audioContext.state);
            }).catch(err => {
              console.error('[useMicrophoneCapture] Failed to resume AudioContext:', err);
            });
          }
        }
      }, 100); // Check every 100ms

      // Set timeout warnings if no audio arrives
      setTimeout(() => {
        if (!firstChunkReceivedRef.current) {
          console.error('[useMicrophoneCapture] ⚠️ WARNING: No audio chunks received after 5 seconds!', {
            audioContextState: audioContextRef.current?.state,
            streamTracks: streamRef.current?.getAudioTracks()?.map(t => ({
              readyState: t.readyState,
              enabled: t.enabled,
              muted: t.muted
            }))
          });
        }
      }, 5000);

      setTimeout(() => {
        if (!firstChunkReceivedRef.current) {
          console.error('[useMicrophoneCapture] ⚠️ CRITICAL: No audio chunks received after 15 seconds!', {
            audioContextState: audioContextRef.current?.state,
            streamTracks: streamRef.current?.getAudioTracks()?.map(t => ({
              readyState: t.readyState,
              enabled: t.enabled,
              muted: t.muted
            })),
            processorNode: !!processorNodeRef.current,
            sourceNode: !!sourceNodeRef.current
          });
        }
      }, 15000);
      
      // Call onReady immediately once stream is connected (don't wait for first chunk)
      // The stream is active and ready to capture, waiting for first chunk adds unnecessary delay
      if (!hasCalledReadyRef.current && onReady) {
        hasCalledReadyRef.current = true;
        const readyTime = performance.now();
        const totalTime = readyTime - startTime;
        console.log(`[useMicrophoneCapture] Stream connected and ready (${totalTime.toFixed(2)}ms), calling onReady immediately`);
        onReady();
      } else {
        const totalTime = performance.now() - startTime;
        console.log(`[useMicrophoneCapture] Total start() took ${totalTime.toFixed(2)}ms`);
      }
    } catch (err) {
      console.error("[useMicrophoneCapture] Error starting capture:", err);
      setError(err);
      setHasPermission(false);
      setIsCapturing(false);
      if (onError) onError(err);
    }
  }, [enabled, isCapturing, paused, audioConstraints, onError, onAudioLevel, onReady]);

  /**
   * Stop microphone capture
   */
  const stop = useCallback(() => {
    if (!isCapturing) return;

    try {
      // Reset ready flag
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
          console.warn("[useMicrophoneCapture] Error closing AudioContext:", err);
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

      setIsCapturing(false);
      setError(null);
    } catch (err) {
      console.error("[useMicrophoneCapture] Error stopping capture:", err);
      setError(err);
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
  // Use refs to track if we're already starting/stopping to prevent race conditions
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const lastEnabledRef = useRef(enabled);
  const lastPausedRef = useRef(paused);
  
  useEffect(() => {
    // Only restart if enabled or paused state actually changed
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
      // (The paused check in start() should handle this, but let's be explicit)
      console.log('[useMicrophoneCapture] Paused while capturing, keeping stream alive');
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

export default useMicrophoneCapture;
