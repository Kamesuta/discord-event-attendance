import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import { config } from '../../utils/config.js';
import eventCreatorCommand from './EventCreatorCommand.js';
import { EventWithHost } from '../../event/EventManager.js';
import preparationStatusMessageUpdater from '../../message_updaters/PreparationStatusMessageUpdater.js';

class EventCreatorPreparationPanelCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('prepare_panel')
    .setDescription('準備状況パネルメッセージを作成します');

  // schedule からも利用するために公開メソッドとして実装
  async outputPanel(
    interaction: ChatInputCommandInteraction,
    show: boolean,
  ): Promise<void> {
    const events: EventWithHost[] =
      await preparationStatusMessageUpdater.fetchEvents();
    const { content: preparationContent, embed: preparationEmbed } =
      preparationStatusMessageUpdater.createPreparationStatusText(events);
    const preparationComponents =
      preparationStatusMessageUpdater.createPreparationStatusComponents();

    if (show) {
      const eventPanelChannel = await interaction.guild?.channels.fetch(
        config.event_panel_channel_id,
      );
      if (!eventPanelChannel?.isTextBased()) {
        await interaction.editReply(
          '準備状況パネルチャンネルが見つかりませんでした。',
        );
        return;
      }

      // 古い準備状況パネルメッセージを削除
      const panelMessages = await eventPanelChannel.messages.fetch({
        limit: 100,
      });
      const oldPanelMessages = panelMessages.filter((msg) => {
        return (
          msg.author.id === interaction.client.user.id &&
          msg.content.startsWith('## 📝 準備状況パネル')
        );
      });

      for (const [, msg] of oldPanelMessages) {
        await msg.delete();
      }

      await eventPanelChannel.send({
        content: preparationContent,
        embeds: [preparationEmbed],
        components: preparationComponents,
        allowedMentions: { users: [] },
      });
    } else {
      // プレビュー用にエフェメラルで返す
      await interaction.followUp({
        content: preparationContent,
        embeds: [preparationEmbed],
        components: preparationComponents,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { users: [] },
      });
    }
  }

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    await this.outputPanel(interaction, true);
    await interaction.editReply('準備状況パネルを投稿しました！');
  }
}

export default new EventCreatorPreparationPanelCommand(eventCreatorCommand);
