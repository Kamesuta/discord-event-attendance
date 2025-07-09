import {
  Message,
  TextChannel,
  ThreadChannel,
  ThreadAutoArchiveDuration,
  EmbedBuilder,
} from 'discord.js';
import { client } from '../utils/client.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/log.js';
import {
  hostRequestManager,
  HostRequestWithRelations,
} from './HostRequestManager.js';

/**
 * DM転送管理クラス
 * DMメッセージと管理チャンネル間のメッセージベース転送を担当
 */
export class DMRelayManager {
  /**
   * DMメッセージを管理チャンネルに転送
   * @param dmMessage DMメッセージ
   * @param hostRequestId お伺いリクエストID
   * @param eventName イベント名
   * @param userName ユーザー名
   * @returns Promise<void>
   */
  async relayDMToChannel(
    dmMessage: Message,
    hostRequestId: number,
    eventName: string,
    userName: string,
  ): Promise<void> {
    try {
      const managementChannel = this._getManagementChannel();
      if (!managementChannel) {
        logger.error('管理チャンネルが見つかりません');
        return;
      }

      // スレッドを取得または作成
      const thread = await this._getOrCreateDMThread(
        managementChannel,
        eventName,
        userName,
      );

      // メッセージを転送（元のDMメッセージIDを埋め込み）
      const embed = new EmbedBuilder()
        .setDescription(dmMessage.content || '*（テキストなし）*')
        .setAuthor({
          name: userName,
          iconURL: dmMessage.author.displayAvatarURL(),
        })
        .setFooter({
          text: `DM:${dmMessage.id} | HostRequest:${hostRequestId}`,
        })
        .setTimestamp(dmMessage.createdAt)
        .setColor(0x3498db);

      await thread.send({
        embeds: [embed],
      });

      logger.info(
        `DMを管理チャンネルに転送しました: User=${userName}, Event=${eventName}`,
      );
    } catch (error) {
      logger.error('DM転送でエラー:', error);
    }
  }

  /**
   * 管理チャンネルからDMに転送
   * @param channelMessage 管理チャンネルのメッセージ
   * @param targetUserId 転送先ユーザーID
   * @returns Promise<void>
   */
  async relayChannelToDM(
    channelMessage: Message,
    targetUserId: string,
  ): Promise<void> {
    try {
      // footerからHostRequestIDを抽出
      const hostRequestId = this._extractHostRequestId(channelMessage);
      if (!hostRequestId) {
        logger.warn('HostRequestIDが見つかりません');
        return;
      }

      const hostRequest = await hostRequestManager.getRequest(hostRequestId);
      if (!hostRequest) {
        logger.warn(`お伺いリクエストが見つかりません: ID=${hostRequestId}`);
        return;
      }

      // DMチャンネルを取得
      const user = await client.users.fetch(targetUserId);
      const dmChannel = await user.createDM();

      // 管理者名とメッセージを転送
      const embed = new EmbedBuilder()
        .setDescription(channelMessage.content || '*（テキストなし）*')
        .setAuthor({
          name: `管理者: ${channelMessage.author.displayName || channelMessage.author.username}`,
          iconURL: channelMessage.author.displayAvatarURL(),
        })
        .setColor(0x3498db)
        .setTimestamp();

      await dmChannel.send({
        embeds: [embed],
      });

      logger.info(
        `管理チャンネルメッセージをDMに転送しました: User=${user.username}, Admin=${channelMessage.author.username}`,
      );
    } catch (error) {
      logger.error('管理チャンネルからDM転送でエラー:', error);
    }
  }

