// src/libs/logger.ts
// Conditional logging utility - only logs in development mode

const IS_DEV = import.meta.env.DEV;

export const logger = {
    log: (...args: unknown[]) => {
        if (IS_DEV) console.log(...args);
    },
    warn: (...args: unknown[]) => {
        if (IS_DEV) console.warn(...args);
    },
    error: (...args: unknown[]) => {
        // Always log errors, even in production
        console.error(...args);
    },
    debug: (...args: unknown[]) => {
        if (IS_DEV) console.debug(...args);
    },
    info: (...args: unknown[]) => {
        if (IS_DEV) console.info(...args);
    },
};

// Named exports for convenience
export const { log, warn, error, debug, info } = logger;
