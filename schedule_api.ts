import fs from "fs/promises";
import iconv from "iconv-lite";
import * as chr from "cheerio";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import { appconfig } from "./config";
import { log } from "./logger";

interface SLesson {
  number: string;
  bells: string;
  subgroup: string;
  name?: string;
  lecturer?: string;
  group?: string;
  room?: string;
}
interface SDay {
  date: string;
  weekday: string;
  lessons: SLesson[];
}

export class ScheduleAPI {
  constructor(
    public SOURCE_TYPES: Record<string, string> = appconfig.data.source_types,
    public WEEKDAYS: Record<string, string> = appconfig.data.weekdays,
    public BELLS: Record<string, string> = appconfig.data.bells,
    public BELLS_MONDAY: Record<string, string> = appconfig.data.bells_monday,
    public BASE_LINKS: Record<string, string> = appconfig.data.base_links,
    public links: Record<string, Record<string, string>> = {},
  ) {
    dayjs.extend(customParseFormat);
  }
  async init() {
    await this._getAllLinks();
    return this;
  }
  _parseDateStr(time_str: string) {
    const lm_time = dayjs(time_str, "Обновлено: DD.MM.YYYY в HH:mm.");
    // return lm_time.toString();
    return lm_time.unix();
  }
  _decodeHTML(buffer: Buffer) {
    let html = buffer.toString("utf-8");
    if (html.includes(`charset=windows-1251"`)) {
      html = iconv.decode(buffer, "win1251");
    }
    return html;
  }
  _get$(html: string) {
    return chr.load(html.replace(/<br\s*\/?>/gi, "\\n"));
  }
  async _fetchHTML(url: string) {
    try {
      const r = await fetch(url);
      const buffer = Buffer.from(await r.arrayBuffer());
      return this._decodeHTML(buffer);
    } catch (err) {
      const e = err as Error;
      log.debug(e.message);
      return "";
    }
  }
  async _fetch$(url: string) {
    const html = await this._fetchHTML(url);
    return html !== "" ? this._get$(html) : null;
  }
  async _downloadHTML(url: string, path: string) {
    const html = await this._fetchHTML(url);
    if (html === "") return;
    await fs.writeFile(
      path,
      html.replace("charset=windows-1251", "charset=utf-8"),
      "utf-8",
    );
  }
  async _fileHTML(path: string) {
    return await fs.readFile(path, "utf-8");
  }
  async _getLinks(root_url: string, base_url: string) {
    const html = await this._fetchHTML(root_url);
    if (html === "") return {};
    const $ = this._get$(html);

    const map: Record<string, string> = {};
    const table = $("table.inf");
    table
      .find("tr")
      .slice(1)
      .each((_, tr) => {
        const a = $(tr).find("a.z0");
        let source = $(a).text().trim();
        // trim source after 28 symbols because of telegram callback data limits
        // <= 64 bytes, each cyrillic is 2 bytes
        // i could just translitterate to latin, but that is too much for me
        // also, it would be better if i would check byte length, not regular length, but i am lazy
        if (source.length > 28) source = source.slice(0, 28);
        const source_link = `${base_url}/${$(a).attr("href")?.trim()}`;
        if (source && source_link) map[source] = source_link;
      });
    return map;
  }
  async _getAllLinks() {
    await Promise.all(
      Object.entries(this.BASE_LINKS)
        .splice(2)
        .map(async ([key, value]) => {
          this.links[key] = await this._getLinks(
            value,
            this.BASE_LINKS["base"] ?? "",
          );
        }),
    );
  }
  async _getStatus(url: string) {
    const r_start = Date.now();
    try {
      const r = await fetch(url);
      const r_end = Date.now();
      return {
        status: r.status,
        text: r.statusText,
        elapsed: r_end - r_start,
      };
    } catch (err) {
      const r_end = Date.now();
      const e = err as Error;
      log.debug(e.message);
      return {
        status: -1,
        text: e.message,
        elapsed: r_end - r_start,
      };
    }
  }

