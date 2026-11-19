/**
 * v2.8.68.1 — the ONE upload engine every browser file-ride shares.
 *
 * Plain `fetch` cannot report upload progress, so every surface that moves
 * real bytes (classroom attachments, chat files, profile photos, signature
 * stamps, admin media, register sheets) sends through this XHR wrapper and
 * gets the owner's three asks in one place:
 *
 *   1. UPLOAD PROGRESS  — onProgress fires with { loaded, total, pct, … }
 *   2. NETWORK SPEED    — an exponential moving average of the live byte
 *                         rate (≥200 ms samples, so jittery events smooth
 *                         into a readable "1.2 MB/s"), plus an ETA
 *   3. CANCEL           — the returned handle's abort() kills the request;
 *                         the promise rejects with UploadCancelledError so
 *                         callers can tell "the user stopped it" apart from
 *                         a real failure and stay quiet instead of flashing
 *                         a red error.
 *
 * Parity with fetch is deliberate: HTTP error statuses RESOLVE (the caller
 * reads the response's error JSON exactly like before); only network
 * failures and cancels REJECT.
 */

export type UploadProgressInfo = {
  loaded: number;
  total: number;
  /** 0–100, rounded. */
  pct: number;
  bytesPerSecond: number | null;
  etaSeconds: number | null;
};

export type UploadHttpResponse = {
  status: number;
  ok: boolean;
  /** Parsed response JSON, or null when the body is not JSON. */
  json: unknown;
};

/** Thrown only when abort() was called — never for network/HTTP failures. */
export class UploadCancelledError extends Error {
  readonly cancelled = true;
  constructor() {
    super("Upload cancelled.");
    this.name = "UploadCancelledError";
  }
}

/** True when a thrown cause means "the user cancelled this upload". */
export function isUploadCancelled(cause: unknown): boolean {
  if (cause instanceof UploadCancelledError) return true;
  if (cause instanceof Error) {
    if ((cause as { cancelled?: boolean }).cancelled === true) return true;
    if (cause.name === "AbortError") return true;
  }
  return false;
}

/**
 * Rolling byte-rate meter shared by every uploader (xhrUpload uses it
 * internally; surfaces that already own an XHR — the admin media pair —
 * can drive the same math by calling sample() from their own handler).
 */
export class UploadSpeedMeter {
  private last: { t: number; loaded: number } | null = null;
  private speed: number | null = null;

  sample(loaded: number, total: number): UploadProgressInfo {
    const now = performance.now();
    if (this.last) {
      const dt = now - this.last.t;
      if (dt >= 200 && loaded >= this.last.loaded) {
        const inst = ((loaded - this.last.loaded) / dt) * 1000;
        this.speed = this.speed == null ? inst : this.speed * 0.6 + inst * 0.4;
        this.last = { t: now, loaded };
      }
    } else {
      this.last = { t: now, loaded };
    }
    const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
    const speed = this.speed != null && Number.isFinite(this.speed) && this.speed > 0 ? this.speed : null;
    return {
      loaded,
      total,
      pct,
      bytesPerSecond: speed,
      etaSeconds: speed != null && total > loaded ? (total - loaded) / speed : null,
    };
  }
}

/** The Content-Type header is browser-managed for FormData bodies — never
 *  set it by hand there (it would strip the multipart boundary). */
function setHeaders(xhr: XMLHttpRequest, headers: Record<string, string>) {
  for (const [key, value] of Object.entries(headers)) {
    try {
      xhr.setRequestHeader(key, value);
    } catch {
      /* forbidden header — the browser ignores it anyway */
    }
  }
}

/**
 * v2.8.68.4 — the SHARED portal storage probe (used by the pick-time
 * pre-check AND by the failure re-probe). Answers how many bytes the
 * signed-in person still has left, or null when the answer is unknown
 * (unlimited teacher / read failure) so callers can skip gracefully.
 */
export async function portalRemainingBytes(): Promise<number | null> {
  try {
    const res = await fetch("/api/portal/my-files/usage");
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; remaining?: number | null }
      | null;
    if (json?.ok && typeof json.remaining === "number" && json.remaining >= 0) {
      return json.remaining;
    }
  } catch {
    /* the probe is best-effort by design */
  }
  return null;
}

export function xhrUpload(opts: {
  url: string;
  method?: "POST" | "PUT" | "PATCH";
  headers?: Record<string, string>;
  body: FormData | Blob | File | string;
  onProgress?: (info: UploadProgressInfo) => void;
}): { promise: Promise<UploadHttpResponse>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const meter = new UploadSpeedMeter();
  const method = opts.method ?? "POST";

  const promise = new Promise<UploadHttpResponse>((resolve, reject) => {
    xhr.open(method, opts.url, true);
    setHeaders(xhr, opts.headers ?? {});
    try {
      xhr.responseType = "text";
    } catch {
      /* older engines ignore it */
    }

    xhr.upload.onprogress = (event) => {
      if (!opts.onProgress || !event.lengthComputable) return;
      opts.onProgress(meter.sample(event.loaded, event.total));
    };
    xhr.onload = () => {
      let json: unknown = null;
      try {
        json = JSON.parse(xhr.responseText) as unknown;
      } catch {
        json = null;
      }
      resolve({
        status: xhr.status,
        ok: xhr.status >= 200 && xhr.status < 300,
        json,
      });
    };
    xhr.onerror = () =>
      reject(new Error("Network error while uploading — check the connection and try again."));
    xhr.onabort = () => reject(new UploadCancelledError());
    xhr.ontimeout = () => reject(new Error("The upload timed out — try again."));

    /* The actual send — nothing moves without it. */
    xhr.send(opts.body);
  });

  return {
    promise,
    abort: () => {
      try {
        xhr.abort();
      } catch {
        /* already finished */
      }
    },
  };
}
