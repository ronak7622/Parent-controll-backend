import { Plan } from '../models/Plan';
import { AddonPlan } from '../models/AddonPlan';
import { PLAN_NAMES_I18N, ADDON_NAMES_I18N, localizeFeatureItem } from '../config/plansI18n';

const SUPPORTED_LANGS = ['en', 'hi', 'gu', 'es', 'fr'] as const;
type Lang = typeof SUPPORTED_LANGS[number];

/**
 * One-time idempotent migration: for any Plan / AddonPlan that is missing
 * nameI18n / featuresI18n, derive and persist them from the static
 * plansI18n.ts dictionary.  Plans that already have the fields are skipped
 * so admin edits made directly in the DB are never overwritten.
 *
 * Safe to call on every boot.
 */
export async function runPlanI18nMigration(): Promise<{ plans: number; addons: number }> {
  let plansMigrated = 0;
  let addonsMigrated = 0;

  try {
    // ── Plans ──
    const plans = await Plan.find({}).lean();

    for (const plan of plans) {
      const p = plan as any;
      const alreadyDone =
        p.nameI18n && p.featuresI18n &&
        Object.keys(p.nameI18n).length > 0 &&
        Object.keys(p.featuresI18n).length > 0;
      if (alreadyDone) continue;

      const planId = p.planId as string;
      const englishFeatures: string[] = p.features || [];

      // Build nameI18n
      const nameI18n: Record<string, string> = {};
      for (const lang of SUPPORTED_LANGS) {
        nameI18n[lang] = PLAN_NAMES_I18N[planId]?.[lang] || p.name || planId;
      }

      // Build featuresI18n — each English feature string is looked up for each lang
      const featuresI18n: Record<string, string[]> = {};
      for (const lang of SUPPORTED_LANGS) {
        featuresI18n[lang] = englishFeatures.map((f: string) =>
          lang === 'en' ? f : localizeFeatureItem(f, lang)
        );
      }

      await Plan.updateOne(
        {
          _id: p._id,
          $or: [{ nameI18n: { $exists: false } }, { featuresI18n: { $exists: false } }],
        },
        { $set: { nameI18n, featuresI18n } }
      );
      plansMigrated++;
    }

    // ── Addon Plans ──
    const addons = await AddonPlan.find({}).lean();

    for (const addon of addons) {
      const a = addon as any;
      if (a.nameI18n && Object.keys(a.nameI18n).length > 0) continue;

      const nameI18n: Record<string, string> = {};
      for (const lang of SUPPORTED_LANGS) {
        nameI18n[lang] = ADDON_NAMES_I18N[a.addonId]?.[lang] || a.name || a.addonId;
      }

      await AddonPlan.updateOne(
        { _id: a._id, nameI18n: { $exists: false } },
        { $set: { nameI18n } }
      );
      addonsMigrated++;
    }

    console.log(
      `[PlanMigration] Done. Plans seeded: ${plansMigrated}, Addons seeded: ${addonsMigrated}`
    );
  } catch (err: any) {
    console.error('[PlanMigration] Error during i18n migration:', err?.message);
  }

  return { plans: plansMigrated, addons: addonsMigrated };
}
