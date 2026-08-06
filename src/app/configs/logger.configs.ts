import { createLogger, format, transports } from 'winston';
import { getTraceId } from './requestContext.configs';
import path from 'path';

const { printf, timestamp, combine, json, colorize } = format;

const loggerFormat = printf(({ timestamp, message, level }) => {
  const traceId = getTraceId();
  return `${timestamp} [traceId: ${traceId}] ${level} ${message}`;
});

const logger = createLogger({
  level: 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    colorize(),
    json(),
    loggerFormat
  ),
  transports: [
    new transports.Console(),
    new transports.File({
      filename: path.join(process.cwd(), 'logs', 'combine.log'),
      format: combine(json()),
    }),
    new transports.File({
      level: 'info',
      filename: path.join(process.cwd(), 'logs', 'info.log'),
      format: combine(json()),
    }),
    new transports.File({
      level: 'error',
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      format: combine(json()),
    }),
  ],
});

export default logger;
