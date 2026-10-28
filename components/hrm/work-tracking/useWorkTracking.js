"use client";

import { useCallback, useEffect, useState } from "react";
import { createWork, getWork, updateSubStatus } from "@/lib/work-tracking/service";

function errorMessage(error) {
  return error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
}

export function useWorkList(start, end) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(Boolean(start && end));
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);
  const updateSubStatusInList = useCallback(({ houseNo, round, date, detail, status }) => {
    setData((current) => current.map((item) => {
      if (item.houseNo !== houseNo || item.round !== round || item.eventDate !== date) return item;
      return {
        ...item,
        subStatuses: (item.subStatuses ?? []).map((subStatus) =>
          subStatus.detail === detail ? { ...subStatus, status } : subStatus,
        ),
      };
    }));
  }, []);

  useEffect(() => {
    if (!start || !end) {
      setData([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    getWork(start, end, { signal: controller.signal })
      .then((records) => {
        if (active) setData(records);
      })
      .catch((cause) => {
        if (active && !(cause instanceof Error && cause.name === "AbortError")) {
          setError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [start, end, reloadKey]);

  return { data, loading, error, refresh, updateSubStatusInList };
}

export function useWorkCreate() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const create = useCallback(async (input) => {
    setCreating(true);
    setError(null);
    try {
      return await createWork(input);
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    } finally {
      setCreating(false);
    }
  }, []);
  return { create, creating, error };
}

export function useSubStatusUpdate() {
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const update = useCallback(async (input) => {
    setUpdating(true);
    setError(null);
    try {
      return await updateSubStatus(input);
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    } finally {
      setUpdating(false);
    }
  }, []);
  return { update, updating, error };
}
