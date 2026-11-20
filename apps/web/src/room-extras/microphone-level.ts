export const microphoneAvailable = () => typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof AudioContext === 'function';

/** Sample input locally. The analyzer has no output connection and audio is never recorded. */
export async function listenToMicrophone(signal: AbortSignal, onLevel: (level: number) => void) {
  const context = new AudioContext();
  let stream: MediaStream | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  const release = () => {
    clearInterval(timer);
    stream?.getTracks().forEach(track => track.stop());
    if (context.state !== 'closed') void context.close().catch(() => undefined);
  };
  signal.addEventListener('abort', release, { once: true });
  try {
    const ready = context.resume();
    void ready.catch(() => undefined);
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (signal.aborted) { release(); return; }
    await ready;
    if (signal.aborted) return;
    const analyser = context.createAnalyser();
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
      onLevel(rms);
    }, 25);
  } catch (error) {
    release();
    if (!signal.aborted) throw error;
  }
}
