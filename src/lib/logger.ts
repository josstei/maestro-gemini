export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export function createLogger(prefix: string): Logger {
  const format = (
    level: string,
    message: string,
    data?: Record<string, unknown>,
  ): string => {
    const timestamp = new Date().toISOString();
    const base = `[${timestamp}] [${prefix}] ${level}: ${message}`;
    if (data) {
      return `${base} ${JSON.stringify(data)}`;
    }
    return base;
  };

  return {
    info(message, data) {
      console.error(format("INFO", message, data));
    },
    warn(message, data) {
      console.error(format("WARN", message, data));
    },
    error(message, data) {
      console.error(format("ERROR", message, data));
    },
  };
}
