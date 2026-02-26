import { Client } from "pg";
import { appconfig } from "./config";
import { log } from "./logger";

interface User {
  id: string;
  username: string;
}
interface UserSettings {
  id: number;
  source_type: string;
  source: string;
  show_errors: boolean;
  favorites: string[];
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
      create table if not exists users (
        id bigint primary key,
        username text,
        joined timestamp default now()
      );
      create table if not exists settings (
        id bigint primary key,
        source_type text,
        source text,
        show_errors boolean default false,
        favorites text
      );`);
  }
  async userAdd(id: number | string, username: string) {
    if ((await this.db.query(`SELECT id FROM users WHERE id = ${id}`)).rowCount)
      return;
    await this.db.query(`
      INSERT INTO users (id, username) VALUES (${id}, '${username}');
      INSERT INTO settings (id) VALUES (${id});
      `);
    log.info(`added user: ${id} - '${username}'`);
  }
  async userGet(id: number | string) {
    const res = await this.db.query(`SELECT * FROM users WHERE id = ${id}`);
    return (res.rows[0] as User) ?? null;
  }
  async userGetSettings(id: number | string) {
    const res = await this.db.query(`SELECT * FROM settings WHERE id = ${id}`);
    return (res.rows[0] as UserSettings) ?? null;
  }
  async userGetAll() {
    const res = await this.db.query("SELECT id FROM users");
    return (res.rows as User[]) ?? null;
  }
  async userUpdateSource(
    id: number | string,
    source_type: string,
    source: string,
  ) {
    return (
      await this.db.query(
        `UPDATE settings SET source_type = '${source_type}', source = '${source}' WHERE id = ${id}`,
      )
    ).rows[0];
  }
  async userUpdateShowErrors(id: number | string, show_errors: boolean) {
    return (
      await this.db.query(
        `UPDATE settings SET show_errors = ${show_errors} WHERE id = ${id}`,
      )
    ).rows[0];
  }

  async userDelete(id: number | string) {
    await this.db.query(`
      DELETE FROM users WHERE id = ${id};
      DELETE FROM settings WHERE id = ${id}
      `);
    log.info(`deleted user: ${id}`);
  }
}
