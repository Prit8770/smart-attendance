export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

/**
 * Returns the full API URL for a given relative endpoint.
 * E.g., getApiUrl('/api/auth/login') -> 'https://my-backend.onrender.com/api/auth/login' (if VITE_API_BASE_URL is set)
 */
export const getApiUrl = (endpoint = '') => {
  if (!endpoint || typeof endpoint !== 'string') return endpoint;
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) return endpoint;
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
};

// Global interceptor for window.fetch and EventSource when VITE_API_BASE_URL is set
if (typeof window !== 'undefined' && API_BASE_URL) {
  const originalFetch = window.fetch;
  window.fetch = function (resource, config) {
    if (typeof resource === 'string' && resource.startsWith('/api')) {
      resource = `${API_BASE_URL}${resource}`;
    } else if (resource && typeof resource === 'object' && typeof resource.url === 'string' && resource.url.startsWith('/api')) {
      const url = `${API_BASE_URL}${resource.url}`;
      resource = new Request(url, resource);
    }
    return originalFetch.call(this, resource, config);
  };

  const OriginalEventSource = window.EventSource;
  if (OriginalEventSource) {
    window.EventSource = function (url, config) {
      if (typeof url === 'string' && url.startsWith('/api')) {
        url = `${API_BASE_URL}${url}`;
      }
      return new OriginalEventSource(url, config);
    };
  }
}
