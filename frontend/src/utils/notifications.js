/**
 * AI Board • PWA & Mobile Web Notifications Utility
 */

let serviceWorkerRegistration = null;
let deferredInstallPrompt = null;
const installPromptListeners = new Set();

/**
 * Play a discreet, elegant chime using the Web Audio API without requiring any external mp3 files.
 */
export function playNotificationChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880, now + 0.08);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.28); // D6

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.08);
    osc1.stop(now + 0.45);
    osc2.stop(now + 0.45);
  } catch (err) {
    // Audio may be blocked by autoplay policies
  }
}

/**
 * Register Service Worker for PWA and Mobile Notifications
 */
export async function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    serviceWorkerRegistration = registration;

    // Listen for messages from SW (such as when user taps on a notification)
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'AI_BOARD_NOTIFICATION_CLICK') {
        const { sessionId } = event.data;
        if (sessionId) {
          window.dispatchEvent(
            new CustomEvent('aiboard:open-session', { detail: { sessionId } })
          );
        }
      }
    });

    return registration;
  } catch (err) {
    console.warn('[PWA] Service Worker registration failed:', err);
    return null;
  }
}

/**
 * Get current notification permission state
 */
export function getNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Request notification permissions from user
 */
export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      playNotificationChime();
    }
    return permission;
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return 'denied';
  }
}

/**
 * Trigger notification on mobile/desktop when an agent finishes responding
 */
export async function notifyAgentResponse({ title, body, sessionId, taskId }) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  // Provide tactile feedback on mobile
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate([150, 75, 150]);
    } catch {}
  }

  // Play audio chime
  playNotificationChime();

  const cleanBody = (body || '').replace(/<[^>]*>?/gm, '').trim();
  const truncatedBody = cleanBody.length > 180 ? cleanBody.slice(0, 180) + '...' : cleanBody;

  const notificationTitle = title || 'AI Board • Resposta do Agente';
  const notificationOptions = {
    body: truncatedBody || 'O agente concluiu sua solicitação no chat.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `aiboard-task-${taskId || sessionId || Date.now()}`,
    renotify: true,
    data: {
      url: `/?sessionId=${encodeURIComponent(sessionId || '')}`,
      sessionId,
      taskId
    }
  };

  try {
    // 1. Preferred method: Service Worker showNotification (works on Android & iOS PWA background)
    if ('serviceWorker' in navigator) {
      const reg = serviceWorkerRegistration || (await navigator.serviceWorker.ready);
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(notificationTitle, notificationOptions);
        return;
      }
    }

    // 2. Fallback: Standard browser Notification instance
    new Notification(notificationTitle, notificationOptions);
  } catch (err) {
    console.warn('[PWA] Notification display error:', err);
  }
}

/**
 * Capture PWA beforeinstallprompt event
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent mini-infobar from appearing on mobile
    e.preventDefault();
    deferredInstallPrompt = e;
    installPromptListeners.forEach((listener) => listener(true));
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installPromptListeners.forEach((listener) => listener(false));
  });
}

export function subscribeInstallPrompt(callback) {
  installPromptListeners.add(callback);
  callback(Boolean(deferredInstallPrompt));
  return () => installPromptListeners.delete(callback);
}

export async function promptInstallApp() {
  if (!deferredInstallPrompt) return false;
  try {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installPromptListeners.forEach((listener) => listener(false));
    return outcome === 'accepted';
  } catch (err) {
    console.error('Install prompt error:', err);
    return false;
  }
}

export function isStandaloneApp() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  );
}

export function isIOSDevice() {
  if (typeof window === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isMobileDevice() {
  if (typeof window === 'undefined') return false;
  if (isIOSDevice()) return true;
  if (/Android|webOS|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent)) {
    return true;
  }
  return navigator.maxTouchPoints > 1 && window.innerWidth <= 900;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Subscribe current browser/PWA Service Worker to server-sent Web Push (VAPID)
 */
export async function subscribeWebPush(userEmail, vapidPublicKey) {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !vapidPublicKey
  ) {
    return false;
  }
  try {
    const reg = serviceWorkerRegistration || (await navigator.serviceWorker.ready);
    if (!reg || !reg.pushManager) return false;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });
    }
    if (!sub) return false;

    const res = await fetch('/api/notifications/push-subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': userEmail || ''
      },
      body: JSON.stringify({
        user_email: userEmail || '',
        subscription: sub.toJSON(),
        device_type: isMobileDevice() ? 'mobile' : 'desktop',
        user_agent: navigator.userAgent || ''
      })
    });
    return res.ok;
  } catch (err) {
    console.warn('[PWA] Web Push subscription skipped:', err);
    return false;
  }
}

export async function fetchMobileNotificationStatus(userEmail) {
  try {
    const q = userEmail ? `?user_email=${encodeURIComponent(userEmail)}` : '';
    const res = await fetch(`/api/notifications/mobile-status${q}`, {
      cache: 'no-store',
      headers: { 'X-User-Email': userEmail || '' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function toggleMobileNotifications(userEmail, enabled, sendConfirmation = true) {
  try {
    const res = await fetch('/api/notifications/mobile-toggle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': userEmail || ''
      },
      body: JSON.stringify({
        user_email: userEmail || '',
        enabled: Boolean(enabled),
        send_confirmation: Boolean(sendConfirmation)
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (enabled) {
      playNotificationChime();
    }
    return data;
  } catch {
    return null;
  }
}
