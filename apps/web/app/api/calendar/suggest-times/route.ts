import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("calendar-suggestions");

const RequestSchema = z.object({
  startTime: z.string(), // ISO string
  endTime: z.string(), // ISO string
  timeZone: z.string(),
  attendees: z.array(z.string()),
});

export type TimeProposal = {
  startTime: string;
  endTime: string;
  attendeeAvailability: Record<string, boolean>;
  score: number;
};

export type SuggestTimesResponse = {
  proposals: TimeProposal[];
};

function generateTimeSlots(
  originalStart: Date,
  originalEnd: Date,
  timeZone: string,
): { start: Date; end: Date }[] {
  const duration = originalEnd.getTime() - originalStart.getTime();
  const slots: { start: Date; end: Date }[] = [];

  // Same day, different times
  const sameDay = new Date(originalStart);
  // Try slots between 9 AM and 5 PM
  for (let hour = 9; hour <= 16; hour++) {
    sameDay.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(sameDay.getTime() + duration);
    // More lenient end time check - allow until 6 PM
    if (
      slotEnd.getHours() <= 18 && // End before 6 PM
      (sameDay.getTime() < originalStart.getTime() ||
        sameDay.getTime() > originalEnd.getTime())
    ) {
      slots.push({
        start: new Date(sameDay),
        end: slotEnd,
      });
    }
  }

  // Next 5 business days (increased from 3), similar times
  const nextDays = new Date(originalStart);
  for (let day = 1; day <= 5; day++) {
    nextDays.setDate(nextDays.getDate() + 1);
    // Skip weekends
    if (nextDays.getDay() === 0 || nextDays.getDay() === 6) {
      day--;
      continue;
    }
    // Try original time and ±3 hours (increased range)
    for (let hourOffset = -3; hourOffset <= 3; hourOffset++) {
      const start = new Date(nextDays);
      start.setHours(originalStart.getHours() + hourOffset, 0, 0, 0);
      const end = new Date(start.getTime() + duration);
      // More lenient time range - 8 AM to 6 PM
      if (start.getHours() >= 8 && end.getHours() <= 18) {
        slots.push({ start, end });
      }
    }
  }

  return slots;
}

export const POST = withError(async (request: Request) => {
  try {
    // Get access token from Authorization header
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      logger.error("Missing or invalid Authorization header");
      return NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 },
      );
    }
    const accessToken = authHeader.slice(7); // Remove "Bearer " prefix

    logger.info("Starting suggest-times request");
    const json = await request.json();
    const result = RequestSchema.safeParse(json);
    if (!result.success) {
      logger.error("Invalid request data", {
        error: result.error.message,
        issues: result.error.issues,
      });
      return NextResponse.json(
        { error: "Invalid request: " + result.error.message },
        { status: 400 },
      );
    }

    const { startTime, endTime, timeZone, attendees } = result.data;
    logger.info("Request parameters", {
      startTime,
      endTime,
      timeZone,
      numAttendees: attendees.length,
      attendees,
    });

    const originalStart = new Date(startTime);
    const originalEnd = new Date(endTime);

    // Generate potential time slots
    const slots = generateTimeSlots(originalStart, originalEnd, timeZone);
    logger.info("Generated time slots", {
      numSlots: slots.length,
      firstSlot: slots[0]
        ? {
            start: slots[0].start.toISOString(),
            end: slots[0].end.toISOString(),
          }
        : null,
      lastSlot: slots[slots.length - 1]
        ? {
            start: slots[slots.length - 1].start.toISOString(),
            end: slots[slots.length - 1].end.toISOString(),
          }
        : null,
    });

    if (slots.length === 0) {
      logger.error("No time slots generated");
      return NextResponse.json(
        { error: "No valid time slots found" },
        { status: 400 },
      );
    }

    // Check availability for each slot
    const proposals: TimeProposal[] = [];
    let slotsChecked = 0;
    let slotsSkipped = 0;
    let freeBusyErrors = 0;

    for (const slot of slots) {
      try {
        slotsChecked++;
        logger.info("Checking slot", {
          slotNumber: slotsChecked,
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
        });

        const freeBusyRequest = {
          timeMin: slot.start.toISOString(),
          timeMax: slot.end.toISOString(),
          timeZone,
          items: [
            { id: "primary" }, // Only check our calendar
          ],
        };

        logger.info("Sending freeBusy request", {
          request: freeBusyRequest,
          accessTokenLength: accessToken.length,
        });

        const freeBusyResponse = await fetch(
          "https://www.googleapis.com/calendar/v3/freeBusy",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(freeBusyRequest),
          },
        );

        if (!freeBusyResponse.ok) {
          freeBusyErrors++;
          const errorData = await freeBusyResponse.json();
          logger.error("Failed to fetch free/busy data", {
            status: freeBusyResponse.status,
            statusText: freeBusyResponse.statusText,
            error: errorData,
            headers: Object.fromEntries(freeBusyResponse.headers.entries()),
          });

          // If we get an auth error, return immediately
          if (freeBusyResponse.status === 401) {
            return NextResponse.json(
              { error: "Failed to authenticate with Google Calendar" },
              { status: 401 },
            );
          }
          continue;
        }

        const freeBusy = await freeBusyResponse.json();
        logger.info("FreeBusy response", {
          hasPrimary: !!freeBusy.calendars.primary,
          primaryBusyCount: freeBusy.calendars.primary?.busy?.length,
        });

        // Check organizer's availability
        const organizerBusy = freeBusy.calendars.primary?.busy?.some(
          (busy: any) =>
            new Date(busy.start) < slot.end && new Date(busy.end) > slot.start,
        );

        if (organizerBusy) {
          logger.info("Organizer is busy for slot", {
            start: slot.start.toISOString(),
            end: slot.end.toISOString(),
            busyPeriods: freeBusy.calendars.primary?.busy,
          });
          slotsSkipped++;
          continue; // Skip if organizer is busy
        }

        // If we get here, the organizer is available
        const dayDiff = Math.abs(
          slot.start.getDate() - originalStart.getDate(),
        );
        const timeDiff = Math.abs(
          slot.start.getHours() - originalStart.getHours(),
        );
        // Score based on how close the time is to original
        const score = 100 - dayDiff * 20 - timeDiff * 5;

        proposals.push({
          startTime: slot.start.toISOString(),
          endTime: slot.end.toISOString(),
          attendeeAvailability: {}, // Empty since we're not checking attendees
          score,
        });

        logger.info("Added proposal", {
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
          score,
          dayDiff,
          timeDiff,
        });
      } catch (error) {
        logger.error("Error checking slot availability", {
          error,
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          slot: {
            start: slot.start.toISOString(),
            end: slot.end.toISOString(),
          },
        });
        continue;
      }
    }

    // Sort by score and take top 5
    proposals.sort((a, b) => b.score - a.score);
    const topProposals = proposals.slice(0, 5);

    logger.info("Suggest times summary", {
      totalSlots: slots.length,
      slotsChecked,
      slotsSkipped,
      freeBusyErrors,
      proposalsGenerated: proposals.length,
      topProposalsReturned: topProposals.length,
      scores: topProposals.map((p) => p.score),
    });

    return NextResponse.json({
      proposals: topProposals,
    });
  } catch (error) {
    logger.error("Fatal error in suggest-times", {
      error,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Failed to suggest alternative times" },
      { status: 500 },
    );
  }
});
