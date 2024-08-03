import assert from 'assert';
import { parse } from 'toml';
import { getWorkdirPath } from './workdir.js';
import { copyFileSync, existsSync, readFileSync } from 'fs';

/**
 * Structure of the configuration file
 */
export interface Config {
  /*
   * Configuration names should be written in snake_case. Therefore, we are disabling eslint naming rules here.
   * The 'requiresQuotes' rule is disabled here because it only excludes strings (including those with spaces) that need to be enclosed in quotes.
   */
  /* eslint-disable @typescript-eslint/naming-convention */

  /** 必要接続分数 */
  required_time: number;

  /** サーバーID */
  guild_id: string;

  /** お知らせチャンネルID */
  announcement_channel_id: string;

  /** お知らせメッセージ */
  announcement_message: string;

  /** お知らせ招待リンクメッセージ */
  announcement_invite_link_message: string;

  /** イベント参加済ロールのID */
  event_join_role_id: string;

  /** 最近イベントに参加したロールのID { ロールID = 必要回数 } */
  recent_event_join_role_ids: Record<string, number>;

  /* eslint-enable @typescript-eslint/naming-convention */
}

// If config.toml does not exist, copy config.default.toml
if (!existsSync(getWorkdirPath('config.toml'))) {
  copyFileSync(
    getWorkdirPath('config.default.toml'),
    getWorkdirPath('config.toml'),
  );
}

/** Configuration */
export const config: Config = parse(
  readFileSync(getWorkdirPath('config.toml'), 'utf-8'),
) as Config;

// Check the types
assert(
  typeof config.required_time === 'number',
  'required_time is required and must be a number.',
);

assert(
  config.guild_id && typeof config.guild_id === 'string',
  'guild_id is required and must be a string.',
);

assert(
  config.announcement_channel_id &&
    typeof config.announcement_channel_id === 'string',
  'announcement_channel_id is required and must be a string.',
);

assert(
  config.announcement_message &&
    typeof config.announcement_message === 'string',
  'announcement_message is required and must be a string.',
);

assert(
  config.announcement_invite_link_message &&
    typeof config.announcement_invite_link_message === 'string',
  'announcement_invite_link_message is required and must be a string.',
);

assert(
  config.event_join_role_id && typeof config.event_join_role_id === 'string',
  'event_join_role_id is required and must be a string.',
);

assert(
  config.recent_event_join_role_ids &&
    typeof config.recent_event_join_role_ids === 'object',
  'recent_event_join_role_id is required and must be an object.',
);
