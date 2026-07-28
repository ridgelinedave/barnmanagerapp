"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DEV_ROLE_COOKIE, DEV_ROLE_NONE, type DevRoleSelection } from "@/lib/dev-role";
import { ROLES } from "@/lib/types";

/**
 * TEMPORARY (Phase 0) — switch the shell between the roles without a login.
 *
 * The parent layout only renders this in a non-production build. It writes a
 * cookie the server layout reads; it grants no data access, because every query
 * still runs under RLS as the real (here: absent) user.
 *
 * "no profile" previews the signed-in-but-unlinked state, which has no role and
 * therefore no tab bar — see app/account-pending/page.tsx.
 *
 * Remove this component, `lib/dev-role.ts`, and its call sites once the three
 * seeded users can sign in for real.
 */
const OPTIONS: { value: DevRoleSelection; label: string }[] = [
  ...ROLES.map((role) => ({ value: role as DevRoleSelection, label: role })),
  { value: DEV_ROLE_NONE, label: "no profile" },
];

/**
 * Cookie writes live outside the component: mutating a global from inside a
 * component body is a React lint error, and this is a plain DOM side effect.
 */
function writeDevRoleCookie(selection: DevRoleSelection | null) {
  const value = selection ?? "";
  const maxAge = selection ? 86400 : 0;
  document.cookie = `${DEV_ROLE_COOKIE}=${value}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function DevRoleSwitcher({ current }: { current: DevRoleSelection | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const select = (selection: DevRoleSelection) => {
    writeDevRoleCookie(selection);
    startTransition(() => {
      router.replace(selection === DEV_ROLE_NONE ? "/account-pending" : "/home");
      router.refresh();
    });
  };

  const clear = () => {
    writeDevRoleCookie(null);
    startTransition(() => {
      router.replace("/sign-in");
      router.refresh();
    });
  };

  return (
    <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-amber-950">
      <p className="text-[11px] font-semibold uppercase tracking-wide">Dev only — role preview</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={pending}
            onClick={() => select(option.value)}
            aria-pressed={current === option.value}
            className={`min-h-9 rounded-lg px-3 text-xs font-semibold capitalize disabled:opacity-50 ${
              current === option.value
                ? "bg-amber-900 text-amber-50"
                : "border border-amber-400 bg-white text-amber-900"
            }`}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={clear}
          className="min-h-9 rounded-lg px-3 text-xs font-medium underline disabled:opacity-50"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
