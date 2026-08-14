export function requestedOrganizationId(request: Request): string | undefined {
  const header = request.headers.get("x-organization-id")?.trim();
  if (header) {
    return header;
  }
  const url = new URL(request.url);
  return url.searchParams.get("organizationId")?.trim() || undefined;
}
