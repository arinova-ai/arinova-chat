import { BACKEND_URL } from "./config";

/** Centralised office plugin endpoint paths — change here to reconfigure. */
export const OFFICE_STATUS_PATH = "/api/office/status";
export const OFFICE_STREAM_PATH = "/api/office/stream";

/** Fully-qualified URLs (used by EventSource / raw fetch). */
export const OFFICE_STATUS_URL = `${BACKEND_URL}${OFFICE_STATUS_PATH}`;
export const OFFICE_STREAM_URL = `${BACKEND_URL}${OFFICE_STREAM_PATH}`;
