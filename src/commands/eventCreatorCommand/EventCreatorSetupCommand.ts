import {
  ActionRowBuilder,
  ButtonBuilder,
  ChatInputCommandInteraction,
  Collection,
  EmbedBuilder,
  GuildScheduledEvent,
  GuildScheduledEventStatus,
  InteractionEditReplyOptions,
  MessageFlags,
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
import { setupConfirmButtonAction } from '@/commands/action/eventSetupCommand/SetupConfirmButtonAction';
import { setupCancelButtonAction } from '@/commands/action/eventSetupCommand/SetupCancelButtonAction';
import { prisma } from '@/utils/prisma';
import { eventCreatorCommand } from './EventCreatorCommand';
import { eventIncludeHost, EventWithHost } from '@/domain/queries/eventQueries';
import { setupTagEditAction } from '@/commands/action/eventSetupCommand/SetupTagEditAction';
import { setupTagConfirmAction } from '@/commands/action/eventSetupCommand/SetupTagConfirmAction';
import { tagService, TagSuggestion } from '@/domain/services/TagService';

/**
 * 保留中の変更
 */
export interface PendingChange {
  /**
   * 主催者DiscordID
   */
  hostDiscordId?: string | null;
  /**
   * 準備者DiscordID
   */
  preparerDiscordId?: string | null;
}

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
  /**
   * 保留中の変更
   */
  pendingChange?: PendingChange;
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
  pendingChanges: Record<string, PendingChange>;
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
    const tagLine = tags.map((tag) => `#${tag}`).join(' ');
    const decorated = hasPending ? `__${tagLine}__` : tagLine;
    return `タグ: ${decorated}`;
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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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

    const panelKey = this.key(interaction);
    const cachedEditData = this.setupPanels[panelKey];

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
        const pendingChange =
          cachedEditData?.pendingChanges?.[scheduledEvent.id] ?? undefined;

        return {
          scheduledEvent,
          event,
          pendingChange,
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
    let editData = this.setupPanels[panelKey];

    // パネルを保存 (選択中のイベントとインタラクション)
    this.setupPanels[panelKey] = editData = {
      interaction,
      selectedEvent:
        editData?.selectedEvent ?? eventList[0]?.scheduledEvent.id ?? '',
      pendingChanges: editData?.pendingChanges ?? {},
      tagEdits: editData?.tagEdits ?? {},
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
      .map((eventSpec) =>
        this.formatEventSummary(
          eventSpec,
          editData.tagEdits?.[eventSpec.scheduledEvent.id],
        ),
      )
      .join('\n');

    // パネルを作成
    const embed = new EmbedBuilder()
      .setTitle('🥳イベント主催者設定パネル')
      .setDescription(eventTable)
      .setColor('#ff8c00');

    const hasPendingChanges = eventList.some((event) =>
      Boolean(event.pendingChange),
    );
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
          setupConfirmButtonAction.create(hasPendingChanges),
          setupCancelButtonAction.create(hasPendingChanges),
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          setupTagEditAction.create(selectedEvent),
          setupTagConfirmAction.create(),
        ),
      ],
    };
  }

  formatEventSummary(eventSpec: EventSpec, tagState?: TagEditState): string {
    const { event, scheduledEvent, pendingChange } = eventSpec;
    const date = event?.scheduleTime ?? scheduledEvent.scheduledStartAt;
    const dateStr = date
      ? `<t:${Math.floor(date.getTime() / 1000)}:D>`
      : '未定';
    const eventTitle = event?.name ?? scheduledEvent?.name ?? '？';
    const eventId = event?.id ?? '未生成';
    const changeMark = pendingChange ? ' 🟡' : '';
    const eventLink = `https://discord.com/events/${config.guild_id}/${scheduledEvent.id}`;
    const hostDiscordId = this.resolvePendingMemberDiscordId(
      event,
      pendingChange,
      'hostDiscordId',
    );
    const preparerDiscordId = this.resolvePendingMemberDiscordId(
      event,
      pendingChange,
      'preparerDiscordId',
    );
    const hostDisplay = hostDiscordId ? `<@${hostDiscordId}>` : 'なし';
    const summaryLines = [
      `### ${dateStr} [${eventTitle}](${eventLink}) (ID: ${eventId})${changeMark}`,
      `- 主催者: ${hostDisplay}`,
    ];

    if (preparerDiscordId) {
      summaryLines.push(`- 準備者: <@${preparerDiscordId}>`);
    }

    summaryLines.push(`- ${this._getTagDisplay(tagState)}`);

    return summaryLines.join('\n');
  }

  resolvePendingMemberDiscordId(
    event: EventWithHost | undefined,
    pendingChange: PendingChange | undefined,
    key: keyof PendingChange,
  ): string | null {
    const currentDiscordId =
      key === 'hostDiscordId'
        ? (event?.host?.userId ?? null)
        : (event?.preparer?.userId ?? null);

    if (pendingChange?.[key] === undefined) {
      return currentDiscordId;
    }

    return pendingChange[key] ?? null;
  }

  updatePendingChanges(
    editData: EditData,
    eventId: string,
    change: PendingChange,
    baseEvent?: EventWithHost | null,
  ): void {
    const currentHostDiscordId = baseEvent?.host?.userId ?? null;
    const currentPreparerDiscordId = baseEvent?.preparer?.userId ?? null;
    const previousPending = editData.pendingChanges[eventId] ?? {};

    const nextHostDiscordId =
      change.hostDiscordId !== undefined
        ? change.hostDiscordId
        : previousPending.hostDiscordId;
    const nextPreparerDiscordId =
      change.preparerDiscordId !== undefined
        ? change.preparerDiscordId
        : previousPending.preparerDiscordId;

    const pending: PendingChange = {};

    if (
      nextHostDiscordId !== undefined &&
      nextHostDiscordId !== currentHostDiscordId
    ) {
      pending.hostDiscordId = nextHostDiscordId ?? null;
    }

    if (
      nextPreparerDiscordId !== undefined &&
      nextPreparerDiscordId !== currentPreparerDiscordId
    ) {
      pending.preparerDiscordId = nextPreparerDiscordId ?? null;
    }

    if (
      pending.hostDiscordId === undefined &&
      pending.preparerDiscordId === undefined
    ) {
      delete editData.pendingChanges[eventId];
      return;
    }

    editData.pendingChanges[eventId] = pending;
  }
}

/**
 * EventCreatorSetupCommandのインスタンス
 */
export const eventCreatorSetupCommand = new EventCreatorSetupCommand(
  eventCreatorCommand,
);
