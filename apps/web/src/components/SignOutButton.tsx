"use client";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button variant="ghost" size="sm" onClick={() => void supabaseBrowser().auth.signOut().then(() => router.push("/login"))}>
      Sign out
    </Button>
  );
}
