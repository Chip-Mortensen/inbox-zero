import { z } from "zod";
import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import {
  determineTimeContext,
  isSimilarTimeContext,
} from "@/utils/calendar/time-context";

const logger = createScopedLogger("calendar-suggestions");

const RequestSchema = z.object({
  startTime: z.string(),
  endTime: z.string(),
  timeZone: z.string(),
  attendees: z.array(z.string()),
  eventCategory: z
    .object({
      primary: z.enum(["meeting", "sports", "meal", "coffee", "other"]),
      confidence: z.number(),
    })
    .optional(),
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
  const timeContext = determineTimeContext(originalStart);

  // Generate next 14 days of potential slots
  const startDate = new Date(originalStart);
  const endDate = new Date(originalStart);
  endDate.setDate(endDate.getDate() + 14);

  for (
    let date = new Date(startDate);
    date <= endDate;
    date.setDate(date.getDate() + 1)
  ) {
    // Skip days that don't match the business/non-business pattern
    if (!isSimilarTimeContext(date, originalStart)) {
      continue;
    }

    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // If business hours, use 9-5 range
    if (timeContext.isBusinessHours) {
      dayStart.setHours(9, 0, 0, 0);
      dayEnd.setHours(17, 0, 0, 0);
    } else {
      // For non-business hours, use original time pattern
      const originalHour = originalStart.getHours();
      const rangeStart = Math.max(originalHour - 2, 0);
      const rangeEnd = Math.min(originalHour + 2, 23);

      dayStart.setHours(rangeStart, 0, 0, 0);
      dayEnd.setHours(rangeEnd, 0, 0, 0);
    }

    // Generate slots for the day
    for (
      let time = dayStart;
      time <= dayEnd;
      time.setMinutes(time.getMinutes() + 30)
    ) {
      const slotEnd = new Date(time.getTime() + duration);
      if (slotEnd <= dayEnd) {
        slots.push({
          start: new Date(time),
          end: slotEnd,
        });
      }
    }
  }

  return slots;
}

function scoreSlot(
  slot: Date,
  originalStart: Date,
  eventCategory?: { primary: string; confidence: number },
): number {
  const dayDiff = Math.abs(slot.getDate() - originalStart.getDate());
  const hourDiff = Math.abs(slot.getHours() - originalStart.getHours());
  const isWeekend = [0, 6].includes(slot.getDay());

  let score = 100;

  // Penalize based on day difference
  score -= dayDiff * 10;

  // Penalize based on time difference
  score -= hourDiff * 5;

  // Bonus for matching day type (weekend/weekday)
  if (isWeekend === [0, 6].includes(originalStart.getDay())) {
    score += 10;
  }

  // Bonus for common meeting times
  if (slot.getMinutes() === 0 || slot.getMinutes() === 30) {
    score += 5;
  }

  return Math.max(0, Math.min(100, score)) / 100;
}

export const POST = withError(async (request: Request) => {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      logger.error("Missing or invalid Authorization header");
      return NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 },
      );
    }
    const accessToken = authHeader.slice(7);

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

    const { startTime, endTime, timeZone, attendees, eventCategory } =
      result.data;
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

        const freeBusyRequest = {
          timeMin: slot.start.toISOString(),
          timeMax: slot.end.toISOString(),
          timeZone,
          items: [{ id: "primary" }],
        };

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
          continue;
        }

        const freeBusy = await freeBusyResponse.json();

        // Check organizer's availability
        const organizerBusy = freeBusy.calendars.primary?.busy?.some(
          (busy: any) =>
            new Date(busy.start) < slot.end && new Date(busy.end) > slot.start,
        );

        if (organizerBusy) {
          slotsSkipped++;
          continue;
        }

        // Score and add proposal
        const score = scoreSlot(slot.start, originalStart, eventCategory);

        proposals.push({
          startTime: slot.start.toISOString(),
          endTime: slot.end.toISOString(),
          attendeeAvailability: {},
          score,
        });
      } catch (error) {
        logger.error("Error checking slot availability", {
          error,
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
    });
    return NextResponse.json(
      { error: "Failed to suggest alternative times" },
      { status: 500 },
    );
  }
});
