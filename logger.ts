import pino from "pino";
import { appconfig } from "./config";

let USE_NTFY = appconfig.logger.use_ntfy;
const NTFY_URL = appconfig.logger.ntfy_url;

export async function notify(
  level: string,
  message: string,
  priority: string = "3",
  title: string = "kitisbot notify",
  tags: string = "",
) {
  try {
    await fetch(NTFY_URL, {
      method: "POST",
      headers: {
        Title: level === "error" ? "kitisbot error" : title,
        Priority: level === "error" ? "5" : priority,
        Tags: tags,
      },
      body: message,
    });
  } catch (err) {
    const e = err as Error;
    console.error(
      `failed to send notification - ${e.message}.\nDisabled notifications until next launch`,
    );
    appconfig.logger.use_ntfy = false;
    USE_NTFY = false;
  }
}

export const log = pino({
  level: "debug",
  hooks: {
    logMethod(inputArgs, method, level) {
      const [msg, ...args] = inputArgs;
      const formatted = typeof msg === "string" ? msg : JSON.stringify(msg);
      if (level >= 40 && USE_NTFY) {
        notify(pino.levels.labels[level] ?? "", formatted);
      }
      method.apply(this, [msg, ...args]);
    },
  },
  transport: {
    targets: [
      {
        level: "debug",
        target: "pino-pretty",
        options: {
          colorize: appconfig.logger.use_colors,
          translateTime: appconfig.logger.time_format,
          ignore: appconfig.logger.ignore,
        },
      },
      {
        level: "info",
        target: "pino-pretty",
        options: {
          destination: "info.log",
          colorize: appconfig.logger.use_colors,
          translateTime: appconfig.logger.time_format,
          ignore: appconfig.logger.ignore,
        },
      },
      {
        level: "debug",
        target: "pino-pretty",
        options: {
          destination: "debug.log",
          colorize: appconfig.logger.use_colors,
          translateTime: appconfig.logger.time_format,
          ignore: appconfig.logger.ignore,
        },
      },
    ],
  },
});

log.info("---");
log.debug("logger - ok");
