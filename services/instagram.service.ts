export interface SendInstagramMessageParams {
  instagramAccountId: string;
  accessToken: string;
  recipientId: string; // Instagram Scoped User ID (IGSID)
  text: string;
}

export class InstagramService {
  private static API_VERSION = 'v21.0';

  /**
   * Envía un mensaje directo (DM) por Instagram usando la Meta Graph API
   */
  static async sendDirectMessage(params: SendInstagramMessageParams): Promise<string> {
    const { instagramAccountId, accessToken, recipientId, text } = params;

    const url = `https://graph.facebook.com/${this.API_VERSION}/${instagramAccountId}/messages`;

    const payload = {
      recipient: { id: recipientId },
      message: { text },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[INSTAGRAM SEND ERROR]', errorData);
      throw new Error(
        `Instagram API Error: ${errorData?.error?.message || response.statusText} (code: ${errorData?.error?.code || response.status})`
      );
    }

    const data = await response.json();
    return data.message_id;
  }

  /**
   * Envía un archivo multimedia (imagen) por mensaje directo de Instagram.
   */
  static async sendMediaMessage(params: {
    instagramAccountId: string;
    accessToken: string;
    recipientId: string;
    mediaUrl: string;
  }): Promise<string> {
    const { instagramAccountId, accessToken, recipientId, mediaUrl } = params;
    const url = `https://graph.facebook.com/${this.API_VERSION}/${instagramAccountId}/messages`;

    const payload = {
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: 'image',
          payload: {
            url: mediaUrl,
            is_reusable: true,
          },
        },
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[INSTAGRAM MEDIA SEND ERROR]', errorData);
      throw new Error(
        `Instagram Media Error: ${errorData?.error?.message || response.statusText} (code: ${errorData?.error?.code || response.status})`
      );
    }

    const data = await response.json();
    return data.message_id;
  }

  /**
   * Marca el mensaje como leído en Instagram (indicador visual de visto)
   */
  static async markAsSeen(instagramAccountId: string, accessToken: string, messageId: string): Promise<boolean> {
    try {
      const url = `https://graph.facebook.com/${this.API_VERSION}/${instagramAccountId}/messages`;
      const payload = {
        recipient: { id: messageId },
        sender_action: 'mark_seen',
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      return res.ok;
    } catch {
      return false;
    }
  }
}

