import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ChatInputCommandInteraction,
  GuildScheduledEvent,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventManager from '../../event/EventManager.js';
import { onUpdateScheduledEvent } from '../../event_handler.js';
import { prisma } from '../../index.js';
import panelStartButtonAction from '../action/event_panel_command/PanelStartButtonAction.js';
import panelReviewButtonAction from '../action/event_panel_command/PanelReviewButtonAction.js';
import panelStopConfirmButtonAction from '../action/event_panel_command/PanelStopConfirmButtonAction.js';
import { config } from '../../utils/config.js';
import { Event } from '@prisma/client';
import eventOpCommand from './EventOpCommand.js';

class EventOpPanelCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('panel')
    .setDescription('イベントを作成するパネルを表示します')
    .addStringOption((option) =>
      option
        .setName('discord_event_id')
        .setDescription('DiscordイベントID')
        .setRequired(true),
    )
    .addUserOption((option) =>
      option.setName('host_user').setDescription('主催者').setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName('show')
        .setDescription(
          'コマンドの結果をチャットに表示しますか？ (デフォルトは公開)',
        )
        .setRequired(false),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントを開始
    const show = interaction.options.getBoolean('show') ?? true;
    await interaction.deferReply({ ephemeral: !show });

    // DiscordイベントIDからイベントを取得
    const discordEventId = interaction.options.getString('discord_event_id');
    if (!discordEventId) {
      await interaction.editReply({
        content: 'DiscordイベントIDを指定してください',
      });
      return;
    }
    let event = await eventManager.getEventFromDiscordId(discordEventId);
    const scheduledEvent = await eventManager.getScheduleEvent(
      interaction,
      event,
    );
    if (!event || !scheduledEvent) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }
    await onUpdateScheduledEvent(scheduledEvent);

    // ホストユーザーを取得
    const hostUser = interaction.options.getUser('host_user');
    if (hostUser) {
      // イベントのホストを更新
      event = await prisma.event.update({
        where: {
          id: event.id,
        },
        data: {
          hostId: hostUser.id,
        },
      });
    }

    // パネルを表示
    await interaction.editReply(this.createPanel(scheduledEvent, event));
  }

  /**
   * パネルを作成
   * @param scheduledEvent Discordイベント
   * @param event イベント
   * @returns 作成したメッセージ
   */
  createPanel(
    scheduledEvent: GuildScheduledEvent,
    event: Event,
  ): BaseMessageOptions {
    // 日付を取得
    const date = scheduledEvent.scheduledStartAt;
    const dateStr = date
      ? `<t:${Math.floor(date.getTime() / 1000)}:D>`
      : '未定';

    // パネルを表示
    // <@～> 1/2(月) はイベント「～」(ID: ◯)の開催日です。\n開始時間になったら「開始」ボタンを押して始めてください～
    return {
      content: `<@${event.hostId}> ${dateStr} は [イベント「${event.name}」(ID: ${event.id})](https://discord.com/events/${config.guild_id}/${event.eventId}) の開催日です。\n開始時間になったら「イベント開始」ボタンを押して始めてください～\nイベントを行うVC: <#${event.channelId}> (違っていたら始める前に教えて下さい)`,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          panelStartButtonAction.create(event.id),
          panelReviewButtonAction.create(event.id),
          panelStopConfirmButtonAction.create(event.id),
        ),
      ],
    };
  }
}

export default new EventOpPanelCommand(eventOpCommand);
