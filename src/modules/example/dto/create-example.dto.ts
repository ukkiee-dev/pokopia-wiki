import { z } from 'zod';

export const CreateExampleSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
});

export type CreateExampleDto = z.infer<typeof CreateExampleSchema>;
