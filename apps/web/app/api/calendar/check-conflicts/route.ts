import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("calendar-conflicts");

const RequestSchema = z.object({
  startTime: z.string(), // ISO string
  endTime: z.string(), // ISO string
  timeZone: z.string(),
});

export type CalendarEvent = {
  id: string;
  summary: string;
  startTime: string;
  endTime: string;
  attendees: string[];
};

export type ConflictCheckResponse = {
  hasConflicts: boolean;
  conflicts?: {
    existingEvents: CalendarEvent[];
  };
};

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.accessToken) {
    logger.error("Not authenticated");
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const json = await request.json();
    const result = RequestSchema.safeParse(json);
    if (!result.success) {
      logger.error("Invalid request", { error: result.error.message });
      return NextResponse.json(
        { error: "Invalid request: " + result.error.message },
        { status: 400 },
      );
    }

    const { startTime, endTime, timeZone } = result.data;
    logger.info("Checking conflicts", { startTime, endTime, timeZone });

    // Get events ±2 hours around the proposed time
    const timeMin = new Date(
      new Date(startTime).getTime() - 2 * 60 * 60 * 1000,
    ).toISOString();
    const timeMax = new Date(
      new Date(endTime).getTime() + 2 * 60 * 60 * 1000,
    ).toISOString();

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&timeZone=${timeZone}&singleEvents=true`,
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
      return NextResponse.json(
        { error: "Failed to fetch calendar events" },
        { status: response.status },
      );
    }

    const { items } = await response.json();
    logger.info("Retrieved calendar events", { numEvents: items.length });

    // Filter events that actually conflict
    const conflictingEvents = items.filter((event: any) => {
      const eventStart = new Date(event.start.dateTime || event.start.date);
      const eventEnd = new Date(event.end.dateTime || event.end.date);
      const proposedStart = new Date(startTime);
      const proposedEnd = new Date(endTime);

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

    const conflicts: CalendarEvent[] = conflictingEvents.map((event: any) => ({
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

    return NextResponse.json({
      hasConflicts: conflicts.length > 0,
      conflicts:
        conflicts.length > 0 ? { existingEvents: conflicts } : undefined,
    });
  } catch (error) {
    logger.error("Error checking calendar conflicts", {
      error,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "Failed to check calendar conflicts" },
      { status: 500 },
    );
  }
});
