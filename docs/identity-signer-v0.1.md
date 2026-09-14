# P0.4 — portable identity and independent signer spike

**Status: bounded laboratory candidate.** This work does not collect KYC, deploy credentials, claim canonical-state verification, or make the browser/gateway a wallet. It tests the boundary that a participant's identity and signing authority can survive host changes while gateway sessions remain host-specific.

## Design decision

The durable Oatrix principal is not a node account and not a web session. A principal has a stable world identifier and a currently authorised public root key. A gateway may authenticate that principal for convenience, but it never receives the corresponding private key and its session token cannot create economic authority by itself.

The experimental `PortableSigner` owns the root private key outside the gateway. It exposes public metadata and signatures only. For a command, the caller supplies an explicit intent plus the exact world-state head it reviewed. The signer constructs the command body itself, using the principal, current root epoch and nonce from that snapshot, validates the action/argument shape against its local Oatrix rules, and signs the result. A gateway can relay the signed envelope but cannot change the principal, action, destination, amount or other signed arguments without invalidating the signature.

This does **not** prove that a hostile gateway has supplied the canonical federation state. Before P1 there is still one authoritative laboratory writer. The `expectedHead` check prevents substitution between review and signing; independent consensus/checkpoint verification is a separate problem.

## Host login and provider competition

Login challenges remain host-origin-specific. The signer has an explicit audience allow-list and signs a challenge only when its world, principal, host origin, expiry and epoch match. A signature for host A is not reusable as host B's login approval. The same durable principal can nevertheless sign separate challenges from hosts A and B, so changing gateway provider does not require changing identity.

Only HTTPS origins are accepted in the general case. Plain HTTP is restricted to loopback development origins (`127.0.0.1`, `localhost`, `::1`). Adding a provider to the signer's allow-list is an owner-side configuration act, not something a remote page may silently perform.

## Passkeys are not a universal cross-host identity key

WebAuthn/passkeys are scoped to a relying-party ID. Two unrelated hosting domains cannot simply demand use of one another's passkey and call that portable identity. A production design therefore needs one of these explicit patterns rather than wishful host portability:

1. a local/native signer whose key is unlocked by a device credential or passkey and which signs Oatrix intents for approved hosts;
2. a deliberately shared authentication/RP domain with a separately specified trust and recovery model; or
3. an identity authority issuing a portable credential which hosts verify without receiving the root signing key.

The spike implements pattern 1 at the cryptographic API level only. It does not implement WebAuthn, browser extensions, native IPC or KYC.

## Recovery and rotation

`PortableSigner.seal(passphrase)` creates an encrypted PKCS#8 key vault using scrypt and AES-256-GCM. The public metadata is authenticated as associated data. Restoring that vault recreates the **same principal and root public key**, so moving the vault to another owner-controlled device/provider does not create another citizen or another asset owner.

The parameters are a laboratory policy, not a production key-custody recommendation. A lost vault plus lost key has no magic recovery path in this spike. Social, threshold, institutional or KYC-backed recovery would be an authoritative governance feature and must be designed separately.

The existing `rotateKey` transition changes the currently authorised root key while preserving the principal identifier. After rotation, an old restored vault is correctly stale: it cannot sign a new command or log into a host using the old root. That is intentional protection against duplicate authority after recovery/rotation.

## Threats tested

The unit and process-level HTTP tests cover:

- the same signer authenticating through two independent gateway sessions;
- a challenge or signing request for an unapproved origin being refused;
- post-signature substitution of principal, action, destination or amount being rejected;
- explicit pinning to the snapshot head that was reviewed;
- locally validating command vocabulary/fields instead of trusting a gateway's advertised form;
- encrypted backup restore on a different host;
- vault metadata/ciphertext authentication and wrong-passphrase failure;
- root rotation preserving principal identity while invalidating an old vault.

The signer intentionally does not expose a raw-private-key export method. JavaScript process compromise can still steal in-memory key material; this is not a secure-element or OS-keystore implementation.

## Context for agents

An AI controller should normally receive a scoped delegate/work credential rather than the principal root key. The portable root signer is for owner-level approvals, recovery/rotation, and actions that genuinely require root authority. Prompt-injection resistance still comes primarily from narrow mandates and independent validation of signed consequences.

## Explicit non-claims

This candidate does not establish Byzantine consensus, canonical state from an arbitrary host, hardware-backed keys, KYC, unique-human membership, quantum resistance, secure browser-to-native transport, revocation of a copied pre-rotation vault before the chain sees a rotation, or legally sufficient custody/recovery. Those remain separate work.