  _parseScheduleJSON($: chr.CheerioAPI) {
    const h1 = $("h1").text().trim();
    const last_modified = this._parseDateStr($("div.ref").text().trim());
    const sources_match = h1.match(/([^:]+): ([^$]+)/);
    const [, source_type = "", source = ""] = sources_match ?? [];
    const days: Record<string, any>[] = [];
    let current_day: any = {};
    let current_date = "",
      current_weekday = "",
      current_lesson_number = "";
    const table = $("table.inf");
    table
      .find("tr")
      .slice(2)
      .each((_, tr) => {
        // magic number. Don't even ask about it, just read the code below if you're curious
        let mn = 0;
        const tds = $(tr).find("td");
        // there it is, most fucking annoying part of the work
        // td is date
        const text0 = $(tds[0]).text().trim();
        if (!text0.includes(":") && text0.length > 1) {
          [current_date = "", current_weekday = ""] = text0.split("\\n");
          if (Object.entries(current_day).length > 0) days.push(current_day);
          current_day = {
            date: current_date,
            weekday: this.WEEKDAYS[current_weekday],
            lessons: [],
          };
          mn = 1;
        } else if (tds.length >= 2) mn = 0;
        else return;

        current_lesson_number = $(tds[mn]).text().at(0) ?? "";
        if (tds.length >= mn + 2) {
          // astd - td with a nodes
          tds.slice(mn + 1).each((k, astd) => {
            if (!$(astd).text().trim()) return;
            const ass = $(astd).children().toArray();
            // get text from a elements with z1, z2 and z3 classes respectively
            const zs = Object.fromEntries(
              ["z1", "z2", "z3"].map((z) => [
                z,
                ass
                  .filter((a) => $(a).hasClass(z))
                  .map((a) => $(a).text())
                  .join(", "),
              ]),
            );
            const z_mapping: any = {
              group: { name: zs.z1, room: zs.z2, lecturer: zs.z3 },
              lecturer: { name: zs.z3, room: zs.z2, group: zs.z1 },
              room: { name: zs.z3, group: zs.z2, lecturer: zs.z1 },
            };
            let current_subgroup = "0";
            if (tds.length > mn + 2) current_subgroup = `${k + 1}`;
            let lesson = {
              number: current_lesson_number,
              bells:
                current_weekday == "Пн"
                  ? (this.BELLS_MONDAY[current_lesson_number] ?? "")
                  : (this.BELLS[current_lesson_number] ?? ""),
              subgroup: current_subgroup,
              ...(z_mapping[this.SOURCE_TYPES[source_type] ?? ""] ?? {}),
            };
            // remove subgroup from lesson name if any
            if (typeof lesson.name !== "undefined")
              lesson.name = lesson.name.replace(/\s*\(\d+\)/, "");
            current_day["lessons"].push(lesson);
          });
        }
      });
    days.push(current_day); // end of this motherfucking circus
    const result = {
      status: "ok",
      message: "",
      source_type: this.SOURCE_TYPES[source_type] ?? source_type,
      source: source,
      last_modified: last_modified,
      days: days,
    };
    return result;
  }
  _parseRecordsJSON($: chr.CheerioAPI) {
    const h1 = $("h1").text().trim();
    const last_modified = this._parseDateStr($("div.ref").text().trim());
    const sources_match = h1.match(/([^:]+): ([^$]+)/);
    const [, source_type = "", source = ""] = sources_match ?? [];

    const records: Record<string, any>[] = [];
    const table = $("table.inf");
    table
      .find("tr")
      .slice(1)
      .each((_, tr) => {
        const tds = $(tr).find("td");
        const record = {
          number: $(tds[0]).text().replace(".", ""),
          lecturer: $(tds[1]).text(),
          group: $(tds[2]).text(),
          subgroup: $(tds[3]).text(),
          name: $(tds[4]).text(),
          type: $(tds[5]).text(),
          hours_all: Number($(tds[6]).text().replace(",", ".")),
          hours_planned: Number($(tds[7]).text().replace(",", ".")),
          hours_actual: Number($(tds[8]).text().replace(",", ".")),
          hours_remaining: Number($(tds[9]).text().replace(",", ".")),
          hours_per_week_planned: Number($(tds[10]).text().replace(",", ".")),
          hours_per_week_actual: Number($(tds[11]).text().replace(",", ".")),
          end_date: $(tds[12]).text(),
          completion_percent: Number(
            $($(tds[13]).find("img")[0])?.attr("alt")?.replace(",", "."),
          ),
        };
        records.push(record);
      });
    const result = {
      status: "ok",
      message: "",
      source_type: this.SOURCE_TYPES[source_type] ?? source_type,
      source: source,
      last_modified: last_modified,
      records: records,
    };
    return result;
  }

