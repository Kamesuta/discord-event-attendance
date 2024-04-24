// 必要なパッケージをインポートする
import { Client, Events, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';

import { logger } from './utils/log.js';
import { config } from './utils/config.js';
import { sleep } from './utils/utils.js';
import { PrismaClient } from '@prisma/client';
import { onVoiceStateUpdate } from './voice_handler.js';
import { onGuildScheduledEventUpdate } from './event_handler.js';

// .envファイルを読み込む
dotenv.config();

/**
 * データベースのインスタンス
 */
export const prisma = new PrismaClient();

/**
 * Discord Client
 */
export const client: Client = new Client({
  // Botで使うGetwayIntents、partials
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildScheduledEvents,
  ],
});

// -----------------------------------------------------------------------------------------------------------
// イベントハンドラーを登録する
// -----------------------------------------------------------------------------------------------------------
client.on(Events.ClientReady, () => {
  logger.info(`${client.user?.username ?? 'Unknown'} として起動しました!`);
});
client.on(Events.VoiceStateUpdate, onVoiceStateUpdate);
client.on(Events.GuildScheduledEventUpdate, onGuildScheduledEventUpdate);

// Discordにログインする
await client.login(process.env.DISCORD_TOKEN);
