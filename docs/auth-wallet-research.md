# Authentication and wallet integration notes

## Decision

PUMPCLIP uses **Privy** as an optional application authentication and embedded-wallet provider. Existing Google OAuth and localhost development auth remain available as compatibility fallbacks.

Privy is configured for email, Google, Twitter, and Solana wallet login. Solana embedded wallets are configured with `users-without-wallets`, so a user who logs in without an external wallet is prompted to receive an embedded Solana wallet.

## Sources checked

- [Privy React quickstart](https://docs.privy.io/basics/react/quickstart): email OTP login is supported through the React SDK, and embedded wallets can be created automatically during login for Solana users.
- [Privy login methods](https://docs.privy.io/basics/get-started/dashboard/configure-login-methods): email OTP, wallet login using SIWS, and OAuth providers such as Google and Twitter are supported. Provider credentials and login methods must be enabled in the Privy Dashboard.
- [Privy access tokens](https://docs.privy.io/authentication/user-authentication/access-tokens): backend requests must verify the ES256 access token with the app verification key. This project uses `@privy-io/node` for that verification.
- [Axiom FAQs](https://docs.axiom.trade/faqs): Axiom describes itself as a non-custodial Solana trading app and wallet. No public payout connector/API was identified, so the implementation treats Axiom as a selectable Solana payout destination rather than inventing an Axiom API integration.

## Required production configuration

- `NEXT_PUBLIC_PRIVY_APP_ID`
- `PRIVY_VERIFICATION_KEY`
- Privy Dashboard email/social login enablement
- A production HTTPS `APP_URL`
- PostgreSQL migration `010_identity_and_payouts.sql`

Never accept or store seed phrases. Embedded wallet transaction signing must remain inside the Privy wallet flow, with server-side verification of the resulting Solana transaction.
