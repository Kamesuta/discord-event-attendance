import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventManager from '../../event/EventManager.js';
import eventAdminCommand from './EventAdminCommand.js';
import { updateAttendanceTime } from '../../event/attendance_time.js';
import { prisma } from '../../utils/prisma.js';

class EventAdminRecalcTimeCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('recalc_time')
    .setDescription('VCの参加時間を再計算します');

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベント情報を更新
    await interaction.deferReply({ ephemeral: true });
    const event = await eventManager.getEvent(interaction);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    if (!event.endTime) {
      await interaction.editReply({
        content: 'イベントが終了していません',
      });
      return;
    }

    // VC時間が記録されてなくて、出席マークが付いていなくて、メモもないユーザーをクリーンアップ
    await prisma.userStat.deleteMany({
      /* eslint-disable @typescript-eslint/naming-convention */
      where: {
        eventId: event.id,
        AND: {
          voiceLogs: {
            none: {},
          },
          show: null,
          memo: null,
        },
      },
      /* eslint-enable @typescript-eslint/naming-convention */
    });

    // 一旦全員のVC参加時間をリセット
    await prisma.userStat.updateMany({
      where: {
        eventId: event.id,
      },
      data: {
        duration: 0,
      },
    });

    // 参加者のVC参加時間を再計算
    await updateAttendanceTime(event, event.endTime);

    await interaction.editReply({
      content: `イベント「${event.name}」(ID: ${event.id})のVC参加時間を再計算しました`,
    });
  }
}

export default new EventAdminRecalcTimeCommand(eventAdminCommand);
