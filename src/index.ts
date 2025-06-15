// 必要なパッケージをインポートする
import { Client, Events, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';

import { logger } from './utils/log.js';
import { databaseManager } from './database/DatabaseManager.js';
import { eventManager } from './managers/EventManager.js';
import { userManager } from './managers/UserManager.js';
import { onVoiceStateUpdate } from './voice_handler.js';
import {
  onGuildScheduledEventCreate,
  onGuildScheduledEventDelete,
  onGuildScheduledEventUpdate,
  updateSchedules,
} from './event_handler.js';
import CommandHandler from './commands/CommandHandler.js';
import { nowait } from './utils/utils.js';
import commands from './commands/commands.js';
import { onMessageCreate } from './message_handler.js';

/**
 * データベースのインスタンス（後方互換性のため）
 * @deprecated 新しいコードではdatabaseManager.getClient()を使用してください
 */
export const prisma = databaseManager.getClient();

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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

/**
 * コマンドハンドラー
 */
const commandHandler = new CommandHandler(commands);

/**
 * アプリケーションの初期化
 */
async function initializeApplication(): Promise<void> {
  try {
    logger.info('アプリケーションを初期化中...');

    // データベース接続
    await databaseManager.connect();
    
    // マネージャーの初期化
    await eventManager.initialize();
    await userManager.initialize();

    logger.info('アプリケーションの初期化が完了しました');
  } catch (error) {
    logger.error('アプリケーションの初期化に失敗しました:', error);
    throw error;
  }
}

/**
 * アプリケーションのクリーンアップ
 */
async function cleanupApplication(): Promise<void> {
  try {
    logger.info('アプリケーションをクリーンアップ中...');

    // マネージャーのクリーンアップ
    await eventManager.cleanup();
    await userManager.cleanup();

    // データベース接続の切断
    await databaseManager.disconnect();

    logger.info('アプリケーションのクリーンアップが完了しました');
  } catch (error) {
    logger.error('アプリケーションのクリーンアップに失敗しました:', error);
  }
}

/**
 * プロセス終了時のハンドリング
 */
process.on('SIGINT', async () => {
  logger.info('SIGINT を受信しました。アプリケーションを終了中...');
  await cleanupApplication();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM を受信しました。アプリケーションを終了中...');
  await cleanupApplication();
  process.exit(0);
});

process.on('uncaughtException', async (error) => {
  logger.error('未処理の例外:', error);
  await cleanupApplication();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  logger.error('未処理のPromise拒否:', { reason, promise });
  await cleanupApplication();
  process.exit(1);
});

// -----------------------------------------------------------------------------------------------------------
// イベントハンドラーを登録する
// -----------------------------------------------------------------------------------------------------------
client.on(
  Events.ClientReady,
  nowait(async () => {
    logger.info(`${client.user?.username ?? 'Unknown'} として起動しました!`);

    // アプリケーションの初期化
    await initializeApplication();

    // イベント管理者用のコマンドを登録
    await commandHandler.registerCommands();

    // イベントスケジュール更新
    await updateSchedules();

    logger.info('Bot の起動が完了しました');
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
  Events.GuildScheduledEventDelete,
  nowait(onGuildScheduledEventDelete),
);
client.on(Events.MessageCreate, nowait(onMessageCreate));
client.on(
  Events.InteractionCreate,
  nowait(commandHandler.onInteractionCreate.bind(commandHandler)),
);

// Discordにログインする
await client.login(process.env.DISCORD_TOKEN);
