import { z } from "zod";
import { existsSync, readFileSync, writeFileSync } from "fs";

const DEFAULT_CONFIG = {
  db: {
    host: "localhost",
    port: 5432,
    user: "kitisbot",
    password: "kitisbotstrongpassword",
    database: "kitisbotdb",
  },
  bot: {
    admins: [],
  },
  logger: {
    level: "debug",
    use_colors: false,
    time_format: "dd mmm yyyy, HH:MM:ss.l",
    ignore: "pid,hostname",
    use_ntfy: false,
    ntfy_url: "https://ntfy.sh/kitisbot_notifications",
  },
  api: {
    base_url: "https://api.shkitis.ru",
  },
};

const config_schema = z.object({
  db: z
    .object({
      host: z.string().default("localhost"),
      port: z.number().default(5432),
      user: z.string().default("kitisbot"),
      password: z.string().default("kitisbotstrongpassword"),
      database: z.string().default("kitisbotdb"),
    })
    .default({
      host: "localhost",
      port: 5432,
      user: "kitisbot",
      password: "kitisbotstrongpassword",
      database: "kitisbotdb",
    }),
  bot: z
    .object({
      admins: z.array(z.string()).default([]),
    })
    .default({
      admins: [""],
    }),
  logger: z
    .object({
      level: z.string().default("debug"),
      use_colors: z.boolean().default(false),
      time_format: z.string().default("dd mmm yyyy, HH:MM:ss.l"),
      ignore: z.string().default("pid,hostname"),
      use_ntfy: z.boolean().default(false),
      ntfy_url: z.string().default("https://ntfy.sh/kitisbot_notifications"),
    })
    .default({
      level: "debug",
      use_colors: false,
      time_format: "dd mmm yyyy, HH:MM:ss.l",
      ignore: "pid,hostname",
      use_ntfy: false,
      ntfy_url: "https://ntfy.sh/kitisbot_notifications",
    }),
  api: z
    .object({
      base_url: z.string().default("https://api.shkitis.ru"),
    })
    .default({
      base_url: "https://api.shkitis.ru",
    }),
});
export type Config = z.infer<typeof config_schema>;
const CONFIG_PATH = "./config.json";

function loadConfig() {
  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      return config_schema.parse(raw);
    } catch (err) {
      const e = err as Error;
      console.error(`Config error: ${e.message}`);
      console.warn("Using default config for now.");
      return DEFAULT_CONFIG;
    }
  } else {
    console.warn("File 'config.json' not found. Writing default.");
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  }
}

export const appconfig: Config = loadConfig();
