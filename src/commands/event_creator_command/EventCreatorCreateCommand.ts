import {
  ChannelType,
  ChatInputCommandInteraction,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import { onCreateScheduledEvent } from '../../event_handler.js';
import { parseSearch } from '../../event/searchParser.js';
import statusEventListCommand, {
  EventDetail,
} from '../status_command/StatusEventListCommand.js';
import eventManager from '../../event/EventManager.js';
import { Event } from '@prisma/client';
import { parseDate } from '../../event/periodParser.js';
import eventCreatorCommand from './EventCreatorCommand.js';
import userManager from '../../event/UserManager.js';

class EventCreatorCreateCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('create')
    .setDescription('過去のイベントを再利用してイベントを登録します')
    .addStringOption((option) =>
      option
        .setName('search')
        .setDescription('イベント名 or イベントID')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('date')
        .setDescription(
          '予定日 (「月曜」のような指定も可。21時以外の時間を指定する場合は「01/23 19:00」のように指定)',
        )
        .setRequired(true),
    )
    .addUserOption((option) =>
      option.setName('host').setDescription('主催者').setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName('show')
        .setDescription(
          'コマンドの結果をチャットに表示しますか？ (デフォルトは非公開)',
        )
        .setRequired(false),
    );

  async onCommand(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    // イベントを開始
    const show = interaction.options.getBoolean('show') ?? false;
    await interaction.deferReply({ ephemeral: !show });

    // 検索条件
    const search = interaction.options.getString('search');
    const eventId = Number(search);
    let event: Event | undefined;
    if (!isNaN(eventId)) {
      // イベントIDからイベントを取得
      event = (await eventManager.getEventFromId(eventId)) ?? undefined;
    } else {
      // 検索してイベントを取得
      const nameCondition = parseSearch(search ?? undefined);
      const events: EventDetail[] = await statusEventListCommand.getEvents(
        {
          active: GuildScheduledEventStatus.Completed,
          ...nameCondition,
        },
        'startTime',
      );
      event = events[events.length - 1];
    }
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // 予定日時を取得
    const dateText = interaction.options.getString('date');
    if (!dateText) {
      await interaction.editReply({
        content: '予定日時を指定してください',
      });
      return;
    }
    // 日付を解析
    const date = parseDate(dateText);

    // 主催者を取得
    const hostDiscordMember = interaction.options.getMember('host');
    const host = hostDiscordMember
      ? await userManager.getOrCreateUser(hostDiscordMember)
      : undefined;
    if (!host) {
      await interaction.editReply({
        content: '主催者を指定してください',
      });
      return;
    }

    // チャンネルを取得
    const channel = await interaction.guild?.channels
      .fetch(event.channelId)
      .catch(() => undefined);
    if (!channel?.isVoiceBased()) {
      await interaction.editReply({
        content: 'VCチャンネルが見つかりませんでした',
      });
      return;
    }

    // 説明文を作成
    // 最後の行に「主催」という文字があれば削除
    const lines = (event.description ?? '').split('\n');
    if (lines[lines.length - 1].includes('主催')) {
      lines.pop();
    }
    // 主催者の文言を追加
    lines.push(`${userManager.getUserName(host)} さんが主催してくれます～`);
    const description = lines.join('\n');

    // Discordイベントを作成
    const createdScheduledEvent =
      await interaction.guild?.scheduledEvents.create({
        name: event.name,
        description,
        scheduledStartTime: date,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType:
          channel.type === ChannelType.GuildStageVoice
            ? GuildScheduledEventEntityType.StageInstance
            : GuildScheduledEventEntityType.Voice,
        channel,
        image: event.coverImage,
        reason: 'イベントを再利用して作成',
      });
    if (!createdScheduledEvent) {
      await interaction.editReply({
        content: 'Discord上でのイベントの作成に失敗しました',
      });
      return;
    }

    // イベントを作成
    const createdEvent = await onCreateScheduledEvent(
      createdScheduledEvent,
      host,
    );
    if (!createdEvent) {
      await interaction.editReply({
        content: 'イベントBOT上のイベントの作成に失敗しました',
      });
      return;
    }

    // メッセージを送信
    await interaction.editReply({
      content: `イベント「${createdEvent.name}」(ID: ${createdEvent.id})を作成しました (イベントID: ${event.id} を再利用)\n${createdScheduledEvent.url}`,
    });
  }
}

export default new EventCreatorCreateCommand(eventCreatorCommand);
