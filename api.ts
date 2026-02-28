import type {
  ResponseSchedule,
  ResponseRecords,
  ResponseStatus,
  Day,
} from "./types";
import { appconfig } from "./config";

export class KitisAPIwrapper {
  private API_BASEURL = appconfig.api.base_url;

  private escapeMessage(s: string) {
    return s.replace(/([\[\]()\~`>#+\-=|{}.!])/g, "\\$1");
  }
  private truncate(text: string, max_length: number) {
    if (text.length <= max_length || max_length <= 0) return text;
    return `${text.slice(0, (max_length < 3 ? 3 : max_length) - 3)}...`;
  }
  private formatLesson(source_type: string, data: Record<string, any>) {
    const lesson_formats: Record<string, string> = {
      group: "__{number} пара__ - _{bells}_ - {name}{subgroup} - _{room}_",
      lecturer: "__{number} пара__ - _{bells}_ - *{group}* - {name} - _{room}_",
      room: "__{number} пара__ - _{bells}_ - *{lecturer}* - {group} - _{name}_",
    };
    const pattern = lesson_formats[source_type] ?? "";
    return pattern.replace(/{(\w+)}/g, (_, key) => String(data[key] ?? ""));
  }
  private formatScheduleMessage(j: ResponseSchedule, truncate: number) {
    const source_type = j.source_type;
    const heads = {
      group: "группы",
      lecturer: "преподавателя",
      room: "аудитории",
    };
    let msg = `Расписание ${heads[source_type]} *${j.source}*\n--------------------------\n`;
    Object.values(j.days).forEach((day) => {
      // continue if no lessons
      if (
        day.lessons.length === 0 &&
        ["Суббота", "Воскресенье"].includes(day.weekday)
      )
        return;
      msg += `\n${day.date} - *${day.weekday}*\n\n`;
      Object.values(day.lessons).forEach((lesson) => {
        const l_number = lesson.number > 0 ? lesson.number : "-";
        const name = this.truncate(lesson.name ?? "", truncate);
        const room = lesson.room || "Дистант";
        const subgroup = lesson.subgroup === 0 ? "" : ` (${lesson.subgroup})`;
        msg += `${this.formatLesson(source_type, { ...lesson, number: l_number, name, room, subgroup })}\n`;
      });
      msg += "\n--------------------------\n";
    });
    const last_modified =
      "Обновлено: " +
      new Date(j.last_modified * 1000).toLocaleTimeString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    msg += last_modified;
    return msg;
  }
  private async formatRecordsMessage(j: ResponseRecords) {
    return "unimplemented";
  }

  public async getAllSources(): Promise<Record<string, string[]>> {
    return (await (await fetch(this.API_BASEURL + "/schd/")).json()) as Record<
      string,
      string[]
    >;
  }

  public async getScheduleMessage(
    source_type: string,
    source: string,
    truncate: number = 80,
  ): Promise<string> {
    const j = (await (
      await fetch(this.API_BASEURL + `/schd/${source_type}/${source}`)
    ).json()) as ResponseSchedule;
    if (!j.source)
      return this.escapeMessage(
        "Не удалось получить данные расписания, используйте /status для проверки работоспособности сайта или попробуйте позже!",
      );
    return this.escapeMessage(this.formatScheduleMessage(j, truncate));
  }
  public async getRecordsMessage(
    source_type: string,
    source: string,
    truncate: number = -1,
  ): Promise<string> {
    return "unimplemented";
  }
  public async getStatusMessage(): Promise<string> {
    const j = (await (
      await fetch(this.API_BASEURL + "/status")
    ).json()) as ResponseStatus;
    if (!j.status) return "API недоступен, попробуйте позже";
    if (j.status === 500) return "Сайт недоступен";
    return this.escapeMessage(
      `Статус: *${j.status}*\nОтклик: *${j.elapsed} мс.*`,
    );
  }
}
