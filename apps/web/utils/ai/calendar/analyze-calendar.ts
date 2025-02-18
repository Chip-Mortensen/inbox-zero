import { z } from "zod";
import { chatCompletionObject } from "@/utils/llms";
import type { UserEmailWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import { captureException } from "@/utils/error";
import { determineTimeContext } from "@/utils/calendar/time-context";

const logger = createScopedLogger("analyze-calendar");

const eventCategorySchema = z.object({
  category: z.object({
    primary: z.enum(["meeting", "sports", "meal", "coffee", "other"]),
    confidence: z.number(),
  }),
  timing: z.object({
    duration: z.number(), // in minutes
    flexibility: z.enum(["strict", "moderate", "flexible"]),
  }),
});

const schema = z.object({
  shouldCreateEvent: z.boolean(),
  confidence: z.number(),
  eventCategory: eventCategorySchema.optional(),
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
2. Social activities or sports events
3. Meals or coffee meetings
4. Any time-sensitive activities

For each event, classify its type and flexibility:
- Category: meeting, sports, meal, coffee, or other
- Flexibility: strict (must be close to proposed time), moderate, or flexible
- Duration: typical duration in minutes for this type of event

Only suggest creating an event if there's clear time-related content.
If suggesting an event, extract:
- A clear title/summary
- Start and end times if mentioned (use ISO format with timezone)
- Any mentioned attendees
- Relevant description from the email

Be conservative - only suggest events when there's high confidence it's appropriate.`;

  const prompt = `Analyze this email to determine if it should be turned into a calendar event:

Subject: ${subject}

Content:
${content}

Today's date is: ${today}

Respond with:
1. Whether this should be a calendar event
2. Your confidence level (0-1)
3. Event categorization (if applicable):
   - Category (meeting/sports/meal/coffee/other)
   - Typical duration for this type of event
   - How flexible the timing is (strict/moderate/flexible)
4. If it should be an event, suggest:
   - Summary (clear, concise title)
   - Description (relevant context)
   - Start time (ISO format with timezone)
   - End time (ISO format with timezone)
   - Attendees (email addresses)

Make sure to include the timezone (${timeZone}) in the response.`;

  try {
    const response = await chatCompletionObject({
      userAi: user,
      system,
      prompt,
      schema,
      userEmail: user.email || "",
      usageLabel: "Analyze Calendar",
    });

    if (!response.object) {
      throw new Error("No response object returned from AI");
    }

    // Ensure timezone is set
    if (response.object.suggestedEvent) {
      response.object.suggestedEvent.timeZone = timeZone;
    }

    return response.object;
  } catch (error) {
    logger.error("AI analysis failed", {
      error,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      subject,
      contentLength: content.length,
    });

    captureException(error, {
      extra: {
        subject,
        contentLength: content.length,
        userEmail: user.email,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });

    throw new Error(
      `Failed to analyze calendar event: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}
