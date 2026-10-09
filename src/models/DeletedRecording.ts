import mongoose, { Schema, Document } from 'mongoose';

/**
 * Tombstone for recordings the parent explicitly deleted.
 * Prevents a late / retried child `/ingest/recording/complete` call from
 * re-inserting (resurrecting) a recording the parent already removed.
 * Self-expires via TTL so the collection stays bounded at 10M+ scale —
 * 45 days is well beyond any realistic child offline-queue flush window.
 */
export interface IDeletedRecording extends Document {
  sessionId: string;
  deviceId: string;
  deletedAt: Date;
}

const DeletedRecordingSchema = new Schema<IDeletedRecording>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    deviceId: { type: String, required: true, index: true },
    // TTL: document auto-removed 45 days after deletion
    deletedAt: { type: Date, required: true, default: Date.now, expires: 60 * 60 * 24 * 45 },
  },
  { versionKey: false }
);

export const DeletedRecording = mongoose.model<IDeletedRecording>('DeletedRecording', DeletedRecordingSchema);
