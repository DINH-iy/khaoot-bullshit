import { z } from 'zod';

export const GameKeySchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
