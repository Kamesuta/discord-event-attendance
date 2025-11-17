import {
  ChannelType,
  ChatInputCommandInteraction,
  DiscordAPIError,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import { onCreateScheduledEvent } from '../../handlers/event_handler.js';
import { parseSearch } from '../../utils/parsers/searchParser.js';
import {
  statusEventListCommand,
  EventDetail,
} from '../status_command/StatusEventListCommand.js';
import { eventManager } from '../../domain/services/EventManager.js';
import { EventWithHost } from '../../domain/queries/eventQueries.js';
import { parseDate } from '../../utils/parsers/periodParser.js';
import { eventCreatorCommand } from './EventCreatorCommand.js';
import { userManager } from '../../domain/services/UserManager.js';

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
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription(
          'イベントのチャンネル (省略時はコピー元のチャンネルを使用)',
        )
        .setRequired(false),
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
    let event: EventWithHost | undefined;
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

    // チャンネルを取得 (オプションで指定されている場合はそれを使用、なければコピー元から取得)
    const channelOption = interaction.options.getChannel('channel');
    const channel = channelOption
      ? channelOption
      : await interaction.guild?.channels
          .fetch(event.channelId)
          .catch(() => undefined);

    // チャンネル種類による分岐処理
    let entityType: GuildScheduledEventEntityType;
    let entityMetadata: { location?: string } | undefined;

    if (!channel) {
      await interaction.editReply({
        content: 'チャンネルが見つかりませんでした',
      });
      return;
    }

    if (channel.isVoiceBased()) {
      // VCチャンネル or ステージチャンネル
      if (channel.type === ChannelType.GuildStageVoice) {
        entityType = GuildScheduledEventEntityType.StageInstance;
      } else {
        entityType = GuildScheduledEventEntityType.Voice;
      }
    } else if (channel.isTextBased()) {
      // テキストチャンネル: External イベントとして作成
      entityType = GuildScheduledEventEntityType.External;
      entityMetadata = { location: channel.name };
    } else {
      await interaction.editReply({
        content: '対応していないチャンネルタイプです',
      });
      return;
    }

    // Discordイベントを作成
    const createdScheduledEvent = await interaction.guild?.scheduledEvents
      .create({
        name: event.name,
        description: eventManager.formatEventDescription(
          event.description,
          event,
        ),
        scheduledStartTime: date,
        scheduledEndTime:
          entityType === GuildScheduledEventEntityType.External
            ? new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000) // 外部イベントは終了時刻が必須なので1週間後に設定
            : undefined,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType,
        channel: channel.isVoiceBased() ? channel : undefined,
        entityMetadata,
        image: event.coverImage,
        reason: 'イベントを再利用して作成',
      })
      .catch(async (error: DiscordAPIError) => {
        if (error.code === 50035) {
          // Invalid Form Body
          await interaction.editReply({
            content:
              '過去の日付を指定することはできません。未来の日付を指定してください。',
          });
        } else {
          await interaction.editReply({
            content: 'Discord上でのイベントの作成に失敗しました',
          });
        }
        return undefined;
      });
    if (!createdScheduledEvent) {
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

/**
 * EventCreatorCreateCommandのインスタンス
 */
export const eventCreatorCreateCommand = new EventCreatorCreateCommand(
  eventCreatorCommand,
);
