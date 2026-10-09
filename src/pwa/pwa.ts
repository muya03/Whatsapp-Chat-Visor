import { useCallback, useEffect, useState } from 'react';

/** Evento no estándar de Chromium para instalar la PWA desde la propia página. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let waitingWorker: ServiceWorker | null = null;
/** Solo se recarga tras un cambio de controlador si el usuario ha pedido actualizar (nunca en la primera instalación). */
let reloadOnControllerChange = false;
const updateListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // no se muestra el mini-aviso del navegador: la instalación es una acción discreta y opcional
    deferredPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((l) => l());
  });
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export interface InstallInfo {
  standalone: boolean;
  /** El navegador permite instalar con un clic (Chromium). */
  canPrompt: boolean;
  /** Safari en iPhone/iPad: solo se instala a mano desde «Compartir». */
  manualIOS: boolean;
  prompt(): Promise<void>;
}

export function useInstall(): InstallInfo {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  const prompt = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    listeners.forEach((l) => l());
  }, []);
  const standalone = isStandalone();
  return { standalone, canPrompt: !standalone && deferredPrompt !== null, manualIOS: !standalone && isIOS(), prompt };
}

/** Registra el Service Worker (solo en producción) y avisa cuando hay una versión nueva esperando. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        const notify = (w: ServiceWorker | null) => {
          if (w && navigator.serviceWorker.controller) {
            waitingWorker = w;
            updateListeners.forEach((l) => l());
          }
        };
        if (reg.waiting) notify(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed') notify(w);
          });
        });
        // Comprueba si hay versión nueva al volver a la app (sin enviar nada del usuario).
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
        });
      })
      .catch(() => undefined);
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloadOnControllerChange || reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}

export function useUpdateAvailable(): { available: boolean; apply(): void } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    updateListeners.add(l);
    return () => void updateListeners.delete(l);
  }, []);
  return {
    available: waitingWorker !== null,
    apply: () => {
      reloadOnControllerChange = true;
      waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
    },
  };
}
