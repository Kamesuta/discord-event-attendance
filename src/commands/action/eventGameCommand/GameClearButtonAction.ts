import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} from 'discord.js';
import { eventManager } from '@/domain/services/EventManager';
import { MessageComponentActionInteraction } from '@/commands/base/actionBase';
import {
  eventGameCommand,
  EditData,
} from '@/commands/eventCommand/EventGameCommand';
class GameClearButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  /**
   * ボタンを作成
   * @param editData 編集データ
   * @returns 作成したビルダー
   */
  override create(editData: EditData): ButtonBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId({
      evt: `${editData.game.eventId}`,
      key: editData.key,
    });

    // ダイアログを作成
    return new ButtonBuilder()
      .setCustomId(customId)
      .setEmoji('✨')
      .setLabel('新規試合')
      .setStyle(ButtonStyle.Primary);
  }

  /** @inheritdoc */
  async onCommand(
    interaction: ButtonInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('evt');
    const key = params.get('key');
    if (!eventId || !key) return; // 必要なパラメータがない場合は旧形式の可能性があるため無視

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const event = await eventManager.getEventFromId(
      eventId ? parseInt(eventId) : undefined,
    );
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // クリアして編集データを取得
    const editData = await eventGameCommand
      .getEditData(key, interaction, event.id, undefined, true)
      .catch(async (content: string) => {
        await interaction.editReply({ content });
      });
    if (!editData) return;

    // Embedを更新
    await eventGameCommand.updateEmbed(event, editData, interaction);
  }
}

/**
 * GameClearButtonActionのインスタンス
 */
export const gameClearButtonAction = new GameClearButtonAction(
  'gclr',
  ComponentType.Button,
);
