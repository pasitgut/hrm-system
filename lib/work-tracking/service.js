const DATE_FORMAT = /^\d{2}\/\d{2}\/\d{4}$/;

export class WorkTrackingApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "WorkTrackingApiError";
    this.status = status;
  }
}

function getMessage(payload, fallback) {
  if (payload && typeof payload === "object") {
    const message = typeof payload.message === "string" ? payload.message : payload.error;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function request(path, init = {}) {
  let response;
  try {
    response = await fetch(`/api/work${path}`, {
      ...init,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new WorkTrackingApiError("เชื่อมต่อระบบติดตามงานไม่สำเร็จ");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new WorkTrackingApiError(
      response.ok ? "ระบบติดตามงานส่งข้อมูลไม่ถูกต้อง" : `คำขอไม่สำเร็จ (${response.status})`,
      response.status,
    );
  }

  if (!response.ok || !payload || payload.success !== true || !("data" in payload)) {
    throw new WorkTrackingApiError(getMessage(payload, `คำขอไม่สำเร็จ (${response.status})`), response.status);
  }
  return payload.data;
}

function normalizeStatus(status) {
  if (status === "in_progress" || status === "in progress") return "in progress";
  if (status === "completed" || status === "delivered") return status;
  return "in progress";
}

function toApiStatus(status) {
  return status === "in progress" ? "in_progress" : status;
}

export function parseWorkers(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mapWorkRecord(item) {
  return {
    houseNo: item.houseNo || "",
    round: item.round || "",
    eventDate: item.date || "",
    projectText: item.projectText || "",
    detail: item.detail || "",
    status: normalizeStatus(item.status),
    deliveredDate: item.deliveredDate || "",
    itemCount: Number.isFinite(Number(item.itemCount)) && Number(item.itemCount) > 0
      ? Number(item.itemCount)
      : Math.max(item.subStatuses?.length ?? 0, 1),
    reportStatuses: item.reportStatuses ?? {},
    subStatuses: (item.subStatuses ?? []).map((subStatus) => ({
      ...subStatus,
      status: normalizeStatus(subStatus.status),
      reportStatuses: subStatus.reportStatuses ?? {},
    })),
    workersRaw: typeof item.workers === "string" ? item.workers : JSON.stringify(item.workers ?? {}),
  };
}

export async function getWork(start, end, options = {}) {
  if (!DATE_FORMAT.test(start) || !DATE_FORMAT.test(end)) {
    throw new TypeError("start and end must use DD/MM/YYYY format");
  }
  const query = new URLSearchParams({ start, end });
  const records = await request(`?${query.toString()}`, { signal: options.signal });
  return (records ?? []).map(mapWorkRecord);
}

export function createWork(input) {
  return request("/", {
    method: "POST",
    body: JSON.stringify({ ...input, status: input.status || "" }),
  });
}

export function updateSubStatus(input) {
  return request("/sub-status", {
    method: "PATCH",
    body: JSON.stringify({ ...input, status: toApiStatus(input.status) }),
  });
}
