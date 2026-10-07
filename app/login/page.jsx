"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { loginAction } from "./actions";

const initialState = { error: null };

export default function LoginPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
            HRM
          </span>
          <h1 className="hrm-form-title">เข้าสู่ระบบ</h1>
          <p className="mt-1 text-sm text-muted-foreground">HRM</p>
        </div>
        <form action={formAction} className="space-y-4" noValidate>
          <input type="hidden" name="next" value={next} />
          <div className="space-y-1.5">
            <Label htmlFor="identifier">อีเมลหรือรหัสพนักงาน</Label>
            <Input
              id="identifier"
              name="identifier"
              type="text"
              autoComplete="username"
              placeholder="name@example.com หรือ 2603"
              isRequired
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">รหัสผ่าน</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              isRequired
            />
          </div>
          {state.error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-5 text-destructive"
            >
              {state.error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" isDisabled={isPending}>
            {isPending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </Button>
        </form>
      </div>
    </div>
  );
}
