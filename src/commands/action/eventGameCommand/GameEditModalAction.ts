import {
  ActionRowBuilder,
  ComponentType,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { eventManager } from '@/domain/services/EventManager';
import { ModalActionInteraction } from '@/commands/base/actionBase';
import {
  eventGameCommand,
  EditData,
} from '@/commands/eventCommand/EventGameCommand';
class GameEditModalAction extends ModalActionInteraction {
  /**
   * ゲーム編集モーダルを作成
   * @param editData 編集データ
   * @returns 作成したビルダー
   */
  override create(editData: EditData): ModalBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId({
      evt: `${editData.game.eventId}`,
      key: editData.key,
    });

    // 初期値を設定
    const gameNameInput = new TextInputBuilder()
      .setCustomId('game_name')
      .setRequired(false)
      .setLabel(
        'ゲーム名 (「＄」がイベント名、「＠」が何番目の試合かに変換されます)',
      )
      .setMinLength(0)
      .setMaxLength(128)
      .setStyle(TextInputStyle.Short)
      .setValue(editData.game.name);

    const rankInput = new TextInputBuilder()
      .setCustomId('rank')
      .setRequired(false)
      .setLabel('ランク指定子 (2人チームの例:「AB,CD」) (参加賞の例:「,,ABC」)')
      .setMinLength(0)
      .setMaxLength(128)
      .setStyle(TextInputStyle.Short)
      .setValue(editData.rank);

    // ダイアログを作成
    return new ModalBuilder()
      .setTitle('ゲーム情報入力 (空欄で変更なし)')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(gameNameInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(rankInput),
      )
      .setCustomId(customId);
  }

  /** @inheritdoc */
  async onCommand(
    interaction: ModalSubmitInteraction,
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

    // 編集データを取得
    const editData = await eventGameCommand
      .getEditData(key, interaction, event.id)
      .catch(async (content: string) => {
        await interaction.editReply({ content });
      });
    if (!editData) return;

    // ゲーム編集状態を設定
    const gameNameAction = interaction.components[0];
    const rankAction = interaction.components[1];
    eventGameCommand.setEditData(editData, {
      gameName:
        gameNameAction?.type === ComponentType.ActionRow
          ? gameNameAction.components[0]?.value
          : null,
      rank:
        rankAction?.type === ComponentType.ActionRow
          ? rankAction.components[0]?.value
          : null,
    });

    // Embedを更新
    await eventGameCommand.updateEmbed(event, editData, interaction);
  }
}

/**
 * GameEditModalActionのインスタンス
 */
export const gameEditModalAction = new GameEditModalAction('gedit');
