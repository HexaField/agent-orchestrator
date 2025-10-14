export async function runVerification() {
  return { lint: 'fail', typecheck: 'pass', tests: { passed: 0, failed: 1 } }
}
