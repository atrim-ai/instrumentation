/**
 * Effect-specific span annotation helpers
 */

export function annotateUser(_userId: string, _email?: string): void {
  // TODO: Implement
}

export function annotateDataSize(_bytes: number, _count: number): void {
  // TODO: Implement
}

export function annotateBatch(_size: number, _batchSize: number): void {
  // TODO: Implement
}

export function annotateLLM(
  _model: string,
  _operation: string,
  _inputTokens: number,
  _outputTokens: number
): void {
  // TODO: Implement
}

export function annotateQuery(_query: string, _database: string): void {
  // TODO: Implement
}

export function annotateHttpRequest(_method: string, _url: string, _statusCode: number): void {
  // TODO: Implement
}

export function annotateError(
  _error: Error,
  _context?: Record<string, string | number | boolean>
): void {
  // TODO: Implement
}

export function annotatePriority(_priority: string): void {
  // TODO: Implement
}

export function annotateCache(_operation: string, _hit: boolean): void {
  // TODO: Implement
}