  _messageEscape(text: string) {
    return text.replace(/([\[\]()\~`>#+\-=|{}.!])/g, "\\$1");
  }
  _truncate(text: string, max_length: number) {
    if (text.length <= max_length || max_length <= 0) return text;
    return `${text.slice(0, (max_length < 3 ? 3 : max_length) - 3)}...`;
  }
  _fmtLesson(source_type: string, data: Record<string, any>) {
    const lesson_formats: Record<string, string> = {
      group: "__{number} пара__ - _{bells}_ - {name}{subgroup} - _{room}_",
      lecturer: "__{number} пара__ - _{bells}_ - *{group}* - {name} - _{room}_",
      room: "__{number} пара__ - _{bells}_ - *{lecturer}* - {group} - _{name}_",
    };
    const pattern = lesson_formats[source_type] ?? "";
    return pattern.replace(/{(\w+)}/g, (_, key) => String(data[key] ?? ""));
  }
  _formatScheduleMessage(
    j: Record<string, any>,
    truncate: number,
    exclude_empty_weekends: boolean,
    exclude_empty_days: boolean,
  ) {
    const source_type = j?.source_type ?? "";
    const heads: Record<string, string> = {
      group: "группы",
      lecturer: "преподавателя",
      room: "аудитории",
    };
    let msg = `Расписание ${heads[source_type] ?? "..."} *${j?.source ?? "..."}*\n--------------------------\n`;
    Object.entries((j?.days as SDay) ?? []).forEach((day_data) => {
      const day: SDay = day_data[1] ?? {};
      if (
        (exclude_empty_weekends &&
          ["Суббота", "Воскресенье"].includes(day.weekday) &&
          day.lessons.length === 0) ||
        (exclude_empty_days && (!day.lessons || day.lessons.length === 0))
      )
        return;
      msg += `\n${day.date} - *${day.weekday}*\n\n`;
      Object.entries(day.lessons ?? []).forEach((lesson_data) => {
        const lesson = lesson_data[1] ?? {};
        const name = this._truncate(lesson.name ?? "", truncate);
        const room = lesson.room || "Дистант";
        const subgroup = lesson.subgroup === "0" ? "" : ` (${lesson.subgroup})`;
        msg += `${this._fmtLesson(source_type, { ...lesson, name: name, room: room, subgroup: subgroup })}\n`;
      });
      msg += "\n--------------------------\n";
    });
    const last_modified =
      dayjs
        .unix(j?.last_modified ?? -1)
        .format("[_Обновлено:] DD.MM.YY в HH:mm[_]") ?? "_Обновлено: ..._";
    msg += last_modified;
    return msg;
  }
  _formatRecordsMessage(j: Record<string, any>) {
    return "скоро";
  }

  async _getData(
    type: "schedule" | "records",
    source_type: string,
    source: string,
  ) {
    const prefix = type === "schedule" ? "s_" : "r_";
    const parser =
      type === "schedule"
        ? this._parseScheduleJSON.bind(this)
        : this._parseRecordsJSON.bind(this);
    const link = this.links[`${prefix}${source_type}`]?.[source];
    if (!link)
      return { status: "error", message: "Invalid 'source_type' or 'source'" };
    const html = await this._fetchHTML(link);
    if (html === "")
      return {
        status: "error",
        message: "Failed to fetch HTML",
      };
    const $ = this._get$(html);
    return parser($);
  }
  async getStatus() {
    return await this._getStatus(this.BASE_LINKS["index"] ?? "");
  }
  async getSchedule(source_type: string, source: string) {
    return await this._getData("schedule", source_type, source);
  }
  async getRecords(source_type: string, source: string) {
    return await this._getData("records", source_type, source);
  }
  async getStatusMessage() {
    const j = await this.getStatus();
    if (j.status === -1) {
      return this._messageEscape(
        `*Не удаётся установить соединение с сайтом!*\n\nТекст ошибки:\n_${j.text}_`,
      );
    }
    return this._messageEscape(
      `Статус: *${j.status}*\nОтклик: *${j.elapsed} мс.*`,
    );
  }
  async getScheduleMessage(
    source_type: string,
    source: string,
    truncate: number = 80,
    exclude_empty_weekends: boolean = appconfig.bot
      .schedule_exclude_empty_weekends,
    exclude_empty_days: boolean = appconfig.bot.schedule_exclude_empty_days,
  ) {
    const j = await this.getSchedule(source_type, source);
    if (j.status === "error")
      return this._messageEscape(
        "Указан неверный источник расписания! (возможно он устарел)\nИспользуйте /settings и обновите его!",
      );
    else if (!("source" in j) || j.source === "") {
      return this._messageEscape(
        "Не удалось получить данные расписания, попробуйте позже!",
      );
    }
    const mes = this._formatScheduleMessage(
      j,
      truncate,
      exclude_empty_weekends,
      exclude_empty_days,
    );
    return this._messageEscape(mes);
  }
  async getRecordsMessage(
    source_type: string,
    source: string,
    truncate: number = -1,
  ) {
    const j = await this.getSchedule(source_type, source);
    if (j.status === "error")
      return this._messageEscape("Указан неверный источник учёта!");
    else if (!(source in j)) {
      return this._messageEscape(
        "Не удалось получить данные учёта занятий, попробуйте позже!",
      );
    }
    const mes = this._formatRecordsMessage(j);
    return this._messageEscape(mes);
  }
}

// const sapi = await new ScheduleAPI().init();
// log.debug("init complete");
// log.debug(sapi.links);

// const source_type = "lecturer";
// const source = "Сергиеня Д.Д.";
// const [s, r] = await Promise.all([
//   sapi.getSchedule(source_type, source),
//   sapi.getRecords(source_type, source),
// ]);
// log.debug("got data");
// Bun.write("sapi-test-s.json", JSON.stringify(s, null, 2));
// Bun.write("sapi-test-r.json", JSON.stringify(r, null, 2));
// log.debug("wrote data");

// log.debug(sapi._formatScheduleMessage(s, 80, false, false));

// log.debug(await sapi._getStatus(sapi.BASE_LINKS["index"] ?? ""));
// log.debug(await sapi._getStatus("https://httpbingo.org"));
