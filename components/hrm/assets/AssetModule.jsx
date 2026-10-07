"use client";

import { useState } from "react";
import Link from "next/link";
import { RiAddLine } from "@remixicon/react";
import { PageHeader } from "@/components/hrm/PageHeader";
import { AssetBorrowingRequests } from "@/components/hrm/assets/AssetBorrowingRequests";
import { Button } from "@/components/ui/button";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { canCreateOwnAssetRequests, canManageAssetTemplates, canManageAssets, canViewCompanyAssetRequests, canViewOwnAssetRequests } from "@/lib/auth/permissions";

export default function AssetModule() {
  const user = useHrmRole();
  const [createOpen, setCreateOpen] = useState(false);
  const manager = Boolean(user && canManageAssets(user.permissions));
  const canViewCompany = Boolean(user && canViewCompanyAssetRequests(user.permissions));
  const canViewRequests = canViewCompany || Boolean(user && canViewOwnAssetRequests(user.permissions));
  const canManageTemplates = Boolean(user && canManageAssetTemplates(user.permissions));
  const canCreateRequest = manager || Boolean(user && canCreateOwnAssetRequests(user.permissions));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="People operations"
        title="การยืมคืนทรัพย์สิน"
        description="สร้างและติดตามคำขอยืม การลงนาม และการตรวจรับคืนในระบบบุคคล"
        actions={<>
          {canManageTemplates ? <Button asChild variant="outline"><Link href="/assets/agreements">จัดการ Agreement</Link></Button> : null}
          {canCreateRequest ? <Button leadingIcon={RiAddLine} onClick={() => setCreateOpen(true)}>สร้างคำขอยืม</Button> : null}
        </>}
      />
      {canViewRequests ? (
        <AssetBorrowingRequests
          isManager={manager}
          canViewCompany={canViewCompany}
          employeeCode={user?.employeeCode ?? ""}
          createOpen={createOpen}
          onCreateClose={() => setCreateOpen(false)}
        />
      ) : (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">บัญชีนี้จัดการแม่แบบ Agreement ได้ แต่ไม่มีสิทธิ์ดูคำขอยืมทรัพย์สิน</p>
      )}
    </div>
  );
}
