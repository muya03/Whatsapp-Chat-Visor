import { useEffect, useState } from 'react';
import { LIMITS } from '../../services/limits';

const BARS = 40;
const cache = new WeakMap<Blob, number[] | null>();

type AudioCtxCtor = typeof AudioContext;

/**
 * Forma de onda real del audio (picos por tramo), decodificada una vez y en asíncrono.
 * Si el navegador no puede decodificar el formato (p. ej. Opus en algunos Safari) o el archivo
 * es grande, devuelve null y el reproductor usa una barra de progreso simple. Nunca se inventa.
 */
export function useWaveform(blob: Blob | null): number[] | null {
  const [peaks, setPeaks] = useState<number[] | null>(() => (blob ? (cache.get(blob) ?? null) : null));
  useEffect(() => {
    if (!blob) return;
    if (cache.has(blob)) {
      setPeaks(cache.get(blob) ?? null);
      return;
    }
    if (blob.size > LIMITS.maxWaveformBytes) return;
    let cancelled = false;
    const Ctor: AudioCtxCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtxCtor }).webkitAudioContext;
    if (!Ctor) return;
    (async () => {
      let ctx: AudioContext | null = null;
      try {
        const buf = await blob.arrayBuffer();
        ctx = new Ctor();
        const audio = await ctx.decodeAudioData(buf);
        const data = audio.getChannelData(0);
        const step = Math.max(1, Math.floor(data.length / BARS));
        const out: number[] = [];
        let max = 0;
        for (let i = 0; i < BARS; i++) {
          let peak = 0;
          const from = i * step;
          const to = Math.min(data.length, from + step);
          for (let j = from; j < to; j += Math.max(1, Math.floor(step / 64))) peak = Math.max(peak, Math.abs(data[j] ?? 0));
          out.push(peak);
          max = Math.max(max, peak);
        }
        const norm = out.map((p) => (max > 0 ? Math.max(0.12, p / max) : 0.12));
        cache.set(blob, norm);
        if (!cancelled) setPeaks(norm);
      } catch {
        cache.set(blob, null);
      } finally {
        void ctx?.close().catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob]);
  return peaks;
}
