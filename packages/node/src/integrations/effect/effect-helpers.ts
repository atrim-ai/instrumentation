/**
 * Effect-specific span annotation helpers
 */

export function annotateUser(_userId: string, _email?: string): any {
  // TODO: Implement
}

export function annotateDataSize(_bytes: number, _count: number): any {
  // TODO: Implement
}

export function annotateBatch(_size: number, _batchSize: number): any {
  // TODO: Implement
}

export function annotateLLM(_model: string, _operation: string, _inputTokens: number, _outputTokens: number): any {
  // TODO: Implement
}

export function annotateQuery(_query: string, _database: string): any {
  // TODO: Implement
}

export function annotateHttpRequest(_method: string, _url: string, _statusCode: number): any {
  // TODO: Implement
}

export function annotateError(_error: Error, _context?: Record<string, string | number | boolean>): any {
  // TODO: Implement
}

export function annotatePriority(_priority: string): any {
  // TODO: Implement
}

export function annotateCache(_operation: string, _hit: boolean): any {
  // TODO: Implement
}
