import { useState, useEffect, useRef, useCallback } from 'react';

const TARGET_SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;

export function useAudioCapture() {
  const [isMicCapturing, setIsMicCapturing] = useState(false);
  const [isSystemCapturing, setIsSystemCapturing] = useState(false);
  const [isMeterOnly, setIsMeterOnly] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [systemLevel, setSystemLevel] = useState(0);
  const [error, setError] = useState(null);
  const [micDB, setMicDB] = useState(-60);
  const [micPeak, setMicPeak] = useState(-60);
  const [systemDB, setSystemDB] = useState(-60);
  const [systemPeak, setSystemPeak] = useState(-60);

  const micContextRef = useRef(null);
  const micStreamRef = useRef(null);
  const micProcessorRef = useRef(null);
  const micRecorderRef = useRef(null);
  const meterOnlyRef = useRef(false);
  const systemContextRef = useRef(null);
  const systemStreamRef = useRef(null);
  const systemProcessorRef = useRef(null);
  const micLevelRef = useRef(0);
  const systemLevelRef = useRef(0);
  const micDBRef = useRef(-60);
  const micPeakRef = useRef(-60);
  const animationFrameRef = useRef(null);
  const peakHoldTimeoutRef = useRef(null);

  const preAuthorizeMic = useCallback(async () => {
    if (micStreamRef.current) return true;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      return true;
    } catch (err) {
      console.error('[useAudioCapture] Failed to pre-authorize mic:', err);
      return false;
    }
  }, []);

  const startMicCapture = useCallback(async () => {
    if (isMicCapturing) return;

    try {
      let stream = micStreamRef.current;
      
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStreamRef.current = stream;
        } catch (mediaErr) {
          console.warn('[useAudioCapture] getUserMedia failed:', mediaErr);
          return startSimulatedCapture();
        }
      }

      let audioContext;
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
        if (audioContext.state === 'suspended') await audioContext.resume();
      } catch (ctxErr) {
        console.warn('[useAudioCapture] AudioContext failed:', ctxErr);
        return startSimulatedCapture();
      }
      
      micContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      micProcessorRef.current = analyser;
      
      const rmsToDb = (rms) => {
        if (rms <= 0) return -60;
        const db = 20 * Math.log10(rms);
        return Math.max(-60, Math.min(0, db));
      };
      
      const timeData = new Float32Array(analyser.fftSize);
      
      const updateLevel = () => {
        if (!micProcessorRef.current) return;
        
        analyser.getFloatTimeDomainData(timeData);
        
        let sumSquares = 0;
        let peak = 0;
        for (let i = 0; i < timeData.length; i++) {
          const sample = timeData[i];
          sumSquares += sample * sample;
          const abs = Math.abs(sample);
          if (abs > peak) peak = abs;
        }
        const rms = Math.sqrt(sumSquares / timeData.length);
        const db = rmsToDb(rms);
        const peakDb = rmsToDb(peak);
        
        micLevelRef.current = rms;
        micDBRef.current = db;
        setMicLevel(rms);
        setMicDB(db);
        
        if (peakDb > micPeakRef.current) {
          micPeakRef.current = peakDb;
          setMicPeak(peakDb);
          if (peakHoldTimeoutRef.current) clearTimeout(peakHoldTimeoutRef.current);
          peakHoldTimeoutRef.current = setTimeout(() => {
            micPeakRef.current = -60;
            setMicPeak(-60);
          }, 500);
        }
        
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      animationFrameRef.current = requestAnimationFrame(updateLevel);
      
      try {
        const mimeType = 'audio/webm;codecs=opus';
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'audio/webm',
        });
        micRecorderRef.current = mediaRecorder;
        
        mediaRecorder.ondataavailable = async (event) => {
          if (event.data.size > 0 && window.cluely?.audio?.sendRawBlob) {
            const buffer = await event.data.arrayBuffer();
            const uint8Array = new Uint8Array(buffer);
            window.cluely.audio.sendRawBlob(Array.from(uint8Array));
          }
        };
        
        mediaRecorder.onerror = (err) => console.error('[useAudioCapture] MediaRecorder error:', err);
        mediaRecorder.start(250);
      } catch (recorderErr) {
        console.error('[useAudioCapture] MediaRecorder failed:', recorderErr);
      }

      setIsMicCapturing(true);
      setError(null);

    } catch (err) {
      console.error('[useAudioCapture] Failed to start mic capture:', err);
      startSimulatedCapture();
    }
  }, [isMicCapturing]);

  const startSimulatedCapture = useCallback(() => {
    setIsMicCapturing(true);
    setError(null);
    
    const simulateLevel = () => {
      micLevelRef.current = 0.1 + Math.random() * 0.3 * (Math.random() > 0.3 ? 1 : 0);
      setMicLevel(micLevelRef.current);
      animationFrameRef.current = requestAnimationFrame(simulateLevel);
    };
    animationFrameRef.current = requestAnimationFrame(simulateLevel);
  }, []);

  const stopMicCapture = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (micRecorderRef.current) {
      if (typeof micRecorderRef.current.disconnect === 'function') {
        micRecorderRef.current.disconnect();
      } else if (micRecorderRef.current.state !== 'inactive') {
        micRecorderRef.current.stop();
      }
      micRecorderRef.current = null;
    }

    if (micProcessorRef.current) {
      micProcessorRef.current.disconnect();
      micProcessorRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }

    if (micContextRef.current && micContextRef.current.state !== 'closed') {
      micContextRef.current.close();
      micContextRef.current = null;
    }

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
  }, []);

  const startMeterOnly = useCallback(async () => {
    if (isMicCapturing || isMeterOnly) return;

    try {
      let stream = micStreamRef.current;
      
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStreamRef.current = stream;
        } catch (mediaErr) {
          console.warn('[useAudioCapture] Meter-only getUserMedia failed:', mediaErr);
          return;
        }
      }

      let audioContext;
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
        if (audioContext.state === 'suspended') await audioContext.resume();
      } catch (ctxErr) {
        console.warn('[useAudioCapture] Meter-only AudioContext failed:', ctxErr);
        return;
      }
      
      micContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      micProcessorRef.current = analyser;
      
      const rmsToDb = (rms) => {
        if (rms <= 0) return -60;
        const db = 20 * Math.log10(rms);
        return Math.max(-60, Math.min(0, db));
      };
      
      const timeData = new Float32Array(analyser.fftSize);
      
      const updateLevel = () => {
        if (!micProcessorRef.current) return;
        
        analyser.getFloatTimeDomainData(timeData);
        
        let sumSquares = 0;
        let peak = 0;
        for (let i = 0; i < timeData.length; i++) {
          const sample = timeData[i];
          sumSquares += sample * sample;
          const abs = Math.abs(sample);
          if (abs > peak) peak = abs;
        }
        const rms = Math.sqrt(sumSquares / timeData.length);
        const db = rmsToDb(rms);
        const peakDb = rmsToDb(peak);
        
        micLevelRef.current = rms;
        micDBRef.current = db;
        setMicLevel(rms);
        setMicDB(db);
        
        if (peakDb > micPeakRef.current) {
          micPeakRef.current = peakDb;
          setMicPeak(peakDb);
          if (peakHoldTimeoutRef.current) clearTimeout(peakHoldTimeoutRef.current);
          peakHoldTimeoutRef.current = setTimeout(() => {
            micPeakRef.current = -60;
            setMicPeak(-60);
          }, 500);
        }
        
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      animationFrameRef.current = requestAnimationFrame(updateLevel);

      meterOnlyRef.current = true;
      setIsMeterOnly(true);
      setError(null);

    } catch (err) {
      console.error('[useAudioCapture] Failed to start meter-only:', err);
    }
  }, [isMicCapturing, isMeterOnly]);

  const stopMeterOnly = useCallback(() => {
    if (!meterOnlyRef.current) return;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (micProcessorRef.current) {
      micProcessorRef.current.disconnect();
      micProcessorRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }

    if (micContextRef.current && micContextRef.current.state !== 'closed') {
      micContextRef.current.close();
      micContextRef.current = null;
    }

    if (peakHoldTimeoutRef.current) {
      clearTimeout(peakHoldTimeoutRef.current);
      peakHoldTimeoutRef.current = null;
    }

    meterOnlyRef.current = false;
    setIsMeterOnly(false);
    setMicLevel(0);
    setMicDB(-60);
    setMicPeak(-60);
    micLevelRef.current = 0;
    micDBRef.current = -60;
    micPeakRef.current = -60;
  }, []);

  const startSystemCapture = useCallback(async () => {
    if (isSystemCapturing) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: 'desktop' } },
        video: { mandatory: { chromeMediaSource: 'desktop', maxWidth: 1, maxHeight: 1, maxFrameRate: 1 } },
      });

      systemStreamRef.current = stream;
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) throw new Error('No audio track in system capture');

      let audioContext;
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: TARGET_SAMPLE_RATE });
      } catch (ctxErr) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      if (audioContext.state === 'suspended') await audioContext.resume();
      systemContextRef.current = audioContext;

      const audioOnlyStream = new MediaStream(audioTracks);
      const source = audioContext.createMediaStreamSource(audioOnlyStream);
      const processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
      systemProcessorRef.current = processor;

      let chunkCount = 0;
      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        const level = calculateRMS(inputData);
        setSystemLevel(level);

        chunkCount++;
        if (chunkCount % 4 === 0 && window.cluely?.audio?.sendAudioChunk && level > 0.01) {
          window.cluely.audio.sendAudioChunk({
            source: 'system',
            data: Array.from(inputData),
            sampleRate: audioContext.sampleRate,
            timestamp: Date.now(),
          });
        }
      };

      source.connect(processor);
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      processor.connect(gainNode);
      gainNode.connect(audioContext.destination);
      stream.getVideoTracks().forEach(track => track.stop());

      setIsSystemCapturing(true);
      setError(null);

    } catch (err) {
      console.error('[useAudioCapture] Failed to start system capture:', err);
      let errorMsg = err.message;
      if (err.name === 'NotAllowedError') errorMsg = 'Screen Recording permission required';
      else if (err.name === 'NotFoundError') errorMsg = 'No audio source found';
      setError(errorMsg);
    }
  }, [isSystemCapturing]);

  const stopSystemCapture = useCallback(() => {
    if (systemProcessorRef.current) {
      systemProcessorRef.current.disconnect();
      systemProcessorRef.current = null;
    }

    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach(track => track.stop());
      systemStreamRef.current = null;
    }

    if (systemContextRef.current && systemContextRef.current.state !== 'closed') {
      systemContextRef.current.close();
      systemContextRef.current = null;
    }

    setIsSystemCapturing(false);
    setSystemLevel(0);
  }, []);

  const startAllCapture = useCallback(async () => {
    await startMicCapture();
    await startSystemCapture();
  }, [startMicCapture, startSystemCapture]);

  const stopAllCapture = useCallback(() => {
    stopMicCapture();
    stopSystemCapture();
  }, [stopMicCapture, stopSystemCapture]);

  useEffect(() => {
    if (!window.cluely?.on) return;

    const unsubStartMic = window.cluely.on.startMicCapture?.(() => startMicCapture());
    const unsubStopMic = window.cluely.on.stopMicCapture?.(() => stopMicCapture());
    const unsubStartSystem = window.cluely.on.startSystemCapture?.(() => startSystemCapture());
    const unsubStopSystem = window.cluely.on.stopSystemCapture?.(() => stopSystemCapture());

    return () => {
      unsubStartMic?.();
      unsubStopMic?.();
      unsubStartSystem?.();
      unsubStopSystem?.();
    };
  }, [startMicCapture, stopMicCapture, startSystemCapture, stopSystemCapture]);

  useEffect(() => {
    return () => {
      stopMicCapture();
      stopSystemCapture();
    };
  }, [stopMicCapture, stopSystemCapture]);

  return {
    isMicCapturing,
    isSystemCapturing,
    isCapturing: isMicCapturing || isSystemCapturing,
    isMeterOnly,
    isMeterActive: isMicCapturing || isMeterOnly,
    micLevel,
    systemLevel,
    error,
    micDB,
    micPeak,
    systemDB,
    systemPeak,
    preAuthorizeMic,
    startMicCapture,
    stopMicCapture,
    startMeterOnly,
    stopMeterOnly,
    startSystemCapture,
    stopSystemCapture,
    startAllCapture,
    stopAllCapture,
  };
}

function calculateRMS(samples) {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

export default useAudioCapture;
