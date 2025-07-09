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

  /** イベント予定チャンネルID */
  schedule_channel_id: string;

  /** お知らせロールID */
  announcement_role_id: string;

  /** イベント参加済ロールのID */
  event_join_role_id: string;

  /** 最近イベントに参加したロールのID { ロールID = 必要回数 } */
  recent_event_join_role_ids: Record<string, number>;

  /** イベント操作チャンネル */
  event_panel_channel_id: string;

  /** イベント連絡チャンネル */
  event_contact_channel_id: string;

  /** 本日の主催者ロールID */
  host_role_id: string;

  /** 絵文字リスト */
  emojis: Record<string, string>;

  /** イベントバナー画像URL */
  event_banner_url?: string;

  /** 主催者お伺い管理チャンネルID */
  host_request_channel_id: string;

  /** イベント案チャンネルID（公募用） */
  host_request_proposal_channel_id: string;

  /** お伺いのタイムアウト時間（時間） */
  host_request_timeout_hours: number;

  /** 週何曜日にパネルを出すか (0=日曜) */
  host_request_schedule_day: number;

  /** 何時にパネルを出すか */
  host_request_schedule_time: string;

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
  config.announcement_role_id &&
    typeof config.announcement_role_id === 'string',
  'announcement_role_id is required and must be a string.',
);

assert(
  config.schedule_channel_id && typeof config.schedule_channel_id === 'string',
  'schedule_channel_id is required and must be a string.',
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

assert(
  config.event_panel_channel_id &&
    typeof config.event_panel_channel_id === 'string',
  'event_panel_channel_id is required and must be a string.',
);

assert(
  config.event_contact_channel_id &&
    typeof config.event_contact_channel_id === 'string',
  'event_contact_channel_id is required and must be a string.',
);

assert(
  config.host_role_id && typeof config.host_role_id === 'string',
  'host_role_id is required and must be a string.',
);

assert(
  config.emojis && typeof config.emojis === 'object',
  'emojis is required and must be an object.',
);

assert(
  config.host_request_channel_id &&
    typeof config.host_request_channel_id === 'string',
  'host_request_channel_id is required and must be a string.',
);

assert(
  config.host_request_proposal_channel_id &&
    typeof config.host_request_proposal_channel_id === 'string',
  'host_request_proposal_channel_id is required and must be a string.',
);

assert(
  typeof config.host_request_timeout_hours === 'number' &&
    config.host_request_timeout_hours > 0,
  'host_request_timeout_hours is required and must be a positive number.',
);

assert(
  typeof config.host_request_schedule_day === 'number' &&
    config.host_request_schedule_day >= 0 &&
    config.host_request_schedule_day <= 6,
  'host_request_schedule_day is required and must be a number between 0-6.',
);

assert(
  config.host_request_schedule_time &&
    typeof config.host_request_schedule_time === 'string' &&
    /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(config.host_request_schedule_time),
  'host_request_schedule_time is required and must be a valid time format (HH:MM).',
);
