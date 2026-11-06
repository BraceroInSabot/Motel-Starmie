import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ApiProblemError, NetworkError, apiRequest, errorMessageKey, readCookie } from './client';

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});
afterAll(() => {
  server.close();
});

describe('apiRequest', () => {
  it('returns the JSON body on success', async () => {
    server.use(http.get('*/api/v1/things', () => HttpResponse.json({ count: 1 })));
    await expect(apiRequest<{ count: number }>('/things')).resolves.toEqual({ count: 1 });
  });

  it('sends the CSRF token on unsafe methods only', async () => {
    document.cookie = 'csrftoken=abc123';
    const seen: Record<string, string | null> = {};
    server.use(
      http.get('*/api/v1/things', ({ request }) => {
        seen.get = request.headers.get('X-CSRFToken');
        return HttpResponse.json({});
      }),
      http.post('*/api/v1/things', ({ request }) => {
        seen.post = request.headers.get('X-CSRFToken');
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    await apiRequest('/things');
    await apiRequest('/things', { method: 'POST', body: { a: 1 } });
    expect(seen).toEqual({ get: null, post: 'abc123' });
  });

  it('returns undefined for 204 No Content', async () => {
    server.use(http.post('*/api/v1/logout', () => new HttpResponse(null, { status: 204 })));
    await expect(apiRequest('/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('throws ApiProblemError with the problem details', async () => {
    server.use(
      http.post('*/api/v1/things', () =>
        HttpResponse.json(
          {
            type: 'https://starmie.local/problems/validation-error',
            title: 'Validation failed',
            status: 422,
            detail: 'One or more fields are invalid.',
            code: 'VALIDATION_ERROR',
            errors: [{ field: 'email', code: 'REQUIRED', message: 'This field is required.' }],
            trace_id: 'abc',
          },
          { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );
    const error = await apiRequest('/things', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiProblemError);
    expect((error as ApiProblemError).problem.code).toBe('VALIDATION_ERROR');
    expect(errorMessageKey(error)).toBe('common:errors.VALIDATION_ERROR');
  });

  it('maps a non-problem error body to UNKNOWN_ERROR', async () => {
    server.use(http.get('*/api/v1/things', () => new HttpResponse('oops', { status: 500 })));
    const error = await apiRequest('/things').catch((e: unknown) => e);
    expect((error as ApiProblemError).problem).toMatchObject({
      status: 500,
      code: 'UNKNOWN_ERROR',
    });
  });

  it('throws NetworkError when the server cannot be reached', async () => {
    server.use(http.get('*/api/v1/things', () => HttpResponse.error()));
    const error = await apiRequest('/things').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect(errorMessageKey(error)).toBe('common:errors.NETWORK_ERROR');
  });
});

describe('helpers', () => {
  it('reads a cookie by exact name', () => {
    expect(readCookie('csrftoken', 'a=1; csrftoken=x%3Dy; csrftokenx=z')).toBe('x=y');
    expect(readCookie('missing', 'a=1')).toBeNull();
  });

  it('maps unknown errors to UNKNOWN_ERROR', () => {
    expect(errorMessageKey(new Error('boom'))).toBe('common:errors.UNKNOWN_ERROR');
  });
});
