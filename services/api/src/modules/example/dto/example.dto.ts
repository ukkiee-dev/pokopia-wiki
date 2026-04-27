import { z } from 'zod';

export const ExampleSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
});

export type ExampleDto = z.infer<typeof ExampleSchema>;
