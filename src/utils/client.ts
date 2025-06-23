import { Client, GatewayIntentBits } from 'discord.js';
import CommandHandler from '../commands/CommandHandler.js';
import commands from '../commands/commands.js';

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
