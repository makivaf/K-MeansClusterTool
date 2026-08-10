export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export const isLocalApiBaseUrl = (apiBaseUrl = API_BASE_URL) => {
  const url = new URL(apiBaseUrl, window.location.origin);
  return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
};
