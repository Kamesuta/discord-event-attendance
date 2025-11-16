/**
 * 詳細メッセージ用のMessageUpdater実装
 * イベント詳細情報のメッセージの判定・更新・取得を担当
 */
import {
  Message,
  APIMessageTopLevelComponent,
  JSONEncodable,
  AttachmentBuilder,
  MessageFlags,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  GuildScheduledEventStatus,
  ComponentType,
} from 'discord.js';
import { EventWithHost, eventIncludeHost } from '../event/EventManager.js';
import { MessageUpdater, MessageUpdateContext } from './MessageUpdater.js';
import { config } from '../utils/config.js';
import { client } from '../utils/client.js';
import { prisma } from '../utils/prisma.js';
import { ScheduleMessageData } from '../commands/event_creator_command/schedule/types.js';
import { BannerImageUtil } from '../commands/event_creator_command/schedule/BannerImageUtil.js';
import userManager from '../event/UserManager.js';
import messageEditor from '../utils/discord/MessageEditor.js';
import statusCommand from '../commands/status_command/StatusCommand.js';

/**
 * 詳細メッセージ用のMessageUpdater実装
 * イベント詳細情報のメッセージの判定・更新・取得を担当
 */
class DetailMessageUpdater implements MessageUpdater {
  /**
   * 詳細メッセージかどうかを判定
   * @param message Discordメッセージ
   * @returns 判定結果
   */
  canParseMessage(message: Message): boolean {
    // アナウンスメッセージを取得 (0番目か1番目にある想定)
    const announceMessage = message.components
      .slice(0, 2)
      .find((component) => component.type === ComponentType.TextDisplay);
    if (announceMessage?.type !== ComponentType.TextDisplay) return false;

    // 期間情報の正規表現にマッチするかチェック
    return /<t:\d+:D> 〜 <t:\d+:D> の予定一覧/.test(announceMessage.content);
  }

  /**
   * 詳細メッセージを更新
   * @param message Discordメッセージ
   * @param _context 更新コンテキスト（スケジュールメッセージでは無視）
   * @returns 更新されたメッセージ
   */
  async updateMessage(
    message: Message,
    _context?: MessageUpdateContext,
  ): Promise<Message | undefined> {
    const data = await this._parseScheduleMessage(message);
    if (!data) {
      throw new Error('このメッセージは詳細メッセージではありません');
    }
    const { components, attachments } = await this.createDetailComponents(
      data.events,
      data.start,
      data.end,
    );
    return await messageEditor.editMessage(message, {
      components: components,
      files: attachments,
      flags:
        MessageFlags.IsComponentsV2 |
        MessageFlags.SuppressEmbeds |
        MessageFlags.IsCrosspost,
    });
  }

  /**
   * 関連する詳細メッセージを取得
   * @param event イベント
   * @returns 関連メッセージ配列
   */
  async getRelatedMessages(event: EventWithHost): Promise<Message[]> {
    const messages: Message[] = [];
    const channelId = config.schedule_channel_id;
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return messages;
    const fetchedMessages = await channel.messages.fetch({ limit: 100 });
    for (const [, message] of fetchedMessages) {
      const data = await this._parseScheduleMessage(message);
      if (data && data.events.some((e) => e.id === event.id)) {
        messages.push(message);
      }
    }
    return messages;
  }

  /**
   * メッセージからScheduleMessageDataをパース
   * @param message Discordメッセージ
   * @returns ScheduleMessageDataまたはnull
   */
  private async _parseScheduleMessage(
    message: Message,
  ): Promise<ScheduleMessageData | null> {
    // 詳細メッセージの先頭に特徴的なテキストがあるかで判定
    if (!this.canParseMessage(message)) return null;

    // アナウンスメッセージを取得
    const announceMessage = message.components
      .slice(0, 2)
      .find((component) => component.type === ComponentType.TextDisplay);
    if (announceMessage?.type !== ComponentType.TextDisplay) return null;

    // 期間情報を抽出（例: <t:1234567890:D> 〜 <t:1234567891:D>）
    const timeMatch = announceMessage.content.match(
      /<t:(\d+):D> 〜 <t:(\d+):D> の予定一覧/,
    );
    if (!timeMatch) return null;
    const start = new Date(parseInt(timeMatch[1]) * 1000);
    const end = new Date(parseInt(timeMatch[2]) * 1000);
    const events: EventWithHost[] = await prisma.event.findMany({
      where: {
        active: { not: GuildScheduledEventStatus.Canceled },
        scheduleTime: { gte: start, lt: end },
      },
      orderBy: [{ scheduleTime: 'asc' }],
      ...eventIncludeHost,
    });
    return new ScheduleMessageData(start, end, events);
  }

  /**
   * 詳細情報のメッセージコンポーネントを生成
   * @param events イベントの配列
   * @param start 開始日
   * @param end 終了日
   * @returns 詳細情報のメッセージコンポーネントと添付ファイルの配列
   */
  async createDetailComponents(
    events: EventWithHost[],
    start: Date,
    end: Date,
  ): Promise<{
    components: JSONEncodable<APIMessageTopLevelComponent>[];
    attachments: AttachmentBuilder[];
  }> {
    const components: JSONEncodable<APIMessageTopLevelComponent>[] = [];
    const attachments: AttachmentBuilder[] = [];

    // バナー画像を処理（設定されている場合）
    if (config.event_banner_url) {
      // バナー画像を追加
      components.push(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setURL(config.event_banner_url)
            .setDescription('イベントバナー'),
        ),
      );
    }

    // ヘッダー部分
    components.push(
      new TextDisplayBuilder()
        .setContent(`<@&1226256982957363230> <@&1247016990347104317>
## 🎮 今週のイベント！🏁
毎日21時から約1時間、VCにてマイクラやその他ゲームで遊びます！
**新規も大歓迎**です。いきなりVCに入って🆗なので、ぜひご参加ください！
### <t:${Math.floor(start.getTime() / 1000)}:D> 〜 <t:${Math.floor(end.getTime() / 1000 - 1)}:D> の予定一覧
-# ※主催者の都合で予定が変わることがあります
-# 21時以外のイベントには 🌞 マークつけています～`),
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
        const processedImageBuffer = await BannerImageUtil.processImage(
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
通知を受け取りたい/不要な方は <id:customize> からGET/解除できます
### 📊統計コマンドについて
下記コマンドを使うと、過去イベントを検索したりランキングを見たり出来ます～
</status event_list:${statusCommand.rootApplicationCommand?.id}> </status ranking:${statusCommand.rootApplicationCommand?.id}> </status user:${statusCommand.rootApplicationCommand?.id}>`),
    );

    return { components, attachments };
  }
}

export default new DetailMessageUpdater();
