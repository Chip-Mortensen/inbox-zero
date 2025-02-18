import { z } from "zod";
import { chatCompletionObject } from "@/utils/llms";
import type { UserEmailWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import { captureException } from "@/utils/error";
import { determineTimeContext } from "@/utils/calendar/time-context";
import { internalDateToDate } from "@/utils/date";

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
  eventCategory: z
    .object({
      category: z.object({
        primary: z.enum(["meeting", "sports", "meal", "coffee", "other"]),
        confidence: z.number(),
      }),
      timing: z.object({
        duration: z.number(),
        flexibility: z.enum(["strict", "moderate", "flexible"]),
      }),
    })
    .nullable()
    .optional(),
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
  message,
}: {
  subject: string;
  content: string;
  user: UserEmailWithAI;
  message: {
    internalDate: string;
    headers: { from: string; to: string; cc?: string };
  };
}): Promise<AnalyzeCalendarResult> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = new Date().toLocaleDateString("en-US", { timeZone });
  const emailDate = internalDateToDate(message.internalDate);
  const emailDateFormatted = emailDate.toLocaleDateString("en-US", {
    timeZone,
  });

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
- Any mentioned attendees (use actual email addresses from the email)
- Relevant description from the email

Important context:
- The email was sent on: ${emailDateFormatted}
- The current user's email is: ${user.email}
- The sender's email is: ${message.headers.from}
- The recipients are: ${message.headers.to}${message.headers.cc ? `, CC: ${message.headers.cc}` : ""}

When suggesting attendees:
1. Always include the current user (${user.email})
2. Include the sender's email if they're not the current user
3. Only include other recipients if they are clearly part of the proposed meeting/event
4. Never use placeholder emails like unknown@example.com

Be conservative - only suggest events when there's high confidence it's appropriate.`;

  const prompt = `Analyze this email to determine if it should be turned into a calendar event:

Subject: ${subject}

Content:
${content}

Email sent date: ${emailDateFormatted}
Today's date: ${today}

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
   - Attendees (use actual email addresses from the context provided)

Make sure to include the timezone (${timeZone}) in the response.`;

  try {
    logger.info("Sending variables to chatCompletionObject", {
      userAi: user,
      system,
      prompt,
      schema: schema.toString(),
      userEmail: user.email || "",
      usageLabel: "Analyze Calendar",
      timeZone,
      subject,
      contentLength: content.length,
    });

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
