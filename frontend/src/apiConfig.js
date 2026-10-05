const DEFAULT_PROD_BACKEND_URL = 'https://smart-attendance-hs1q.onrender.com';

const rawEnv = (import.meta.env.VITE_API_BASE_URL || '').trim();
export const API_BASE_URL = rawEnv
  ? rawEnv.replace(/\/+$/, '')
  : (import.meta.env.DEV ? '' : DEFAULT_PROD_BACKEND_URL);

/**
 * Returns the full API URL for a given relative endpoint.
 * E.g., getApiUrl('/api/auth/login') -> 'https://smart-attendance-hs1q.onrender.com/api/auth/login'
 */
export const getApiUrl = (endpoint = '') => {
  if (!endpoint || typeof endpoint !== 'string') return endpoint;
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) return endpoint;
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
};

// Global interceptor for window.fetch and EventSource when API_BASE_URL is set
if (typeof window !== 'undefined' && API_BASE_URL) {
  const originalFetch = window.fetch;
  window.fetch = async function (resource, config) {
    let targetUrl = resource;
    if (typeof resource === 'string') {
      if (resource.startsWith('/api')) {
        targetUrl = `${API_BASE_URL}${resource}`;
      } else if (resource.startsWith('api/')) {
        targetUrl = `${API_BASE_URL}/${resource}`;
      }
    } else if (resource && typeof resource === 'object' && typeof resource.url === 'string') {
      if (resource.url.startsWith('/api')) {
        targetUrl = new Request(`${API_BASE_URL}${resource.url}`, resource);
      } else if (resource.url.startsWith('api/')) {
        targetUrl = new Request(`${API_BASE_URL}/${resource.url}`, resource);
      }
    }

    const response = await originalFetch.call(this, targetUrl, config);

    // Safeguard response.json() against HTML error pages (404, 502, Render cold starts)
    const originalJson = response.json.bind(response);
    response.json = async function () {
      try {
        return await originalJson();
      } catch (err) {
        if (!response.ok) {
          console.warn(`[API] Server returned non-JSON response (${response.status}) for ${typeof targetUrl === 'string' ? targetUrl : targetUrl.url}`);
          return { error: `Server error (${response.status}). Please try again.` };
        }
        throw err;
      }
    };

    return response;
  };

  const OriginalEventSource = window.EventSource;
  if (OriginalEventSource) {
    window.EventSource = function (url, config) {
      if (typeof url === 'string') {
        if (url.startsWith('/api')) {
          url = `${API_BASE_URL}${url}`;
        } else if (url.startsWith('api/')) {
          url = `${API_BASE_URL}/${url}`;
        }
      }
      return new OriginalEventSource(url, config);
    };
  }
}
