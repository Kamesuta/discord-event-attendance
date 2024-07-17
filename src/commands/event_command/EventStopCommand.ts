import {
  ChatInputCommandInteraction,
  GuildScheduledEventStatus,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventCommand from './EventCommand.js';
import eventManager from '../../event/EventManager.js';
import { config } from '../../utils/config.js';
import { logger } from '../../utils/log.js';
import updateEventMessageMenu from '../contextmenu/UpdateEventMessageMenu.js';
import getWebhook from '../../event/getWebhook.js';
import { endEvent } from '../../event_handler.js';

class EventStopCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('stop')
    .setDescription('イベントを終了します');

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントを開始
    await interaction.deferReply({ ephemeral: true });

    // アナウンスチャンネルを取得
    const announcementChannel = interaction.guild?.channels.cache.get(
      config.announcement_channel_id,
    );
    if (!announcementChannel || !announcementChannel.isTextBased()) {
      await interaction.editReply({
        content: 'アナウンスチャンネルが見つかりませんでした',
      });
      return;
    }

    // 最新のイベントを取得
    const event = await eventManager.getEvent(interaction);
    const scheduledEvent = await eventManager.getScheduleEvent(
      interaction,
      event,
    );
    if (!scheduledEvent || !event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // ログに残す
    logger.info(
      `${interaction.user.username} が /event stop コマンドを打ってイベント「${event.name}」(ID: ${event.id})を終了しました`,
    );

    // イベントを終了
    try {
      await scheduledEvent.edit({
        status: GuildScheduledEventStatus.Completed,
      });
    } catch (_) {
      // イベントの状態を変更できなかった場合、イベントを終了する
      await endEvent(scheduledEvent);
    }

    // Webhookを取得
    const webhook = await getWebhook(interaction, announcementChannel);
    if (!webhook) {
      await interaction.editReply({
        content: 'Webhookの取得に失敗しました',
      });
      return;
    }

    // アナウンスチャンネルの最新10件のメッセージを取得
    const messages = await announcementChannel.messages.fetch({ limit: 10 });
    // Webhook経由でメッセージを取得し直す (MessageContent Intentsがないときは自身のメッセージしか取得できないため)
    const fetchedMessages = await Promise.all(
      messages
        .filter((m) => m.webhookId === webhook.webhook.id)
        .map((m) => webhook.webhook.fetchMessage(m.id)),
    );

    // イベントのメッセージを取得
    const message = fetchedMessages.find((m) => {
      try {
        // メッセージをパースしてイベントIDを取得
        const scheduledEventId =
          updateEventMessageMenu.parseScheduledEventId(m);
        return scheduledEventId === scheduledEvent.id;
      } catch (_) {
        return false;
      }
    });
    // イベントのメッセージが見つかった場合、メッセージを更新
    if (message) {
      await updateEventMessageMenu.updateMessage(interaction, message);
    }

    await interaction.editReply({
      content: `イベント「${event.name}」(ID: ${event.id})を終了しました`,
    });
  }
}

export default new EventStopCommand(eventCommand);
