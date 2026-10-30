import type { CreationInput } from "./create-yawrd.ts";

/** Deliberately selected public text, separate from private Blueprint content. */
export interface BlueprintPublicDetailsSnapshot {
  readonly schemaVersion: 1;
  /** Opaque immutable revision ID, not a revision number local to a workspace. */
  readonly blueprintRevisionId: string;
  readonly publicName: string;
  readonly publicDescription: string;
}

/** Supplied by a future trusted server boundary; this type proves no approval. */
export interface BlueprintApprovalReference {
  readonly approvalId: string;
  readonly blueprintRevisionId: string;
}

export type BlueprintCreationDetails = Pick<CreationInput, "projectName" | "projectPurpose">;

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be a record`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${field} must be a record`);
  }
  return value as Record<string, unknown>;
}

function ownValue(input: Record<string, unknown>, field: string): unknown {
  const property = Object.getOwnPropertyDescriptor(input, field);
  if (!property || !Object.hasOwn(property, "value")) {
    throw new Error(`${field} must be an explicit data field`);
  }
  return property.value;
}

function nonblank(input: Record<string, unknown>, field: string): string {
  const value = ownValue(input, field);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a nonblank string`);
  }
  return value;
}

/**
 * Pure projection only: checks shape and exact revision equality, not approval
 * authenticity, owner access, publication consent, revocation or content integrity.
 * The future server boundary must verify these before supplying the snapshot and
 * reference. Extra fields are ignored; private text is never a fallback.
 */
export function mapBlueprintPublicDetails(
  snapshot: unknown,
  approvalReference: unknown,
): BlueprintCreationDetails {
  const details = record(snapshot, "Public-details snapshot");
  if (ownValue(details, "schemaVersion") !== 1) {
    throw new Error("Unsupported public-details schema version");
  }
  const reference = record(approvalReference, "Approval reference");
  const revisionId = nonblank(details, "blueprintRevisionId");
  nonblank(reference, "approvalId");
  if (revisionId !== nonblank(reference, "blueprintRevisionId")) {
    throw new Error("Blueprint revision references must match exactly");
  }
  // Match the Creation Builder's trim/nonblank rules without adding text limits.
  const projectName = nonblank(details, "publicName").trim();
  const projectPurpose = nonblank(details, "publicDescription").trim();
  return { projectName, projectPurpose };
}
