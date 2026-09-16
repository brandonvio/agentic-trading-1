import { z } from "zod";

export const IsoDateTime = z.string().datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

export const Money = z.number().finite();
export const Currency = z.enum(["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD", "BTC", "ETH", "SOL", "USDC"]);
export type Currency = z.infer<typeof Currency>;

export const Timestamped = z.object({
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Timestamped = z.infer<typeof Timestamped>;

export const Page = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  });

export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type PageQuery = z.infer<typeof PageQuery>;

export const Side = z.enum(["BUY", "SELL"]);
export type Side = z.infer<typeof Side>;
