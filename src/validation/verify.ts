export async function runVerification() {
  // Allow tests to opt-out of verification by setting AO_SKIP_VERIFY=1
  try {
    if (process.env.AO_SKIP_VERIFY === '1') {
      return { lint: 'pass', typecheck: 'pass', tests: { passed: 1, failed: 0 } }
    }
  } catch {
    // ignore
  }
  // Default stubbed verifier: failing lint and one failing test to exercise flows
  return { lint: 'fail', typecheck: 'pass', tests: { passed: 0, failed: 1 } }
}
