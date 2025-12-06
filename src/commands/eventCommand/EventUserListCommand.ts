import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '@/commands/base/commandBase';
import { eventCommand } from './EventCommand';
import { eventManager } from '@/domain/services/EventManager';
import { prisma } from '@/utils/prisma';
import { userManager } from '@/domain/services/UserManager';

class EventUserListCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('user_list')
    .setDescription(
      'スプレッドシートで使えるように、名前とユーザーIDのリストを表示します',
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // 公開前のメンバー確認
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const event = await eventManager.getEvent(interaction);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // メンバーマネージャーを取得する
    const members = interaction.guild?.members;
    if (!members) {
      await interaction.editReply({
        content: 'Discordからメンバーリストを取得できませんでした',
      });
      return;
    }

    // 参加者を列挙する
    const attendance = (
      await prisma.userStat.findMany({
        where: {
          eventId: event.id,
          show: true,
        },
        include: {
          user: true,
        },
      })
    ).map((stat) => stat.user);

    // メンバーの名前とIDを取得する
    const memberTextList = attendance
      .map((user) => {
        const memberName = userManager.getUserName(user);
        return memberName ? `${memberName},${user.userId}` : '';
      })
      .join('\n');

    // メッセージを送信する
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('参加者リスト (CSV形式)')
          .setDescription('```csv\n' + memberTextList + '\n```')
          .addFields({
            name: 'スプレッドシートへの貼付け方法',
            value:
              '1. ↑の右上のコピーマークを押してコピー\n2. スプレッドシートに貼り付け\n3. 左下のペーストアイコン→「テキストを列に分割」を選択\n4. /event game_csv file:参加者リスト.csv でアップロード',
          })
          .setColor('#ff8c00'),
      ],
    });
  }
}

/**
 * EventUserListCommandのインスタンス
 */
export const eventUserListCommand = new EventUserListCommand(eventCommand);
