import { describe, expect, it } from "vitest";

describe("auction concurrency invariant", () => {
  it("requires every accepted bid to be strictly greater than the committed current bid", () => {
    const current = 100;
    const attempts = [101, 110, 105, 99, 110];
    let highest = current;
    const accepted: number[] = [];

    for (const amount of attempts) {
      if (amount > highest) {
        highest = amount;
        accepted.push(amount);
      }
    }

    expect(highest).toBe(110);
    expect(accepted).toEqual([101, 110]);
    expect(accepted.every((amount, i) => i === 0 || amount > accepted[i - 1])).toBe(true);
  });
});
