"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createMissionClient, type MissionClientError } from "./client.ts";
import { createMissionDetailClient, createViewEvent, detailErrorMessage } from "./detail-client.ts";
import type { MissionItemDetail } from "./detail-contract.ts";

type ViewEventType = "detail_view" | "map_open";
type LoadState =
  | { key: string; status: "loading" }
  | { key: string; status: "ready"; detail: MissionItemDetail }
  | { key: string; status: "error"; message: string };

export function useMissionDetail(batchId: string, itemId: string, eventType: ViewEventType, enabled = true) {
  const key = `${batchId}:${itemId}`;
  const detailClient = useMemo(() => createMissionDetailClient(), []);
  const missionClient = useMemo(() => createMissionClient(), []);
  const viewEvent = useMemo(() => createViewEvent(batchId, itemId, eventType), [batchId, itemId, eventType]);
  const [load, setLoad] = useState<LoadState>(() => ({ key, status: "loading" }));
  const [eventFailure, setEventFailure] = useState<{ eventId: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const automaticEventId = useRef<string | null>(null);
  const manualEventRequest = useRef<AbortController | null>(null);
  const currentLoad: LoadState = load.key === key ? load : { key, status: "loading" };
  const detail = currentLoad.status === "ready" ? currentLoad.detail : null;
  const loading = currentLoad.status === "loading";
  const error = currentLoad.status === "error" ? currentLoad.message : null;
  const eventError = eventFailure?.eventId === viewEvent.clientEventId ? eventFailure.message : null;

  const recordView = useCallback(async (signal?: AbortSignal) => {
    try {
      await missionClient.recordEvent(viewEvent, signal);
    } catch (caught) {
      if (!signal?.aborted) {
        const message = (caught as MissionClientError)?.message;
        setEventFailure({ eventId: viewEvent.clientEventId, message: message || "열람 기록을 저장하지 못했어요." });
      }
    }
  }, [missionClient, viewEvent]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    detailClient(batchId, itemId, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setLoad({ key, status: "ready", detail: result });
    }).catch(caught => {
      if (controller.signal.aborted) return;
      setLoad({ key, status: "error", message: detailErrorMessage(caught) });
    });
    return () => controller.abort();
  }, [attempt, batchId, detailClient, enabled, itemId, key]);

  useEffect(() => {
    automaticEventId.current = null;
    manualEventRequest.current?.abort();
    return () => manualEventRequest.current?.abort();
  }, [viewEvent.clientEventId]);

  useEffect(() => {
    if (!detail) return;
    const controller = new AbortController();
    const sendWhenVisible = () => {
      if (document.visibilityState !== "visible" || automaticEventId.current === viewEvent.clientEventId) return;
      automaticEventId.current = viewEvent.clientEventId;
      void recordView(controller.signal);
    };
    sendWhenVisible();
    document.addEventListener("visibilitychange", sendWhenVisible);
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", sendWhenVisible);
    };
  }, [detail, recordView, viewEvent]);

  const retryEvent = useCallback(() => {
    manualEventRequest.current?.abort();
    const controller = new AbortController();
    manualEventRequest.current = controller;
    setEventFailure(null);
    void recordView(controller.signal);
  }, [recordView]);

  const retryDetail = useCallback(() => {
    setLoad({ key, status: "loading" });
    setAttempt(current => current + 1);
  }, [key]);

  return {
    detail, loading, error, eventError,
    retryDetail,
    retryEvent,
  };
}
