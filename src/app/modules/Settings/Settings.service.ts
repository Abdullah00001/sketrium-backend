

// ── Get Settings by role and type ─────────────────────────────────────────────

import { Settings } from "./Settings.model";

// GET /api/v1/settings?role=MARCHANT&type=privacy_policy
const getSettings = async (role: string, type?: string) => {
  if (type) {
    const settings = await Settings.findOne({ role, type });
    return settings || { role, type, content: "" };
  }


  const types = ["privacy_policy", "terms_conditions", "about_us", "mission_statement"];
  const allSettings = await Settings.find({ role });

  return types.map((t) => {
    const found = allSettings.find((s) => s.type === t);
    return { role, type: t, content: found?.content || "" };
  });
};

// ── Upsert Settings (Admin) ───────────────────────────────────────────────────
// PATCH /api/v1/settings
const upsertSettings = async (
  adminId: string,
  role: string,
  type: string,
  content: string
) => {
  const settings = await Settings.findOneAndUpdate(
    { role, type },
    { $set: { content, updatedBy: adminId } },
    { new: true, upsert: true }
  );
  return settings;
};

export const SettingsService = { getSettings, upsertSettings };