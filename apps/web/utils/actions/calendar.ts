"use server";

import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { createScopedLogger } from "@/utils/logger";
import type { ServerActionResponse } from "@/utils/actions";
import { withActionInstrumentation } from "@/utils/instrumentation";

const logger = createScopedLogger("calendar");

const createCalendarEventSchema = z.object({
  summary: z.string(),
  description: z.string(),
  startTime: z.string(), // ISO string
  endTime: z.string(), // ISO string
  timeZone: z
    .string()
    .default(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  attendees: z.array(z.string()).optional(),
});

type CreateCalendarEventBody = z.infer<typeof createCalendarEventSchema>;

export const createCalendarEventAction = withActionInstrumentation(
  "createCalendarEvent",
  async (
    unsafeData: CreateCalendarEventBody,
  ): Promise<ServerActionResponse> => {
    const session = await auth();
    if (!session?.accessToken) return { error: "Not authenticated" };

    const { data, success, error } =
      createCalendarEventSchema.safeParse(unsafeData);
    if (!success) return { error: error.message };

    try {
      const response = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summary: data.summary,
            description: data.description,
            start: {
              dateTime: data.startTime,
              timeZone: data.timeZone,
            },
            end: {
              dateTime: data.endTime,
              timeZone: data.timeZone,
            },
            attendees: data.attendees?.map((email) => ({ email })),
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        logger.error("Failed to create calendar event", { error: errorData });
        return {
          error: errorData.error?.message || "Failed to create calendar event",
        };
      }

      const event = await response.json();
      logger.info("Created calendar event", { eventId: event.id });

      return { success: true };
    } catch (error) {
      logger.error("Error creating calendar event", { error });
      return { error: "Failed to create calendar event" };
    }
  },
);
