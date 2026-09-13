# Primary references and scope

Checked 13 September 2026. These references support component facts and design constraints, not the claim that Oatrix as a whole has been audited or proven feasible.

- Node.js test runner: https://nodejs.org/api/test.html — built-in test execution; the lab uses stable features available in Node 22.
- Node.js cryptography: https://nodejs.org/api/crypto.html — Ed25519 key import, signing and verification. This is conventional cryptography, not a quantum-resilient production profile.
- W3C WebAuthn Level 3: https://www.w3.org/TR/webauthn-3/ — credentials and relying-party/origin scope. Host portability cannot assume an arbitrary domain can reuse another RP's passkey.
- Besu QBFT tutorial: https://docs.besu-eth.org/private-networks/tutorials/qbft — candidate next network experiment; a tutorial network is not production security or independent governance.
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/ and pricing: https://developers.cloudflare.com/workers/platform/pricing/ — presentation/API deployment constraints and mutable allowances.
- Cloudflare Pages build configuration: https://developers.cloudflare.com/pages/configuration/build-configuration/ — possible static-console hosting. No account was configured here.
- UK CMA unfair contract terms guidance: https://www.gov.uk/government/publications/unfair-contract-terms-cma37 — contractual risk allocation does not automatically eliminate applicable consumer protections or liability. Obtain qualified advice for actual operations and jurisdictions.
- Open Source Definition: https://opensource.org/osd — public repository access alone is not an open-source licence. Licensing is deliberately left for the founder.
- GitHub Actions security: https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions — untrusted workflow execution and privilege boundaries.
- NCSC prompt-injection guidance: https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection — design containment rather than rely on a perfect prompt filter.

The workflow pins were read from GitHub's official repositories through the connected API during bootstrap:

- actions/checkout v4: `11d5960a326750d5838078e36cf38b85af677262`
- actions/setup-node v4: `49933ea5288caeca8642d1e84afbd3f7d6820020`

Pinning records a revision; it is not an independent audit of the action or its runtime.
