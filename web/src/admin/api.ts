// Admin API calls. The session cookie rides along automatically (same origin).

export class Unauthorized extends Error {}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  // Keep the server's text: on the login form a 401 means "Wrong password.", not "logged out".
  if (res.status === 401) throw new Unauthorized(errorText(data) || 'Not logged in');
  if (!res.ok) throw new Error(errorText(data) || `HTTP ${res.status}`);
  return data as T;
}

/** Readable message from a zod `flatten()` error or a plain `{ error }`. */
function errorText(data: { error?: unknown }): string {
  const e = data.error;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const { formErrors = [], fieldErrors = {} } = e as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    return [...formErrors, ...Object.entries(fieldErrors).map(([k, v]) => `${k}: ${v.join(', ')}`)].join('; ');
  }
  return '';
}

/** Upload a file as the raw request body, reporting progress (fetch can't report upload progress). */
export function upload(kind: 'logos', file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/admin/media/${kind}/${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status === 401) return reject(new Unauthorized());
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `HTTP ${xhr.status}`;
      try {
        msg = errorText(JSON.parse(xhr.responseText)) || msg;
      } catch {
        // keep the status
      }
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error('network error'));
    xhr.send(file);
  });
}
