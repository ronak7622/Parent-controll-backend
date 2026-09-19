import mongoose, { Schema, Document } from 'mongoose';

export interface IContact extends Document {
  deviceId: string;
  name: string;
  phoneNumber: string;
  additionalPhoneNumbers: string[];
  emails: string[];
  accountType?: string;
  photoUri?: string;
  isBlocked: boolean;
  isOutgoingBlocked?: boolean;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  nickname?: string;
  company?: string;
  jobTitle?: string;
  department?: string;
  notes?: string;
  contactSource?: string;
  phoneLabel?: string;
  isPrimaryNumber?: boolean;
  contactCreatedDate?: Date;
  contactUpdatedDate?: Date;
  timestamp: Date;
}

const ContactSchema = new Schema<IContact>(
  {
    deviceId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    phoneNumber: { type: String, required: true, index: true },
    additionalPhoneNumbers: [{ type: String }],
    emails: [{ type: String }],
    accountType: { type: String, default: 'Device' },
    photoUri: { type: String },
    isBlocked: { type: Boolean, default: false },
    isOutgoingBlocked: { type: Boolean, default: false },
    firstName: { type: String, default: '' },
    middleName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    nickname: { type: String, default: '' },
    company: { type: String, default: '' },
    jobTitle: { type: String, default: '' },
    department: { type: String, default: '' },
    notes: { type: String, default: '' },
    contactSource: { type: String, default: 'Device' },
    phoneLabel: { type: String, default: 'Mobile' },
    isPrimaryNumber: { type: Boolean, default: true },
    contactCreatedDate: { type: Date },
    contactUpdatedDate: { type: Date },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ContactSchema.index({ deviceId: 1, phoneNumber: 1 }, { unique: true });
ContactSchema.index({ deviceId: 1, name: 1 });

export const Contact = mongoose.model<IContact>('Contact', ContactSchema);
