import { Suspense } from "react";
import { SignInForm } from "@/components/SignInForm";
import { DevRoleSwitcher } from "@/components/DevRoleSwitcher";
import { devRoleSwitcherEnabled } from "@/lib/dev-role";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="flex flex-1 flex-col">
      {devRoleSwitcherEnabled() && <DevRoleSwitcher current={null} />}
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </main>
  );
}
