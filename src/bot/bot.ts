import { Events } from 'discord.js';
import 'dotenv/config';
import { logger } from '../utils/log.js';
import { client, commandHandler } from './client.js';
import { onVoiceStateUpdate } from '../handlers/voiceHandler.js';
import {
  onGuildScheduledEventCreate,
  onGuildScheduledEventDelete,
  onGuildScheduledEventUpdate,
  updateSchedules,
} from '../handlers/eventHandler.js';
import { nowait } from '../utils/utils.js';
import { onMessageCreate } from '../handlers/messageHandler.js';
import { fileURLToPath } from 'url';

/**
 * Discord Botの起動関数
 */
export async function main(): Promise<void> {
  // イベントハンドラーを登録する
  client.on(
    Events.ClientReady,
    nowait(async () => {
      logger.info(`${client.user?.username ?? 'Unknown'} として起動しました!`);
      await commandHandler.registerCommands();
      await updateSchedules();
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
}

// 直接起動された場合のみmain()を実行
const _filename = fileURLToPath(import.meta.url);
if (process.argv[1] === _filename) {
  main().catch((error) => {
    logger.error('Failed to start Discord Bot:', error);
    process.exit(1);
  });
}

export { main as startBot };
