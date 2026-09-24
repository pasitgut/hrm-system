"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cx } from "@/utils/cx";

export function HrmDialog({ open, title, description, onClose, children, footer, size = "md", className }) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose?.(); }}>
      <DialogContent className={cx(size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl", className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="min-w-0">{children}</div>
        {footer ? <DialogFooter className="border-t pt-4">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}

export function DialogCancelButton({ onClick }) {
  return <Button type="button" variant="outline" onClick={onClick}>ยกเลิก</Button>;
}
