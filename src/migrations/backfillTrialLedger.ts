import { TrialLedger } from '../models/TrialLedger';
import { normalizeEmail } from '../utils/normalizeEmail';

export async function backfillTrialLedgerNormalizedEmail(): Promise<void> {
  try {
    const unnormalizedDocs = await TrialLedger.find({
      email: { $exists: true, $ne: null, $gt: '' },
      $or: [
        { normalizedEmail: { $exists: false } },
        { normalizedEmail: null },
        { normalizedEmail: '' },
      ],
    }).lean();

    if (unnormalizedDocs.length === 0) {
      return;
    }

    console.log(`[TrialLedger-Migration] Backfilling normalizedEmail for ${unnormalizedDocs.length} rows...`);
    for (const doc of unnormalizedDocs) {
      if (doc.email) {
        const norm = normalizeEmail(doc.email);
        await TrialLedger.updateOne(
          { _id: doc._id },
          { $set: { normalizedEmail: norm } }
        );
      }
    }
    console.log(`[TrialLedger-Migration] Backfill complete.`);
  } catch (err: any) {
    console.error('[TrialLedger-Migration] Error during backfill:', err?.message || err);
  }
}
