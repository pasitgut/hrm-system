import "server-only";

const BASE_URL = "https://checker.thomeinspector.com";
const CACHE_TTL_MS = 120_000;

export interface CheckerRow {
  request_status: string;
  inspect_no: string;
  confirm_date: string;
  house_developer_note: string;
  address_no: string;
  project_text: string;
  [key: string]: unknown;
}

interface SessionState {
  ciSession: string | null;
}

interface CheckerCacheEntry {
  data: CheckerRow[];
  expiresAt: number;
}

const checkerCache = new Map<string, CheckerCacheEntry>();
let ciSession: string | null = null;

function requireCheckerCredentials() {
  const email = process.env.CHECKER_API_EMAIL?.trim();
  const password = process.env.CHECKER_API_PASSWORD;
  if (!email || !password) {
    throw new Error("กำหนด CHECKER_API_EMAIL และ CHECKER_API_PASSWORD ในไฟล์ .env ก่อนเชื่อมต่อ API Checker");
  }
  return { email, password };
}

function toBuddhist(dateStr: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateStr);
  if (!match) throw new TypeError("Checker dates must use DD/MM/YYYY format");
  return `${match[1]}/${match[2]}/${Number(match[3]) + 543}`;
}

export function toChristian(dateStr: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateStr?.trim() ?? "");
  if (!match) return dateStr ?? "";
  const year = Number(match[3]);
  return `${match[1]}/${match[2]}/${year > 2500 ? year - 543 : year}`;
}

export function groupCheckerByKey(
  rows: CheckerRow[],
  roundOf: (row: CheckerRow) => string = (row) => row.inspect_no || "1",
): Map<string, CheckerRow[]> {
  const grouped = new Map<string, CheckerRow[]>();
  for (const row of rows) {
    const houseNo = (row.address_no ?? "").trim();
    if (!houseNo) continue;
    const key = `${houseNo}::${roundOf(row)}`;
    const group = grouped.get(key);
    if (group) group.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
}

async function createSession(state: SessionState): Promise<void> {
  const response = await fetch(`${BASE_URL}/adminlogin`, { cache: "no-store" });
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("API Checker did not return a session cookie");
  const match = setCookie.match(/(?:^|,\s*)ci_session=([^;,]+)/);
  if (!match) throw new Error("API Checker session cookie is missing ci_session");
  state.ciSession = match[1];
}

async function login(state: SessionState): Promise<void> {
  const credentials = requireCheckerCredentials();
  if (!state.ciSession) await createSession(state);

  const body = new URLSearchParams({
    user_email: credentials.email,
    user_pass: credentials.password,
  });
  const response = await fetch(`${BASE_URL}/adminlogin/admin_login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: `ci_session=${state.ciSession}`,
    },
    body,
    cache: "no-store",
  });

  const location = response.headers.get("location") ?? "";
  if (response.status !== 302 && response.status !== 303) {
    state.ciSession = null;
    throw new Error(`API Checker login failed (HTTP ${response.status})`);
  }
  if (!location.includes("/home")) {
    state.ciSession = null;
    throw new Error("API Checker login redirected to an unexpected page");
  }
}

async function fetchPage(
  state: SessionState,
  page: number,
  startBuddhist: string,
  endBuddhist: string,
): Promise<CheckerRow[] | "HTML"> {
  const body = new URLSearchParams();
  body.append("page", String(page));
  body.append("search", JSON.stringify({
    type: 2,
    text: "",
    status: "-1",
    development: "-1",
    start_date: startBuddhist,
    end_date: endBuddhist,
    inspect_no: "-1",
  }));

  const response = await fetch(`${BASE_URL}/inspectoraccept/get_table_mobile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Cookie: `ci_session=${state.ciSession}`,
    },
    body,
    cache: "no-store",
  });

  const text = await response.text();
  if (text.includes("<!DOCTYPE html")) {
    console.warn("API Checker returned HTML instead of JSON", { page, status: response.status });
    return "HTML";
  }
  try {
    return JSON.parse(text) as CheckerRow[];
  } catch {
    throw new Error(`API Checker returned invalid JSON (HTTP ${response.status})`);
  }
}

async function getAllData(
  state: SessionState,
  startDate: string,
  endDate: string,
): Promise<CheckerRow[]> {
  const startBuddhist = toBuddhist(startDate);
  const endBuddhist = toBuddhist(endDate);
  const allData: CheckerRow[] = [];
  let page = 0;

  while (true) {
    let retry = 0;
    let data: CheckerRow[] | "HTML" | null = null;
    while (retry < 3) {
      data = await fetchPage(state, page, startBuddhist, endBuddhist);
      if (data !== "HTML") break;
      state.ciSession = null;
      await login(state);
      retry++;
    }

    if (data === "HTML" || data === null) {
      throw new Error("API Checker session retry limit was reached");
    }
    if (!Array.isArray(data) || data.length === 0) break;
    allData.push(...data);
    page++;
  }

  return allData.filter((row) => row.request_status === "1" || row.request_status === "2");
}

export async function getCheckerData(startDate: string, endDate: string): Promise<CheckerRow[]> {
  requireCheckerCredentials();
  const key = `${startDate}::${endDate}`;
  const cached = checkerCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const state: SessionState = { ciSession };
  try {
    await login(state);
  } catch {
    ciSession = null;
    state.ciSession = null;
    await login(state);
  }
  ciSession = state.ciSession;

  try {
    const data = await getAllData(state, startDate, endDate);
    ciSession = state.ciSession;
    checkerCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (error) {
    ciSession = null;
    throw error;
  }
}
