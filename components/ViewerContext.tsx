"use client";

import { createContext, useContext } from "react";
import type { Role } from "@/lib/types";

export type ViewerContextValue = { role: Role; isDevRole: boolean };

const ViewerContext = createContext<ViewerContextValue | null>(null);

export function ViewerProvider({
  value,
  children,
}: {
  value: ViewerContextValue;
  children: React.ReactNode;
}) {
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

/** Role for client-side rendering decisions only — never for access control. */
export function useViewer(): ViewerContextValue {
  const value = useContext(ViewerContext);
  if (!value) throw new Error("useViewer must be used inside the app shell layout.");
  return value;
}
