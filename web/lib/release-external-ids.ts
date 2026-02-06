/**
 * release_external_ids table: release_id, source, external_id only.
 * Use this helper for all writes so only these columns are sent.
 */
export function releaseExternalIdRow(
  release_id: string,
  source: string,
  external_id: string
): { release_id: string; source: string; external_id: string } {
  return { release_id, source, external_id };
}
