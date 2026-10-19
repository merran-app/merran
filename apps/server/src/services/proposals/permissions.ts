import type {
  ApiKeyPermissions,
  Proposal,
} from "../../database/entities/index.ts"
import { PROPOSAL_KINDS } from "../../database/entities/proposals.ts"
import { AppError } from "../../core/errors.ts"
import { allows, type ApiAccess } from "../auth/api-keys.ts"

/** Recipe access alone must not expose or apply suggestions for other areas. */
export function allowsProposal(
  permissions: ApiKeyPermissions,
  kind: Proposal["kind"],
  access: ApiAccess
) {
  if (kind === "meals") return allows(permissions, "plan", access)
  if (kind === "list") return allows(permissions, "list", access)
  if (kind === "tastes") return allows(permissions, "plan", access)
  if (kind === "import") return allows(permissions, "imports", access)
  return allows(permissions, "recipes", access)
}

export function readableProposalKinds(permissions: ApiKeyPermissions) {
  return PROPOSAL_KINDS.filter((kind) =>
    allowsProposal(permissions, kind, "read")
  )
}

export function requireProposalPermission(
  permissions: ApiKeyPermissions | undefined,
  kind: Proposal["kind"],
  access: ApiAccess
) {
  if (permissions && !allowsProposal(permissions, kind, access)) {
    throw new AppError(
      "forbidden",
      "missing_permission",
      "This API key cannot access that kind of suggestion."
    )
  }
}
