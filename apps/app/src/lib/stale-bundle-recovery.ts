// bb-fork(stale-bundle): reload a tab whose lazily imported route chunk was replaced by a newer build.

const PRELOAD_ERROR_EVENT = "vite:preloadError";
const RELOAD_MARKER_KEY = "bb.stale-bundle-reload-at";
const RELOAD_COOLDOWN_MS = 30_000;

interface ReloadMarkerStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface StaleBundleRecoveryOptions {
  markerStorage?: ReloadMarkerStorage | null;
  now?: () => number;
  reload?: () => void;
}

function sessionReloadMarkerStorage(): ReloadMarkerStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readReloadMarker(storage: ReloadMarkerStorage): number | null {
  try {
    const raw = storage.getItem(RELOAD_MARKER_KEY);
    if (raw === null) return null;
    const at = Number(raw);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

function writeReloadMarker(storage: ReloadMarkerStorage, at: number): void {
  try {
    storage.setItem(RELOAD_MARKER_KEY, String(at));
  } catch {}
}

function describePreloadPayload(event: Event): string {
  const payload = (event as Event & { payload?: unknown }).payload;
  if (payload instanceof Error) return payload.message;
  return typeof payload === "string" ? payload : "";
}

let uninstallRecovery: (() => void) | null = null;

export function installStaleBundleRecovery(
  options: StaleBundleRecoveryOptions = {},
): void {
  if (uninstallRecovery !== null) return;
  const markerStorage =
    options.markerStorage === undefined
      ? sessionReloadMarkerStorage()
      : options.markerStorage;
  const now = options.now ?? (() => Date.now());
  const reload = options.reload ?? (() => window.location.reload());
  let reloadRequested = false;

  const handlePreloadError = (event: Event): void => {
    if (reloadRequested) {
      event.preventDefault();
      return;
    }
    if (markerStorage === null) {
      console.warn(
        "[bb] a route bundle failed to load and this tab cannot record reload attempts, so the error stays visible",
        describePreloadPayload(event),
      );
      return;
    }
    const at = now();
    const previous = readReloadMarker(markerStorage);
    if (previous !== null && at - previous < RELOAD_COOLDOWN_MS) {
      console.warn(
        "[bb] a route bundle failed to load again right after a reload, so the error stays visible",
        describePreloadPayload(event),
      );
      return;
    }
    reloadRequested = true;
    event.preventDefault();
    writeReloadMarker(markerStorage, at);
    console.info(
      "[bb] this tab was loaded from an older build and its route bundle is gone; reloading",
      describePreloadPayload(event),
    );
    reload();
  };

  window.addEventListener(PRELOAD_ERROR_EVENT, handlePreloadError);
  uninstallRecovery = () => {
    window.removeEventListener(PRELOAD_ERROR_EVENT, handlePreloadError);
  };
}

export function uninstallStaleBundleRecoveryForTest(): void {
  uninstallRecovery?.();
  uninstallRecovery = null;
}
