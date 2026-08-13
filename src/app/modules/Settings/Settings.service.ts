

// ── Get Settings by type ─────────────────────────────────────────────

import { Settings } from "./Settings.model";

// GET /api/v1/settings?type=privacy_policy
const getSettings = async (type?: string) => {
  if (type) {
    const settings = await Settings.findOne({ type });
    return settings || { type, content: "" };
  }


  const types = ["privacy_policy", "terms_conditions", "about_us", "mission_statement", "disclaimer", "community_guidelines"];
  const allSettings = await Settings.find();

  return types.map((t) => {
    const found = allSettings.find((s) => s.type === t);
    return { type: t, content: found?.content || "" };
  });
};

// ── Upsert Settings (Admin) ───────────────────────────────────────────────────
// PATCH /api/v1/settings
const upsertSettings = async (
  adminId: string,
  type: string,
  content: string
) => {
  const settings = await Settings.findOneAndUpdate(
    { type },
    { $set: { content, updatedBy: adminId } },
    { new: true, upsert: true }
  );
  return settings;
};

export const SettingsService = { getSettings, upsertSettings };