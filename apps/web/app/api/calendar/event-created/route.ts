import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("calendar-event-created");

const RequestSchema = z.object({
  threadId: z.string(),
  messageId: z.string(),
});

const EventResponseSchema = z.object({
  summary: z.string(),
  description: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  timeZone: z.string(),
  attendees: z.array(z.string()),
  googleEventId: z.string(),
});

export type EventCreatedResponse = {
  exists: boolean;
  event?: z.infer<typeof EventResponseSchema>;
};

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user?.id) {
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

    const { threadId, messageId } = result.data;

    const eventCreated = await prisma.calendarEventCreated.findFirst({
      where: {
        userId: session.user.id,
        threadId,
        messageId,
      },
      select: {
        summary: true,
        description: true,
        startTime: true,
        endTime: true,
        timeZone: true,
        attendees: true,
        googleEventId: true,
      },
    });

    logger.info("Checked calendar event creation status", {
      userId: session.user.id,
      threadId,
      messageId,
      exists: !!eventCreated,
      summary: eventCreated?.summary,
      googleEventId: eventCreated?.googleEventId,
    });

    // Validate the response
    if (eventCreated) {
      const eventResult = EventResponseSchema.safeParse(eventCreated);
      if (!eventResult.success) {
        logger.error("Invalid event data in database", {
          error: eventResult.error.message,
          eventCreated,
        });
        return NextResponse.json(
          { error: "Invalid event data in database" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      exists: !!eventCreated,
      event: eventCreated,
    } satisfies EventCreatedResponse);
  } catch (error) {
    logger.error("Error checking calendar event creation", {
      error,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "Failed to check calendar event creation" },
      { status: 500 },
    );
  }
});
