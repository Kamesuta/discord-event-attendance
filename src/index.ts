// 必要なパッケージをインポートする
import { Client, Events, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';

import { logger } from './utils/log.js';
import { PrismaClient } from '@prisma/client';
import { onVoiceStateUpdate } from './voice_handler.js';
import {
  onGuildScheduledEventCreate,
  onGuildScheduledEventUpdate,
} from './event_handler.js';
import CommandHandler from './commands/CommandHandler.js';
import { nowait } from './utils/utils.js';
import commands from './commands/commands.js';

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

/**
 * コマンドハンドラー
 */
const commandHandler = new CommandHandler(commands);

// -----------------------------------------------------------------------------------------------------------
// イベントハンドラーを登録する
// -----------------------------------------------------------------------------------------------------------
client.on(
  Events.ClientReady,
  nowait(async () => {
    logger.info(`${client.user?.username ?? 'Unknown'} として起動しました!`);

    // イベント管理者用のコマンドを登録
    await commandHandler.registerCommands();

    logger.info(`インタラクションの登録が完了しました`);
  }),
);
client.on(Events.VoiceStateUpdate, nowait(onVoiceStateUpdate));
client.on(
  Events.GuildScheduledEventCreate,
  nowait(onGuildScheduledEventCreate),
);
client.on(
  Events.GuildScheduledEventUpdate,
  nowait(onGuildScheduledEventUpdate),
);
client.on(
  Events.InteractionCreate,
  nowait(commandHandler.onInteractionCreate.bind(commandHandler)),
);

// Discordにログインする
await client.login(process.env.DISCORD_TOKEN);
