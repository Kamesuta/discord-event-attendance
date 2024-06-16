import {
  DiscordAPIError,
  InteractionEditReplyOptions,
  Message,
  MessagePayload,
  RepliableInteraction,
} from 'discord.js';
import { logger } from '../utils/log.js';

/**
 * 編集可能なインタラクション
 * 一度目のインタラクションを保持しておき、更新することができる
 */
export class EditableInteraction {
  /**
   * インタラクションを初期化します
   * @param interaction 初期のインタラクション
   */
  constructor(public interaction: RepliableInteraction) {}

  /**
   * メッセージを更新 or 新規にリプライを送信します
   * @param interaction 現在のインタラクション
   * @param message 送信するメッセージ
   * @returns 送信されたメッセージ
   */
  async editReply(
    interaction: RepliableInteraction | undefined,
    message: string | MessagePayload | InteractionEditReplyOptions,
  ): Promise<Message> {
    if (!interaction) {
      // インタラクションが指定されていない場合、元のメッセージを編集
      return await this.interaction.editReply(message);
    } else if (interaction === this.interaction) {
      // 新規の場合、そのまま返信
      return await interaction.editReply(message);
    } else {
      // 2回目以降の場合、元のメッセージを編集し、リプライを削除
      try {
        const reply = await this.interaction.editReply(message);
        await interaction.deleteReply();
        return reply;
      } catch (error) {
        // Unknown Interactionエラーが発生した場合、新しいInteractionにリプライを送信
        if (error instanceof DiscordAPIError && error.code === 10062) {
          logger.warn(
            `インタラクションの期限切れ${this.interaction.isMessageComponent() ? `: メッセージID: ${this.interaction.message.id}` : ''}`,
          );
          const reply = await interaction.editReply(message);
          await interaction.deleteReply();
          // 新しいInteractionに更新
          this.interaction = interaction;
          return reply;
        }
        throw error;
      }
    }
  }

  /**
   * 編集先インタラクションをリセットします
   * @param interaction 新しいインタラクション
   */
  reset(interaction: RepliableInteraction): void {
    this.interaction = interaction;
  }
}
