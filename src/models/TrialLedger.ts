import mongoose, { Schema, Document } from 'mongoose';

export interface ITrialLedger extends Document {
  parentUserId?: string;
  phoneNumber?: string;
  deviceId?: string;
  usedAt: Date;
}

const TrialLedgerSchema: Schema = new Schema(
  {
    parentUserId: { type: String, index: true },
    phoneNumber: { type: String, index: true },
    deviceId: { type: String, index: true },
    usedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const TrialLedger = mongoose.model<ITrialLedger>('TrialLedger', TrialLedgerSchema);
