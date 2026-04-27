const isDev = import.meta.env.DEV;

export const log = {
  info: (...args: unknown[]) => {
    if (isDev) console.info("[quack]", ...args);
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn("[quack]", ...args);
  },
  error: (...args: unknown[]) => {
    console.error("[quack]", ...args);
  },
  debug: (...args: unknown[]) => {
    if (isDev) console.debug("[quack]", ...args);
  },
};
