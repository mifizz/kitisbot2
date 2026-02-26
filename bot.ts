import { Bot, Context, GrammyError } from "grammy";
import { run, sequentialize } from "@grammyjs/runner";
import { ScheduleDatabase } from "./db";
import { log, notify } from "./logger";
import { api, kbs } from "./helper";
import { appconfig } from "./config";

const db = new ScheduleDatabase();
await db.connect();
log.debug("database - ok");

const BOT_TOKEN = process.env.TOKEN;
if (!BOT_TOKEN) {
  log.fatal("no token");
  process.exit(1);
}
const bot = new Bot(BOT_TOKEN);
bot.use(
  sequentialize((c) => {
    const chat = c.chat?.id.toString();
    const user = c.from?.id.toString();
    return [chat, user].filter((con) => con !== undefined);
  }),
);

log.info("started");
if (appconfig.logger.use_ntfy) notify("info", "yeah", "1", "kitisbot started");

bot.command("start", async (c: Context) => {
  const uid = c.chat?.id ?? null;
  const uname = c.chat?.username ?? "";
  if (!uid) {
    log.error(`invalid user: ${uid} - '${uname}'`);
    return;
  }
  db.userAdd(uid, uname);
  await c.reply(
    `Привет, это бот для просмотра расписания КИТиС!\nДля начала выбери источник расписания с помощью команды /settings и кнопки "источник расписания", а после этого используй команду /myschedule, чтобы посмотреть своё расписание!

Вот все команды бота:
/settings - настройки бота
/myschedule - ваше расписание
/schedule - чужое расписание
/status - статус сайта
/help - помощь с ботом`,
  );
});

async function botSendSchedule(
  c: Context,
  source_type: string = "",
  source: string = "",
  show_errors: boolean = false,
) {
  const cid = c.chatId ?? -1; // chat_id => cid
  if (!source_type || !source) {
    await c.reply(
      "Не указан источник расписания. Используйте /settings и выберите источник.",
    );
    return;
  }
  const mes = await c.reply("Получаю информацию...");
  const mid = mes.message_id; // message_id => mid
  const reply = await api.getScheduleMessage(source_type, source);
  if (reply.length > 4096) {
    log.warn(
      `message is too long (${reply.length}), can't send it! source: ${source} (${cid})`,
    );
    await c.api.editMessageText(
      cid,
      mid,
      "Не могу отправить расписание, слишком длинный текст сообщения!",
    );
    return;
  }
  try {
    await c.api.editMessageText(cid, mid, reply, {
      parse_mode: "MarkdownV2",
    });
  } catch (err) {
    const e = err as Error;
    const mes = e.message;
    log.error(`can not send schedule: ${mes} (${cid})`);
    await c.api.editMessageText(
      cid,
      mid,
      `Не могу отправить расписание (ошибка телеграма)${show_errors ? ":\n\n" + mes : ""}`,
    );
  }
}
async function fetchUserSettings(c: Context) {
  const cid = c.chatId ?? -1;
  const cname = c.chat?.username ?? "";
  await db.userAdd(cid, cname);
  const user = await db.userGetSettings(cid);
  return user;
}

bot.command("myschedule", async (c: Context) => {
  const user = await fetchUserSettings(c);
  const source_type = user.source_type ?? "";
  const source = user.source ?? "";
  const show_errors = user.show_errors ?? false;
  await botSendSchedule(c, source_type, source, show_errors);
});

bot.command("schedule", async (c: Context) => {
  const user = await fetchUserSettings(c);
  await c.reply("Выберите источник расписания:", {
    reply_markup: kbs["get_source_type"],
  });
});

bot.command("status", async (c: Context) => {
  const cid = c.chatId ?? -1;
  const user = await fetchUserSettings(c);
  const mes = await c.reply("_Соединение с сайтом\\.\\.\\._", {
    parse_mode: "MarkdownV2",
  });
  const text = await api.getStatusMessage();
  await c.api.editMessageText(cid, mes.message_id, text, {
    parse_mode: "MarkdownV2",
  });
});
bot.command("help", async (c: Context) => {
  const user = await fetchUserSettings(c);
  await c.reply(`/settings - команда для настройки бота. Например, с помощью кнопки "источник расписания" можно выбрать источник по умолчанию для команды /myschedule\n
/myschedule - посмотреть ваше расписание, установленное в настройках\n
/schedule - посмотреть любое расписание, для этого вызовите команду и выберите нужный источник, это не сохранится в настройках\n
/status - проверить статус работы сайта с расписанием: код статуса и время ответа сервера\n
/help - посмотреть помощь по боту`);
});
bot.command("settings", async (c: Context) => {
  const user = await fetchUserSettings(c);
  await c.reply("⚙️ Настройки", {
    reply_markup: kbs["settings"],
  });
});

