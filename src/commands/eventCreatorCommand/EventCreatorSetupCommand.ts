import {
  ActionRowBuilder,
  ButtonBuilder,
  ChatInputCommandInteraction,
  Collection,
  EmbedBuilder,
  GuildScheduledEvent,
  GuildScheduledEventStatus,
  InteractionEditReplyOptions,
  RepliableInteraction,
  SlashCommandSubcommandBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '@/commands/base/commandBase';
import { config } from '@/bot/config';
import { setupUserSelectAction } from '@/commands/action/eventSetupCommand/SetupUserSelectAction';
import { setupPreparerSelectAction } from '@/commands/action/eventSetupCommand/SetupPreparerSelectAction';
import { setupEventSelectAction } from '@/commands/action/eventSetupCommand/SetupEventSelectAction';
import { prisma } from '@/utils/prisma';
import { eventCreatorCommand } from './EventCreatorCommand';
import { eventIncludeHost, EventWithHost } from '@/domain/queries/eventQueries';
import { setupTagEditAction } from '@/commands/action/eventSetupCommand/SetupTagEditAction';
import { setupTagConfirmAction } from '@/commands/action/eventSetupCommand/SetupTagConfirmAction';
import { tagService, TagSuggestion } from '@/domain/services/TagService';

/**
 * イベント情報
 */
export interface EventSpec {
  /**
   * Discordイベント
   */
  scheduledEvent: GuildScheduledEvent;
  /**
   * イベント
   */
  event?: EventWithHost;
}

/**
 * タグ編集状態
 */
export interface TagEditState {
  /**
   * DBに保存されているタグ
   */
  originalTags: string[];
  /**
   * 編集中のタグ
   */
  pendingTags: string[];
  /**
   * サジェスト済みのタグ候補
   */
  suggestions: TagSuggestion[];
}

/**
 * 設定中のデータ
 */
interface EditData {
  interaction: RepliableInteraction;
  selectedEvent: string;
  tagEdits?: Record<string, TagEditState>;
}

class EventCreatorSetupCommand extends SubcommandInteraction {
  setupPanels: Record<string, EditData> = {};
  scheduledEvents:
    | Collection<string, GuildScheduledEvent<GuildScheduledEventStatus>>
    | undefined;

  command = new SlashCommandSubcommandBuilder()
    .setName('setup')
    .setDescription('1週間分のイベントの主催者と準備者を設定します');

  /**
   * タグ編集状態を生成します
   * @param eventSpec イベント情報
   * @param existingState 既存の編集状態
   * @returns タグ編集状態
   */
  private async _buildTagEditState(
    eventSpec: EventSpec,
    existingState?: TagEditState,
  ): Promise<TagEditState> {
    if (existingState) return existingState;

    const currentTags = tagService.sanitizeTagNames(
      eventSpec.event?.tags?.map((tag) => tag.name) ?? [],
    );
    const suggestions = await tagService.suggestTags(
      eventSpec.event?.name ?? eventSpec.scheduledEvent.name,
      eventSpec.event?.description ?? eventSpec.scheduledEvent.description,
      currentTags,
    );
    const defaultPending =
      currentTags.length > 0
        ? currentTags
        : suggestions
            .filter((suggestion) => suggestion.preselect)
            .map((suggestion) => suggestion.name);
    return {
      originalTags: currentTags,
      pendingTags: defaultPending,
      suggestions,
    };
  }

  /**
   * タグ編集状態を取得します
   * @param editData 編集データ
   * @param eventSpec イベント情報
   * @returns タグ編集状態
   */
  private async _getTagEditState(
    editData: EditData,
    eventSpec: EventSpec,
  ): Promise<TagEditState> {
    const eventKey = eventSpec.scheduledEvent.id;
    if (!editData.tagEdits) {
      editData.tagEdits = {};
    }
    const existingState = editData.tagEdits[eventKey];
    const state = await this._buildTagEditState(eventSpec, existingState);
    editData.tagEdits[eventKey] = state;
    return state;
  }

  /**
   * タグ表示用の文字列を生成します
   * @param tagState タグ編集状態
   * @returns 表示用文字列
   */
  private _getTagDisplay(tagState?: TagEditState): string {
    const tags = tagService.sanitizeTagNames(tagState?.pendingTags ?? []);
    if (tags.length === 0) return 'タグ: なし';
    const hasPending = this._hasUnsavedTags(tagState);
    const suffix = hasPending ? ' (未確定)' : '';
    return `タグ: ${tags.map((tag) => `#${tag}`).join(' ')}${suffix}`;
  }

  /**
   * タグが未確定か確認します
   * @param tagState タグ編集状態
   * @returns 未確定かどうか
   */
  private _hasUnsavedTags(tagState?: TagEditState): boolean {
    if (!tagState) return false;
    const normalize = (tags: string[]): string =>
      tagService.sanitizeTagNames(tags).sort().join(' ');
    const original = normalize(tagState.originalTags);
    const pending = normalize(tagState.pendingTags);
    return original !== pending;
  }

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    // イベントを取得してキャッシュしておく。プルダウンメニューを選んだときなどは取得する代わりにキャッシュを使う
    this.scheduledEvents = await interaction.guild?.scheduledEvents.fetch();

    // パネルを作成
    const reply = await this.createSetupPanel(interaction);
    if (!reply) return;
    await interaction.editReply(reply);
  }

  /**
   * キーを取得
   * @param interaction インタラクション (ユーザー特定用)
   * @returns キー
   */
  key(interaction: RepliableInteraction): string {
    return new URLSearchParams({
      user: interaction.user.id,
      channel: `${interaction.channel?.id}`,
    }).toString();
  }

  /**
   * セットアップパネルを作成
   * @param interaction インタラクション
   * @returns 作成したパネル
   */
  async createSetupPanel(
    interaction: RepliableInteraction,
  ): Promise<InteractionEditReplyOptions | undefined> {
    const scheduledEvents = this.scheduledEvents;
    if (!scheduledEvents || scheduledEvents.size === 0) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // イベントを取得
    const events = await prisma.event.findMany({
      where: {
        eventId: {
          in: scheduledEvents.map((event) => event.id),
        },
        active: GuildScheduledEventStatus.Scheduled,
      },
      ...eventIncludeHost,
    });
    const eventList: EventSpec[] = scheduledEvents
      .map((scheduledEvent) => {
        const event = events.find((e) => e.eventId === scheduledEvent.id);
        return {
          scheduledEvent,
          event,
        };
      })
      .sort(
        (a, b) =>
          (a.event?.scheduleTime?.getTime() ??
            a.scheduledEvent.scheduledStartTimestamp ??
            0) -
          (b.event?.scheduleTime?.getTime() ??
            b.scheduledEvent.scheduledStartTimestamp ??
            0),
      );

    // パネル読み込み
    let editData = this.setupPanels[this.key(interaction)];

    // パネルを保存 (選択中のイベントとインタラクション)
    this.setupPanels[this.key(interaction)] = editData = {
      interaction,
      selectedEvent:
        editData?.selectedEvent ?? eventList[0]?.scheduledEvent.id ?? '',
      tagEdits: editData?.tagEdits,
    };

    // タグ編集状態を初期化
    for (const eventSpec of eventList) {
      await this._getTagEditState(editData, eventSpec);
    }

    // 選択中のイベントを取得
    const selectedEvent = eventList.find(
      ({ scheduledEvent }) => scheduledEvent.id === editData?.selectedEvent,
    );

    // イベントとイベント主催者の表を表示
    const eventTable = eventList
      .map(({ event, scheduledEvent }) => {
        const date = event?.scheduleTime ?? scheduledEvent.scheduledStartAt;
        const dateStr = date
          ? `<t:${Math.floor(date.getTime() / 1000)}:D>`
          : '未定';
        const eventInfo = `${dateStr} [「${event?.name ?? scheduledEvent?.name ?? '？'}」(ID: ${event?.id ?? '？'})](https://discord.com/events/${config.guild_id}/${scheduledEvent.id})`;
        const hostName = event?.host?.userId
          ? `<@${event.host.userId}>`
          : 'なし';
        const preparerDisplay = event?.preparer?.userId
          ? ` / 準備者: <@${event.preparer.userId}>`
          : '';
        const tagState =
          editData?.tagEdits?.[scheduledEvent.id] ??
          ({
            pendingTags: tagService.sanitizeTagNames(
              event?.tags?.map((tag) => tag.name) ?? [],
            ),
            originalTags: tagService.sanitizeTagNames(
              event?.tags?.map((tag) => tag.name) ?? [],
            ),
            suggestions: [],
          } as TagEditState);
        const tagDisplay = this._getTagDisplay(tagState);

        return `${eventInfo}: 主催者: ${hostName}${preparerDisplay} / ${tagDisplay}`;
      })
      .join('\n');

    // パネルを作成
    const embed = new EmbedBuilder()
      .setTitle('🥳イベント主催者設定パネル')
      .setDescription(eventTable)
      .setColor('#ff8c00');

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          setupEventSelectAction.create(eventList, selectedEvent),
        ),
        new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
          setupUserSelectAction.create(selectedEvent),
        ),
        new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
          setupPreparerSelectAction.create(selectedEvent),
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          setupTagEditAction.create(selectedEvent),
          setupTagConfirmAction.create(),
        ),
      ],
    };
  }
}

/**
 * EventCreatorSetupCommandのインスタンス
 */
export const eventCreatorSetupCommand = new EventCreatorSetupCommand(
  eventCreatorCommand,
);
