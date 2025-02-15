import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { withError } from "@/utils/middleware";
import { handleBatchRequest } from "@/app/api/user/categorize/senders/batch/handle-batch";
import { env } from "@/env";
import { isValidInternalApiKey } from "@/utils/internal-api";

export const maxDuration = 60;

// Fallback when Qstash is not in use
export const POST = withError(async (request) => {
  if (env.QSTASH_TOKEN) {
    return NextResponse.json({
      error: "Qstash is set. This endpoint is disabled.",
    });
  }

  if (!isValidInternalApiKey(headers()))
    return NextResponse.json({ error: "Invalid API key" });

  return handleBatchRequest(request);
});
