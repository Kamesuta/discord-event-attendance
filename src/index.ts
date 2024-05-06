// 必要なパッケージをインポートする
import { Client, Events, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';

import { logger } from './utils/log.js';
import { PrismaClient } from '@prisma/client';
import { onVoiceStateUpdate } from './voice_handler.js';
import { onGuildScheduledEventCreate, onGuildScheduledEventUpdate } from './event_handler.js';
import { onInteractionCreate, registerCommands } from './command_handler.js';

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
client.on(Events.ClientReady, async () => {
  logger.info(`${client.user?.username ?? 'Unknown'} として起動しました!`);

  // イベント管理者用のコマンドを登録
  await registerCommands();
});
client.on(Events.VoiceStateUpdate, onVoiceStateUpdate);
client.on(Events.GuildScheduledEventCreate, onGuildScheduledEventCreate);
client.on(Events.GuildScheduledEventUpdate, onGuildScheduledEventUpdate);
client.on(Events.InteractionCreate, onInteractionCreate);

// Discordにログインする
await client.login(process.env.DISCORD_TOKEN);
