"use client";

import { createContext, useContext, useState } from "react";
import { RiCloseLine, RiErrorWarningLine } from "@remixicon/react";
import { DEFAULT_INTEGRATION_STATUS, INTEGRATION_METADATA } from "@/lib/integrations/constants";
import { cn } from "@/lib/utils";

const IntegrationContext = createContext(DEFAULT_INTEGRATION_STATUS);

export function IntegrationProvider({ value = DEFAULT_INTEGRATION_STATUS, children }) {
  return (
    <IntegrationContext.Provider value={value ?? DEFAULT_INTEGRATION_STATUS}>
      {children}
    </IntegrationContext.Provider>
  );
}

export function useHrmIntegrations() {
  return useContext(IntegrationContext);
}

export function GlobalIntegrationBanner({ integrations, className }) {
  const [dismissed, setDismissed] = useState(false);
  const unconfigured = integrations?.unconfigured ?? [];

  if (dismissed || unconfigured.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mb-5 flex items-start gap-3 rounded-lg border border-status-warning/30 bg-status-warning/10 px-4 py-3 text-sm text-foreground",
        className,
      )}
    >
      <RiErrorWarningLine className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium leading-5">
          บางบริการภายนอกยังไม่พร้อมใช้งาน ({unconfigured.map((item) => item.name).join(", ")})
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          {unconfigured.map((item) => `${item.name}: ${item.feature}`).join(" · ")} — ส่วนอื่นของระบบและฐานข้อมูลยังใช้งานได้ตามปกติ
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="ซ่อนการแจ้งเตือนสถานะบริการภายนอก"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RiCloseLine className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function IntegrationFeatureNotice({ service, className }) {
  const integrations = useHrmIntegrations();
  const meta = INTEGRATION_METADATA[service];

  if (!meta || integrations?.[service] !== false) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-3 rounded-lg border border-status-warning/30 bg-status-warning/10 px-4 py-3 text-sm text-foreground",
        className,
      )}
    >
      <RiErrorWarningLine className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium leading-5">{meta.unavailableTitle}</p>
        <p className="text-xs leading-5 text-muted-foreground">{meta.unavailableDescription}</p>
      </div>
    </div>
  );
}
