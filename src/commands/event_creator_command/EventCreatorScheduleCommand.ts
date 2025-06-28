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
import sharp, { OverlayOptions } from 'sharp';
import userManager from '../../event/UserManager.js';

class EventCreatorScheduleCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('schedule')
    .setDescription('1週間分のスケジュールメッセージを作成します');

  /**
   * デフォルト背景画像を生成する
   * @param width 幅
   * @param height 高さ
   * @param eventName イベント名（色の決定に使用）
   * @returns デフォルト背景画像のバッファ
   */
  private async _createDefaultBackground(
    width: number,
    height: number,
    eventName: string,
  ): Promise<Buffer> {
    // イベント名から色を決定（簡単なハッシュベースの色生成）
    let hash = 0;
    for (let i = 0; i < eventName.length; i++) {
      hash = eventName.charCodeAt(i) + ((hash << 5) - hash);
    }

    // HSLカラーを生成（彩度と明度を調整してきれいな色にする）
    const hue = Math.abs(hash) % 360;
    const saturation = 60 + (Math.abs(hash) % 20); // 60-80%
    const lightness = 45 + (Math.abs(hash) % 15); // 45-60%

    const color1 = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    const color2 = `hsl(${(hue + 60) % 360}, ${saturation}%, ${lightness - 10}%)`;

    // SVGでグラデーション背景を作成
    const backgroundSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg-gradient)" />
      </svg>
    `;

    // SVGをPNGに変換
    return await sharp(Buffer.from(backgroundSvg)).png().toBuffer();
  }

  /**
   * Discordのカスタム絵文字から画像URLを取得する
   * @param emoji 絵文字文字列
   * @returns 画像URL（カスタム絵文字の場合）、またはnull（Unicode絵文字の場合）
   */
  private _getEmojiImageUrl(emoji: string): string | null {
    // Discordのカスタム絵文字の形式: <:name:id>
    const match = emoji.match(/<:([^:]+):(\d+)>/);
    if (match) {
      const [, name, id] = match;
      return `https://cdn.discordapp.com/emojis/${id}.png`;
    }
    return null;
  }

  /**
   * 画像をダウンロードして高さを半分にリサイズし、イベント名を埋め込む
   * @param imageUrl 元の画像URL（nullの場合はデフォルト背景を使用）
   * @param eventName イベント名
   * @param hostAvatarUrl 主催者のアバター画像URL（オプション）
   * @param emoji イベントの絵文字（オプション）
   * @returns リサイズされた画像のバッファ
   */
  private async _processImage(
    imageUrl: string | null,
    eventName: string,
    hostAvatarUrl?: string,
    emoji?: string,
  ): Promise<Buffer> {
    // 出力サイズを固定
    const outputWidth = 512;
    const outputHeight = 80;
    const fontSize = 16;
    const textColor = '#FFFFFF';
    const shadowColor = '#000000';
    const padding = 10;
    const avatarSize = 32;
    const avatarPadding = 8;
    const emojiSize = 24;
    const emojiPadding = 12;

    let backgroundImage: Buffer;

    if (imageUrl) {
      // 画像をダウンロード
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }

      const imageBuffer = Buffer.from(await response.arrayBuffer());

      // 背景画像をリサイズして切り抜き
      backgroundImage = await sharp(imageBuffer)
        .resize(outputWidth, outputHeight, {
          fit: 'cover',
          position: 'center',
        })
        .png()
        .toBuffer();
    } else {
      // デフォルト背景を生成
      backgroundImage = await this._createDefaultBackground(
        outputWidth,
        outputHeight,
        eventName,
      );
    }

    // 合成用の要素を準備
    const compositeElements: OverlayOptions[] = [];

    // 絵文字画像を処理（カスタム絵文字の場合）
    let emojiImageBuffer: Buffer | null = null;
    if (emoji) {
      const emojiImageUrl = this._getEmojiImageUrl(emoji);
      if (emojiImageUrl) {
        try {
          const emojiResponse = await fetch(emojiImageUrl);
          if (emojiResponse.ok) {
            const emojiBuffer = Buffer.from(await emojiResponse.arrayBuffer());
            emojiImageBuffer = await sharp(emojiBuffer)
              .resize(emojiSize, emojiSize, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 },
              })
              .png()
              .toBuffer();
          }
        } catch (error) {
          console.error('Failed to download emoji image:', error);
          // 絵文字画像のダウンロードに失敗しても続行
        }
      }
    }

    // テキストオーバーレイ用のSVGを作成
    const textSvg = `
      <svg width="${outputWidth}" height="${outputHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="1" dy="1" stdDeviation="2" flood-color="${shadowColor}" flood-opacity="0.8"/>
          </filter>
        </defs>
        
        <!-- 半透明の背景オーバーレイ -->
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.4)" />
        
        <!-- 絵文字（Unicode絵文字の場合） -->
        ${
          emoji && !emojiImageBuffer
            ? `<text 
          x="${emojiPadding + emojiSize / 2}" 
          y="${outputHeight / 2 + emojiSize / 3}" 
          font-size="${emojiSize}" 
          text-anchor="middle" 
          dominant-baseline="middle"
          filter="url(#shadow)"
        >${emoji}</text>`
            : ''
        }
        
        <!-- イベント名テキスト -->
        <text 
          x="${emoji ? emojiPadding + emojiSize + padding : outputWidth / 2}" 
          y="${outputHeight - padding}" 
          font-family="Arial, sans-serif" 
          font-size="${fontSize}" 
          font-weight="bold"
          fill="${textColor}" 
          text-anchor="${emoji ? 'start' : 'middle'}" 
          dominant-baseline="baseline"
          filter="url(#shadow)"
        >${eventName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>
      </svg>
    `;

    // 先にテキストオーバーレイを追加
    compositeElements.push({
      input: Buffer.from(textSvg),
      blend: 'over',
    });

    // カスタム絵文字画像を追加（存在する場合）
    if (emojiImageBuffer) {
      compositeElements.push({
        input: emojiImageBuffer,
        left: emojiPadding,
        top: Math.floor((outputHeight - emojiSize) / 2),
      });
    }

    // 主催者のアバター画像を処理（存在する場合）
    if (hostAvatarUrl) {
      try {
        const avatarResponse = await fetch(hostAvatarUrl);
        if (avatarResponse.ok) {
          const avatarBuffer = Buffer.from(await avatarResponse.arrayBuffer());

          // アバター画像を円形にクロップしてリサイズし、白い縁取りを追加
          const circularAvatar = await sharp(avatarBuffer)
            .resize(avatarSize, avatarSize, {
              fit: 'cover',
              position: 'center',
            })
            .composite([
              {
                input: Buffer.from(`
                  <svg width="${avatarSize}" height="${avatarSize}">
                    <defs>
                      <mask id="circle">
                        <circle cx="${avatarSize / 2}" cy="${avatarSize / 2}" r="${avatarSize / 2 - 1}" fill="white"/>
                      </mask>
                    </defs>
                    <circle cx="${avatarSize / 2}" cy="${avatarSize / 2}" r="${avatarSize / 2 - 0.5}" fill="none" stroke="white" stroke-width="2"/>
                    <rect width="100%" height="100%" fill="black" mask="url(#circle)"/>
                  </svg>
                `),
                blend: 'dest-in',
              },
              {
                input: Buffer.from(`
                  <svg width="${avatarSize}" height="${avatarSize}">
                    <circle cx="${avatarSize / 2}" cy="${avatarSize / 2}" r="${avatarSize / 2 - 1}" fill="none" stroke="white" stroke-width="2"/>
                  </svg>
                `),
                blend: 'over',
              },
            ])
            .png()
            .toBuffer();

          // アバター画像を右上に配置（オーバーレイの後に追加）
          compositeElements.push({
            input: circularAvatar,
            left: outputWidth - avatarSize - avatarPadding,
            top: avatarPadding,
          });
        }
      } catch (error) {
        console.error('Failed to process host avatar:', error);
        // アバター処理に失敗しても続行
      }
    }

    // 背景画像とすべての要素を合成
    const processedBuffer = await sharp(backgroundImage)
      .composite(compositeElements)
      .png()
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
      try {
        // 画像を加工（coverImageがない場合はデフォルト背景を使用）
        const filename = `event_${event.id}_cover.png`;
        const processedImageBuffer = await this._processImage(
          event.coverImage,
          event.name,
          event.host ? userManager.getUserAvatar(event.host) : undefined,
          emoji,
        );

        // 添付ファイルを作成
        const attachment = new AttachmentBuilder(processedImageBuffer, {
          name: filename,
          description: `${event.name}のカバー画像（${event.coverImage ? 'リサイズ済み' : 'デフォルト背景'}）`,
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
        console.error(`Failed to process image for event ${event.id}:`, error);
        // エラーの場合、coverImageがあれば元の画像を使用、なければ画像なし
        if (event.coverImage) {
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
