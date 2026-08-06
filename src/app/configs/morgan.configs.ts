import logger from './logger.configs';

interface LogObject {
  method: string;
  url: string;
  status: string;
  res: string;
  responseTime: string;
}

export const morganMessageFormat =
  '":method :url HTTP/:http-version" :status :res[content-length] :response-time ms';

export const streamConfig = {
  write: (message: string): void => {
    const parts = message.match(/"([^"]+)" (\d+) (\d+|-) ([\d.]+ ms)/);
    if (parts) {
      const logObject: LogObject = {
        method: parts[1].split(' ')[0],
        url: parts[1].split(' ')[1],
        status: parts[2],
        res: parts[3] === '-' ? '0' : parts[3],
        responseTime: parts[4],
      };

      logger.info(
        `Method: ${logObject.method}, URL: ${logObject.url}, Status: ${logObject.status}, Res: ${logObject.res}, Response Time: ${logObject.responseTime}`
      );
    } else {
      // Fallback if parsing fails
      logger.info(message.trim());
    }
  }
};
