import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opt a route out of the global, default-deny authentication guard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
