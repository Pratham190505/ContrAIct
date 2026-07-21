import { z } from "zod";

export const contractSelectionSearchSchema = z.object({
  contractId: z.string().optional(),
});
