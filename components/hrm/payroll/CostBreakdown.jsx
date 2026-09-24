export default function CostBreakdown() {
  return (
    <section aria-labelledby="cost-title" className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 id="cost-title" className="text-base font-semibold tracking-tight text-foreground">โครงสร้างต้นทุน (ล้านบาท)</h2>
        <p className="mt-1 text-xs text-muted-foreground">สัดส่วนเงินได้รวมของรอบนี้</p>
      </div>
      <div
        aria-label="แผนภูมิสัดส่วนต้นทุนเงินเดือน"
        className="mx-auto mt-5 grid size-48 place-items-center rounded-full"
        role="img"
        style={{ background: "conic-gradient(var(--chart-1) 0% 71%, var(--card) 71% 72%, var(--chart-2) 72% 82%, var(--card) 82% 83%, var(--chart-3) 83% 91%, var(--card) 91% 92%, var(--chart-4) 92% 96%, var(--card) 96% 97%, var(--chart-5) 97% 100%)" }}
      >
        <div className="grid size-28 place-content-center rounded-full bg-card text-center">
          <strong className="text-lg font-semibold tabular-nums text-foreground">฿43.16</strong>
          <span className="text-[10px] text-muted-foreground">ล้านบาท</span>
        </div>
      </div>
      <ul className="mt-5 grid grid-cols-2 gap-x-2 gap-y-3 text-[11px] text-muted-foreground">
        <li className="flex items-center gap-2"><span className="size-2 shrink-0 rounded-full bg-chart-1" />เงินเดือนฐาน</li>
        <li className="flex items-center gap-2"><span className="size-2 shrink-0 rounded-full bg-chart-2" />OT</li>
        <li className="flex items-center gap-2"><span className="size-2 shrink-0 rounded-full bg-chart-3" />ค่าพิเศษ / Incentive</li>
        <li className="flex items-center gap-2"><span className="size-2 shrink-0 rounded-full bg-chart-4" />สวัสดิการ / เบี้ยเลี้ยง</li>
        <li className="col-span-2 flex items-center gap-2"><span className="size-2 shrink-0 rounded-full bg-chart-5" />ปกส. + PVD นายจ้าง</li>
      </ul>
    </section>
  );
}
