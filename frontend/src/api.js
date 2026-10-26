export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }
  return data;
}

export const post = (path, body = {}) =>
  api(path, { method: "POST", body: JSON.stringify(body) });

export const patch = (path, body = {}) =>
  api(path, { method: "PATCH", body: JSON.stringify(body) });

export const put = (path, body = {}) =>
  api(path, { method: "PUT", body: JSON.stringify(body) });

export function formatDate(value, options = {}) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(undefined, options);
}

export function number(value, digits = 1) {
  return value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toFixed(digits);
}
