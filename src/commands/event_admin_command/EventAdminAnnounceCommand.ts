import {
  ChatInputCommandInteraction,
  Message,
  RepliableInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventAdminCommand from './EventAdminCommand.js';
import { config } from '../../utils/config.js';
import { Event } from '@prisma/client';
import showEvent from '../../event/showEvent.js';
import eventManager from '../../event/EventManager.js';

class EventAdminAnnounceCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('announce')
    .setDescription('イベントをアナウンスチャンネルで告知します');

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントを開始
    await interaction.deferReply({ ephemeral: true });
    const event = await eventManager.getEvent(interaction);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // イベントをアナウンス
    const message = await this.showAnnounceMessage(interaction, event);

    // 返信
    await interaction.editReply({
      content: `イベントをアナウンスしました: ${message?.url ?? '不明'}`,
    });
  }

  /**
   * イベントをアナウンスします
   * @param interaction インタラクション
   * @param event イベント
   * @returns 送信したメッセージ
   */
  async showAnnounceMessage(
    interaction: RepliableInteraction,
    event: Event,
  ): Promise<Message | undefined> {
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

    // VC名を取得
    const vc = await interaction.guild?.channels.fetch(event.channelId);
    const vcName = vc?.name ?? '不明';

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

    return message;
  }
}

export default new EventAdminAnnounceCommand(eventAdminCommand);
