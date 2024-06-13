import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import eventManager from '../../../event/EventManager.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import eventGameCommand, {
  EditData,
} from '../../event_command/EventGameCommand.js';

class GameConfirmButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
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
      .setEmoji('☑')
      .setLabel('確定 (登録)')
      .setStyle(ButtonStyle.Success);
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

    // 登録
    const game = await eventGameCommand.addGameResult(editData);
    // 編集データを更新
    editData.game = game;

    // Embedを更新
    if (interaction !== editData.interaction) {
      // 元のメッセージがある場合のみ更新
      await eventGameCommand.updateEmbed(event, editData);
    }

    // メッセージを返信 (ゲーム「ゲーム名」(試合ID: n)の結果を登録しました)
    await interaction.editReply({
      content: `ゲーム「${game.name}」(試合ID: ${game.id})の結果を登録しました`,
    });
  }
}

export default new GameConfirmButtonAction('gcfrm', ComponentType.Button);
