"use client";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="underline"
      onClick={() => void supabaseBrowser().auth.signOut().then(() => router.push("/login"))}
    >
      sign out
    </button>
  );
}
