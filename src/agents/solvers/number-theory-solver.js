import { BaseAgent } from '../base-agent.js';
import {
  gcd, lcm, isPrime, primeFactors, formatFactorization, fibonacci,
} from '../../math/number-theory.js';
import { UnsupportedProblemError } from '../../errors.js';

/** Eratosthenes handles the integer problems: gcd, lcm, primality, factorization, Fibonacci. */
export class NumberTheorySolver extends BaseAgent {
  constructor({ wallet } = {}) {
    super({
      id: 'agent.solver.number-theory',
      name: 'Eratosthenes',
      capabilities: ['solve:number-theory'],
      wallet,
    });
  }

  async perform({ parsed }) {
    switch (parsed.kind) {
      case 'gcd': {
        const value = gcd(parsed.a, parsed.b);
        return { kind: 'gcd', value, display: `gcd(${parsed.a}, ${parsed.b}) = ${value}` };
      }
      case 'lcm': {
        const value = lcm(parsed.a, parsed.b);
        return { kind: 'lcm', value, display: `lcm(${parsed.a}, ${parsed.b}) = ${value}` };
      }
      case 'is-prime': {
        const value = isPrime(parsed.n);
        return { kind: 'is-prime', value, display: `${parsed.n} is ${value ? 'prime' : 'not prime'}` };
      }
      case 'prime-factors': {
        const factors = primeFactors(parsed.n);
        return {
          kind: 'prime-factors',
          factors,
          display: `${parsed.n} = ${formatFactorization(factors)}`,
        };
      }
      case 'fibonacci': {
        const value = fibonacci(parsed.n);
        return { kind: 'fibonacci', value, display: `fib(${parsed.n}) = ${value}` };
      }
      default:
        throw new UnsupportedProblemError(`number-theory solver cannot handle kind '${parsed.kind}'`);
    }
  }
}
