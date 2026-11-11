import { http } from '@kit.NetworkKit';
import { PreviewAuthProfile } from '../preview/PreviewAuth';
import { PreviewLocalPreferences } from '../preview/PreviewLocalPreferences';
import { HarnessAgentHttp } from './HarnessAgentHttp';

export class HarmonyCoreAuth {
  static async sendPhoneCode(phone: string): Promise<void> {
    await HarnessAgentHttp.postJson('/api/auth/phone/send-code', { phone: phone.trim() });
  }

  static async verifyPhone(phone: string, code: string): Promise<PreviewAuthProfile> {
    const base = HarnessAgentHttp.baseUrl();
    const client = http.createHttp();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const body = JSON.stringify({ phone: phone.trim(), code: code.trim() });
    return new Promise((resolve, reject) => {
      client.request(`${base}/api/auth/phone/verify`, {
        method: http.RequestMethod.POST,
        header: headers,
        extraData: body,
        expectDataType: http.HttpDataType.STRING,
      }, (err, data) => {
        client.destroy();
        if (err) {
          reject(err);
          return;
        }
        const codeNum = data?.responseCode ?? 0;
        if (codeNum < 200 || codeNum >= 300) {
          reject(new Error(`HTTP ${codeNum}`));
          return;
        }
        const headerObj = data?.header as Record<string, string> | undefined;
        const setCookie = headerObj?.['Set-Cookie'] ?? headerObj?.['set-cookie'] ?? '';
        const token = HarmonyCoreAuth.parseSessionToken(setCookie);
        if (token.length === 0) {
          reject(new Error('verify succeeded but harness_session cookie missing'));
          return;
        }
        PreviewLocalPreferences.sessionToken = token;
        const parsed = JSON.parse(typeof data?.result === 'string' ? data.result as string : '{}') as Record<string, Object>;
        const user = parsed['user'] as Record<string, string> | undefined;
        const profile: PreviewAuthProfile = {
          displayName: user?.['displayName'] ?? phone,
          phone: user?.['phone'] ?? phone,
        };
        PreviewLocalPreferences.updateAuth(profile);
        resolve(profile);
      });
    });
  }

  private static parseSessionToken(setCookie: string): string {
    const match = setCookie.match(/harness_session=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }
}
