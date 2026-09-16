import { z } from "zod";
import { Currency, Timestamped } from "./common";

export const DeskStrategyFocus = z.enum([
  "global_macro",
  "equity_derivatives",
  "fx",
  "futures_systematic",
  "digital_assets",
  "event_driven",
  "multi_strategy",
]);
export type DeskStrategyFocus = z.infer<typeof DeskStrategyFocus>;

/** A trading desk: the organisational unit that owns portfolios and risk budgets. */
export const Desk = Timestamped.extend({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  focus: DeskStrategyFocus,
  baseCurrency: Currency,
  /** Capital allocated to the desk by the CIO, in base currency. */
  capitalAllocation: z.number().nonnegative(),
  headUserId: z.string().nullable(),
});
export type Desk = z.infer<typeof Desk>;

export const CreateDeskInput = Desk.omit({ id: true, createdAt: true, updatedAt: true });
export type CreateDeskInput = z.infer<typeof CreateDeskInput>;
