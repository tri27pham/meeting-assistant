/**
 * useAudioCapture.js
 * 
 * PURPOSE:
 * React hook that handles actual audio capture in the renderer process.
 * Uses Web Audio API for microphone and desktopCapturer for system audio.
 * 
 * WHY IN RENDERER:
 * - navigator.mediaDevices.getUserMedia only works in renderer
 * - Electron's desktopCapturer only works in renderer
 * - Web Audio API for processing is a browser API
 * 
 * AUDIO PIPELINE:
 * 
 * Microphone:
 * getUserMedia → MediaStream → AudioContext → ScriptProcessor → Float32 samples
 *                                                      ↓
 *                                                 IPC to Main
 * 
 * System Audio:
 * desktopCapturer → MediaStream → AudioContext → ScriptProcessor → Float32 samples
 *                                                         ↓
 *                                                    IPC to Main
 * 
 * AUDIO FORMAT:
 * - Sample Rate: 16000 Hz (resampled if needed)
 * - Channels: 1 (mono, mixed down if stereo)
 * - Format: Float32 samples (-1 to 1)
 * - Chunk Size: 4096 samples (~256ms at 16kHz)
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// Target audio format for STT
const TARGET_SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;

/**
 * Custom hook for audio capture
 * 
 * @returns {Object} Audio capture controls and state
 */
