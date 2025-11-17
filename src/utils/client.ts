import { Client, GatewayIntentBits } from 'discord.js';
import { CommandHandler } from '../commands/CommandHandler.js';
import { commands } from '../commands/commands.js';
import { messageUpdaters } from '../message_updaters/messageUpdaters.js';
import { MessageUpdateManager } from '../message_updaters/MessageUpdateManager.js';

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
export const commandHandler = new CommandHandler(commands);

/**
 * メッセージ更新マネージャー
 */
export const messageUpdateManager = new MessageUpdateManager(messageUpdaters);
