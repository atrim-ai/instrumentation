/**
 * Effect-based HttpClient service
 *
 * Provides pure Effect wrappers around fetch operations
 */

import { Context, Effect, Layer } from 'effect'
import { HttpError } from '../errors.js'

/**
 * HTTP fetch options
 */
export interface FetchOptions {
  readonly method?: string
  readonly headers?: Record<string, string>
  readonly body?: string
  readonly signal?: AbortSignal
  readonly redirect?: 'follow' | 'manual' | 'error'
}

/**
 * HTTP Response wrapper
 */
export interface HttpResponse {
  readonly ok: boolean
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
  readonly text: () => Promise<string>
  readonly json: <T>() => Promise<T>
}

/**
 * HttpClient service interface
 */
export interface HttpClient {
  /**
   * Fetch a URL with optional configuration
   */
  readonly fetch: (url: string, options?: FetchOptions) => Effect.Effect<HttpResponse, HttpError>
}

/**
 * HttpClient service tag
 */
export const HttpClient = Context.GenericTag<HttpClient>('@atrim/HttpClient')

/**
 * Live implementation of HttpClient service
 */
export const HttpClientLive = Layer.succeed(
  HttpClient,
  HttpClient.of({
    fetch: (url: string, options?: FetchOptions) =>
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(url, options)

          // Wrap the Response object to match our interface
          return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            text: () => response.text(),
            json: <T>() => response.json() as Promise<T>
          } as HttpResponse
        },
        catch: (error) =>
          new HttpError({
            message: `Failed to fetch URL: ${url}`,
            url,
            cause: error
          })
      })
  })
)
