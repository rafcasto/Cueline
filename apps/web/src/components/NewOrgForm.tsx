"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";

/**
 * A signed-in host with no organisation (an account made by hand, before sign-up existed)
 * names one here and carries on; the first room is made right after.
 */
export function NewOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/orgs", { name });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-6 max-w-xl rounded-xl border border-dashed border-line p-8">
      <h2 className="text-base font-semibold text-ink">Name your organisation</h2>
      <p className="mt-1 text-sm text-ink-muted">Rooms, plans and invoices belong to it. Your own name is fine if it is just you.</p>
      <div className="mt-5 space-y-4">
        <Field label="Organisation" htmlFor="org-name">
          <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus placeholder="Tuesday Sessions" />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" loading={busy} disabled={!name.trim()}>
          Continue
        </Button>
      </div>
    </form>
  );
}
