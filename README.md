> **Donate (SOL):** `7NG9dEf65YY5poUYmPAYVd6i9UYF8A5hKHYos6QYh3sG`

# PAM — Problem-solving Agent Mesh

A mathematical agent workflow orchestrator in pure Node.js (zero dependencies),
with a Solana-style settlement layer: every solved problem is independently
verified, certified with an ed25519 signature, and paid out in simulated SOL
from an escrowed bounty.

> The crypto layer is an **educational simulation**. It uses the same
> primitives Solana uses — ed25519 keypairs, base58 addresses that *are* the
> public key, lamport-denominated balances, signed transactions, a blockhash
> chain — but it is an in-memory ledger. Nothing touches a real network.

## Quick start

```sh
npm start     # run the demo: 10 problems, 10 bounties, full pipeline
npm test      # run the test suites (node:test, no dependencies)
```

Requires Node.js >= 18.

## The pipeline

Every problem flows through six stages. Agents are resolved by capability;
the solve stage is routed at runtime from the planner's decision.

```
            ┌─────────┐   ┌─────────┐   ┌─────────────────────────┐
  problem ─▶│  parse  │──▶│  plan   │──▶│          solve          │
            │  Lexis  │   │Strategos│   │ Abacus | Vieta          │
            └─────────┘   └─────────┘   │ Eratosthenes | Gauss    │
                                        └───────────┬─────────────┘
                                                    ▼
            ┌─────────┐   ┌─────────┐   ┌─────────────────────────┐
   payout ◀─│ settle  │◀──│ certify │◀──│         verify          │
            │ Bursar  │   │ Notary  │   │         Skeptic         │
            └─────────┘   └─────────┘   └─────────────────────────┘

   any stage fails ──▶ compensation: the escrowed bounty is refunded
```

| Stage   | Agent        | What it does |
|---------|--------------|--------------|
| parse   | Lexis        | Turns `"<directive>: <payload>"` text into a structured task (expression ASTs, BigInts, samples). |
| plan    | Strategos    | Routes the task to a solver capability and picks the verification method. |
| solve   | Abacus / Vieta / Eratosthenes / Gauss | Computes the answer. |
| verify  | Skeptic      | Re-derives the answer through a *structurally different* algorithm (see below). Fails the job if they disagree. |
| certify | Notary       | Signs a solution certificate with the verification authority's ed25519 key. |
| settle  | Bursar       | Presents the certificate to the bounty board; escrow pays the solver. |

### Independent verification

The Skeptic never trusts the solver's code path:

- `evaluate` — recomputed on an RPN stack machine instead of the tree-walking evaluator
- `solve` — real roots substituted into the original equation; complex roots checked by complex Horner evaluation
- `gcd` — Stein's binary GCD instead of Euclid
- `lcm` — the |a·b|/gcd identity
- `is-prime` — naive odd trial division instead of 6k±1
- `prime-factors` — factors multiplied back and each re-checked for primality
- `fibonacci` — plain iteration instead of fast doubling
- `stats` — alternative formulations (running mean, E[x²]−μ² variance, descending-sort median)

## Problem grammar

```
evaluate: (3 + 4) * 2^3 - sqrt(144)     arithmetic with functions & constants
solve: 2x + 3 = 11                      linear and quadratic equations
solve: x^2 + 2x + 5 = 0                 complex roots are fine
gcd: 252, 105                           BigInt number theory
lcm: 4, 6
prime-factors: 5040
is-prime: 104729
fibonacci: 90
stats: 4, 8, 15, 16, 23, 42             population statistics
```

Expressions support `+ - * / % ^`, parentheses, implicit multiplication
(`2x`, `3(x+1)`), functions (`sqrt`, `sin`, `cos`, `ln`, `log`, `min`, `max`, …)
and constants (`pi`, `e`, `tau`, `phi`). Equations above degree 2 are honestly
refused — in the demo, that problem's bounty is automatically refunded.

## The settlement layer

- **Keypair** (`src/crypto/keypair.js`) — ed25519 via `node:crypto`; the base58
  address *is* the 32-byte public key, so any address can verify its own signatures.
- **Ledger** (`src/crypto/ledger.js`) — lamport balances (BigInt), signed
  transfer transactions, an airdrop faucet, and a blockhash chain.
  `verifyHistory()` replays and re-verifies the entire chain.
- **BountyBoard** (`src/crypto/bounty-board.js`) — escrowed bounties with a
  strict lifecycle: `open → paid` (against a valid certificate) or `open → refunded`.
- **Certificate** (`src/crypto/certificate.js`) — the authority's signed,
  canonical-JSON statement binding problem hash, solver address, and
  verification method. The board only pays against the authority it trusts.

Money is conserved: apart from airdrops (minting), every lamport is accounted
for, and the demo asserts `sum(balances) === totalSupply()` at the end.

## Orchestrator features

- capability-based agent registry with runtime routing
- per-stage timeout and retry-with-backoff; deterministic errors
  (`error.fatal`) are never retried
- compensation handlers (`workflow.onFailure`) — used here for bounty refunds
- full event stream (`job:*`, `stage:*`) and a per-job execution trace
- bounded-concurrency `runAll` worker pool, results in input order

## Project layout

```
src/
  errors.js               error taxonomy (fatal vs retryable)
  system.js               wires agents + workflow + bounty board together
  index.js                the demo
  orchestrator/           engine: registry, workflow, orchestrator
  agents/                 Lexis, Strategos, solvers/, Skeptic, Notary, Bursar
  math/                   tokenizer, parser, evaluator, RPN machine,
                          polynomials, complex, number theory, statistics
  crypto/                 base58, keypair, canonical JSON, ledger,
                          certificate, bounty board, SOL units
test/
  math.test.js            tokenizer / parser / evaluator / RPN / polynomial
  solvers.test.js         parser & planner agents, all four solvers, verifier
  crypto.test.js          base58, canonical JSON, keypair signatures
  ledger.test.js          ledger, units, certificate, bounty board
  orchestrator.test.js    retries, timeouts, fatal errors, compensation, concurrency
  integration.test.js     the full pipeline end to end, money conserved
```
