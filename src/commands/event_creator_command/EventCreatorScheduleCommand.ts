import {
  ChatInputCommandInteraction,
  GuildScheduledEventStatus,
  SlashCommandSubcommandBuilder,
  MessageFlags,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  APIMessageTopLevelComponent,
  JSONEncodable,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  AttachmentBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import { config } from '../../utils/config.js';
import { prisma } from '../../index.js';
import eventCreatorCommand from './EventCreatorCommand.js';
import { eventIncludeHost, EventWithHost } from '../../event/EventManager.js';
import sharp from 'sharp';

class EventCreatorScheduleCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('schedule')
    .setDescription('1週間分のスケジュールメッセージを作成します');

  /**
   * 画像をダウンロードして高さを半分にリサイズする
   * @param imageUrl 元の画像URL
   * @returns リサイズされた画像のバッファ
   */
  private async _processImage(imageUrl: string): Promise<Buffer> {
    // 画像をダウンロード
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());

    // 画像の情報を取得
    const metadata = await sharp(imageBuffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Could not get image dimensions');
    }

    // 高さを半分にして、上下を切り取る
    const newHeight = Math.floor(metadata.height / 2);
    const cropTop = Math.floor((metadata.height - newHeight) / 2);

    // 画像を加工
    const processedBuffer = await sharp(imageBuffer)
      .extract({
        left: 0,
        top: cropTop,
        width: metadata.width,
        height: newHeight,
      })
      .png() // PNG形式で出力
      .toBuffer();

    return processedBuffer;
  }

  /**
   * 週間カレンダー形式のメッセージコンポーネントを生成
   * @param events イベントの配列
   * @returns カレンダー形式のメッセージコンポーネント配列
   */
  private _createCalendarText(events: EventWithHost[]): string {
    const baseTitle = '今週のイベントリスト';
    const titleChars = [...baseTitle.split('')];

    // イベント数に応じて「!」を追加
    while (titleChars.length < events.length) {
      titleChars.push('!');
    }

    // タイトルの文字にURLを付ける
    const titleWithLinks = titleChars
      .map((char, index) => {
        if (index < events.length) {
          const event = events[index];
          return `[${char}](https://discord.com/events/${config.guild_id}/${event.eventId})`;
        }
        return char;
      })
      .join('');

    return `## 📆 ${titleWithLinks}`;
  }

  /**
   * 詳細情報のメッセージコンポーネントを生成
   * @param events イベントの配列
   * @param start 開始日
   * @param end 終了日
   * @returns 詳細情報のメッセージコンポーネントと添付ファイルの配列
   */
  private async _createDetailComponents(
    events: EventWithHost[],
    start: Date,
    end: Date,
  ): Promise<{
    components: JSONEncodable<APIMessageTopLevelComponent>[];
    attachments: AttachmentBuilder[];
  }> {
    const components: JSONEncodable<APIMessageTopLevelComponent>[] = [];
    const attachments: AttachmentBuilder[] = [];

    components.push(
      // ヘッダー部分
      new TextDisplayBuilder()
        .setContent(`<@&1226256982957363230> <@&1247016990347104317>

## 🎮 今週もかめぱゲームウィーク開催します！🏁

ゲームやりたかったけど、遊ぶ友達がいなくて・・・キッカケがなくて・・・
と思っている君も楽しめるように、毎日1時間だけ、いろんなゲームをローテーションで遊んでいこうと思います。

**気になるイベントがあったら↑の「興味あり」ボタンを押してください！** (モチベが上がります！)

期間: <t:${Math.floor(start.getTime() / 1000)}:D> 〜 <t:${Math.floor(end.getTime() / 1000 - 1)}:D> の21:00～ (毎日約1時間程度)
※主催者の都合で予定が変わることがあります

**いつもの時間以外のイベントには 🌞 マークつけています～**`),
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large),
    );

    // イベントごとのコンポーネントを追加
    for (const event of events) {
      if (!event.scheduleTime) continue;

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

      // 主催者
      const hostDescription = event.host
        ? ` (<@${event.host.userId}>主催)`
        : '';

      // イベントタイトルを追加
      const section = new ContainerBuilder();
      if (event.coverImage) {
        try {
          // 画像をダウンロードして加工
          const filename = `event_${event.id}_cover.png`;
          const processedImageBuffer = await this._processImage(
            event.coverImage,
          );

          // 添付ファイルを作成
          const attachment = new AttachmentBuilder(processedImageBuffer, {
            name: filename,
            description: `${event.name}のカバー画像（リサイズ済み）`,
          });
          attachments.push(attachment);

          section.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
              new MediaGalleryItemBuilder()
                .setURL(`attachment://${filename}`)
                .setDescription(`${event.name}のカバー画像`),
            ),
          );
        } catch (error) {
          console.error(
            `Failed to process image for event ${event.id}:`,
            error,
          );
          // エラーの場合は元の画像を使用
          section.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
              new MediaGalleryItemBuilder()
                .setURL(event.coverImage)
                .setDescription(`${event.name}のカバー画像`),
            ),
          );
        }
      }
      section.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${dateText}${timeText}: ${emoji}[${event.name}](https://discord.com/events/${config.guild_id}/${event.eventId})${hostDescription}\n${event.description}`,
        ),
      );
      components.push(section);
    }

    // フッター部分
    components.push(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large),
      new TextDisplayBuilder().setContent(`### 📧通知ロールについて
通知を受け取りたい/不要な方は <id:customize> からGET/解除できます`),
    );

    return { components, attachments };
  }

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントを開始
    await interaction.deferReply({ ephemeral: true });

    // イベント予定チャンネルを取得
    const scheduleChannel = await interaction.guild?.channels.fetch(
      config.schedule_channel_id,
    );
    if (!scheduleChannel?.isTextBased()) {
      await interaction.editReply(
        'イベント予定チャンネルが見つかりませんでした。',
      );
      return;
    }

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
    const events: EventWithHost[] = await prisma.event.findMany({
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
      ...eventIncludeHost,
    });

    // 古いメッセージを削除
    const messages = await scheduleChannel.messages.fetch({ limit: 100 });
    const oldMessages = messages.filter((msg) => {
      return (
        msg.author.id === interaction.client.user.id &&
        msg.content.startsWith('## 📆 ')
      );
    });

    // 1個だけ削除
    if (oldMessages.size > 0) {
      const oldestMessage = oldMessages.first();
      if (oldestMessage) {
        await oldestMessage.delete();
      }
    }

    // カレンダーメッセージを送信
    const calendarText = this._createCalendarText(events);
    await scheduleChannel.send(calendarText);

    // 詳細メッセージを送信
    const { components, attachments } = await this._createDetailComponents(
      events,
      start,
      end,
    );
    await scheduleChannel.send({
      components: components,
      files: attachments,
      flags: MessageFlags.IsComponentsV2,
    });

    // 成功メッセージを返信
    await interaction.editReply('イベント予定を投稿しました！');
  }
}

export default new EventCreatorScheduleCommand(eventCreatorCommand);