// callback query handler
bot.callbackQuery(/^settings::$/, async (c) => {
  const cid = c.chatId ?? -1,
    mid = c.callbackQuery.message?.message_id ?? -1;
  await c.answerCallbackQuery();
  await c.api.editMessageText(cid, mid, "⚙️ Настройки", {
    reply_markup: kbs["settings"],
  });
});
bot.callbackQuery(/^settings:debug_mode:/, async (c) => {
  const cid = c.chatId ?? -1,
    mid = c.callbackQuery.message?.message_id ?? -1,
    param = c.callbackQuery.data.split(":")?.[2] ?? "",
    text =
      "Режим отладки позволяет отслеживать ошибки. Возможно, в будущем будет больше того, на что влияет эта настройка :)",
    sets = await fetchUserSettings(c);
  await c.answerCallbackQuery();
  let show_errors: boolean = sets?.show_errors;
  if (param !== "") {
    show_errors = param === "enable";
    await db.userUpdateShowErrors(cid, param === "enable");
  }
  await c.api.editMessageText(cid, mid, text, {
    reply_markup: show_errors ? kbs["debug_enabled"] : kbs["debug_disabled"],
  });
});
bot.callbackQuery(/^settings:set_source_type:/, async (c) => {
  const cid = c.chatId ?? -1,
    mid = c.callbackQuery.message?.message_id ?? -1,
    param = c.callbackQuery.data.split(":")?.[2] ?? "",
    key = `set_source_${param === "" ? "type" : param}`;
  await c.answerCallbackQuery();
  await c.api.editMessageText(cid, mid, "Выберите источник расписания:", {
    reply_markup: kbs[key],
  });
});
bot.callbackQuery(/^db:ss:/, async (c) => {
  const cid = c.chatId ?? -1,
    mid = c.callbackQuery.message?.message_id ?? -1,
    param = c.callbackQuery.data.split(":")?.[2] ?? "",
    sets = await fetchUserSettings(c),
    will_send_schedule = !Boolean(sets.source);
  await c.answerCallbackQuery();
  let status = "",
    [, source_type = "", source = ""] = param.match(/(\w+)\.(.+)$/) ?? [];
  source_type = { g: "group", l: "lecturer", r: "room" }[source_type] ?? "";
  if (source_type && source) {
    await db.userUpdateSource(cid, source_type, source);
    status = "*Источник расписания изменён\\!*";
    if (will_send_schedule)
      await botSendSchedule(c, source_type, source, sets.show_errors ?? false);
  } else status = "*Что\\-то пошло не так\\!*";
  await c.api.editMessageText(cid, mid, `${status}\n\n⚙️ Настройки`.trim(), {
    reply_markup: kbs["settings"],
    parse_mode: "MarkdownV2",
  });
});
bot.callbackQuery(/^get:get_source_type:/, async (c) => {
  const cid = c.chatId ?? -1,
    mid = c.callbackQuery.message?.message_id ?? -1,
    param = c.callbackQuery.data.split(":")?.[2] ?? "",
    key = `get_source_${param === "" ? "type" : param}`;
  await c.answerCallbackQuery();
  await c.api.editMessageText(cid, mid, "Выберите источник расписания:", {
    reply_markup: kbs[key],
  });
});
bot.callbackQuery(/^get:g:/, async (c) => {
  const cid = c.chatId ?? -1,
    mid = c.callbackQuery.message?.message_id ?? -1,
    param = c.callbackQuery.data.split(":")?.[2] ?? "";
  await c.answerCallbackQuery();
  let [, source_type = "", source = ""] = param.match(/(\w)\.(.+)$/) ?? [];
  source_type = { g: "group", l: "lecturer", r: "room" }[source_type] ?? "none";
  await c.api.deleteMessage(cid, mid);
  await botSendSchedule(c, source_type, source);
});

