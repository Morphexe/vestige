/**
 * Custom Test Assertions
 *
 * Provides domain-specific assertions for testing:
 * - FSRS-6 algorithm results
 * - Memory strength calculations
 * - Embedding similarity
 * - Temporal validity
 */

/**
 * Assertion error with context
 */
export class AssertionError extends Error {
  constructor(
    message: string,
    public readonly expected: unknown,
    public readonly actual: unknown,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AssertionError';
  }
}

/**
 * Assert that a number is approximately equal to expected
 */
export function assertApproxEqual(
  actual: number,
  expected: number,
  epsilon: number = 0.0001,
  message?: string
): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new AssertionError(
      message ?? `Expected ${expected} ± ${epsilon}, got ${actual}`,
      expected,
      actual,
      { epsilon }
    );
  }
}

/**
 * Assert that a value is within a range
 */
export function assertInRange(
  actual: number,
  min: number,
  max: number,
  message?: string
): void {
  if (actual < min || actual > max) {
    throw new AssertionError(
      message ?? `Expected value in range [${min}, ${max}], got ${actual}`,
      { min, max },
      actual
    );
  }
}

/**
 * Assert that a number is positive
 */
export function assertPositive(actual: number, message?: string): void {
  if (actual <= 0) {
    throw new AssertionError(
      message ?? `Expected positive number, got ${actual}`,
      'positive',
      actual
    );
  }
}

/**
 * Assert that a number is non-negative
 */
export function assertNonNegative(actual: number, message?: string): void {
  if (actual < 0) {
    throw new AssertionError(
      message ?? `Expected non-negative number, got ${actual}`,
      'non-negative',
      actual
    );
  }
}

// ============================================================================
// FSRS-6 SPECIFIC ASSERTIONS
// ============================================================================

/**
 * Assert that retrievability is valid (0-1)
 */
export function assertValidRetrievability(r: number, message?: string): void {
  assertInRange(r, 0, 1, message ?? `Invalid retrievability: ${r}`);
}

/**
 * Assert that difficulty is valid (1-10)
 */
export function assertValidDifficulty(d: number, message?: string): void {
  assertInRange(d, 1, 10, message ?? `Invalid difficulty: ${d}`);
}

/**
 * Assert that stability is valid (>0)
 */
export function assertValidStability(s: number, message?: string): void {
  assertPositive(s, message ?? `Invalid stability: ${s}`);
}

/**
 * Assert that interval is valid (>=0)
 */
export function assertValidInterval(i: number, message?: string): void {
  assertNonNegative(i, message ?? `Invalid interval: ${i}`);
}

/**
 * Assert that retrievability decreases monotonically with time
 */
export function assertRetrievabilityDecays(
  retrievabilities: Array<{ elapsedDays: number; r: number }>,
  message?: string
): void {
  const sorted = [...retrievabilities].sort((a, b) => a.elapsedDays - b.elapsedDays);

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].r > sorted[i - 1].r) {
      throw new AssertionError(
        message ??
          `Retrievability should decay: at day ${sorted[i].elapsedDays} got ${sorted[i].r}, but at day ${sorted[i - 1].elapsedDays} got ${sorted[i - 1].r}`,
        'monotonically decreasing',
        retrievabilities
      );
    }
  }
}

/**
 * Assert that difficulty ordering is correct (Again > Hard > Good > Easy)
 */
export function assertDifficultyOrdering(
  dAgain: number,
  dHard: number,
  dGood: number,
  dEasy: number,
  message?: string
): void {
  if (!(dAgain > dHard && dHard > dGood && dGood > dEasy)) {
    throw new AssertionError(
      message ??
        `Expected difficulty ordering Again > Hard > Good > Easy, got ${dAgain} > ${dHard} > ${dGood} > ${dEasy}`,
      'Again > Hard > Good > Easy',
      { dAgain, dHard, dGood, dEasy }
    );
  }
}

/**
 * Assert that stability ordering is correct (Again < Hard < Good < Easy)
 */
export function assertStabilityOrdering(
  sAgain: number,
  sHard: number,
  sGood: number,
  sEasy: number,
  message?: string
): void {
  if (!(sAgain < sHard && sHard < sGood && sGood < sEasy)) {
    throw new AssertionError(
      message ??
        `Expected stability ordering Again < Hard < Good < Easy, got ${sAgain} < ${sHard} < ${sGood} < ${sEasy}`,
      'Again < Hard < Good < Easy',
      { sAgain, sHard, sGood, sEasy }
    );
  }
}

/**
 * Assert that interval round-trips correctly (interval -> retrievability -> interval)
 */
export function assertIntervalRoundTrip(
  stability: number,
  desiredRetention: number,
  interval: number,
  actualRetention: number,
  tolerance: number = 0.05,
  message?: string
): void {
  if (Math.abs(actualRetention - desiredRetention) > tolerance) {
    throw new AssertionError(
      message ??
        `Interval round-trip failed: stability=${stability}, interval=${interval}, expected R=${desiredRetention}, got R=${actualRetention}`,
      desiredRetention,
      actualRetention,
      { stability, interval, tolerance }
    );
  }
}

// ============================================================================
// EMBEDDING ASSERTIONS
// ============================================================================

/**
 * Assert that embeddings are normalized (unit length)
 */
