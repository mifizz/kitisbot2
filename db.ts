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
  async _getRow(id: number | string, row: string) {
    const res = await this.db.query("SELECT $2 FROM users WHERE id = $1", [
      id,
      row,
    ]);
    return res.rows[0] ?? null;
  }
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
  async query(query: string) {
    try {
      const r = await this.db.query(query);
      return r.rows ?? null;
    } catch (err) {
      const e = err as Error;
      log.error(e.message);
      return null;
    }
  }
  async userAdd(id: number | string, username: string) {
    if (
      !(await this.db.query(`SELECT * FROM users WHERE id = $1`, [id])).rowCount
    ) {
      await this.db.query(
        `INSERT INTO users (id, username, stats) VALUES ($1, $2, $3)`,
        [id, username, JSON.stringify({ join: dayjs().toString() })],
      );
      // idk if it was added or just updated, log anyway, i am too lazy to solve it
      log.info(`add user: ${id} - '${username}'`);
    }
  }
  async userGet(id: number | string) {
    const res = await this.db.query("SELECT * FROM users WHERE id = $1", [id]);
    return (res.rows[0] as BotUser) ?? null;
  }
  // async userGetSettings(id: number) {
  //   return this._getRow(id, "settings") ?? {};
  // }
  // async userGetStats(id: number) {
  //   return this._getRow(id, "stats") ?? {};
  // }
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
    // log.debug(`updated stats: ${id} - '${JSON.stringify(stats)}'`);
  }
  async userDel(id: number | string, reason: string = "") {
    await this.db.query("DELETE FROM users WHERE id = $1", [id]);
    log.info(`deleted user: ${id}${reason ? ". Reason: " + reason : ""}`);
  }
}
