import mongoose, { Schema, Document } from 'mongoose';

export interface IContact extends Document {
  deviceId: string;
  name: string;
  phoneNumber: string;
  isBlocked: boolean;
  timestamp: Date;
}

const ContactSchema = new Schema<IContact>(
  {
    deviceId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    phoneNumber: { type: String, required: true, index: true },
    isBlocked: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Contact = mongoose.model<IContact>('Contact', ContactSchema);