export function assertNormalizedEmbedding(
  embedding: Float32Array | number[],
  epsilon: number = 0.001,
  message?: string
): void {
  let norm = 0;
  for (const v of embedding) {
    norm += v * v;
  }
  norm = Math.sqrt(norm);

  if (Math.abs(norm - 1) > epsilon) {
    throw new AssertionError(
      message ?? `Expected normalized embedding (norm=1), got norm=${norm}`,
      1,
      norm,
      { epsilon }
    );
  }
}

/**
 * Assert that embeddings have the correct dimension
 */
export function assertEmbeddingDimension(
  embedding: Float32Array | number[],
  expectedDim: number,
  message?: string
): void {
  if (embedding.length !== expectedDim) {
    throw new AssertionError(
      message ??
        `Expected embedding dimension ${expectedDim}, got ${embedding.length}`,
      expectedDim,
      embedding.length
    );
  }
}

/**
 * Assert that cosine similarity is valid (-1 to 1)
 */
export function assertValidSimilarity(sim: number, message?: string): void {
  assertInRange(
    sim,
    -1,
    1,
    message ?? `Invalid cosine similarity: ${sim}`
  );
}

/**
 * Assert that similar texts have higher similarity than different texts
 */
export function assertSemanticSimilarity(
  similarSim: number,
  differentSim: number,
  message?: string
): void {
  if (similarSim <= differentSim) {
    throw new AssertionError(
      message ??
        `Expected similar texts to have higher similarity: similar=${similarSim}, different=${differentSim}`,
      'similarSim > differentSim',
      { similarSim, differentSim }
    );
  }
}

// ============================================================================
// TEMPORAL ASSERTIONS
// ============================================================================

/**
 * Assert that a date is within a validity window
 */
export function assertWithinValidity(
  current: Date,
  validFrom?: Date,
  validUntil?: Date,
  message?: string
): void {
  const afterStart = validFrom ? current >= validFrom : true;
  const beforeEnd = validUntil ? current <= validUntil : true;

  if (!afterStart || !beforeEnd) {
    throw new AssertionError(
      message ??
        `Date ${current.toISOString()} not within validity window [${validFrom?.toISOString() ?? '-∞'}, ${validUntil?.toISOString() ?? '+∞'}]`,
      { validFrom, validUntil },
      current
    );
  }
}

/**
 * Assert that a review is due
 */
export function assertIsDue(
  nextReview: Date,
  current: Date,
  message?: string
): void {
  if (current < nextReview) {
    throw new AssertionError(
      message ??
        `Expected review to be due: next=${nextReview.toISOString()}, current=${current.toISOString()}`,
      'due',
      'not due',
      { nextReview, current }
    );
  }
}

/**
 * Assert that a review is not yet due
 */
export function assertIsNotDue(
  nextReview: Date,
  current: Date,
  message?: string
): void {
  if (current >= nextReview) {
    throw new AssertionError(
      message ??
        `Expected review to not be due: next=${nextReview.toISOString()}, current=${current.toISOString()}`,
      'not due',
      'due',
      { nextReview, current }
    );
  }
}

// ============================================================================
// ARRAY/COLLECTION ASSERTIONS
// ============================================================================

/**
 * Assert that arrays are equal (deep comparison)
 */
export function assertArraysEqual<T>(
  actual: T[],
  expected: T[],
  message?: string
): void {
  if (actual.length !== expected.length) {
    throw new AssertionError(
      message ??
        `Arrays have different lengths: expected ${expected.length}, got ${actual.length}`,
      expected,
      actual
    );
  }

  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new AssertionError(
        message ?? `Arrays differ at index ${i}: expected ${expected[i]}, got ${actual[i]}`,
        expected,
        actual,
        { index: i }
      );
    }
  }
}

/**
 * Assert that an array contains a value
 */
export function assertContains<T>(
  array: T[],
  value: T,
  message?: string
): void {
  if (!array.includes(value)) {
    throw new AssertionError(
      message ?? `Expected array to contain ${value}`,
      value,
      array
    );
  }
}

/**
 * Assert that an array is sorted in ascending order
 */
export function assertSortedAscending(
  array: number[],
  message?: string
): void {
  for (let i = 1; i < array.length; i++) {
    if (array[i] < array[i - 1]) {
      throw new AssertionError(
        message ??
          `Array not sorted ascending at index ${i}: ${array[i - 1]} > ${array[i]}`,
        'sorted ascending',
        array
      );
    }
  }
}

/**
 * Assert that an array is sorted in descending order
 */
export function assertSortedDescending(
  array: number[],
  message?: string
): void {
  for (let i = 1; i < array.length; i++) {
    if (array[i] > array[i - 1]) {
      throw new AssertionError(
        message ??
          `Array not sorted descending at index ${i}: ${array[i - 1]} < ${array[i]}`,
        'sorted descending',
        array
      );
    }
  }
}

export default {
  assertApproxEqual,
  assertInRange,
  assertPositive,
  assertNonNegative,
  assertValidRetrievability,
  assertValidDifficulty,
  assertValidStability,
  assertValidInterval,
  assertRetrievabilityDecays,
  assertDifficultyOrdering,
  assertStabilityOrdering,
  assertIntervalRoundTrip,
  assertNormalizedEmbedding,
  assertEmbeddingDimension,
  assertValidSimilarity,
  assertSemanticSimilarity,
  assertWithinValidity,
  assertIsDue,
  assertIsNotDue,
  assertArraysEqual,
  assertContains,
  assertSortedAscending,
  assertSortedDescending,
};
