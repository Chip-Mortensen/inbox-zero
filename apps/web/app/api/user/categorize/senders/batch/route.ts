import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { withError } from "@/utils/middleware";
import { handleBatchRequest } from "@/app/api/user/categorize/senders/batch/handle-batch";
import { env } from "@/env";
import { isValidInternalApiKey } from "@/utils/internal-api";

export const maxDuration = 300;

export const POST = withError(async (request) => {
  if (!isValidInternalApiKey(headers()))
    return NextResponse.json({ error: "Invalid API key" });

  return handleBatchRequest(request);
});
