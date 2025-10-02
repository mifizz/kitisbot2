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
    schedule_exclude_empty_days: false,
    schedule_exclude_empty_weekends: true,
  },
  logger: {
    level: "debug",
    use_colors: false,
    time_format: "dd mmm yyyy, HH:MM:ss.l",
    ignore: "pid,hostname",
    use_ntfy: false,
    ntfy_url: "https://ntfy.sh/kitisbot_notifications",
  },
  data: {
    bells: {
      1: "8:30-10:00",
      2: "10:10-11:40",
      3: "12:10-13:40",
      4: "13:50-15:20",
      5: "15:30-17:00",
      6: "17:10-18:40",
      7: "18:50-20:20",
    },
    bells_monday: {
      1: "8:30-9:00 / 15:20-15:50",
      2: "9:10-10:30",
      3: "10:40-12:00",
      4: "12:20-13:40",
      5: "13:50-15:10",
      6: "16:00-17:20",
      7: "17:30-18:50",
    },
    weekdays: {
      Пн: "Понедельник",
      Вт: "Вторник",
      Ср: "Среда",
      Чт: "Четверг",
      Пт: "Пятница",
      Сб: "Суббота",
      Вс: "Воскресенье",
    },
    source_types: {
      Группа: "group",
      Преподаватель: "lecturer",
      Аудитория: "room",
    },
    base_links: {
      base: "http://94.72.18.202:8083",
      index: "http://94.72.18.202:8083/index.htm",
      s_group: "http://94.72.18.202:8083/cg.htm",
      s_lecturer: "http://94.72.18.202:8083/cp.htm",
      s_room: "http://94.72.18.202:8083/ca.htm",
      r_group: "http://94.72.18.202:8083/vg.htm",
      r_lecturer: "http://94.72.18.202:8083/vp.htm",
    },
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
      schedule_exclude_empty_days: z.boolean().default(false),
      schedule_exclude_empty_weekends: z.boolean().default(true),
    })
    .default({
      admins: [""],
      schedule_exclude_empty_days: false,
      schedule_exclude_empty_weekends: true,
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
  data: z.object({
    bells: z
      .object({
        1: z.string().default("8:30-10:00"),
        2: z.string().default("10:10-11:40"),
        3: z.string().default("12:10-13:40"),
        4: z.string().default("13:50-15:20"),
        5: z.string().default("15:30-17:00"),
        6: z.string().default("17:10-18:40"),
        7: z.string().default("18:50-20:20"),
      })
      .default({
        1: "8:30-10:00",
        2: "10:10-11:40",
        3: "12:10-13:40",
        4: "13:50-15:20",
        5: "15:30-17:00",
        6: "17:10-18:40",
        7: "18:50-20:20",
      }),
    bells_monday: z
      .object({
        1: z.string().default("8:30-9:00 / 15:20-15:50"),
        2: z.string().default("9:10-10:30"),
        3: z.string().default("10:40-12:00"),
        4: z.string().default("12:20-13:40"),
        5: z.string().default("13:50-15:10"),
        6: z.string().default("16:00-17:20"),
        7: z.string().default("17:30-18:50"),
      })
      .default({
        1: "8:30-9:00 / 15:20-15:50",
        2: "9:10-10:30",
        3: "10:40-12:00",
        4: "12:20-13:40",
        5: "13:50-15:10",
        6: "16:00-17:20",
        7: "17:30-18:50",
      }),
    weekdays: z
      .object({
        Пн: z.string().default("Понедельник"),
        Вт: z.string().default("Вторник"),
        Ср: z.string().default("Среда"),
        Чт: z.string().default("Четверг"),
        Пт: z.string().default("Пятница"),
        Сб: z.string().default("Суббота"),
        Вс: z.string().default("Воскресенье"),
      })
      .default({
        Пн: "Понедельник",
        Вт: "Вторник",
        Ср: "Среда",
        Чт: "Четверг",
        Пт: "Пятница",
        Сб: "Суббота",
        Вс: "Воскресенье",
      }),
    source_types: z
      .object({
        Группа: z.string().default("group"),
        Преподаватель: z.string().default("lecturer"),
        Аудитория: z.string().default("room"),
      })
      .default({
        Группа: "group",
        Преподаватель: "lecturer",
        Аудитория: "room",
      }),
    base_links: z
      .object({
        base: z.string().default("http://94.72.18.202:8083"),
        index: z.string().default("http://94.72.18.202:8083/index.htm"),
        s_group: z.string().default("http://94.72.18.202:8083/cg.htm"),
        s_lecturer: z.string().default("http://94.72.18.202:8083/cp.htm"),
        s_room: z.string().default("http://94.72.18.202:8083/ca.htm"),
        r_group: z.string().default("http://94.72.18.202:8083/vg.htm"),
        r_lecturer: z.string().default("http://94.72.18.202:8083/vp.htm"),
      })
      .default({
        base: "http://94.72.18.202:8083",
        index: "http://94.72.18.202:8083/index.htm",
        s_group: "http://94.72.18.202:8083/cg.htm",
        s_lecturer: "http://94.72.18.202:8083/cp.htm",
        s_room: "http://94.72.18.202:8083/ca.htm",
        r_group: "http://94.72.18.202:8083/vg.htm",
        r_lecturer: "http://94.72.18.202:8083/vp.htm",
      }),
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
