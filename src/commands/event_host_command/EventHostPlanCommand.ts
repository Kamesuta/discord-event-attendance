import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  GuildScheduledEvent,
  GuildScheduledEventStatus,
  Collection,
  InteractionEditReplyOptions,
  RepliableInteraction,
  UserSelectMenuBuilder,
  MessageActionRowComponentBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventHostCommand from './EventHostCommand.js';
import { prisma } from '../../utils/prisma.js';
import { Event, User } from '@prisma/client';
import eventManager from '../../event/EventManager.js';
import planEventSelectAction from '../action/event_host_command/PlanEventSelectAction.js';
import planSetupAllButtonAction from '../action/event_host_command/PlanSetupAllButtonAction.js';
import planCancelButtonAction from '../action/event_host_command/PlanCancelButtonAction.js';
import { config } from '../../utils/config.js';
import { logger } from '../../utils/log.js';
import planCandidatePositionUserSelectAction from '../action/event_host_command/PlanCandidatePositionUserSelectAction.js';
import planAllowPublicApplyButtonAction from '../action/event_host_command/PlanAllowPublicApplyButtonAction.js';
import planMessageEditButtonAction from '../action/event_host_command/PlanMessageEditButtonAction.js';
import planConfirmButtonAction from '../action/event_host_command/PlanConfirmButtonAction.js';
import planCancelSetupButtonAction from '../action/event_host_command/PlanCancelSetupButtonAction.js';

/**
 * 主催者お伺いワークフロー計画の設定データ
 */
export interface PlanSetupData {
  /** キー */
  key: string;
  /** イベントID */
  eventId: number;
  /** 選択可能なユーザー一覧 */
  availableUsers: User[];
  /** 候補者（1～3番手） */
  candidates: User[];
  /** 並行して公募するか */
  allowPublicApply: boolean;
  /** 依頼メッセージ */
  customMessage: string;
}

/**
 * 主催者お伺いワークフローの計画作成コマンド
 * /event_host plan
 */
class EventHostPlanCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('plan')
    .setDescription('主催者お伺いワークフローの計画を作成します')
    .addBooleanOption((option) =>
      option
        .setName('show')
        .setDescription(
          'コマンドの結果をチャットに表示しますか？（デフォルトは非公開）',
        )
        .setRequired(false),
    );

  /** 設定データ */
  private _setupData: Record<string, PlanSetupData> = {};
  /** イベント一覧 */
  private _scheduledEvents:
    | Collection<string, GuildScheduledEvent<GuildScheduledEventStatus>>
    | undefined;
  /** 計画作成パネルのメッセージ参照 (ユーザーID -> インタラクション) */
  private _planningPanelInteractions: Record<string, RepliableInteraction> = {};

  async onCommand(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const show = interaction.options.getBoolean('show') ?? true;
    await interaction.deferReply({ ephemeral: !show });

    // イベントを取得してキャッシュしておく。プルダウンメニューを選んだときなどは取得する代わりにキャッシュを使う
    this._scheduledEvents = await interaction.guild?.scheduledEvents.fetch();

    // パネルを作成
    const reply = await this.createPlanningPanel(interaction);
    if (!reply) return;
    await interaction.editReply(reply);

    // 計画パネルのインタラクションを保存
    this._planningPanelInteractions[interaction.user.id] = interaction;
  }

  /**
   * 計画作成パネルを表示
   * @param interaction インタラクション
   * @returns Promise<InteractionEditReplyOptions | undefined>
   */
  async createPlanningPanel(
    interaction: RepliableInteraction,
  ): Promise<InteractionEditReplyOptions | undefined> {
    // スケジュールイベントを取得
    let scheduledEvents = this._scheduledEvents;
    if (!scheduledEvents && 'guild' in interaction && interaction.guild) {
      scheduledEvents = await interaction.guild.scheduledEvents.fetch();
      this._scheduledEvents = scheduledEvents;
    }

    if (!scheduledEvents || scheduledEvents.size === 0) {
      return {
        content: 'イベントが見つかりませんでした',
      };
    }

    // イベント一覧を取得
    const eventSpecs = await eventManager.getEventSpecs(
      scheduledEvents,
      GuildScheduledEventStatus.Scheduled,
    );

    // 主催者が決まっていないイベントのみフィルタリング
    const eventsWithoutHost = eventSpecs.filter(
      (eventSpec) => !eventSpec.event?.hostId,
    );

    if (eventsWithoutHost.length === 0) {
      return {
        content: '主催者が決まっていないイベントが見つかりませんでした。',
      };
    }

    // イベントと設定状況の表を表示
    const eventTable = eventSpecs
      .map(({ event, scheduledEvent }) => {
        const date = event?.scheduleTime ?? scheduledEvent.scheduledStartAt;
        const dateStr = date
          ? `<t:${Math.floor(date.getTime() / 1000)}:D>`
          : '未定';
        const eventInfo = `${dateStr} [「${event?.name ?? scheduledEvent?.name ?? '？'}」(ID: ${event?.id ?? '？'})](https://discord.com/events/${config.guild_id}/${scheduledEvent.id})`;

        // 設定状況を取得
        let statusInfo = '';
        if (!event) {
          statusInfo = 'イベント未生成';
        } else if (event.hostId) {
          statusInfo = `主催者決定済み (<@${event.hostId}>)`;
        } else {
          // PlanSetupDataから設定を確認
          const setupData = this._setupData[interaction.user.id];
          const hasSetup = setupData && setupData.eventId === event.id;

          if (!hasSetup) {
            statusInfo = '未設定';
          } else {
            // 設定詳細を表示
            const candidates =
              setupData.candidates.length > 0
                ? setupData.candidates
                    .map((user, index) => `${index + 1}.<@${user.userId}>`)
                    .join(' ')
                : '未設定';
            const publicApply = setupData.allowPublicApply
              ? '公募ON'
              : '公募OFF';
            const message =
              setupData.customMessage &&
              setupData.customMessage !== 'よろしくお願いいたします。'
                ? setupData.customMessage.length > 20
                  ? setupData.customMessage.substring(0, 20) + '...'
                  : setupData.customMessage
                : 'デフォルト';

            statusInfo = `[${candidates}] ${publicApply} "${message}"`;
          }
        }

        return `${eventInfo}\n　└ ${statusInfo}`;
      })
      .join('\n\n');

    // パネルを作成
    const embed = new EmbedBuilder()
      .setTitle('🎯 主催者お伺いワークフロー計画作成')
      .setDescription(
        '主催者が決まっていないイベントが見つかりました。\n' +
          'お伺いワークフローを作成するイベントを選択してください。\n\n' +
          eventTable,
      )
      .setColor(0x3498db);

    // イベント選択メニューを作成
    const events = eventsWithoutHost
      .map((spec) => spec.event)
      .filter(
        (event): event is NonNullable<typeof event> => event !== undefined,
      );
    const eventSelectMenu = planEventSelectAction.create(events);

    // ボタンを作成
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      planSetupAllButtonAction.create(),
      planCancelButtonAction.create(),
    );

    const selectRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        eventSelectMenu,
      );

    return {
      embeds: [embed],
      components: [selectRow, buttons],
    };
  }

  /**
   * 設定データを取得・初期化
   * @param interaction インタラクション（userIdを取得するため）
   * @param eventId イベントID
   * @param clear 設定データをクリアするか
   * @returns 設定データ
   */
  async getSetupData(
    interaction: RepliableInteraction,
    eventId: number,
    clear = false,
  ): Promise<PlanSetupData> {
    const userId = interaction.user.id;
    // 設定データを取得
    let setupData: PlanSetupData | undefined = this._setupData[userId];

    // 設定データがない場合は新規作成
    if (!setupData || clear) {
      // 設定データを作成
      this._setupData[userId] = setupData = {
        key: userId,
        eventId,
        availableUsers: [],
        candidates: [],
        allowPublicApply: false,
        customMessage: 'よろしくお願いいたします。',
      };
    }

    // イベントIDが異なる場合は初期化
    if (setupData.eventId !== eventId) {
      setupData.eventId = eventId;
      setupData.candidates = [];
      setupData.allowPublicApply = false;
      setupData.customMessage = 'よろしくお願いいたします。';
    }

    // 選択可能なユーザー一覧を取得（参加者から）
    if (setupData.availableUsers.length === 0) {
      setupData.availableUsers = (
        await prisma.userStat.findMany({
          where: {
            eventId,
            show: true,
          },
          include: {
            user: true,
          },
        })
      ).map((stat) => stat.user);
    }

    return setupData;
  }

  /**
   * 元の計画作成パネルを更新
   * @param userId ユーザーID
   * @returns Promise<boolean> 更新成功かどうか
   */
  async updatePlanningPanel(userId: string): Promise<boolean> {
    const originalInteraction = this._planningPanelInteractions[userId];
    if (!originalInteraction) {
      return false; // 元のパネルが見つからない
    }

    try {
      const reply = await this.createPlanningPanel(originalInteraction);
      if (!reply) return false;

      // 元のメッセージを編集
      await originalInteraction.editReply(reply);
      return true;
    } catch (error) {
      logger.error('計画パネル更新でエラー:', error);
      return false;
    }
  }

  /**
   * アクションから呼び出される計画パネル更新メソッド
   * @param interaction アクションのインタラクション
   * @returns Promise<void>
   */
  async updatePlanningPanelFromAction(
    interaction: RepliableInteraction,
  ): Promise<void> {
    try {
      // 元の計画作成パネルを更新
      const updated = await this.updatePlanningPanel(interaction.user.id);
      if (!updated) {
        logger.warn('計画作成パネルの更新に失敗しました');
      }
    } catch (error) {
      logger.error('計画作成パネル更新でエラー:', error);
      // エラーでも処理を継続
    }
  }

  /**
   * 設定パネルのEmbedを作成
   * @param event イベント
   * @param setupData 設定データ
   * @returns Embed
   */
  makeSetupEmbed(event: Event, setupData: PlanSetupData): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('🎯 主催者お伺いワークフロー設定')
      .setDescription(
        'ボタンを押して設定を行い、「確定」ボタンで計画を作成してください。',
      )
      .setColor(0x3498db);

    // イベント名を表示
    embed.addFields({
      name: 'イベント名',
      value: `${event.name}`,
      inline: false,
    });

    // 候補者を表示
    if (setupData.candidates.length > 0) {
      const candidateList = setupData.candidates
        .map((user, index) => `${index + 1}. <@${user.userId}>`)
        .join('\n');
      embed.addFields({
        name: '候補者（1～3番手）',
        value: candidateList,
        inline: false,
      });
    } else {
      embed.addFields({
        name: '候補者（1～3番手）',
        value: '未設定',
        inline: false,
      });
    }

    // 並行公募の設定を表示
    embed.addFields({
      name: '並行公募',
      value: setupData.allowPublicApply ? 'はい' : 'いいえ',
      inline: true,
    });

    // 依頼メッセージを表示
    embed.addFields({
      name: '依頼メッセージ',
      value: setupData.customMessage || '（デフォルト）',
      inline: false,
    });

    return embed;
  }

  /**
   * 設定パネルのコンポーネントを作成
   * @param eventId イベントID
   * @param setupData 設定データ
   * @returns ActionRowBuilder[]
   */
  createSetupPanelComponents(
    eventId: number,
    setupData: PlanSetupData,
  ): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
    // 3つの候補者選択フィールドを作成
    const candidateRows: ActionRowBuilder<UserSelectMenuBuilder>[] = [];
    for (let i = 1; i <= 3; i++) {
      const userSelect = planCandidatePositionUserSelectAction.create(
        eventId,
        i,
      );

      // 現在の選択状態を反映
      if (setupData.candidates.length >= i && setupData.candidates[i - 1]) {
        const selectedUser = setupData.candidates[i - 1];
        userSelect.setDefaultUsers([selectedUser.userId]);
      }

      const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        userSelect,
      );
      candidateRows.push(row);
    }

    // 並行公募・確定・キャンセルボタンを作成
    const controlButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      planAllowPublicApplyButtonAction.create(
        eventId,
        setupData.allowPublicApply,
      ),
      planMessageEditButtonAction.create(eventId),
      planConfirmButtonAction.create(eventId),
      planCancelSetupButtonAction.create(eventId),
    );

    return [...candidateRows, controlButtons];
  }
}

/**
 * EventHostPlanCommandのインスタンス
 */
export default new EventHostPlanCommand(eventHostCommand);
