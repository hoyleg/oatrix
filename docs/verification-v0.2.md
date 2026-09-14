# v0.2 candidate verification record

Date: 14 September 2026. Local environment: Node.js 22.16.0 on Linux. Self-tested candidate, not independently reviewed or merged by this record.

- `npm run verify`: syntax; 96 unit/integration tests including 2,500 generated candidate actions (1,500 original plus 1,000 v2); six separate child-process/HTTP E2E tests; seven demos; static build.
- All six original v1 scenario checkpoint sequences match the pinned bootstrap fixture.
- V2 machinery journal replay succeeds against its trusted genesis and final checkpoint.
- Offline Chromium UI inspection: all seven scenarios and 84 frames; desktop 1440 x 1050 and mobile 390 x 844; no JavaScript errors or horizontal overflow. Localhost browser navigation was blocked; HTTP E2E ran independently in Node. See [test boundaries](testing.md).
- Two temporary mutation checks disabled nonce validation and levy deduction respectively; the targeted process E2E test failed in each case. Both mutations were reverted before the final successful full verification. This is a small test-quality spot check, not a complete mutation score.
- Example recipe files match their executable fixture definitions; `recipe:check` validates data without publishing or running it.

CI is configured but its actual outcome must be read from the PR commit. The final delivery/PR records the observed checks rather than treating this configuration as a successful run. Source tree equality is checked when publishing. No OpenClaw/Hermes or paid-model work was launched.
