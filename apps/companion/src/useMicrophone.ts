import { useCallback, useEffect, useRef, useState } from 'react';

export type MicState =
  | { status: 'off' }
  | { status: 'starting' }
  | { status: 'on'; context: AudioContext; analyser: AnalyserNode }
  | { status: 'error'; message: string };

/**
 * The microphone for a voice on a table: echo cancellation and noise suppression on (the TV is
 * playing the room's reactions a few metres away), auto-gain off (levels must mean something:
 * emphasis at the end of a line is measured from them).
 * Must be started from a tap, and the page must be HTTPS, or mobile browsers refuse.
 */
export function useMicrophone(fftSize = 2048) {
  const [state, setState] = useState<MicState>({ status: 'off' });
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void contextRef.current?.close();
    streamRef.current = null;
    contextRef.current = null;
    setState({ status: 'off' });
  }, []);

  const start = useCallback(async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setState({ status: 'error', message: 'This page needs HTTPS to use the microphone.' });
      return;
    }
    setState({ status: 'starting' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      });
      const context = new AudioContext({ latencyHint: 'interactive' });
      await context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = 0;
      context.createMediaStreamSource(stream).connect(analyser);
      streamRef.current = stream;
      contextRef.current = context;
      for (const track of stream.getAudioTracks()) {
        track.onended = () => setState({ status: 'error', message: 'The microphone stopped. Tap to start it again.' });
      }
      setState({ status: 'on', context, analyser });
    } catch (err) {
      const denied = err instanceof DOMException && err.name === 'NotAllowedError';
      setState({
        status: 'error',
        message: denied ? 'Microphone permission was denied.' : 'Could not start the microphone.',
      });
    }
  }, [fftSize]);

  useEffect(() => stop, [stop]);

  return { state, start, stop };
}