// announcement
async function sendAnnouncement(c: Context, id: number | string, text: string) {
  let fid = ""; // file_id
  if (c.message?.photo)
    fid = c.message.photo[c.message.photo.length - 1]?.file_id ?? "";
  try {
    if (id === "") return;
    if (fid)
      await c.api.sendPhoto(id, fid, { caption: text, parse_mode: "HTML" });
    else await c.api.sendMessage(id, text, { parse_mode: "HTML" });
  } catch (err) {
    const e = err as GrammyError;
    log.warn(`failed to send ann to ${id}: ${e.description}`);
    if (e.error_code === 403) {
      await db.userDelete(id);
    }
  }
}
/*
This command will be replaced with some better option later.
Use HTML formatting for announcements, more here:
https://core.telegram.org/bots/api#formatting-options

Command syntax examples (separated with ---):
---
/ann text
text on new line\nanother new line
<b>bold</b>
|end|
mode = only
ids = 1184488381, 123456
---
/ann
example <u>text</u>
|end|
mode=except; ids=1488,52,42;
---
You can omit 'ids' and only specify mode and bot will use all database ids instead.
In that case use 'mode=only' to send announcement to all users,
'mode=except' to not send announcement at all (useless),
'mode=preview' to only send announcement to your chat
*/
bot.on(["message:text", "message:caption"], async (c: Context) => {
  const cid = c.chatId ?? -1;
  if (!appconfig.bot.admins.includes(`${cid}`)) return;

  const mtext = c.message?.text ?? c.message?.caption ?? "";
  // this is temporary condition, i fucked up with photos so...
  if (!mtext.startsWith("/ann")) return;
  const cmd_text = mtext.replace("/ann", "").trim() ?? "";
  const [cmd_message = "", cmd_parameters = ""] = cmd_text
    .split("|end|", 2)
    .map((text) => text.trim().replace(/\\n/g, "\n"));
  if (cmd_message === "" || cmd_parameters === "") {
    await c.reply(
      "Неверный формат! Нет текста, тега |end| или параметра mode=...",
    );
    return;
  }

  const [, send_mode = ""] = cmd_parameters.match(/mode\s*=\s*(\w+)/) ?? [];
  let ids =
    cmd_parameters
      .match(/ids\s*=\s*([^;$]+)/)?.[1]
      ?.split(",")
      .map((s) => s.trim()) ?? (await db.userGetAll()).map((u) => u.id);
  if (ids?.length === 1 && ids[0] === "")
    ids = (await db.userGetAll()).map((u) => u.id);

  if (!["only", "except", "preview"].includes(send_mode)) {
    await c.reply(
      "Неверный режим отправки!\nonly - только ids\nexcept - всем кроме ids\npreview - посмотреть итоговое сообщение",
    );
    return;
  }
  let target_ids: string[] = [];
  if (send_mode === "preview") {
    target_ids = [`${cid}`];
  } else if (send_mode === "only") {
    target_ids = ids;
  } else if (send_mode === "except") {
    target_ids = (await db.userGetAll())
      .map((u) => u.id)
      .filter((id) => !ids.includes(id));
  }
  log.info(`sending ann to: '${target_ids.join("', '")}'`);
  for (const id of target_ids) {
    await sendAnnouncement(c, id, cmd_message);
  }
  log.info("/ann done");
  await c.reply("Готово");
});

bot.catch(async (err) => {
  let err_text = "";
  const c = err.ctx;

  if (
    err.message.includes("message is not modified") ||
    err.message.includes("message to delete not found") ||
    err.message.includes("message can't be deleted")
  )
    try {
      await c.answerCallbackQuery();
      return;
    } catch {
      return;
    }
  log.error(err_text ? err_text : err.message);

  let answer = "Произошла ошибка";
  const cid = c.chatId ?? -1;
  const sets = await fetchUserSettings(c);
  if (sets.show_errors) {
    answer += `:\n\n${err.message}`;
  } else {
    answer += '\n\n(для подробностей включите "Режим отладки" в настройках)';
  }
  if (c.callbackQuery) {
    const mid = c.callbackQuery?.message?.message_id ?? -1;
    try {
      await c.answerCallbackQuery();
    } catch (err1) {
      const e = err1 as Error;
      let err_text = "400: ";
      if (e.message.includes("query is too old"))
        err_text += "query is too old";
      log.warn(err_text ? err_text : e.message);
    }
    try {
      await c.api.editMessageText(cid, mid, answer);
    } catch (err2) {
      log.error("400: message can't be modified");
    }
  } else {
    await c.reply(answer);
  }
});
run(bot);
