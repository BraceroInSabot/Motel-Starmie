/**
 * Minimal API client (Technical Specs 1.3, 1.8):
 * - same-origin requests with the session cookie;
 * - CSRF token from the `csrftoken` cookie sent as `X-CSRFToken` on unsafe methods;
 * - errors parsed from `application/problem+json` into `ApiProblemError`.
 */

export interface ProblemFieldError {
  field: string;
  code: string;
  message: string;
}

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string | null;
  code: string;
  errors: ProblemFieldError[];
  trace_id: string | null;
}

export class ApiProblemError extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.title);
    this.name = 'ApiProblemError';
    this.problem = problem;
  }
}

export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Network request failed', { cause });
    this.name = 'NetworkError';
  }
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export function readCookie(name: string, cookieString: string = document.cookie): string | null {
  for (const part of cookieString.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

function isProblem(value: unknown): value is Problem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'code' in value &&
    typeof (value as { code: unknown }).code === 'string'
  );
}

function unknownProblem(status: number): Problem {
  return {
    type: 'about:blank',
    title: 'Unexpected response',
    status,
    detail: null,
    code: 'UNKNOWN_ERROR',
    errors: [],
    trace_id: null,
  };
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (UNSAFE_METHODS.has(method)) {
    const csrfToken = readCookie('csrftoken');
    if (csrfToken) {
      headers['X-CSRFToken'] = csrfToken;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    throw new NetworkError(error);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiProblemError(isProblem(payload) ? payload : unknownProblem(response.status));
  }
  return payload as T;
}

/** i18n key for an error (Technical Specs 1.3, 4.2): the UI translates `code`, never `detail`. */
export function errorMessageKey(error: unknown): string {
  if (error instanceof ApiProblemError) {
    return `common:errors.${error.problem.code}`;
  }
  if (error instanceof NetworkError) {
    return 'common:errors.NETWORK_ERROR';
  }
  return 'common:errors.UNKNOWN_ERROR';
}
