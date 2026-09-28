"use client";

import { useState } from "react";
import Link from "next/link";
import { RiAddLine } from "@remixicon/react";
import { PageHeader } from "@/components/hrm/PageHeader";
import { AssetBorrowingRequests } from "@/components/hrm/assets/AssetBorrowingRequests";
import { Button } from "@/components/ui/button";
import { useHrmRole } from "@/components/hrm/HrmShell";
import { canManageAssets } from "@/lib/auth/permissions";

export default function AssetModule() {
  const user = useHrmRole();
  const [createOpen, setCreateOpen] = useState(false);
  const manager = Boolean(user && canManageAssets(user.role));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="People operations"
        title="การยืมคืนทรัพย์สิน"
        description="สร้างและติดตามคำขอยืม การลงนาม และการตรวจรับคืนในระบบบุคคล"
        actions={<>
          {manager ? <Button asChild variant="outline"><Link href="/assets/agreements">จัดการ Agreement</Link></Button> : null}
          <Button leadingIcon={RiAddLine} onClick={() => setCreateOpen(true)}>สร้างคำขอยืม</Button>
        </>}
      />
      <AssetBorrowingRequests
        isManager={manager}
        employeeCode={user?.employeeCode ?? ""}
        createOpen={createOpen}
        onCreateClose={() => setCreateOpen(false)}
      />
    </div>
  );
}
