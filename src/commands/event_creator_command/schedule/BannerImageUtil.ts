import sharp, { OverlayOptions } from 'sharp';

/**
 * バナー画像生成などの共通処理ユーティリティ
 */
export class BannerImageUtil {
  /**
   * デフォルト背景画像を生成する
   * @param width 幅
   * @param height 高さ
   * @param eventName イベント名（色の決定に使用）
   * @returns デフォルト背景画像のバッファ
   */
  static async createDefaultBackground(
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
  static getEmojiImageUrl(emoji: string): string | null {
    // Discordのカスタム絵文字の形式: <:name:id>
    const match = emoji.match(/<:([^:]+):(\d+)>/);
    if (match) {
      const [, _name, id] = match;
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
  static async processImage(
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
    const emojiSize = 48;
    const emojiPadding = 8;

    // 絵文字サイズを定数化（整数にキャスト）
    const actualEmojiSize = Math.floor(emojiSize * 0.8);
    const emojiFontSize = Math.floor(emojiSize * 0.6);
    const emojiCircleSize = actualEmojiSize + 4;

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
      backgroundImage = await this.createDefaultBackground(
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
      const emojiImageUrl = this.getEmojiImageUrl(emoji);
      if (emojiImageUrl) {
        try {
          const emojiResponse = await fetch(emojiImageUrl);
          if (emojiResponse.ok) {
            const emojiBuffer = Buffer.from(await emojiResponse.arrayBuffer());
            emojiImageBuffer = await sharp(emojiBuffer)
              .resize(actualEmojiSize, actualEmojiSize, {
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
          <linearGradient id="black-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="black" stop-opacity="0.0"/>
            <stop offset="100%" stop-color="black" stop-opacity="0.4"/>
          </linearGradient>
        </defs>
        
        <!-- 下に行くほど濃くなる黒のグラデーションオーバーレイ -->
        <rect width="100%" height="100%" fill="url(#black-gradient)" />
        
        <!-- 絵文字（Unicode絵文字の場合） -->
        ${
          emoji && !emojiImageBuffer
            ? `<circle 
          cx="${emojiPadding + actualEmojiSize / 2}" 
          cy="${outputHeight - emojiPadding - actualEmojiSize / 2}" 
          r="${actualEmojiSize / 2 + 2}" 
          fill="white" 
        />
        <text 
          x="${emojiPadding + actualEmojiSize / 2}" 
          y="${outputHeight - emojiPadding - actualEmojiSize / 2 + 2}" 
          font-size="${emojiFontSize}" 
          text-anchor="middle" 
          fill="#333333" 
          dominant-baseline="central"
        >${emoji}</text>`
            : ''
        }
        
        <!-- イベント名テキスト -->
        <text 
          x="${emoji ? emojiPadding + actualEmojiSize + padding : emojiPadding + padding}" 
          y="${outputHeight - emojiPadding - fontSize / 2}" 
          font-family="keifont, Arial, sans-serif" 
          font-size="${fontSize}" 
          font-weight="bold"
          fill="${textColor}" 
          text-anchor="start" 
          dominant-baseline="alphabetic"
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
      // 白い丸の背景を追加
      const whiteCircle = await sharp({
        create: {
          width: emojiCircleSize,
          height: emojiCircleSize,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([
          {
            input: Buffer.from(`
              <svg width="${emojiCircleSize}" height="${emojiCircleSize}">
                <circle cx="${emojiCircleSize / 2}" cy="${emojiCircleSize / 2}" r="${actualEmojiSize / 2 + 2}" fill="white"/>
              </svg>
            `),
            blend: 'over',
          },
        ])
        .png()
        .toBuffer();

      // 白い丸を先に配置
      compositeElements.push({
        input: whiteCircle,
        left: emojiPadding - 2,
        top: outputHeight - actualEmojiSize - emojiPadding - 2,
      });

      // その上に絵文字を配置
      compositeElements.push({
        input: emojiImageBuffer,
        left: emojiPadding,
        top: outputHeight - actualEmojiSize - emojiPadding,
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
}
