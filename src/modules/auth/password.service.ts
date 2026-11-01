import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** argon2id at the OWASP minimum (m=19 MiB, t=2, p=1), sized for a 0.1 CPU / 512 MB instance. */
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  /** Verified against unknown emails so response time does not reveal which accounts exist. */
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, HASH_OPTIONS);
  }

  async verify(hash: string | undefined, password: string): Promise<boolean> {
    this.dummyHash ??= this.hash('timing-equaliser-not-a-real-password');
    const target = hash ?? (await this.dummyHash);
    try {
      const valid = await argon2.verify(target, password);
      return valid && hash !== undefined;
    } catch {
      return false;
    }
  }
}
