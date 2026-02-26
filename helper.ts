import { InlineKeyboard } from "grammy";
import { log } from "./logger";
import { KitisAPIwrapper } from "./api";

function buildKB(
  values: string[],
  callback_path: string,
  buttons_per_row: number = 3,
) {
  const kb = new InlineKeyboard();
  values.forEach((val, i) => {
    kb.text(val, `${callback_path}${val}`);
    if ((i + 1) % buttons_per_row === 0) kb.row();
  });
  return kb;
}

export const api = new KitisAPIwrapper();
const sources = await api.getAllSources();

const list_groups = sources["group"] ?? [];
const list_lecturers = sources["lecturer"] ?? [];
const list_rooms = sources["room"] ?? [];

export const kbs: Record<string, InlineKeyboard> = {
  settings: new InlineKeyboard()
    .text("Источник расписания", "settings:set_source_type:")
    .row()
    .text("Режим отладки", "settings:debug_mode:"),

  // debug mode (show_errors)
  debug_disabled: new InlineKeyboard()
    .text("❌ Отладка отключена", "settings:debug_mode:enable")
    .row()
    .text("⬅️ Назад", "settings::"),
  debug_enabled: new InlineKeyboard()
    .text("✅ Отладка включена", "settings:debug_mode:disable")
    .row()
    .text("⬅️ Назад", "settings::"),

  // set default schedule source
  set_source_type: new InlineKeyboard()
    .text("Группы", "settings:set_source_type:group")
    .row()
    .text("Преподаватели", "settings:set_source_type:lecturer")
    .row()
    .text("Аудитории", "settings:set_source_type:room")
    .row()
    .text("⬅️ Назад", "settings::"),
  set_source_group: buildKB(list_groups, "db:ss:g.", 3)
    .row()
    .text("⬅️ Назад", "settings:set_source_type:"),
  set_source_lecturer: buildKB(list_lecturers, "db:ss:l.", 3)
    .row()
    .text("⬅️ Назад", "settings:set_source_type:"),
  set_source_room: buildKB(list_rooms, "db:ss:r.", 3)
    .row()
    .text("⬅️ Назад", "settings:set_source_type:"),

  // get_ used with '/schedule' or '/records' command
  get_source_type: new InlineKeyboard()
    .text("Группы", "get:get_source_type:group")
    .row()
    .text("Преподаватели", "get:get_source_type:lecturer")
    .row()
    .text("Аудитории", "get:get_source_type:room"),
  get_source_group: buildKB(list_groups, "get:g:g.", 3)
    .row()
    .text("⬅️ Назад", "get:get_source_type:"),
  get_source_lecturer: buildKB(list_lecturers, "get:g:l.", 3)
    .row()
    .text("⬅️ Назад", "get:get_source_type:"),
  get_source_room: buildKB(list_rooms, "get:g:r.", 3)
    .row()
    .text("⬅️ Назад", "get:get_source_type:"),
};

log.debug("helper - ok");
