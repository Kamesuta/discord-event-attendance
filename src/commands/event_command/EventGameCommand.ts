import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventCommand from './EventCommand.js';
import { addGameResult } from '../../event/game.js';
import eventManager from '../../event/EventManager.js';

class EventGameCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('game')
    .setDescription('ゲームの勝敗を記録します')
    .addStringOption((option) =>
      option.setName('game_name').setDescription('ゲーム名').setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank1')
        .setDescription('1位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank2')
        .setDescription('2位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank3')
        .setDescription('3位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank4')
        .setDescription('4位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank5')
        .setDescription('5位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank6')
        .setDescription('6位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank7')
        .setDescription('7位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank8')
        .setDescription('8位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank9')
        .setDescription('9位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank10')
        .setDescription('10位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank11')
        .setDescription('11位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank12')
        .setDescription('12位のユーザー')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('url').setDescription('試合のURL').setRequired(false),
    )
    .addAttachmentOption((option) =>
      option.setName('image').setDescription('試合の画像').setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName('delete_image')
        .setDescription('試合の画像を削除するか')
        .setRequired(false),
    )
    .addNumberOption((option) =>
      option
        .setName('xp_multiplier')
        .setDescription('XP倍率')
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName('game_id')
        .setDescription('編集する試合ID')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('team')
        .setDescription(
          'チーム指定子 (2人チームの例:「2,4」) (参加賞の例:「=」) (3人に順位つけて、残りは参加賞の例:「3」)',
        )
        .setRequired(false),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // ゲームの勝敗を記録
    await interaction.deferReply({ ephemeral: false });
    const event = await eventManager.getEvent(interaction);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }
    await addGameResult(interaction, event);
  }
}

export default new EventGameCommand(eventCommand);
