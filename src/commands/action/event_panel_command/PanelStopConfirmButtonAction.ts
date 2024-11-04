import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  GuildScheduledEventStatus,
} from 'discord.js';
import eventManager from '../../../event/EventManager.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { config } from '../../../utils/config.js';
import { checkCommandPermission } from '../../../event/checkCommandPermission.js';
import { prisma } from '../../../index.js';
import PanelStopButtonAction from './PanelStopButtonAction.js';

class PanelStopConfirmButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  /**
   * ボタンを作成
   * @param eventId イベントID
   * @returns 作成したビルダー
   */
  override create(eventId: number): ButtonBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId({
      evt: `${eventId}`,
    });

    // ダイアログを作成
    return new ButtonBuilder()
      .setCustomId(customId)
      .setEmoji('⏹️')
      .setLabel('③イベント終了')
      .setStyle(ButtonStyle.Danger);
  }

  /** @inheritdoc */
  async onCommand(
    interaction: ButtonInteraction,
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

    // メンバー情報を取得
    const member = await interaction.guild?.members.fetch(interaction.user.id);
    if (!interaction.guild || !member) {
      await interaction.editReply({
        content: 'メンバー情報の取得に失敗しました',
      });
      return;
    }

    // 権限をチェック
    if (
      // イベントの主催者か
      event.hostId !== interaction.user.id &&
      // /event_admin で権限を持っているか
      !(await checkCommandPermission('event_admin', member))
    ) {
      await interaction.editReply({
        content: 'イベント主催者のみがイベントを停止できます',
      });
      return;
    }

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

    // 参加者記録がされていない場合は警告を表示
    const isWarning = stats.filter((stat) => stat.show === true).length === 0;
    const warningMessage = `
■■■■■■■■■■■■■■■■■■■■■■■■■■■
## <a:alert:1303007357562785812> イベント参加者がチェックされていません！！ <a:alert:1303007357562785812>
参加者記録はイベント終了前に行う必要があります。
「②参加者記録」ボタンから記録をお願いします

■■■■■■■■■■■■■■■■■■■■■■■■■■■`.replaceAll(
      '■',
      '<:warning_stripe:1303007373392220190>',
    );
    const defaultMessage =
      'イベント終了前に、もう一度イベント出席/欠席者が正しくチェックできているか確認してください';

    // ボタン
    const stopButton = PanelStopButtonAction.create(event.id);
    if (isWarning) {
      stopButton.setLabel('イベント参加者を記録せずにイベントを終了する');
    }

    // メッセージを作成
    const embed = new EmbedBuilder()
      .setTitle(`⚠️イベント終了前確認`)
      .setFooter({
        text: `イベントID: ${event.id}`,
      })
      .setDescription(isWarning ? warningMessage : defaultMessage)
      .addFields({
        name: '現在の参加者チェックリスト',
        value:
          stats
            .map((stat) => {
              const mark = stat.show === null ? '⬛' : stat.show ? '☑️' : '❌';
              const duration = Math.floor(stat.duration / 1000 / 60);
              return `${mark} <@${stat.userId}>: ${duration}分`;
            })
            .join('\n') || 'なし',
      })
      .setColor('#ff8c00');

    // メッセージを送信
    await interaction.editReply({
      content: 'イベントを終了しますか？',
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(stopButton),
      ],
    });
  }
}

export default new PanelStopConfirmButtonAction(
  'pstopcf',
  ComponentType.Button,
);
