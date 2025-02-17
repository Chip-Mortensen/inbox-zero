import { z } from "zod";
import { chatCompletionObject } from "@/utils/llms";
import type { UserEmailWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import { captureException } from "@/utils/error";

const logger = createScopedLogger("analyze-calendar");

const schema = z.object({
  shouldCreateEvent: z.boolean(),
  confidence: z.number(),
  suggestedEvent: z
    .object({
      summary: z.string(),
      description: z.string(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      timeZone: z.string(),
      attendees: z.array(z.string()).optional(),
    })
    .optional(),
});

export type AnalyzeCalendarResult = z.infer<typeof schema>;

export async function aiAnalyzeCalendar({
  subject,
  content,
  user,
}: {
  subject: string;
  content: string;
  user: UserEmailWithAI;
}): Promise<AnalyzeCalendarResult> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = new Date().toLocaleDateString("en-US", { timeZone });

  const system = `You are an AI assistant that analyzes emails to determine if they should be turned into calendar events.
You should look for:
1. Meeting requests or scheduling discussions
2. Deadlines or due dates
3. Important time-sensitive tasks
4. Events or appointments

Only suggest creating an event if there's clear time-related content.
If suggesting an event, try to extract:
- A clear title/summary
- Start and end times if mentioned (use ISO format with timezone)
- Any mentioned attendees
- Relevant description from the email

Be conservative - only suggest events when there's high confidence it's appropriate.

The user's timezone is: ${timeZone}`;

  const prompt = `Analyze this email to determine if it should be turned into a calendar event:

Subject: ${subject}

Content:
${content}

Today's date is: ${today}

Respond with:
1. Whether this should be a calendar event
2. Your confidence level (0-1)
3. If it should be an event, suggest the event details including:
   - Summary (clear, concise title)
   - Description (relevant context from the email)
   - Start time (in ISO format with timezone)
   - End time (in ISO format with timezone)
   - Attendees (email addresses mentioned)

Make sure to include the timezone (${timeZone}) in the response.`;

  try {
    logger.trace("Input", { system, prompt });

    const response = await chatCompletionObject({
      userAi: user,
      system,
      prompt,
      schema,
      userEmail: user.email || "",
      usageLabel: "Analyze Calendar",
    });

    logger.trace("Output", { response: response.object });

    if (!response.object) {
      throw new Error("No response object returned from AI");
    }

    // Ensure timezone is set
    if (response.object.suggestedEvent) {
      response.object.suggestedEvent.timeZone = timeZone;
    }

    return response.object;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error("AI analysis failed", {
      error,
      errorMessage,
      subject,
      contentLength: content.length,
    });

    captureException(error, {
      extra: {
        subject,
        contentLength: content.length,
        userEmail: user.email,
        errorMessage,
      },
    });

    throw new Error(`Failed to analyze calendar event: ${errorMessage}`);
  }
}
