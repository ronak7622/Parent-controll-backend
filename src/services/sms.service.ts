import https from 'https';

export class SmsService {
  private static QA_TEST_NUMBERS = [
    '+919999999999',
    '+918888888888',
    '+917777777777',
    '+910000000000',
    '9999999999',
  ];

  public static isTestNumber(phoneNumber: string): boolean {
    const clean = phoneNumber.trim();
    return this.QA_TEST_NUMBERS.some((num) => clean.includes(num));
  }

  public static async sendOtpSms(phoneNumber: string, otp: string): Promise<boolean> {
    if (this.isTestNumber(phoneNumber)) {
      console.log(`[SMS-SERVICE] QA Test number detected (${phoneNumber}). Bypassing SMS gateway cost. Fix OTP: ${otp}`);
      return true;
    }

    const provider = process.env.SMS_PROVIDER || 'MOCK';
    const apiKey = process.env.SMS_PROVIDER_API_KEY || '';

    if (provider === 'MSG91' && apiKey) {
      return this.sendViaMsg91(phoneNumber, otp, apiKey);
    } else if (provider === 'FAST2SMS' && apiKey) {
      return this.sendViaFast2Sms(phoneNumber, otp, apiKey);
    }

    console.log(`[SMS-SERVICE-MOCK] Provider: ${provider}. Sent OTP ${otp} to ${phoneNumber}`);
    return true;
  }

  private static async sendViaMsg91(phone: string, otp: string, authKey: string): Promise<boolean> {
    try {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      const templateId = process.env.MSG91_TEMPLATE_ID || '';
      const url = `https://control.msg91.com/api/v5/otp?template_id=${templateId}&mobile=${cleanPhone}&otp=${otp}`;

      return new Promise((resolve) => {
        const req = https.request(
          url,
          {
            method: 'POST',
            headers: {
              authkey: authKey,
              'Content-Type': 'application/json',
            },
          },
          (res) => {
            resolve(res.statusCode === 200);
          }
        );
        req.on('error', () => resolve(false));
        req.end();
      });
    } catch {
      return false;
    }
  }

  private static async sendViaFast2Sms(phone: string, otp: string, apiKey: string): Promise<boolean> {
    try {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=otp&variables_values=${otp}&numbers=${cleanPhone}`;

      return new Promise((resolve) => {
        const req = https.get(url, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
      });
    } catch {
      return false;
    }
  }
}
