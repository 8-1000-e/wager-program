import { expect } from "chai";
import { randomBytes } from "crypto";

/**
 * Off-chain test for VRF random_bool distribution.
 *
 * The on-chain function is: random_bool(bytes) = (bytes[31] % 2) == 0
 * If VRF provides uniformly distributed bytes, this should be exactly 50/50.
 *
 * We simulate 10,000 random 32-byte seeds and verify the distribution
 * is within acceptable statistical bounds (chi-squared test).
 */
describe("07 - VRF Distribution (off-chain)", () => {
  const ITERATIONS = 10_000;

  function randomBool(bytes: Buffer): boolean {
    return (bytes[31] % 2) === 0;
  }

  it("random_bool produces ~50/50 distribution over 10k samples", () => {
    let trueCount = 0;
    let falseCount = 0;

    for (let i = 0; i < ITERATIONS; i++) {
      const seed = randomBytes(32);
      if (randomBool(seed)) {
        trueCount++;
      } else {
        falseCount++;
      }
    }

    const ratio = trueCount / ITERATIONS;

    // Expected: 50% +/- 3% (very generous for 10k samples)
    // At 10k samples, 99.9% confidence interval is ~47%-53%
    expect(ratio).to.be.greaterThan(0.47);
    expect(ratio).to.be.lessThan(0.53);

    // Chi-squared test: (observed - expected)^2 / expected for each outcome
    const expected = ITERATIONS / 2;
    const chiSquared =
      Math.pow(trueCount - expected, 2) / expected +
      Math.pow(falseCount - expected, 2) / expected;

    // Chi-squared critical value for 1 df at p=0.001 is 10.83
    // If our statistic exceeds this, the distribution is very likely biased
    expect(chiSquared).to.be.lessThan(10.83);

    console.log(
      `    Distribution: true=${trueCount} (${(ratio * 100).toFixed(1)}%) | false=${falseCount} (${((1 - ratio) * 100).toFixed(1)}%) | chi²=${chiSquared.toFixed(3)}`
    );
  });

  it("all-zero randomness always gives player 0 (true)", () => {
    const zeros = Buffer.alloc(32, 0);
    // bytes[31] = 0, 0 % 2 == 0 → true → player 0
    expect(randomBool(zeros)).to.be.true;
  });

  it("all-one randomness always gives player 1 (false)", () => {
    const ones = Buffer.alloc(32, 1);
    // bytes[31] = 1, 1 % 2 == 1 → false → player 1
    expect(randomBool(ones)).to.be.false;
  });

  it("only byte[31] matters for the outcome", () => {
    // Two seeds identical except byte[31]
    const seed = randomBytes(32);
    const seedEven = Buffer.from(seed);
    const seedOdd = Buffer.from(seed);

    seedEven[31] = 42; // even → true
    seedOdd[31] = 43; // odd → false

    expect(randomBool(seedEven)).to.be.true;
    expect(randomBool(seedOdd)).to.be.false;
  });
});
