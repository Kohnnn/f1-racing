const apiOrigin = process.env.NEXT_PUBLIC_F1_API_ORIGIN?.replace(/\/$/, "") || "";

export function buildClientDataUrl(staticPath: string, apiPath?: string) {
  if (apiOrigin && apiPath) {
    return `${apiOrigin}${apiPath}`;
  }
  return staticPath;
}

export function getClientApiOrigin() {
  return apiOrigin;
}

export function buildClientWebSocketUrl(apiPath: string) {
  if (!apiOrigin) {
    return null;
  }

  const url = new URL(apiPath, `${apiOrigin}/`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
