import { calculateDeltas } from '@server/lib/utils/delta';

const strike = 6400;
const underlyingLtp = 5347;
const av = 0.3582;
const timeToExpiry = 9778 / 224385;
const type = 'CE';
const delta = calculateDeltas(underlyingLtp, strike, av, timeToExpiry, type);
console.log(delta);
