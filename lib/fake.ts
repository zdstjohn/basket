/** Whether a *_FAKE switch is on. Never on Vercel, so a stray variable there cannot swap real services for fakes. */
export const fakeOn = (name: string): boolean => process.env.VERCEL !== '1' && process.env[name] === '1';