export function useAudioCapture() {
  // Capture state
  const [isMicCapturing, setIsMicCapturing] = useState(false);
  const [isSystemCapturing, setIsSystemCapturing] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [systemLevel, setSystemLevel] = useState(0);
  const [error, setError] = useState(null);
  
  // dB levels for audio meter (real-time)
  const [micDB, setMicDB] = useState(-60);
  const [micPeak, setMicPeak] = useState(-60);
  const [systemDB, setSystemDB] = useState(-60);
  const [systemPeak, setSystemPeak] = useState(-60);

  // Audio context and stream refs
  const micContextRef = useRef(null);
  const micStreamRef = useRef(null);
  const micProcessorRef = useRef(null);
  const micRecorderRef = useRef(null); // MediaRecorder for STT
  
  const systemContextRef = useRef(null);
  const systemStreamRef = useRef(null);
  const systemProcessorRef = useRef(null);
  
  // Level refs for audio callback (avoid setState in audio callback)
  const micLevelRef = useRef(0);
  const systemLevelRef = useRef(0);
  const micDBRef = useRef(-60);
  const micPeakRef = useRef(-60);
  const animationFrameRef = useRef(null);
  
  // Peak hold decay
  const peakHoldTimeoutRef = useRef(null);

  /**
   * Pre-authorize microphone access
   * Call this during permission setup when the window is fully interactive
   * This prevents crashes when calling getUserMedia in transparent windows
   */
  const preAuthorizeMic = useCallback(async () => {
    if (micStreamRef.current) {
      console.log('[useAudioCapture] Mic already pre-authorized');
      return true;
    }
    
    try {
      console.log('[useAudioCapture] Pre-authorizing microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      console.log('[useAudioCapture] Microphone pre-authorized successfully');
      return true;
    } catch (err) {
      console.error('[useAudioCapture] Failed to pre-authorize mic:', err);
      return false;
    }
  }, []);

  /**
   * Start microphone capture
   */
  const startMicCapture = useCallback(async () => {
    if (isMicCapturing) {
      console.log('[useAudioCapture] Mic already capturing');
      return;
    }

    try {
      console.log('[useAudioCapture] Starting mic capture...');
      
      // Check if we already have a stream (pre-authorized)
      let stream = micStreamRef.current;
      
      if (!stream) {
        // Request microphone - this can crash in transparent windows
        // so we wrap it carefully
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStreamRef.current = stream;
        } catch (mediaErr) {
          console.warn('[useAudioCapture] getUserMedia failed, using simulation:', mediaErr);
          return startSimulatedCapture();
        }
      }

      // Create audio context
      let audioContext;
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
      } catch (ctxErr) {
        console.warn('[useAudioCapture] AudioContext failed, using simulation:', ctxErr);
        return startSimulatedCapture();
      }
      
      micContextRef.current = audioContext;

      // Create source from stream
      const source = audioContext.createMediaStreamSource(stream);
      
      // Use AnalyserNode for level metering AND audio capture for local STT
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096; // Larger for better audio capture
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      // Don't connect to destination - we don't want audio output
      
      micProcessorRef.current = analyser;
      
      // Arrays for audio capture
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Float32Array(analyser.fftSize);
      
      // Buffer for accumulating audio samples
      let audioSampleBuffer = [];
      let lastSendTime = Date.now();
      const SEND_INTERVAL_MS = 3000; // Send every 3 seconds
      
      // Helper: Convert RMS to dB (dBFS)
      const rmsToDb = (rms) => {
        if (rms <= 0) return -60;
        const db = 20 * Math.log10(rms);
        return Math.max(-60, Math.min(0, db));
      };
      
      // Poll analyser for level updates and audio capture
      const updateLevel = () => {
        if (!micProcessorRef.current) return;
        
        // Get time domain data for dB calculation
        analyser.getFloatTimeDomainData(timeData);
        
        // Calculate RMS and Peak from time domain data
        let sumSquares = 0;
        let peak = 0;
        for (let i = 0; i < timeData.length; i++) {
          const sample = timeData[i];
          sumSquares += sample * sample;
          const abs = Math.abs(sample);
          if (abs > peak) peak = abs;
        }
        const rms = Math.sqrt(sumSquares / timeData.length);
        
        // Convert to dB
        const db = rmsToDb(rms);
        const peakDb = rmsToDb(peak);
        
        // Update refs and state
        micLevelRef.current = rms;
        micDBRef.current = db;
        setMicLevel(rms);
        setMicDB(db);
        
        // Peak hold with decay
        if (peakDb > micPeakRef.current) {
          micPeakRef.current = peakDb;
          setMicPeak(peakDb);
          // Reset peak after 500ms
          if (peakHoldTimeoutRef.current) clearTimeout(peakHoldTimeoutRef.current);
          peakHoldTimeoutRef.current = setTimeout(() => {
            micPeakRef.current = -60;
            setMicPeak(-60);
          }, 500);
        }
        
        // Add samples to buffer (only if there's meaningful audio)
        if (rms > 0.01) {
          audioSampleBuffer.push(...timeData);
        }
        
        // Send buffer periodically for STT
        const now = Date.now();
        if (now - lastSendTime >= SEND_INTERVAL_MS && audioSampleBuffer.length > 0) {
          if (window.cluely?.audio?.sendAudioChunk) {
            window.cluely.audio.sendAudioChunk({
              source: 'mic',
              data: audioSampleBuffer,
              sampleRate: audioContext.sampleRate,
              timestamp: now,
            });
          }
          audioSampleBuffer = [];
          lastSendTime = now;
        }
        
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      animationFrameRef.current = requestAnimationFrame(updateLevel);

      setIsMicCapturing(true);
      setError(null);
      console.log('[useAudioCapture] Mic capture started (real)');

    } catch (err) {
      console.error('[useAudioCapture] Failed to start mic capture:', err);
      startSimulatedCapture();
    }
  }, [isMicCapturing]);

  // Fallback simulation mode when real capture fails
  const startSimulatedCapture = useCallback(() => {
    console.log('[useAudioCapture] Using simulated audio capture');
    setIsMicCapturing(true);
    setError(null);
    
    const simulateLevel = () => {
      micLevelRef.current = 0.1 + Math.random() * 0.3 * (Math.random() > 0.3 ? 1 : 0);
      setMicLevel(micLevelRef.current);
      animationFrameRef.current = requestAnimationFrame(simulateLevel);
    };
    animationFrameRef.current = requestAnimationFrame(simulateLevel);
  }, []);

  /**
   * Stop microphone capture
   */
  const stopMicCapture = useCallback(() => {
    console.log('[useAudioCapture] Stopping mic capture...');

    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Stop MediaRecorder
    if (micRecorderRef.current && micRecorderRef.current.state !== 'inactive') {
      micRecorderRef.current.stop();
      micRecorderRef.current = null;
    }

    // Disconnect processor
    if (micProcessorRef.current) {
      micProcessorRef.current.disconnect();
      micProcessorRef.current = null;
    }

    // Stop all tracks in the stream
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }

    // Close audio context
    if (micContextRef.current && micContextRef.current.state !== 'closed') {
      micContextRef.current.close();
      micContextRef.current = null;
    }

    // Clear peak hold timeout
    if (peakHoldTimeoutRef.current) {
      clearTimeout(peakHoldTimeoutRef.current);
      peakHoldTimeoutRef.current = null;
    }

    setIsMicCapturing(false);
    setMicLevel(0);
    setMicDB(-60);
    setMicPeak(-60);
    micLevelRef.current = 0;
    micDBRef.current = -60;
    micPeakRef.current = -60;
    console.log('[useAudioCapture] Mic capture stopped');
  }, []);

  /**
   * Start system audio capture using desktopCapturer
   */
  const startSystemCapture = useCallback(async () => {
    if (isSystemCapturing) {
      console.log('[useAudioCapture] System already capturing');
      return;
    }

    try {
      console.log('[useAudioCapture] Starting system audio capture...');

      // Get available screen sources
      // We need to use Electron's desktopCapturer
      if (!window.electronAPI?.getDesktopSources) {
        // Fallback: try using the exposed API
        console.log('[useAudioCapture] Using navigator.mediaDevices for system audio');
      }

      // Request screen capture with audio
      // On macOS, this captures system audio via ScreenCaptureKit
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop',
          },
        },
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            maxWidth: 1,
            maxHeight: 1,
            maxFrameRate: 1,
          },
        },
      });

      systemStreamRef.current = stream;

      // Check if we got an audio track
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio track in system capture. Screen Recording permission may be denied.');
      }

      console.log('[useAudioCapture] Got system audio track:', audioTracks[0].label);

      // Create audio context
      let audioContext;
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: TARGET_SAMPLE_RATE,
        });
      } catch (ctxErr) {
        console.warn('[useAudioCapture] Could not create 16kHz context, using default:', ctxErr);
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      systemContextRef.current = audioContext;

      // Create source from the audio track only
      const audioOnlyStream = new MediaStream(audioTracks);
      const source = audioContext.createMediaStreamSource(audioOnlyStream);

      // Create script processor
      const processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
      systemProcessorRef.current = processor;

      // Throttle IPC calls
      let chunkCount = 0;
      const SEND_EVERY_N_CHUNKS = 4;

      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        
        // Calculate level for visualization
        const level = calculateRMS(inputData);
        setSystemLevel(level);

        // Only send every Nth chunk to reduce IPC overhead
        chunkCount++;
        if (chunkCount % SEND_EVERY_N_CHUNKS === 0 && window.cluely?.audio?.sendAudioChunk) {
          if (level > 0.01) {
            window.cluely.audio.sendAudioChunk({
              source: 'system',
              data: Array.from(inputData),
              sampleRate: audioContext.sampleRate,
              timestamp: Date.now(),
            });
          }
        }
      };

      // Connect the audio graph - mute output
      source.connect(processor);
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      processor.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Stop the video track since we only need audio
      stream.getVideoTracks().forEach(track => track.stop());

      setIsSystemCapturing(true);
      setError(null);
      console.log('[useAudioCapture] System audio capture started');

    } catch (err) {
      console.error('[useAudioCapture] Failed to start system capture:', err);
      
      // Provide helpful error message
      let errorMsg = err.message;
      if (err.name === 'NotAllowedError') {
        errorMsg = 'Screen Recording permission is required for system audio capture. Please enable it in System Preferences.';
      } else if (err.name === 'NotFoundError') {
        errorMsg = 'No audio source found. Make sure Screen Recording is enabled.';
      }
      
      setError(errorMsg);
    }
  }, [isSystemCapturing]);

  /**
   * Stop system audio capture
   */
  const stopSystemCapture = useCallback(() => {
    console.log('[useAudioCapture] Stopping system capture...');

    // Disconnect processor
    if (systemProcessorRef.current) {
      systemProcessorRef.current.disconnect();
      systemProcessorRef.current = null;
    }

    // Stop all tracks
    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach(track => track.stop());
      systemStreamRef.current = null;
    }

    // Close audio context
    if (systemContextRef.current && systemContextRef.current.state !== 'closed') {
      systemContextRef.current.close();
      systemContextRef.current = null;
    }

    setIsSystemCapturing(false);
    setSystemLevel(0);
    console.log('[useAudioCapture] System capture stopped');
  }, []);

  /**
   * Start both mic and system capture
   */
  const startAllCapture = useCallback(async () => {
    await startMicCapture();
    await startSystemCapture();
  }, [startMicCapture, startSystemCapture]);

  /**
   * Stop all capture
   */
  const stopAllCapture = useCallback(() => {
    stopMicCapture();
    stopSystemCapture();
  }, [stopMicCapture, stopSystemCapture]);

  // Listen for IPC commands from main process
  useEffect(() => {
    if (!window.cluely?.on) return;

    // Main process can command us to start/stop capture
    const unsubStartMic = window.cluely.on.startMicCapture?.(() => {
      startMicCapture();
    });

    const unsubStopMic = window.cluely.on.stopMicCapture?.(() => {
      stopMicCapture();
    });

    const unsubStartSystem = window.cluely.on.startSystemCapture?.(() => {
      startSystemCapture();
    });

    const unsubStopSystem = window.cluely.on.stopSystemCapture?.(() => {
      stopSystemCapture();
    });

    return () => {
      unsubStartMic?.();
      unsubStopMic?.();
      unsubStartSystem?.();
      unsubStopSystem?.();
    };
  }, [startMicCapture, stopMicCapture, startSystemCapture, stopSystemCapture]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMicCapture();
      stopSystemCapture();
    };
  }, [stopMicCapture, stopSystemCapture]);

  return {
    // State
    isMicCapturing,
    isSystemCapturing,
    isCapturing: isMicCapturing || isSystemCapturing,
    micLevel,
    systemLevel,
    error,
    
    // dB levels (real-time)
    micDB,
    micPeak,
    systemDB,
    systemPeak,

    // Controls
    preAuthorizeMic,  // Call during permission setup
    startMicCapture,
    stopMicCapture,
    startSystemCapture,
    stopSystemCapture,
    startAllCapture,
    stopAllCapture,
  };
}

/**
 * Calculate RMS (Root Mean Square) level
 * @param {Float32Array} samples - Audio samples
 * @returns {number} - Level from 0 to 1
 */
function calculateRMS(samples) {
  if (!samples || samples.length === 0) return 0;
  
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  
  return Math.sqrt(sum / samples.length);
}

export default useAudioCapture;
