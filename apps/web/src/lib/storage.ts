"use client";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** Upload under <org_id>/<random>-<name>; storage RLS only lets org members write their own folder. */
export async function uploadToBucket(bucket: "presentations" | "media", orgId: string, file: File) {
  const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
  const path = `${orgId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabaseBrowser().storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return { path, url: publicUrl(bucket, path) };
}

export function publicUrl(bucket: "presentations" | "media", path: string) {
  return supabaseBrowser().storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
