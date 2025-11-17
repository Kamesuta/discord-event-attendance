import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { MessageComponentActionInteraction } from '../base/action_base.js';
import { config } from '../../utils/config.js';

class AddRoleButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  /**
   * ボタンを作成
   * @returns 作成したビルダー
   */
  override create(): ButtonBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId();

    // ダイアログを作成
    return new ButtonBuilder()
      .setCustomId(customId)
      .setEmoji('🔔')
      .setLabel('クリックしてイベント通知を受け取る')
      .setStyle(ButtonStyle.Success);
  }

  /** @inheritdoc */
  async onCommand(
    interaction: ButtonInteraction,
    _params: URLSearchParams,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    // メンバーを取得
    const member = await interaction.guild?.members
      .fetch(interaction.user.id)
      .catch(() => undefined);
    if (!member) {
      await interaction.editReply({
        content: 'メンバー情報が取得できませんでした',
      });
      return;
    }

    // メッセージ
    const template = `
イベントが開始したらお知らせします～！
-# 通知解除は <id:customize> からできます
## 🎉イベントの楽しみ方
- イベントの開始時間になったら、気軽にVCに参加してみよう！
- VC付属のチャットになにか書けば返してくれるはず！とりあえず挨拶などしてみよう
  - VC付属のチャットの使い方がわからない方はこちら https://discord.com/channels/930083398691733565/931586361817964634 (ちょっと隠れた位置にあります！)
- ゲームへの参加方法は https://discord.com/channels/930083398691733565/947162719885352970 に書いてあります！(書いてない場合はチャットで聞いてみよう～)
`;

    // ロールを付与
    if (member.roles.cache.has(config.announcement_role_id)) {
      await interaction.editReply({
        content: `🔔イベント通知を受け取る設定になっています！${template}`,
      });
      return;
    }
    await member?.roles.add(config.announcement_role_id);

    await interaction.editReply({
      content: `🔔イベント通知を受け取る設定になりました！${template}`,
    });
  }
}

/**
 * AddRoleButtonActionのインスタンス
 */
export const addRoleButtonAction = new AddRoleButtonAction(
  'addrole',
  ComponentType.Button,
);
