import { DEBUG_MODE_ENABLED } from './config';

export interface Logger {
  debug: (tag: string, ...messages: any[]) => void;

  info: (tag: string, ...messages: any[]) => void;

  warn: (tag: string, ...messages: any[]) => void;

  error: (tag: string, ...messages: any[]) => void;
}

class ConsoleLogger implements Logger {
  debug = (tag: string, ...messages: any[]) => {
    DEBUG_MODE_ENABLED && console.debug(`${tag}/${messages.join(', ')}`);
  };

  info = (tag: string, ...messages: any[]) => {
    DEBUG_MODE_ENABLED && console.info(`${tag}/${messages.join(', ')}`);
  };

  warn = (tag: string, ...messages: any[]) => {
    DEBUG_MODE_ENABLED && console.warn(`${tag}/${messages.join(', ')}`);
  };

  error = (tag: string, ...messages: any[]) => {
    DEBUG_MODE_ENABLED && console.error(`${tag}/${messages.join(', ')}`);
  };
}

export const logger = new ConsoleLogger();
