import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventAdminCommand from './EventAdminCommand.js';
import { syncRoleByCondition } from '../../event/roleManager.js';

class EventAdminSyncRoleCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('sync_role')
    .setDescription('ロールを付与条件に応じて付与/剥奪します');

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントを終了
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guild) {
      await interaction.editReply({
        content: 'サーバーでコマンドを実行してください',
      });
      return;
    }

    // ロールを同期
    const result = await syncRoleByCondition(interaction.guild);

    await interaction.editReply({
      content: result,
    });
  }
}

export default new EventAdminSyncRoleCommand(eventAdminCommand);
