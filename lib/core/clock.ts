/** Injectable time source so services and tests never call Date.now() directly. */
export interface Clock {
  now(): Date;
  nowIso(): string;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
  nowIso(): string {
    return new Date().toISOString();
  }
}

export class FixedClock implements Clock {
  private current: Date;
  constructor(start: Date | string = "2026-09-03T14:30:00.000Z") {
    this.current = new Date(start);
  }
  now(): Date {
    return new Date(this.current);
  }
  nowIso(): string {
    return this.current.toISOString();
  }
  set(d: Date | string) {
    this.current = new Date(d);
  }
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}
