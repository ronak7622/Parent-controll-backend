import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { config } from '../config/env';
import { SmsService } from '../services/sms.service';

/**
 * Send OTP to Parent Phone Number
 * Enforces rate limiting: Max 3 OTPs per hour per phone number to prevent SMS fraud.
 * Auto bypasses cost for QA/Test numbers (+919999999999 -> 123456).
 */
export const requestOtp = async (req: Request, res: Response) => {
  try {
    const rawPhone = req.body.phoneNumber || req.body.phone;
    if (!rawPhone || String(rawPhone).trim().length < 8) {
      return res.status(400).json({ success: false, message: 'Valid phone number is required.' });
    }

    const cleanPhone = String(rawPhone).trim();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    let user = await User.findOne({ phoneNumber: cleanPhone });

    if (user) {
      // Check Rate Limit: max 3 requests per hour
      const lastRequest = user.lastOtpRequestedAt;
      if (lastRequest && lastRequest > oneHourAgo) {
        if ((user.otpAttemptsCount || 0) >= 3) {
          return res.status(429).json({
            success: false,
            message: 'Maximum 3 OTP requests allowed per hour to prevent SMS spam. Please try again later.',
          });
        }
        user.otpAttemptsCount = (user.otpAttemptsCount || 0) + 1;
      } else {
        // Reset counter after 1 hour
        user.otpAttemptsCount = 1;
      }
    } else {
      user = new User({
        phoneNumber: cleanPhone,
        otpAttemptsCount: 1,
        isVerified: false,
      });
    }

    // Generate 6-digit OTP (or fixed 123456 for test numbers)
    const isTest = SmsService.isTestNumber(cleanPhone);
    const otpCode = isTest ? '123456' : String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 mins expiry

    user.otp = otpCode;
    user.otpExpiresAt = expiresAt;
    user.lastOtpRequestedAt = now;
    await user.save();

    // Send SMS via Provider Gateway (MSG91 / Fast2SMS / Mock)
    await SmsService.sendOtpSms(cleanPhone, otpCode);

    return res.json({
      success: true,
      message: 'OTP sent successfully.',
      phoneNumber: cleanPhone,
      otpForTesting: isTest || process.env.NODE_ENV !== 'production' ? otpCode : undefined,
    });
  } catch (error: any) {
    console.error('[OTP-ERROR]', error);
    return res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

/**
 * Verify OTP and return JWT Bearer Token for Parent App (Android/iOS) & Web
 */
export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const rawPhone = req.body.phoneNumber || req.body.phone;
    const otp = req.body.otp;

    if (!rawPhone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone number and OTP are required.' });
    }

    const cleanPhone = String(rawPhone).trim();
    const user = await User.findOne({ phoneNumber: cleanPhone });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found. Request OTP first.' });
    }

    // Check expiry
    if (user.otpExpiresAt && user.otpExpiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new OTP.' });
    }

    const isTest = SmsService.isTestNumber(cleanPhone);
    if (user.otp !== String(otp).trim() && !(isTest && String(otp).trim() === '123456')) {
      return res.status(400).json({ success: false, message: 'Incorrect OTP code entered.' });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiresAt = undefined;
    user.otpAttemptsCount = 0;
    await user.save();

    const token = jwt.sign(
      { userId: user._id.toString(), phoneNumber: user.phoneNumber },
      config.jwtSecret,
      { expiresIn: '365d' }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user._id.toString(),
        phoneNumber: user.phoneNumber,
        name: user.name || 'Parent User',
      },
    });
  } catch (error: any) {
    console.error('[VERIFY-OTP-ERROR]', error);
    return res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};
