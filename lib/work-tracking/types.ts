export type WorkTrackingRecordStatus = "in_progress" | "completed" | "delivered";

export type WorkTrackingSession = {
  date: string;
  time: string;
  name: string;
  nickname?: string;
  items: string[];
};

export type WorkTrackingSubStatus = {
  detail: string;
  status: WorkTrackingRecordStatus;
  reportStatuses?: Record<string, string>;
};

export type WorkTrackingApiRecord = {
  houseNo: string;
  round: string;
  date: string;
  projectText: string;
  detail: string;
  status: WorkTrackingRecordStatus;
  deliveredDate: string;
  reportStatuses: Record<string, string>;
  subStatuses: WorkTrackingSubStatus[];
  /** The legacy API stores this object as a JSON string. */
  workers: string;
  /** Raw API Checker request status, retained for integrations that use it. */
  requestStatus?: string;
};