  /**
   * DMメッセージがお伺い関連かチェック
   * @param dmMessage DMメッセージ
   * @returns Promise<HostRequestWithRelations | null>
   */
  async getHostRequestFromDM(
    dmMessage: Message,
  ): Promise<HostRequestWithRelations | null> {
    try {
      // DMチャンネルかつ、送信者がボットでない場合のみ処理
      if (!dmMessage.channel.isDMBased() || dmMessage.author.bot) {
        return null;
      }

      // DMメッセージに対する返信があるか確認（お伺いボタンのメッセージに対する返信）
      if (dmMessage.reference?.messageId) {
        const hostRequest = await hostRequestManager.getRequestByDmMessageId(
          dmMessage.reference.messageId,
        );
        return hostRequest;
      }

      // 最近のお伺いリクエストを確認
      const userId = parseInt(dmMessage.author.id);
      const recentRequests = await hostRequestManager.getRequestsByUser(
        userId,
        'pending',
      );

      // 最新のpendingリクエストを返す
      return recentRequests[0] || null;
    } catch (error) {
      logger.error('DM関連お伺いリクエストの取得でエラー:', error);
      return null;
    }
  }

  /**
   * 管理チャンネルメッセージがDM転送対象かチェック
   * @param channelMessage チャンネルメッセージ
   * @returns boolean
   */
  isDMRelayTarget(channelMessage: Message): boolean {
    // DM転送スレッド内のメッセージかチェック
    if (channelMessage.channel.isThread()) {
      const threadName = channelMessage.channel.name;
      return threadName.startsWith('[DM転送]');
    }

    return false;
  }

  /**
   * 管理チャンネルを取得
   * @returns TextChannel | null
   */
  private _getManagementChannel(): TextChannel | null {
    try {
      const channel = client.channels.cache.get(config.host_request_channel_id);
      if (channel?.isTextBased() && 'threads' in channel) {
        return channel as TextChannel;
      }
      return null;
    } catch (error) {
      logger.error('管理チャンネルの取得でエラー:', error);
      return null;
    }
  }

  /**
   * DMスレッドを取得または作成
   * @param channel 管理チャンネル
   * @param eventName イベント名
   * @param userName ユーザー名
   * @returns Promise<ThreadChannel>
   */
  private async _getOrCreateDMThread(
    channel: TextChannel,
    eventName: string,
    userName: string,
  ): Promise<ThreadChannel> {
    const threadName = `[DM転送] ${eventName} - ${userName}`;

    // 既存スレッドを検索
    const existingThread = channel.threads.cache.find(
      (thread) => thread.name === threadName,
    );

    if (existingThread) {
      return existingThread;
    }

    // 新規スレッド作成
    const thread = await channel.threads.create({
      name: threadName,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      reason: `${userName}さんとの主催者お伺いDM転送`,
    });

    logger.info(`新しいDM転送スレッドを作成: ${threadName}`);
    return thread;
  }

  /**
   * メッセージからHostRequestIDを抽出
   * @param message メッセージ
   * @returns number | null
   */
  private _extractHostRequestId(message: Message): number | null {
    try {
      // Embedのfooterから抽出
      const embed = message.embeds[0];
      if (embed?.footer?.text) {
        const match = embed.footer.text.match(/HostRequest:(\d+)/);
        if (match) {
          return parseInt(match[1]);
        }
      }

      // スレッド内のメッセージの場合、スレッド名や最初のメッセージから取得
      if (message.channel.isThread()) {
        // TODO: より詳細な抽出ロジックが必要な場合はここに追加
      }

      return null;
    } catch (error) {
      logger.error('HostRequestID抽出でエラー:', error);
      return null;
    }
  }

  /**
   * DM転送スレッド内のユーザーIDを取得
   * @param thread DM転送スレッド
   * @returns Promise<string | null>
   */
  private async _getUserIdFromThread(
    thread: ThreadChannel,
  ): Promise<string | null> {
    try {
      // スレッド名からユーザー名を抽出
      const match = thread.name.match(/\[DM転送\] .+ - (.+)$/);
      if (!match) return null;

      const userName = match[1];

      // ギルドメンバーからユーザーIDを検索
      const guild = thread.guild;
      const members = await guild.members.fetch();
      const member = members.find(
        (m) => m.displayName === userName || m.user.username === userName,
      );

      return member?.user.id || null;
    } catch (error) {
      logger.error('スレッドからユーザーID取得でエラー:', error);
      return null;
    }
  }
}

/**
 * DMRelayManagerのインスタンス
 */
export const dmRelayManager = new DMRelayManager();

export default new DMRelayManager();
