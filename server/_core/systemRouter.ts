import { z } from "zod";
import { notifyOwner } from "./notification";
import { transcribeAudio } from "./voiceTranscription";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  transcribeAudio: publicProcedure
    .input(
      z.object({
        audio: z.string(), // Base64
        mimeType: z.string().optional(),
        language: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.audio, "base64");
      return await transcribeAudio({
        audioBuffer: buffer,
        mimeType: input.mimeType,
        language: input.language,
      });
    }),
});
