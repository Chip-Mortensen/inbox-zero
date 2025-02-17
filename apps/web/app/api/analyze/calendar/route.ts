import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import { aiAnalyzeCalendar } from "@/utils/ai/calendar/analyze-calendar";
import type { AnalyzeCalendarResult } from "@/utils/ai/calendar/analyze-calendar";
import { getAiUserByEmail } from "@/utils/user/get";

const logger = createScopedLogger("calendar-analysis");

const RequestSchema = z.object({
  subject: z.string(),
  content: z.string(),
});

export type AnalyzeCalendarResponse = AnalyzeCalendarResult;

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const json = await request.json();
    const result = RequestSchema.safeParse(json);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request: " + result.error.message },
        { status: 400 },
      );
    }

    const { subject, content } = result.data;

    const user = await getAiUserByEmail({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const analysis = await aiAnalyzeCalendar({
      subject,
      content,
      user,
    });

    return NextResponse.json(analysis);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    logger.error("Error analyzing calendar event", {
      error,
      errorMessage,
      email: session.user.email,
    });

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
});
