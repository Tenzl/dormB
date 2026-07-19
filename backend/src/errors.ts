import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(public statusCode: number, public code: string, message: string, public details?: unknown) { super(message); }
}

export function errorHandler(error: unknown, _request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ApiError) {
    return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } });
  }
  if (error instanceof ZodError) {
    return reply.code(422).send({ error: { code: 'validation_error', message: 'Request validation failed', details: error.issues.map(i => ({ field: i.path.join('.'), message: i.message, code: i.code })) } });
  }
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const statusCode = Number((error as { statusCode?: unknown }).statusCode);
    if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600) {
      const code = statusCode === 415 ? 'unsupported_media_type' : statusCode === 404 ? 'not_found' : statusCode === 429 ? 'rate_limit_exceeded' : statusCode < 500 ? 'bad_request' : 'service_error';
      const message = statusCode === 415 ? 'Content-Type must be application/json' : statusCode >= 500 ? 'Service unavailable' : error instanceof Error ? error.message : 'Request failed';
      return reply.code(statusCode).send({ error: { code, message } });
    }
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(JSON.stringify({ level: 'error', message: 'Unhandled API error', error: message, at: new Date().toISOString() }));
  return reply.code(500).send({ error: { code: 'internal_error', message: 'Internal server error' } });
}
