import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
  GuildScheduledEventStatus,
} from 'discord.js';
import eventManager from '../../../event/EventManager.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { logger } from '../../../utils/log.js';
import { checkCommandPermission } from '../../../event/checkCommandPermission.js';
import eventAdminAnnounceCommand from '../../event_admin_command/EventAdminAnnounceCommand.js';

class PanelStartButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
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
      .setEmoji('▶️')
      .setLabel('①イベント開始')
      .setStyle(ButtonStyle.Success);
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

    // 予定状態のイベントのみ開始可能
    if (event.active !== (GuildScheduledEventStatus.Scheduled as number)) {
      await interaction.editReply({
        content:
          'イベントは既に開始されているため開始できません。イベント管理者にお問い合わせください。',
      });
      return;
    }

    // メンバー情報を取得
    const member = await interaction.guild?.members.fetch(interaction.user.id);
    if (!member) {
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

    // イベントを開始
    await scheduledEvent.edit({
      status: GuildScheduledEventStatus.Active,
    });

    // イベントをアナウンス
    await eventAdminAnnounceCommand.showAnnounceMessage(interaction, event);

    // ログに残す
    logger.info(
      `${interaction.user.username} がイベント開始ボタンを押してイベント「${event.name}」(ID: ${event.id})を開始しました`,
    );

    await interaction.editReply({
      content: `イベント「${event.name}」(ID: ${event.id})を開始しました。`,
    });
  }
}

export default new PanelStartButtonAction('pstart', ComponentType.Button);
