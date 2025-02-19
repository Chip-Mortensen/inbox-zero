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
import prisma from "@/utils/prisma";
import { headers } from "next/headers";

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

const updateCalendarEventSchema = createCalendarEventSchema.extend({
  googleEventId: z.string(),
});

type CreateCalendarEventBody = z.infer<typeof createCalendarEventSchema>;
type UpdateCalendarEventBody = z.infer<typeof updateCalendarEventSchema>;
type CalendarEventResult = { success: true; error: "" };

export const checkCalendarConflictsAction = withActionInstrumentation(
  "checkCalendarConflicts",
  async (
    data: Pick<
      CreateCalendarEventBody,
      "startTime" | "endTime" | "timeZone"
    > & {
      excludeEventId?: string;
    },
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

      logger.info("Calendar API request params", {
        timeMin,
        timeMax,
        timeZone: data.timeZone,
      });

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
          headers: Object.fromEntries(response.headers.entries()),
        });
        return { error: "Failed to fetch calendar events" };
      }

      const { items } = await response.json();
      logger.info("Calendar API response", {
        numEvents: items?.length ?? 0,
        timeRange: { timeMin, timeMax },
        firstEvent: items?.[0]
          ? {
              id: items[0].id,
              summary: items[0].summary,
              start: items[0].start,
              end: items[0].end,
            }
          : null,
      });

      if (!items) {
        return { success: true, error: "", hasConflicts: false };
      }

      // Filter events that actually conflict
      const conflictingEvents = items.filter((event: any) => {
        // Skip the event being edited
        if (data.excludeEventId && event.id === data.excludeEventId) {
          return false;
        }

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
    unsafeData: CreateCalendarEventBody & {
      threadId?: string;
      messageId?: string;
    },
  ): Promise<ServerActionResponse<CalendarEventResult>> => {
    const session = await auth();
    if (!session?.accessToken) return { error: "Not authenticated" };
    const userId = session.user.id;

    const { data, success, error } =
      createCalendarEventSchema.safeParse(unsafeData);
    if (!success) {
      logger.error("Invalid calendar event data", {
        error: error.message,
        issues: error.issues,
      });
      return { error: error.message };
    }

    logger.info("Creating calendar event", {
      summary: data.summary,
      startTime: data.startTime,
      endTime: data.endTime,
      timeZone: data.timeZone,
      hasAttendees: !!data.attendees?.length,
      attendeesCount: data.attendees?.length,
    });

    // Check for conflicts first
    const conflictCheck = await checkCalendarConflictsAction({
      startTime: data.startTime,
      endTime: data.endTime,
      timeZone: data.timeZone,
    });

    if ("error" in conflictCheck && conflictCheck.error) {
      logger.error("Conflict check failed during event creation", {
        error: conflictCheck.error,
      });
      return { error: conflictCheck.error };
    }

    if (conflictCheck.hasConflicts) {
      logger.warn("Found conflicts during event creation", {
        conflicts: conflictCheck.conflicts,
      });
      return {
        error: "There are calendar conflicts during this time",
        conflicts: conflictCheck.conflicts,
      };
    }

    try {
      const requestBody = {
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
      };

      logger.info("Calendar API request", {
        url: "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        requestBody,
        accessTokenLength: session.accessToken.length,
      });

      const response = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
      );

      logger.info("Calendar API response status", {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });

      const responseData = await response.json();

      if (!response.ok) {
        logger.error("Failed to create calendar event", {
          error: responseData,
          status: response.status,
          statusText: response.statusText,
          responseData,
        });
        return {
          error:
            responseData.error?.message || "Failed to create calendar event",
        };
      }

      // Track the created event if we have thread and message IDs
      if (unsafeData.threadId && unsafeData.messageId) {
        try {
          await prisma.calendarEventCreated.create({
            data: {
              userId,
              threadId: unsafeData.threadId,
              messageId: unsafeData.messageId,
              summary: data.summary,
              description: data.description,
              startTime: data.startTime,
              endTime: data.endTime,
              timeZone: data.timeZone,
              attendees: data.attendees || [],
              googleEventId: responseData.id,
            },
          });
          logger.info("Tracked calendar event creation", {
            userId,
            threadId: unsafeData.threadId,
            messageId: unsafeData.messageId,
            summary: data.summary,
            startTime: data.startTime,
            googleEventId: responseData.id,
          });
        } catch (error) {
          // Don't fail the whole action if tracking fails
          logger.error("Failed to track calendar event creation", {
            error,
            userId,
            threadId: unsafeData.threadId,
            messageId: unsafeData.messageId,
          });
        }
      }

      logger.info("Created calendar event", {
        eventId: responseData.id,
        eventSummary: responseData.summary,
        start: responseData.start,
        end: responseData.end,
        responseData,
      });

      return { success: true, error: "" };
    } catch (error) {
      logger.error("Error creating calendar event", {
        error,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        errorStack: error instanceof Error ? error.stack : undefined,
      });
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
      eventCategory?: {
        primary: "meeting" | "sports" | "meal" | "coffee" | "other";
        confidence: number;
      };
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
        eventCategory: data.eventCategory,
      });

      // Get the request URL from headers
      const requestHeaders = headers();
      const requestUrl =
        requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
      const protocol = requestHeaders.get("x-forwarded-proto") || "http";
      const baseUrl = `${protocol}://${requestUrl}`;

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

export const updateCalendarEventAction = withActionInstrumentation(
  "updateCalendarEvent",
  async (
    unsafeData: UpdateCalendarEventBody,
  ): Promise<ServerActionResponse<CalendarEventResult>> => {
    const session = await auth();
    if (!session?.accessToken) return { error: "Not authenticated" };

    const { data, success, error } =
      updateCalendarEventSchema.safeParse(unsafeData);
    if (!success) {
      logger.error("Invalid calendar event update data", {
        error: error.message,
        issues: error.issues,
      });
      return { error: error.message };
    }

    try {
      const requestBody = {
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
      };

      logger.info("Updating calendar event", {
        googleEventId: data.googleEventId,
        summary: data.summary,
        startTime: data.startTime,
        endTime: data.endTime,
      });

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${data.googleEventId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        const responseData = await response.json();
        logger.error("Failed to update calendar event", {
          error: responseData,
          status: response.status,
          statusText: response.statusText,
        });
        return {
          error:
            responseData.error?.message || "Failed to update calendar event",
        };
      }

      // Update our database record
      await prisma.calendarEventCreated.updateMany({
        where: {
          googleEventId: data.googleEventId,
          userId: session.user.id,
        },
        data: {
          summary: data.summary,
          description: data.description,
          startTime: data.startTime,
          endTime: data.endTime,
          timeZone: data.timeZone,
          attendees: data.attendees || [],
        },
      });

      return { success: true, error: "" };
    } catch (error) {
      logger.error("Error updating calendar event", {
        error,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
      return { error: "Failed to update calendar event" };
    }
  },
);
