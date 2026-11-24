/**
 * Shared singleton WebAudio engine so repeated notification chimes never leak
 * past Chromium/Electron's 6-AudioContext hardware limit.
 */

export interface ToneStep {
  freq: number;
  durationMs: number;
  delayMs: number;
  type?: OscillatorType;
  gain?: number;
}

let sharedAudioCtx: AudioContext | null = null;
const activeNodes = new Set<{ stop?: () => void; disconnect?: () => void }>();

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (sharedAudioCtx && sharedAudioCtx.state !== 'closed') {
    return sharedAudioCtx;
  }
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    sharedAudioCtx = new Ctor();
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function stopActiveAudioTones(): void {
  for (const node of activeNodes) {
    try {
      node.stop?.();
      node.disconnect?.();
    } catch {
      // Ignore already stopped oscillators
    }
  }
  activeNodes.clear();
}

export async function playSharedToneSequence(steps: ToneStep[]): Promise<boolean> {
  if (typeof window === 'undefined' || !Array.isArray(steps) || steps.length === 0) return false;
  const ctx = getSharedAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }
    if (ctx.state === 'suspended') return false;
    const baseTime = ctx.currentTime;
    for (const step of steps) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startAt = baseTime + Math.max(0, step.delayMs) / 1000;
      const stopAt = startAt + Math.max(40, step.durationMs) / 1000 + 0.02;
      osc.type = step.type || 'sine';
      osc.frequency.setValueAtTime(step.freq, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.01, step.gain ?? 0.06), startAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, stopAt - 0.005);
      osc.connect(gain);
      gain.connect(ctx.destination);
      activeNodes.add(osc);
      osc.onended = () => {
        activeNodes.delete(osc);
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      };
      osc.start(startAt);
      osc.stop(stopAt);
    }
    return true;
  } catch {
    return false;
  }
}

export function triggerMobileVibrate(urgent = true): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  try {
    return navigator.vibrate(urgent ? [280, 90, 280, 90, 420] : [180, 70, 220]);
  } catch {
    return false;
  }
}

export function getMobileNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestMobileNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported';
  try {
    if (Notification.permission === 'granted') return 'granted';
    return await Notification.requestPermission();
  } catch {
    return Notification.permission || 'denied';
  }
}

export async function dispatchMobileSystemNotification({
  title,
  body,
  tag = 'companygen-alert',
  urgent = true,
}: {
  title: string;
  body: string;
  tag?: string;
  urgent?: boolean;
}): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'granted') return false;

  const options = {
    body: String(body || '').slice(0, 220),
    icon: '/brand/app-icon-512.png',
    badge: '/brand/favicon-32.png',
    tag,
    renotify: true,
    requireInteraction: true,
    vibrate: urgent ? [280, 90, 280, 90, 420] : [180, 70, 220],
    data: { url: '/?theme=light' },
  } as NotificationOptions & { renotify?: boolean; vibrate?: number[] };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1200)),
      ]);
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, options);
        return true;
      }
    }
  } catch {
    // Fallback to classic Notification constructor on desktop browsers
  }

  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      try {
        window.focus();
      } catch {}
    };
    return true;
  } catch {
    return false;
  }
}

export function playSharedOrderChime(): void {
  void playSharedToneSequence([
    { freq: 587.33, durationMs: 140, delayMs: 0, type: 'triangle', gain: 0.05 },
    { freq: 880, durationMs: 220, delayMs: 110, type: 'triangle', gain: 0.05 },
  ]);
}

export function playSharedHumanEscalationAlert(): void {
  void playSharedToneSequence([
    { freq: 740, durationMs: 120, delayMs: 0, type: 'sine', gain: 0.07 },
    { freq: 554.37, durationMs: 140, delayMs: 140, type: 'sine', gain: 0.07 },
    { freq: 740, durationMs: 160, delayMs: 300, type: 'sine', gain: 0.07 },
  ]);
}
