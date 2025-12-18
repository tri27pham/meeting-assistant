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
    if (isCapturing || !enabled) return;

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });

      streamRef.current = stream;
      setHasPermission(true);
      setError(null);

      // Create AudioContext
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext({
        sampleRate: 48000, // Match requested sample rate
      });
      audioContextRef.current = audioContext;

      // Create source node from media stream
      const source = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      // Create ScriptProcessorNode for audio processing
      // Note: ScriptProcessorNode is deprecated but widely supported
      // For better performance, AudioWorkletNode could be used but requires more setup
      const bufferSize = 4096; // Buffer size in samples
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      processorNodeRef.current = processor;

      // Process audio chunks
      processor.onaudioprocess = (event) => {
        if (paused) return;

        // Call onReady on first audio chunk (indicates mic is actually capturing)
        if (!hasCalledReadyRef.current && onReady) {
          hasCalledReadyRef.current = true;
          onReady();
        }

        // Get audio data from input buffer
        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0); // Get first channel (mono)

        // Calculate audio level (RMS)
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        const level = Math.min(1, rms * 2); // Normalize and boost for visibility

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
      source.connect(processor);
      processor.connect(audioContext.destination); // Connect to output for monitoring

      setIsCapturing(true);
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
  useEffect(() => {
    if (enabled && !isCapturing && !paused) {
      start();
    } else if (!enabled && isCapturing) {
      stop();
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
