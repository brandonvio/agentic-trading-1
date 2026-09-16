"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { useCan } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { PlusIcon } from "@/components/icons";
import type { Instrument } from "@/lib/domain/instrument";
import type { Order, OrderType, TimeInForce } from "@/lib/domain/order";
import type { Side } from "@/lib/domain/common";
import { InstrumentSearch } from "./instrument-search";
import { OrderResult } from "./order-result";

/** Serialisable portfolio option handed down from the server component. */
export interface PortfolioOption {
  id: string;
  code: string;
  name: string;
}

const TYPES: Array<{ value: OrderType; label: string }> = [
  { value: "MARKET", label: "Market" },
  { value: "LIMIT", label: "Limit" },
  { value: "STOP", label: "Stop" },
  { value: "STOP_LIMIT", label: "Stop limit" },
];

const TIFS: Array<{ value: TimeInForce; label: string }> = [
  { value: "DAY", label: "Day" },
  { value: "GTC", label: "Good till cancelled" },
  { value: "IOC", label: "Immediate or cancel" },
  { value: "FOK", label: "Fill or kill" },
];

const SIDES: Side[] = ["BUY", "SELL"];

/** New-order ticket. Gated on `orders:create`; renders nothing without it. */
export function OrderTicket({ portfolios }: { portfolios: PortfolioOption[] }) {
  const router = useRouter();
  const { push } = useToast();
  const canCreate = useCan("orders:create");

  const [open, setOpen] = useState(false);
  const [portfolioId, setPortfolioId] = useState(portfolios[0]?.id ?? "");
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [side, setSide] = useState<Side>("BUY");
  const [type, setType] = useState<OrderType>("MARKET");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [timeInForce, setTimeInForce] = useState<TimeInForce>("DAY");
  const [rationale, setRationale] = useState("");

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<Order | null>(null);

  if (!canCreate) return null;

  const needsLimit = type === "LIMIT" || type === "STOP_LIMIT";
  const needsStop = type === "STOP" || type === "STOP_LIMIT";
  const qty = Number(quantity);
  const valid =
    Boolean(portfolioId) &&
    Boolean(instrument) &&
    Number.isFinite(qty) &&
    qty > 0 &&
    (!needsLimit || Number(limitPrice) > 0) &&
    (!needsStop || Number(stopPrice) > 0);

  function reset() {
    setInstrument(null);
    setQuantity("");
    setLimitPrice("");
    setStopPrice("");
    setRationale("");
    setResult(null);
    setError(null);
    setFieldErrors({});
  }

  async function submit() {
    if (!instrument) return;
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      const order = await apiFetch<Order>("/api/orders", {
        method: "POST",
        body: {
          portfolioId,
          instrumentId: instrument.id,
          side,
          type,
          quantity: qty,
          ...(needsLimit ? { limitPrice: Number(limitPrice) } : {}),
          ...(needsStop ? { stopPrice: Number(stopPrice) } : {}),
          timeInForce,
          rationale: rationale.trim(),
          origin: "manual",
        },
      });
      setResult(order);
      push({
        title: `Order ${order.status.toLowerCase().replace(/_/g, " ")}`,
        description: `${order.side} ${order.symbol}`,
        tone: order.status === "RISK_REJECTED" || order.status === "ERROR" ? "negative" : order.status === "PENDING_APPROVAL" ? "warning" : "positive",
      });
      router.refresh();
    } catch (e) {
      if (e instanceof ApiClientError) {
        setError(e.message);
        setFieldErrors(e.fieldErrors);
      } else {
        setError("Order submission failed");
      }
    } finally {
      setPending(false);
    }
  }

  const first = (key: string) => fieldErrors[key]?.[0] ?? null;

  return (
    <>
      <Button variant="primary" size="sm" icon={<PlusIcon size={14} />} onClick={() => setOpen(true)}>
        New order
      </Button>
      <Drawer
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="New order ticket"
        description="Orders pass pre-trade risk before routing; large or agent-originated tickets may require approval."
        footer={
          result ? (
            <>
              <Button variant="ghost" size="sm" onClick={reset}>
                New ticket
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Done
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" loading={pending} disabled={!valid} onClick={() => void submit()}>
                Submit order
              </Button>
            </>
          )
        }
      >
        {result ? (
          <OrderResult order={result} />
        ) : (
          <div className="space-y-4">
            {error ? (
              <p role="alert" className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
                {error}
              </p>
            ) : null}

            <Field label="Portfolio" htmlFor="ticket-portfolio" error={first("portfolioId")}>
              <Select
                id="ticket-portfolio"
                value={portfolioId}
                onChange={(e) => setPortfolioId(e.target.value)}
                placeholder={portfolios.length === 0 ? "No portfolio available" : undefined}
                options={portfolios.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
              />
            </Field>

            <InstrumentSearch value={instrument} onSelect={setInstrument} error={first("instrumentId")} />

            <div className="grid grid-cols-2 gap-3">
              <Field label="Side" htmlFor="ticket-side" error={first("side")}>
                <Select id="ticket-side" value={side} onChange={(e) => setSide(e.target.value as Side)} options={SIDES.map((s) => ({ value: s, label: s }))} />
              </Field>
              <Field label="Type" htmlFor="ticket-type" error={first("type")}>
                <Select id="ticket-type" value={type} onChange={(e) => setType(e.target.value as OrderType)} options={TYPES} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity" htmlFor="ticket-quantity" error={first("quantity")}>
                <Input
                  id="ticket-quantity"
                  mono
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Time in force" htmlFor="ticket-tif" error={first("timeInForce")}>
                <Select id="ticket-tif" value={timeInForce} onChange={(e) => setTimeInForce(e.target.value as TimeInForce)} options={TIFS} />
              </Field>
            </div>

            {needsLimit || needsStop ? (
              <div className="grid grid-cols-2 gap-3">
                {needsLimit ? (
                  <Field label="Limit price" htmlFor="ticket-limit" error={first("limitPrice")}>
                    <Input id="ticket-limit" mono inputMode="decimal" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} placeholder="0.00" />
                  </Field>
                ) : null}
                {needsStop ? (
                  <Field label="Stop price" htmlFor="ticket-stop" error={first("stopPrice")}>
                    <Input id="ticket-stop" mono inputMode="decimal" value={stopPrice} onChange={(e) => setStopPrice(e.target.value)} placeholder="0.00" />
                  </Field>
                ) : null}
              </div>
            ) : null}

            <Field label="Rationale" htmlFor="ticket-rationale" help="Stored with the order and shown to approvers." error={first("rationale")}>
              <Textarea id="ticket-rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} placeholder="Why this trade, and why now?" />
            </Field>
          </div>
        )}
      </Drawer>
    </>
  );
}
