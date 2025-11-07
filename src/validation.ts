import { SMSPayload, CallPayload } from "./types";

export function validateSMSPayload(payload: any): payload is SMSPayload {
  return (
    payload &&
    typeof payload.clientId === "string" &&
    typeof payload.messageId === "string" &&
    typeof payload.status === "string" &&
    typeof payload.timestamp === "string"
  );
}

export function validateCallPayload(payload: any): payload is CallPayload {
  return (
    payload &&
    typeof payload.clientId === "string" &&
    typeof payload.callId === "string" &&
    typeof payload.status === "string" &&
    typeof payload.timestamp === "string"
  );
}

