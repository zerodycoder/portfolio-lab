export * from '@portfolio-lab/kit/dom';

/** True on devices whose primary pointer is a finger. */
export const touchFirst = (): boolean => matchMedia('(pointer: coarse)').matches;
