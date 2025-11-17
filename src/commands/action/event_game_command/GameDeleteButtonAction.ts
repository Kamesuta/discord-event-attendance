import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { eventManager } from '../../../domain/services/EventManager.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import {
  eventGameCommand,
  EditData,
} from '../../event_command/EventGameCommand.js';
class GameDeleteButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
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
      .setEmoji('🗑️')
      .setLabel('削除')
      .setStyle(ButtonStyle.Danger);
  }

  /** @inheritdoc */
  async onCommand(
    interaction: ButtonInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('evt');
    const key = params.get('key');
    if (!eventId || !key) return; // 必要なパラメータがない場合は旧形式の可能性があるため無視

    await interaction.deferReply({ ephemeral: true });
    const event = await eventManager.getEventFromId(
      eventId ? parseInt(eventId) : undefined,
    );
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // 編集データを取得
    const editData = await eventGameCommand
      .getEditData(key, interaction, event.id)
      .catch(async (content: string) => {
        await interaction.editReply({ content });
      });
    if (!editData) return;

    if (!editData.game.id) {
      await interaction.editReply({
        content: 'ドラフト状態の(登録されていない)試合は削除できません',
      });
      return;
    }

    // 削除
    await eventGameCommand.deleteGameResult(editData.game.id);

    // クリアして編集データを取得
    const clearedEditData = await eventGameCommand
      .getEditData(key, interaction, event.id, undefined, true)
      .catch(async (content: string) => {
        await interaction.editReply({ content });
      });
    if (!clearedEditData) return;
    // 削除したデータは試合IDを0にする
    clearedEditData.game.id = 0;

    // 削除メッセージを返信
    const gameName = editData.game.name
      .replace(/＄/g, event.name)
      .replace(/＠/g, `${editData.gameNumber}`);
    await interaction.editReply({
      content: `ゲーム「${gameName}」(試合ID: ${editData.game.id})を削除しました`,
    });
  }
}

/**
 * GameDeleteButtonActionのインスタンス
 */
export const gameDeleteButtonAction = new GameDeleteButtonAction(
  'gdel',
  ComponentType.Button,
);
