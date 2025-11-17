import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { eventManager } from '../../../event/EventManager.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import { eventReviewCommand } from '../../event_command/EventReviewCommand.js';

class PanelReviewButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
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
      .setEmoji('📝')
      .setLabel('②参加者記録')
      .setStyle(ButtonStyle.Primary);
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

    // 編集データを取得
    const editData = eventReviewCommand.editDataHolder.get(interaction, event);
    editData.interaction.reset(interaction);

    // イベントの出欠状況を表示するメッセージを作成
    const messageOption = await eventReviewCommand.createReviewEventMessage(
      interaction,
      event,
    );
    await editData.interaction.editReply(interaction, messageOption);
  }
}

/**
 * PanelReviewButtonActionのインスタンス
 */
export const panelReviewButtonAction = new PanelReviewButtonAction(
  'preview',
  ComponentType.Button,
);
