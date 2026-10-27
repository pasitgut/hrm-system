// Generates synthetic PDFs for the OT reports, leave reports and salary slips.
// Pass an output directory as the first argument to keep QA files separate from regular output.
export {};
await import("./verify-ot-report-fixtures");
await import("./verify-leave-report-fixtures");
await import("./verify-salary-slip-pdf-fixture");
