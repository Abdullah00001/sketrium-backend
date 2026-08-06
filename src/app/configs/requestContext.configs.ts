import { createNamespace, getNamespace } from 'cls-hooked';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const NAMESPACE_NAME = 'skatrium-context';

export const requestContextMiddleware = (req: Request, res: Response, next: NextFunction) => {
  let namespace = getNamespace(NAMESPACE_NAME);
  if (!namespace) {
    namespace = createNamespace(NAMESPACE_NAME);
  }

  namespace.run(() => {
    const traceId = crypto.randomUUID();
    namespace!.set('traceId', traceId);
    next();
  });
};

export const getTraceId = (): string => {
  const namespace = getNamespace(NAMESPACE_NAME);
  if (namespace && namespace.active) {
    return namespace.get('traceId') || 'no-trace-id';
  }
  return 'no-trace-id';
};
