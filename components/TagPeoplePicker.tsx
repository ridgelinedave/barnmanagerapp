"use client";

import { useActionState, useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormFeedback, Input } from "@/components/ui/Field";
import { addToTag, type TagState } from "@/app/(app)/manage/tags/actions";

const EMPTY: TagState = { error: null, message: null };
const ROLE = { parent: "Client", staff: "Staff", admin: "Admin" } as const;

/**
 * Add people to a tag: type to narrow the list, tick everyone who should have
 * it, Add. Built for loading a list quickly — a whole Circle membership in a
 * few passes — so the ticks survive the search narrowing and widening again.
 */
export function TagPeoplePicker({
  tagId,
  people,
}: {
  tagId: string;
  people: { profileId: string; name: string; role: keyof typeof ROLE }[];
}) {
  const [state, action, pending] = useActionState(addToTag, EMPTY);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const searchId = useId();

  // Once added, they leave this list (the page refreshes); clear the ticks.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset after a successful add
    if (state.message) setPicked(new Set());
  }, [state]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  }, [people, query]);

  if (people.length === 0) return <p className="text-caption text-muted">Everyone already has this tag.</p>;

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="tag_id" value={tagId} />
      {[...picked].map((id) => (
        <input key={id} type="hidden" name="profile_id" value={id} />
      ))}
      <label htmlFor={searchId} className="sr-only">
        Search people
      </label>
      <Input id={searchId} type="search" placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="flex max-h-[26rem] flex-col overflow-y-auto rounded-control border border-line bg-surface">
        {shown.length === 0 && <li className="px-3 py-3 text-caption text-muted">No one by that name.</li>}
        {shown.map((p) => (
          <li key={p.profileId} className="border-b border-line last:border-b-0">
            <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3">
              <input
                type="checkbox"
                className="size-5 shrink-0 accent-[var(--accent)]"
                checked={picked.has(p.profileId)}
                onChange={(e) =>
                  setPicked((was) => {
                    const next = new Set(was);
                    if (e.target.checked) next.add(p.profileId);
                    else next.delete(p.profileId);
                    return next;
                  })
                }
              />
              <span className="min-w-0 flex-1 text-body text-ink">{p.name}</span>
              <span className="shrink-0 font-condensed text-label uppercase tracking-[0.08em] text-muted">{ROLE[p.role]}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" arrow={false} disabled={pending || picked.size === 0}>
          {pending ? "Adding" : picked.size > 1 ? `Add ${picked.size} people` : "Add"}
        </Button>
        {picked.size > 0 && (
          <button type="button" onClick={() => setPicked(new Set())} className="min-h-11 text-label text-muted underline underline-offset-4">
            Clear ticks
          </button>
        )}
      </div>
      <FormFeedback error={state.error} message={state.message} />
    </form>
  );
}
