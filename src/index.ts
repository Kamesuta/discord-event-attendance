// 必要なパッケージをインポートする
import { Client, Events, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';

import { logger } from './utils/log.js';
import { config } from './utils/config.js';
import { sleep } from './utils/utils.js';

// .envファイルを読み込む
dotenv.config();

/**
 * Discord Client
 */
export const client: Client = new Client({
  // Botで使うGetwayIntents、partials
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// -----------------------------------------------------------------------------------------------------------
// イベントハンドラーを登録する
// -----------------------------------------------------------------------------------------------------------
client.on(Events.ClientReady, () => {
  logger.info(`${client.user?.username ?? 'Unknown'} として起動しました!`);
});

// Discordにログインする
await client.login(process.env.DISCORD_TOKEN);
