import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
} from 'discord.js';
import eventManager from '../../../event/EventManager.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import eventGameCommand, {
  EditData,
} from '../../event_command/EventGameCommand.js';
import { makeEmbed } from '../../../event/game.js';

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

    await interaction.deferReply({ ephemeral: false }); // Confirm時はみんなに公開する
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
    const game = await eventGameCommand.addGameResult(event, editData);

    // 登録結果を表示
    const embeds = makeEmbed(
      new EmbedBuilder()
        .setTitle(`🎮「${game.name}」の結果が記録されました`)
        .setDescription(`第 ${editData.gameNumber} 回目の試合結果です`),
      game,
    );

    // 編集データをクリア
    await eventGameCommand
      .getEditData(key, interaction, event.id, undefined, true)
      .catch(async (content: string) => {
        await interaction.editReply({ content });
      });

    await interaction.editReply({
      embeds: [embeds],
    });
  }
}

export default new GameConfirmButtonAction('gcfrm', ComponentType.Button);
