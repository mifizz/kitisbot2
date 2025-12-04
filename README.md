# kitisbot2
---

## О боте
Это новая версия [бота расписания КИТиС](https://github.com/mifizz/kitis_schedule_bot), переписанная на Typescript. Эта версия использует асинхронные вызовы Telegram API, а также базу данных PostgreSQL вместо SQLite3.

## Установка
**ВНИМАНИЕ**: *Данный гайд предназначен для установки бота на сервер Ubuntu, в моём случае Ubuntu 24.04.*

Для начала нужно установить пакет **postgres**, для этого используйте:
```bash
sudo apt-get install postgres -y
```
Проверьте статус работы postgres через команду:
```bash
systemctl status postgres
```

После этого нужно установить **bun** (это javascript runtime):
```bash
sudo apt-get install unzip -y
curl -fsSL https://bun.sh/install | bash
```
После этого перезапустите терминал для обновления PATH.

Дальше склонируйте этот репозиторий в нужную директорию:
```bash
git clone https://github.com/mifizz/kitisbot2
cd kitisbot2
```

Нужно создать пользователя postgres и базу, для этого:
```bash
sudo -u postgres psql -f setup.sql
```

Установите пакеты bun:
```bash
bun install
```

Создайте **.env** файл и запишите туда токен бота, предварительно создав его в [BotFather](https://t.me/BotFather):
```.env
TOKEN="ВАШ_ТОКЕН"
```

Наконец, запустите бота:
```bash
bun run bot.ts
```

После первого запуска создастся файл **config.json**, в нём желательно установить Telegram id админов бота (*bot -> admins*), например `["1234567890"]`, а также по желанию включить цветной логгинг (*logger -> use_colors ->* `true`).

В настройках бота (BotFather) можно установить команды:
```
schedule - ваше расписание
scheduleby - чужое расписание
settings - настройки бота
status - статус сайта
help - помощь по боту
```

Для постоянной работы бота можно создать сервис, но с этим, я думаю, сами разберётесь))

## Планы
- [ ] Webhook
- [ ] Страницы в выборе источника расписания
- [ ] Перенос учёта занятий с сайта ([пример](https://mifizz.pw/kitis/testdump/vg102.htm))
- [ ] Настройка полей сообщения с расписанием (и учётом занятий)
- [ ] Кэширование данных для случаев, когда сайт недоступен
- [ ] ...

## Ссылки
- [Телеграм-бот](https://t.me/kitis_schedule_bot)
- [Чат в телеграме](https://t.me/+xQHZL9P1VGYyOTdi)