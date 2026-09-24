"use client";

import { Button } from "@/components/ui/button";

export function IconButton({ icon: Icon, size = "icon", ...props }) {
  return (
    <Button variant="ghost" size={size === "small" ? "icon" : size} {...props}>
      {Icon ? <Icon aria-hidden="true" /> : null}
    </Button>
  );
}
