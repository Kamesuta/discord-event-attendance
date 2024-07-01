import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionEditReplyOptions,
  RepliableInteraction,
  SlashCommandSubcommandBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventCommand from './EventCommand.js';
import eventManager from '../../event/EventManager.js';
import { updateAttendanceTimeIfEventActive } from '../../event/attendance_time.js';
import { prisma } from '../../index.js';
import { config } from '../../utils/config.js';
import { Event } from '@prisma/client';
import reviewMarkUserSelectAction from '../action/ReviewMarkUserSelectAction.js';
import { EditableInteraction } from '../../event/EditableInteraction.js';

/**
 * 編集データ
 */
export interface ReviewEditData {
  /** インタラクション */
  interaction: EditableInteraction;
  /** 参加者のリストの履歴 */
  history: string[][];
}

/**
 * 編集データホルダー
 */
class ReviewEditDataHolder {
  /** キー(ユーザーIDなど) -> 編集データ */
  keyToEditData: Record<string, ReviewEditData> = {};

  /**
   * キーを取得
   * @param interaction インタラクション (ユーザー特定用)
   * @param event イベント
   * @returns キー
   */
  private _key(interaction: RepliableInteraction, event: Event): string {
    return new URLSearchParams({
      user: interaction.user.id,
      event: `${event.id}`,
      channel: `${interaction.channel?.id}`,
    }).toString();
  }

  /**
   * 編集データをセット
   * @param interaction インタラクション (ユーザー特定用)
   * @param event イベント
   * @param editData 編集データ
   */
  private _register(
    interaction: RepliableInteraction,
    event: Event,
    editData: ReviewEditData,
  ): void {
    const key = this._key(interaction, event);
    this.keyToEditData[key] = editData;
  }

  /**
   * 編集データを取得
   * @param interaction インタラクション (ユーザー特定用)
   * @param event イベント
   * @returns 編集データ
   */
  get(interaction: RepliableInteraction, event: Event): ReviewEditData {
    const key = this._key(interaction, event);
    const editData = this.keyToEditData[key] || {
      interaction: new EditableInteraction(interaction),
      history: [],
    };
    this._register(interaction, event, editData);
    return editData;
  }
}

class EventReviewCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('review')
    .setDescription('イベントの出欠状況を表示します (自分のみに表示)');

  /** 編集データホルダー */
  readonly editDataHolder = new ReviewEditDataHolder();

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // 公開前のメンバー確認
    await interaction.deferReply({ ephemeral: true });
    const event = await eventManager.getEvent(interaction);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // 編集データを取得
    const editData = this.editDataHolder.get(interaction, event);
    editData.interaction.reset(interaction);

    // イベントの出欠状況を表示するメッセージを作成
    const messageOption = await this.createReviewEventMessage(event);
    await editData.interaction.editReply(interaction, messageOption);
  }

  /**
   * イベントの出欠状況チェックパネルを表示します
   * @param event イベント
   * @returns メッセージオプション
   */
  async createReviewEventMessage(
    event: Event,
  ): Promise<InteractionEditReplyOptions> {
    // 集計
    await updateAttendanceTimeIfEventActive(event);

    // イベントの出欠状況を表示
    const stats = await prisma.userStat.findMany({
      where: {
        eventId: event.id,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        OR: [
          {
            show: true,
          },
          {
            duration: {
              // 必要接続分数を満たしているユーザーのみを抽出する (config.required_time分以上参加している)
              gt: config.required_time * 60 * 1000,
            },
          },
        ],
      },
    });

    const embeds = new EmbedBuilder()
      .setTitle(
        `🏁「${event.name}」イベントに参加してくれた人を選択してください`,
      )
      .setURL(`https://discord.com/events/${config.guild_id}/${event.eventId}`)
      .setFooter({
        text: `イベントID: ${event.id}`,
      })
      .setDescription(
        '出席、欠席のステータスです。\n下のプルダウンからステータスを変更できます。\n\n' +
          // 非公開モードの場合は全員表示 (現在のステータスも表示)
          stats
            .map((stat) => {
              const memo = stat.memo ? ` (**メモ**: ${stat.memo})` : '';
              const mark = stat.show === null ? '⬛' : stat.show ? '☑️' : '❌';
              const duration = Math.floor(stat.duration / 1000 / 60);
              return `${mark} <@${stat.userId}>: ${duration}分${memo}`;
            })
            .join('\n') || 'なし',
      )
      .setColor('#ff8c00');

    // マークされていないされていないユーザーIDを取得 → プルダウンのデフォルト値に設定
    const selectedUserIds = stats
      .filter((stat) => stat.show === null)
      .map((stat) => stat.userId);

    const components = [
      // 出席プルダウン
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        reviewMarkUserSelectAction.create(event, selectedUserIds, 'show'),
      ),
      // 除外プルダウン
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        reviewMarkUserSelectAction.create(event, selectedUserIds, 'hide'),
      ),
    ];

    // イベントの出欠状況を表示するメッセージを作成
    return {
      embeds: [embeds],
      components,
    };
  }

  /**
   * イベントの出欠状況を編集します
   * @param interaction 返信用のインタラクション
   * @param event イベント
   */
  async updateReviewEventMessage(
    interaction: RepliableInteraction,
    event: Event,
  ): Promise<void> {
    // イベントの出欠状況を表示するメッセージを作成
    const messageOption = await this.createReviewEventMessage(event);

    // 編集データを取得
    const editData = this.editDataHolder.get(interaction, event);
    // イベントの出欠状況を表示するメッセージを更新
    await editData.interaction.editReply(interaction, messageOption);
  }
}

export default new EventReviewCommand(eventCommand);
