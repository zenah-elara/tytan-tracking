export const BALANCE_BUCKET_BY_REQUEST_TYPE: Record<string, string> = {
  "Sick Leave": "VL/SL",
  "Vacation Leave": "VL/SL",
  "Emergency Leave": "VL/SL",
  "Floating Leave": "Floating Leave",
};

export function getBalanceBucketNameForRequest(requestLeaveTypeName: string) {
  const normalizedRequestTypeName = normalizeLeaveTypeName(requestLeaveTypeName);

  return (
    Object.entries(BALANCE_BUCKET_BY_REQUEST_TYPE).find(
      ([requestTypeName]) =>
        normalizeLeaveTypeName(requestTypeName) === normalizedRequestTypeName,
    )?.[1] ?? null
  );
}

export function normalizeLeaveTypeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
