import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildScheduledEventStatus,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventAdminCommand from './EventAdminCommand.js';
import { config } from '../../utils/config.js';
import { prisma } from '../../index.js';
import { Event } from '@prisma/client';

class EventAdminScheduleCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('schedule')
    .setDescription('1週間分のスケジュールメッセージを作成します');

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントを開始
    await interaction.deferReply({ ephemeral: true });

    // 期間を計算 (水曜日で次の週になるようにする)
    // 現在:11/19(火) → 11/17(日)～11/23(土)
    // 現在:11/20(水) → 11/24(日)～11/30(土)
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - now.getDay() + 7);
    start.setHours(0, 0, 0, 0);
    if (now.getDay() < 3 /* 水曜 */) {
      start.setDate(start.getDate() - 7);
    }
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    // イベントを取得
    const events: Event[] = await prisma.event.findMany({
      where: {
        active: {
          not: GuildScheduledEventStatus.Canceled,
        },
        scheduleTime: {
          gte: start,
          lt: end,
        },
      },
      orderBy: [
        {
          scheduleTime: 'asc',
        },
      ],
    });

    // イベントごとのメッセージを作成
    const eventMessages = events.flatMap((event) => {
      if (!event.scheduleTime) {
        return [];
      }

      // 日付を取得 (9/29(日) という表示にフォーマット)
      const daysOfWeek = ['日', '月', '火', '水', '木', '金', '土'];
      const dateText = `${event.scheduleTime.getMonth() + 1}/${event.scheduleTime.getDate()}(${daysOfWeek[event.scheduleTime.getDay()]})`;

      // 時間 (21時以外は「🌞」をつけて表示)
      const timeText =
        event.scheduleTime.getHours() === 21 &&
        event.scheduleTime.getMinutes() === 0
          ? ''
          : ` 🌞${event.scheduleTime.getHours()}:${event.scheduleTime.getMinutes().toString().padStart(2, '0')}～`;

      // 絵文字を取得
      const emoji =
        Object.entries(config.emojis).find(([key, _emoji]) =>
          event.name.includes(key),
        )?.[1] ?? '';

      // 説明文を作成
      // 最後の行に「主催」という文字があれば削除
      const lines = (event.description ?? '').split('\n');
      if (lines[lines.length - 1].includes('主催')) {
        lines.pop();
      }

      return [
        `
### ${dateText}${timeText}: ${emoji}[${event.name}](https://discord.com/events/${config.guild_id}/${event.eventId})
${lines.join('\n')}
<@${event.hostId}> さんが主催してくれます～
`,
      ];
    });

    // メッセージを作成
    const message = `
<@&1226256982957363230> <@&1247016990347104317> 
## 🎮 今週もかめぱゲームウィーク開催します！🏁
ゲームやりたかったけど、遊ぶ友達がいなくて・・・キッカケがなくて・・・
と思っている君も楽しめるように、毎日1時間だけ、いろんなゲームをローテーションで遊んでいこうと思います。

**気になるイベントがあったら↓の「興味あり」ボタンを押してください！** (モチベが上がります！)

期間: <t:${Math.floor(start.getTime() / 1000)}:D> 〜 <t:${Math.floor(end.getTime() / 1000 - 1)}:D> の21:00～ (毎日約1時間程度)
※主催者の都合で予定が変わることがあります

**いつもの時間以外のイベントには 🌞 マークつけています～**
${eventMessages.join('')}
### 📧通知ロールについて
通知を受け取りたい/不要な方は <id:customize> からGET/解除できます
`;

    // Embedを作成
    const embed = new EmbedBuilder()
      .setTitle('お知らせ文')
      .setDescription('```' + message + '\n```')
      .setColor('#FFC0CB');

    await interaction.editReply({
      embeds: [embed],
    });
  }
}

export default new EventAdminScheduleCommand(eventAdminCommand);
