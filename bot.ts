import { Bot, Context, GrammyError } from "grammy";
import { run, sequentialize } from "@grammyjs/runner";
import { ScheduleDatabase } from "./db";
import { log, notify } from "./logger";
import { sapi, kbs } from "./helper";
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
  sequentialize((ctx) => {
    const chat = ctx.chat?.id.toString();
    const user = ctx.from?.id.toString();
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
    `Привет, это бот для просмотра расписания КИТиС!\nДля начала выбери источник расписания с помощью команды /settings и кнопки "источник расписания", а после этого используй команду /schedule, чтобы посмотреть своё расписание!

Вот все команды бота:
/settings - настройки бота
/schedule - ваше расписание
/scheduleby - чужое расписание
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
    log.debug(`did not send schedule - source is not set (${cid})`);
    return;
  }
  if (await isSpamming(c, "schedule")) {
    await c.reply("Слишком частые запросы, подождите немного!");
    return;
  }
  const mes = await c.reply("Получаю информацию...");
  const mid = mes.message_id; // message_id => mid
  const reply = await sapi.getScheduleMessage(source_type, source);
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
    log.debug(`sent schedule ${source} (${cid})`);
    await updateTimestamp(c, "schedule");
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
async function fetchUser(c: Context) {
  const cid = c.chatId ?? -1;
  const user = await db.userGet(cid);
  if (!user || user.username !== (c.chat?.username ?? "")) {
    const username = c.chat?.username ?? "";
    await db.userAdd(cid, username);
    return await db.userGet(cid);
  }
  return user;
}
async function updateTimestamp(c: Context, action: "schedule" | "status") {
  const cid = c.chatId ?? -1;
  const user = await fetchUser(c);
  const stats = user?.stats;
  const now = Date.now();
  const time_map = {
    schedule: { lt_schedule: now },
    status: { lt_status: now },
    set: { lt_set: now },
  };
  await db.userUpdateStats(cid, { ...stats, ...time_map[action] });
}
async function isSpamming(c: Context, action: "schedule" | "status") {
  const user = await fetchUser(c);
  const lt = user?.stats?.[`lt_${action}`];
  const now = Date.now();
  const spam_map = {
    schedule: 2500,
    status: 1000,
  };
  if (now - lt < spam_map[action]) return true;
  return false;
}

bot.command("schedule", async (c: Context) => {
  const user = await fetchUser(c);
  const source_type = user?.settings?.source_type ?? "";
  const source = user?.settings?.source ?? "";
  const verbose = user?.settings?.verbose ?? false;
  await botSendSchedule(c, source_type, source, verbose);
});

bot.command("scheduleby", async (c: Context) => {
  const user = await fetchUser(c);
  await c.reply("Выберите источник расписания:", {
    reply_markup: kbs["get_source_type"],
  });
});

bot.command("status", async (c: Context) => {
  if (await isSpamming(c, "status")) {
    await c.reply("Слишком частые запросы, подождите немного!");
    return;
  }
  const cid = c.chatId ?? -1;
  const user = await fetchUser(c);
  const mes = await c.reply("_Соединение с сайтом\\.\\.\\._", {
    parse_mode: "MarkdownV2",
  });
  const text = await sapi.getStatusMessage();
  await c.api.editMessageText(cid, mes.message_id, text, {
    parse_mode: "MarkdownV2",
  });
  await updateTimestamp(c, "status");
  log.debug(`sent status - ${cid}`);
});
bot.command("help", async (c: Context) => {
  const user = await fetchUser(c);
  await c.reply(`/settings - команда для настройки бота. Например, с помощью кнопки "источник расписания" можно выбрать источник по умолчанию для команды /schedule\n
/schedule - посмотреть ваше расписание, установленное в настройках\n
/scheduleby - посмотреть любое расписание, для этого вызовите команду и выберите нужный источник, это не сохранится в настройках\n
/status - проверить статус работы сайта с расписанием: код статуса и время ответа сервера\n
/help - посмотреть помощь по боту`);
});
bot.command("settings", async (c: Context) => {
  const user = await fetchUser(c);
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
    sets = (await db.userGet(cid))?.settings;
  await c.answerCallbackQuery();
  let verbose: boolean = sets?.verbose;
  if (param !== "") {
    verbose = param === "enable";
    await db.userUpdateSettings(cid, {
      ...sets,
      verbose: param === "enable",
    });
  }
  await c.api.editMessageText(cid, mid, text, {
    reply_markup: verbose ? kbs["debug_enabled"] : kbs["debug_disabled"],
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
    sets = (await db.userGet(cid))?.settings,
    will_send_schedule = !Boolean(sets?.source);
  await c.answerCallbackQuery();
  let status = "",
    [, source_type = "", source = ""] = param.match(/(\w+)\.(.+)$/) ?? [];
  source_type = { g: "group", l: "lecturer", r: "room" }[source_type] ?? "";
  if (source_type && source) {
    await db.userUpdateSettings(cid, {
      ...sets,
      source_type: source_type,
      source: source,
    });
    status = "*Источник расписания изменён\\!*";
    if (will_send_schedule)
      await botSendSchedule(c, source_type, source, sets?.verbose ?? false);
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
bot.callbackQuery(/^debug:breakbot:/, async (c) => {
  const cid = c.chatId ?? -1,
    mid = c.callbackQuery.message?.message_id ?? -1,
    param = c.callbackQuery.data.split(":")?.[2] ?? "";
  await c.answerCallbackQuery();
  await fetch("w_w");
});

/// DEBUG
bot.command("users", async (c: Context) => {
  const cid = c.chatId ?? -1;
  if (!appconfig.bot.admins.includes(`${cid}`)) return;
  const users = await db.userGetAll();
  log.debug(users);
});
bot.command("squery", async (c: Context) => {
  const cid = c.chatId ?? -1;
  if (!appconfig.bot.admins.includes(`${cid}`)) return;
  const query = c.message?.text?.replace("/squery", "").trim() ?? "";
  const r = (await db.db.query(query)).rows;
  if (r?.length ?? 0) console.log(r);
});
bot.command("breakbot", async (c: Context) => {
  const cid = c.chatId ?? -1;
  if (!appconfig.bot.admins.includes(`${cid}`)) return;
});
bot.command("breakmybutton", async (c: Context) => {
  const cid = c.chatId ?? -1;
  if (!appconfig.bot.admins.includes(`${cid}`)) return;
  await c.reply("ЛОМАЙ МЕНЯ ПОЛНОСТЬЮ", {
    reply_markup: {
      inline_keyboard: [[{ text: "ЖМИ!!!", callback_data: "debug:breakbot:" }]],
    },
  });
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
      await db.userDel(id, "blocked");
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
  console.log(cmd_message);

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
  const sets = (await db.userGet(cid))?.settings ?? [];
  if (sets?.verbose) {
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
      log.debug("400: message can't be modified");
    }
  } else {
    await c.reply(answer);
  }
});
run(bot);
