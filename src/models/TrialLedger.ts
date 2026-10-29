import mongoose, { Schema, Document } from 'mongoose';

export interface ITrialLedger extends Document {
  parentUserId?: string;
  phoneNumber?: string;
  email?: string;
  normalizedEmail?: string;
  deviceId?: string;
  usedAt: Date;
}

const TrialLedgerSchema: Schema = new Schema(
  {
    parentUserId: { type: String },
    phoneNumber: { type: String, index: true },
    email: { type: String, lowercase: true, trim: true },
    normalizedEmail: { type: String, lowercase: true, trim: true },
    deviceId: { type: String },
    usedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Partial Unique index: Only indexes documents where normalizedEmail is a non-empty string.
// Nulls and missing values will not collide, allowing unlimited records without email (e.g. deviceId/phone-only).
TrialLedgerSchema.index(
  { normalizedEmail: 1 },
  {
    unique: true,
    partialFilterExpression: {
      normalizedEmail: { $type: 'string', $gt: '' },
    },
  }
);

TrialLedgerSchema.index({ email: 1 });
TrialLedgerSchema.index({ deviceId: 1 });
TrialLedgerSchema.index({ parentUserId: 1 });

export const TrialLedger = mongoose.model<ITrialLedger>('TrialLedger', TrialLedgerSchema);
