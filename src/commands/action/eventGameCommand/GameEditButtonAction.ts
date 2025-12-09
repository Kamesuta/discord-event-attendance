import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { eventManager } from '@/domain/services/EventManager';
import { MessageComponentActionInteraction } from '@/commands/base/actionBase';
import {
  eventGameCommand,
  EditData,
} from '@/commands/eventCommand/EventGameCommand';
import { gameEditModalAction } from './GameEditModalAction';

class GameEditButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  /**
   * ゲーム編集ボタンを作成
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
      .setEmoji('📝')
      .setLabel('編集')
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

    // モーダルのため、deferできない
    // await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const event = await eventManager.getEventFromId(
      eventId ? parseInt(eventId) : undefined,
    );
    if (!event) {
      await interaction.reply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // 編集データを取得
    const editData = await eventGameCommand
      .getEditData(key, interaction, event.id)
      .catch(async (content: string) => {
        await interaction.reply({ content });
      });
    if (!editData) return;

    // モーダルを表示
    await interaction.showModal(gameEditModalAction.create(editData));
  }
}

/**
 * GameEditButtonActionのインスタンス
 */
export const gameEditButtonAction = new GameEditButtonAction(
  'gedit',
  ComponentType.Button,
);
