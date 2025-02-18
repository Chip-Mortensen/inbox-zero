"use server";

import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { createScopedLogger } from "@/utils/logger";
import type { ServerActionResponse } from "@/utils/error";
import { withActionInstrumentation } from "../instrumentation";
import type { ConflictCheckResponse } from "@/app/api/calendar/check-conflicts/route";
import type {
  TimeProposal,
  SuggestTimesResponse,
} from "@/app/api/calendar/suggest-times/route";

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
type CalendarEventResult = { success: true; error: "" };

export const checkCalendarConflictsAction = withActionInstrumentation(
  "checkCalendarConflicts",
  async (
    data: Pick<CreateCalendarEventBody, "startTime" | "endTime" | "timeZone">,
  ): Promise<ServerActionResponse<ConflictCheckResponse>> => {
    const session = await auth();
    if (!session?.accessToken) return { error: "Not authenticated" };

    try {
      logger.info("Checking calendar conflicts", {
        startTime: data.startTime,
        endTime: data.endTime,
        timeZone: data.timeZone,
      });

      // Get events ±2 hours around the proposed time
      const timeMin = new Date(
        new Date(data.startTime).getTime() - 2 * 60 * 60 * 1000,
      ).toISOString();
      const timeMax = new Date(
        new Date(data.endTime).getTime() + 2 * 60 * 60 * 1000,
      ).toISOString();

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&timeZone=${data.timeZone}&singleEvents=true`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
        },
      );

      if (!response.ok) {
        const error = await response.json();
        logger.error("Failed to fetch calendar events", {
          error,
          status: response.status,
          statusText: response.statusText,
        });
        return { error: "Failed to fetch calendar events" };
      }

      const { items } = await response.json();
      logger.info("Retrieved calendar events", {
        numEvents: items?.length ?? 0,
      });

      if (!items) {
        return { success: true, error: "", hasConflicts: false };
      }

      // Filter events that actually conflict
      const conflictingEvents = items.filter((event: any) => {
        const eventStart = new Date(event.start.dateTime || event.start.date);
        const eventEnd = new Date(event.end.dateTime || event.end.date);
        const proposedStart = new Date(data.startTime);
        const proposedEnd = new Date(data.endTime);

        const hasConflict =
          (eventStart <= proposedEnd && eventEnd >= proposedStart) || // Event overlaps
          (proposedStart <= eventEnd && proposedEnd >= eventStart); // Proposed time overlaps

        if (hasConflict) {
          logger.info("Found conflicting event", {
            eventId: event.id,
            eventSummary: event.summary,
            eventStart: eventStart.toISOString(),
            eventEnd: eventEnd.toISOString(),
          });
        }

        return hasConflict;
      });

      const conflicts = conflictingEvents.map((event: any) => ({
        id: event.id,
        summary: event.summary,
        startTime: event.start.dateTime || event.start.date,
        endTime: event.end.dateTime || event.end.date,
        attendees: event.attendees?.map((a: any) => a.email) || [],
      }));

      logger.info("Conflict check complete", {
        hasConflicts: conflicts.length > 0,
        numConflicts: conflicts.length,
      });

      return {
        success: true,
        error: "",
        hasConflicts: conflicts.length > 0,
        conflicts:
          conflicts.length > 0 ? { existingEvents: conflicts } : undefined,
      };
    } catch (error) {
      logger.error("Error checking calendar conflicts", {
        error,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
      return { error: "Failed to check calendar conflicts" };
    }
  },
);

export const createCalendarEventAction = withActionInstrumentation(
  "createCalendarEvent",
  async (
    unsafeData: CreateCalendarEventBody,
  ): Promise<ServerActionResponse<CalendarEventResult>> => {
    const session = await auth();
    if (!session?.accessToken) return { error: "Not authenticated" };

    const { data, success, error } =
      createCalendarEventSchema.safeParse(unsafeData);
    if (!success) return { error: error.message };

    // Check for conflicts first
    const conflictCheck = await checkCalendarConflictsAction({
      startTime: data.startTime,
      endTime: data.endTime,
      timeZone: data.timeZone,
    });

    if ("error" in conflictCheck) {
      return { error: conflictCheck.error };
    }

    if (conflictCheck.hasConflicts) {
      return {
        error: "There are calendar conflicts during this time",
        conflicts: conflictCheck.conflicts,
      };
    }

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

      return { success: true, error: "" };
    } catch (error) {
      logger.error("Error creating calendar event", { error });
      return { error: "Failed to create calendar event" };
    }
  },
);

export const getAlternativeTimesAction = withActionInstrumentation(
  "getAlternativeTimes",
  async (
    data: Pick<
      CreateCalendarEventBody,
      "startTime" | "endTime" | "timeZone"
    > & {
      attendees: string[];
    },
  ): Promise<ServerActionResponse<SuggestTimesResponse>> => {
    const session = await auth();
    if (!session?.accessToken) {
      logger.error("No access token in session for alternative times");
      return { error: "Not authenticated" };
    }

    try {
      logger.info("Getting alternative times", {
        startTime: data.startTime,
        endTime: data.endTime,
        timeZone: data.timeZone,
        attendees: data.attendees,
      });

      // Use absolute URL to ensure we're hitting the right endpoint
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const response = await fetch(`${baseUrl}/api/calendar/suggest-times`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Pass the access token to the API route
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error("Failed to get alternative times from API", {
          status: response.status,
          statusText: response.statusText,
          error,
          headers: Object.fromEntries(response.headers.entries()),
        });
        return { error: error.error || "Failed to get alternative times" };
      }

      const result = await response.json();
      logger.info("Got alternative times", {
        numProposals: result.proposals?.length,
        firstProposal: result.proposals?.[0],
      });

      return { success: true, error: "", ...result };
    } catch (error) {
      logger.error("Error getting alternative times", {
        error,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });
      return { error: "Failed to get alternative times" };
    }
  },
);
