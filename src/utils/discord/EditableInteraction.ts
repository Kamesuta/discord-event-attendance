import {
  DiscordAPIError,
  InteractionEditReplyOptions,
  Message,
  MessagePayload,
  RepliableInteraction,
} from 'discord.js';
import { logger } from '../log.js';

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
   * @param fallbackInteraction 現在のインタラクション (フォールバック用)
   * @param message 送信するメッセージ
   * @returns 送信されたメッセージ
   */
  async editReply(
    fallbackInteraction: RepliableInteraction,
    message: string | MessagePayload | InteractionEditReplyOptions,
  ): Promise<Message> {
    if (fallbackInteraction === this.interaction) {
      // 新規の場合、そのまま返信
      return await fallbackInteraction.editReply(message);
    } else {
      // 2回目以降の場合、元のメッセージを編集し、リプライを削除
      try {
        return await this.interaction.editReply(message);
      } catch (error) {
        // Unknown Interactionエラーが発生した場合、新しいInteractionにリプライを送信
        if (error instanceof DiscordAPIError && error.code === 10062) {
          logger.warn(
            `インタラクションの期限切れ${this.interaction.isMessageComponent() ? `: メッセージID: ${this.interaction.message.id}` : ''}`,
          );
          const reply = await fallbackInteraction.followUp({
            ephemeral: this.interaction.ephemeral ?? true,
          });
          // 新しいInteractionに更新
          this.interaction = fallbackInteraction;
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
