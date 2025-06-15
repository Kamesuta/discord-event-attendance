import {
  ActionRowBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { ModalActionInteraction } from '../../base/action_base.js';
import panelStopButtonAction from './PanelStopButtonAction.js';
import eventManager from '../../../event/EventManager.js';
import { GuildScheduledEventStatus } from 'discord.js';
import { checkEventOperationPermission } from '../../../event/checkCommandPermission.js';
import { prisma } from '../../../index.js';
import { config } from '../../../utils/config.js';
import { Prisma } from '@prisma/client';
import userManager from '../../../event/UserManager.js';

const userStatIncludeUser = {
  include: {
    user: true,
  },
};

/**
 * ユーザー統計情報
 * ユーザー情報を含む
 */
export type UserStatWithUser = Prisma.UserStatGetPayload<
  typeof userStatIncludeUser
>;

class PanelStopConfirmModalAction extends ModalActionInteraction {
  /**
   * イベントの参加者リストを取得
   * @param eventId イベントID
   * @returns 参加者リスト
   */
  async listupStats(eventId: number): Promise<UserStatWithUser[]> {
    return await prisma.userStat.findMany({
      where: {
        eventId: eventId,
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
      ...userStatIncludeUser,
    });
  }

  /**
   * モーダルを作成
   * @param eventId イベントID
   * @param stats 参加者リスト
   * @returns 作成したモーダル
   */
  override create(eventId: number, stats: UserStatWithUser[]): ModalBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId({
      evt: `${eventId}`,
    });

    // 参加者記録がされていない場合は警告を表示
    const isWarning = stats.filter((stat) => stat.show === true).length === 0;
    const warningMessage = `
★★★参加者が未記録です！！★★★
イベント終了前に「②参加者記録」ボタンから参加者記録をしてください`;
    const defaultMessage = '出席者記録が間違っていないか確認お願いします';

    // 参加者リストを作成
    const statsList =
      stats
        .map((stat) => {
          const mark = stat.show === null ? '⬛' : stat.show ? '☑️' : '❌';
          const duration = Math.floor(stat.duration / 1000 / 60);
          return `${mark} ${userManager.getUserName(stat.user)}: ${duration}分`;
        })
        .join('\n') || '参加者なし';

    // モーダルを作成
    return new ModalBuilder()
      .setCustomId(customId)
      .setTitle('イベント終了確認')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('confirm')
            .setLabel(
              isWarning
                ? '⛔「キャンセル」を押して、まずは参加者記録を行ってください'
                : '✅ 問題なければ「送信」を押して、イベントを終了してください',
            )
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setValue(
              `${isWarning ? warningMessage : `${defaultMessage}\n${statsList}`}`,
            ),
        ),
      );
  }

  /** @inheritdoc */
  async onCommand(
    interaction: ModalSubmitInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('evt');
    if (!eventId) return; // 必要なパラメータがない場合は旧形式の可能性があるため無視

    await interaction.deferReply({ ephemeral: true });

    // イベントを取得
    const event = await eventManager.getEventFromId(
      eventId ? parseInt(eventId) : undefined,
    );
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

    // 開始されているイベントのみ停止可能
    if (event.active !== (GuildScheduledEventStatus.Active as number)) {
      await interaction.editReply({
        content: '開始されていないイベントは停止できません',
      });
      return;
    }

    // 権限をチェック
    const { member, hasPermission } = await checkEventOperationPermission(
      interaction,
      event.host?.userId,
    );
    if (!member || !hasPermission) {
      await interaction.editReply({
        content: 'イベント主催者のみがイベントを停止できます',
      });
      return;
    }

    await panelStopButtonAction.stopEvent(interaction, event, scheduledEvent);
  }
}

export default new PanelStopConfirmModalAction('pstopcf');
