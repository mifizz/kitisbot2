import { Client } from "pg";
import dayjs from "dayjs";
import { appconfig } from "./config";
import { log } from "./logger";

interface BotUser {
  id: string;
  username: string;
  settings: Record<string, any>;
  stats: Record<string, any>;
}

export class ScheduleDatabase {
  constructor(
    public db = new Client({
      host: appconfig.db.host,
      user: appconfig.db.user,
      password: appconfig.db.password,
      database: appconfig.db.database,
    }),
  ) {}
  async connect() {
    await this.db.connect();
    await this.db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT,
      settings JSONB NOT NULL DEFAULT '{}',
      stats JSONB NOT NULL DEFAULT '{}'
    )`);
  }
  async userAdd(id: number | string, username: string) {
    if (
      (await this.db.query("SELECT * FROM users WHERE id = $1", [id])).rowCount
    )
      return;
    await this.db.query(
      `INSERT INTO users (id, username, stats) VALUES ($1, $2, $3)`,
      [id, username, JSON.stringify({ join: dayjs().toString() })],
    );
    log.info(`add user: ${id} - '${username}'`);
  }
  async userGet(id: number | string) {
    const res = await this.db.query("SELECT * FROM users WHERE id = $1", [id]);
    return (res.rows[0] as BotUser) ?? null;
  }
  async userGetAll() {
    const res = await this.db.query("SELECT * FROM users");
    return (res.rows as BotUser[]) ?? null;
  }
  async userUpdateSettings(id: number | string, settings: Record<string, any>) {
    await this.db.query("UPDATE users SET settings = $2 WHERE id = $1", [
      id,
      JSON.stringify(settings),
    ]);
    log.debug(`updated settings: ${id} - '${JSON.stringify(settings)}'`);
  }
  async userUpdateStats(id: number | string, stats: Record<string, any>) {
    await this.db.query("UPDATE users SET stats = $2 WHERE id = $1", [
      id,
      JSON.stringify(stats),
    ]);
  }
  async userDel(id: number | string, reason: string = "") {
    await this.db.query("DELETE FROM users WHERE id = $1", [id]);
    log.info(`deleted user: ${id}${reason ? ". Reason: " + reason : ""}`);
  }
}
