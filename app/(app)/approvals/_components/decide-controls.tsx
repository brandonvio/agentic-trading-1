"use client";

import { useCan, useSession } from "@/components/providers/session-provider";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionButton } from "../../_components/action-button";

const FOUR_EYES = "You raised this request — a second pair of eyes must decide";
const NO_PERMISSION = "Requires approvals:decide";

/**
 * Approve / reject for one pending request. Four-eyes is enforced in the
 * service; it is mirrored here so the reason a viewer cannot act is visible
 * rather than a surprise 403.
 */
export function DecideControls({ id, requesterUserId, subjectLabel }: { id: string; requesterUserId: string | null; subjectLabel: string }) {
  const canDecide = useCan("approvals:decide");
  const { user } = useSession();
  const isRequester = requesterUserId !== null && requesterUserId === user.id;
  const blockedReason = !canDecide ? NO_PERMISSION : isRequester ? FOUR_EYES : null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1.5">
        <ActionButton
          path={`/api/approvals/${id}/decide`}
          body={{ decision: "approve" }}
          label="Approve"
          size="xs"
          disabled={blockedReason !== null}
          disabledReason={blockedReason ?? undefined}
          reasonKey="note"
          reasonLabel="Approval note"
          reasonPlaceholder="Optional context for the audit trail"
          reasonRequired={false}
          confirmTitle="Approve request"
          confirmDescription={subjectLabel}
          confirmLabel="Approve"
          successTitle="Approved"
          successDescription="The subject has been released for execution."
        />
        <ActionButton
          path={`/api/approvals/${id}/decide`}
          body={{ decision: "reject" }}
          label="Reject"
          size="xs"
          variant="danger"
          disabled={blockedReason !== null}
          disabledReason={blockedReason ?? undefined}
          reasonKey="note"
          reasonLabel="Rejection reason"
          reasonPlaceholder="Why is this being rejected?"
          confirmTitle="Reject request"
          confirmDescription={subjectLabel}
          confirmLabel="Reject"
          successTitle="Rejected"
        />
      </div>
      {blockedReason ? (
        <p className="text-2xs text-warning text-right max-w-[15rem]">{isRequester ? "Four-eyes: you raised this request" : "No decide permission"}</p>
      ) : null}
    </div>
  );
}

/** Banner explaining a viewer-only role, shown above the pending queue. */
export function DecideNotice() {
  const canDecide = useCan("approvals:decide");
  if (canDecide) return null;
  return (
    <EmptyState
      compact
      tone="warning"
      title="You can review but not decide"
      description="Deciding an approval requires the approvals:decide permission. Requests below are shown read-only."
    />
  );
}
