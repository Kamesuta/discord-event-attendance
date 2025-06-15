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
import { checkCommandPermission } from '../../../event/checkCommandPermission.js';

class PanelStopConfirmModalAction extends ModalActionInteraction {
  /**
   * モーダルを作成
   * @param eventId イベントID
   * @returns 作成したモーダル
   */
  override create(eventId: number): ModalBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId({
      evt: `${eventId}`,
    });

    // モーダルを作成
    return new ModalBuilder()
      .setCustomId(customId)
      .setTitle('イベント終了確認')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('confirm')
            .setLabel('イベントを終了するには「終了」と入力してください')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true),
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

    // メンバー情報を取得
    const member = await interaction.guild?.members
      .fetch(interaction.user.id)
      .catch(() => undefined);
    if (!interaction.guild || !member) {
      await interaction.editReply({
        content: 'メンバー情報の取得に失敗しました',
      });
      return;
    }

    // 権限をチェック
    if (
      // イベントの主催者か
      event.host?.userId !== interaction.user.id &&
      // /event_admin で権限を持っているか
      !(await checkCommandPermission('event_admin', member))
    ) {
      await interaction.editReply({
        content: 'イベント主催者のみがイベントを停止できます',
      });
      return;
    }

    // 確認テキストを取得
    const confirmText = interaction.fields.getTextInputValue('confirm');
    if (confirmText !== '終了') {
      await interaction.editReply({
        content: '確認テキストが正しくありません。「終了」と入力してください',
      });
      return;
    }

    await panelStopButtonAction.stopEvent(interaction, event, scheduledEvent);
  }
}

export default new PanelStopConfirmModalAction('pstopcf');
