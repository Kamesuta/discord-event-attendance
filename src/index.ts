// 必要なパッケージをインポートする
import { Events } from 'discord.js';
import 'dotenv/config';

import { logger } from './utils/log.js';
import { prisma } from './utils/prisma.js';
import { client, commandHandler } from './utils/client.js';
import { onVoiceStateUpdate } from './voice_handler.js';
import {
  onGuildScheduledEventCreate,
  onGuildScheduledEventDelete,
  onGuildScheduledEventUpdate,
  updateSchedules,
} from './event_handler.js';
import { nowait } from './utils/utils.js';
import { onMessageCreate } from './message_handler.js';
import { fileURLToPath } from 'url';

export { prisma, client, commandHandler };

// サーバー起動
const _filename = fileURLToPath(import.meta.url);
if (process.argv[1] === _filename) {
  // -----------------------------------------------------------------------------------------------------------
  // イベントハンドラーを登録する
  // -----------------------------------------------------------------------------------------------------------
  client.on(
    Events.ClientReady,
    nowait(async () => {
      logger.info(`${client.user?.username ?? 'Unknown'} として起動しました!`);

      // イベント管理者用のコマンドを登録
      await commandHandler.registerCommands();

      // イベントスケジュール更新
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
