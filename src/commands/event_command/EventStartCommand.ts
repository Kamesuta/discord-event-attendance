import {
  ChatInputCommandInteraction,
  GuildScheduledEventStatus,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventCommand from './EventCommand.js';
import eventManager from '../../event/EventManager.js';
import showEvent from '../../event/showEvent.js';
import { config } from '../../utils/config.js';

class EventStartCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('start')
    .setDescription('イベントを開始します');

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

    // まだ始まっていない最新のイベントを取得
    const event = await eventManager.getEvent(interaction, false);
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
    // イベントを開始
    await scheduledEvent.edit({
      status: GuildScheduledEventStatus.Active,
    });

    // VC名を取得
    const vcName = scheduledEvent.channel?.name ?? '不明';

    // アナウンスチャンネルでイベントを表示
    const message = await showEvent(
      interaction,
      event,
      announcementChannel,
      config.announcement_message
        .replace('{event}', event.name)
        .replace('{vc}', vcName),
      config.announcement_invite_link_message
        .replace('{event}', event.name)
        .replace('{vc}', vcName),
    );
    // メッセージを公開
    await message?.crosspost();

    await interaction.editReply({
      content: `イベント「${event.name}」(ID: ${event.id})を開始しました`,
    });
  }
}

export default new EventStartCommand(eventCommand);
