"use client";

import Link from "next/link";
import { formatDateTime, formatRelative, humanize } from "@/lib/ui/format";
import { Badge } from "@/components/ui/badge";
import { Drawer } from "@/components/ui/drawer";
import { JsonView } from "@/components/ui/json-view";
import { DetailGrid, DetailItem, Prose } from "@/app/(app)/_components/detail";
import type { AuditEvent } from "@/lib/domain/audit";
import { targetHref, toneForAction } from "./format";

export interface EventDrawerProps {
  event: AuditEvent | null;
  now: number;
  portfolioCode?: string;
  onClose: () => void;
}

/** Full record for one audit event, including its structured payload. */
export function EventDrawer({ event, now, portfolioCode, onClose }: EventDrawerProps) {
  if (!event) return null;
  const href = targetHref(event.targetType, event.targetId);

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Badge tone={toneForAction(event.action)} size="xs" mono dot>
            {event.action}
          </Badge>
        </span>
      }
      description={formatDateTime(event.at, { seconds: true }) + " UTC"}
    >
      <div className="space-y-5">
        <Prose>{event.summary}</Prose>

        <DetailGrid cols={2}>
          <DetailItem label="Actor" mono={false}>
            {event.actor.name} <span className="text-fg-subtle">({humanize(event.actor.kind)})</span>
            <span className="num mt-0.5 block text-2xs text-fg-subtle">{event.actor.id}</span>
          </DetailItem>
          <DetailItem label="Target" mono={false}>
            <span className="text-fg-muted">{event.targetType}</span>
            <span className="num mt-0.5 block text-2xs">
              {href ? (
                <Link href={href} className="text-accent-strong hover:underline">
                  {event.targetId}
                </Link>
              ) : (
                <span className="text-fg-subtle">{event.targetId}</span>
              )}
            </span>
          </DetailItem>
          <DetailItem label="Portfolio">{portfolioCode ?? event.portfolioId ?? "—"}</DetailItem>
          <DetailItem label="Desk">{event.deskId ?? "—"}</DetailItem>
          <DetailItem label="Occurred">
            {formatRelative(event.at, now)} <span className="text-fg-subtle">· {formatDateTime(event.at, { seconds: true })} UTC</span>
          </DetailItem>
          <DetailItem label="Source IP">{event.ip ?? "—"}</DetailItem>
          <DetailItem label="Event id" className="sm:col-span-2">
            {event.id}
          </DetailItem>
        </DetailGrid>

        <div>
          <h3 className="label-caps mb-2">Payload</h3>
          <JsonView value={event.data} label="data" defaultOpen maxHeight="26rem" />
        </div>

        <div>
          <h3 className="label-caps mb-2">Actor record</h3>
          <JsonView value={event.actor} label="actor" />
        </div>
      </div>
    </Drawer>
  );
}
