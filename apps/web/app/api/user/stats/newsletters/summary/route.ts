import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";

export type NewsletterSummaryResponse = Awaited<
  ReturnType<typeof getNewsletterSummary>
>;

async function getNewsletterSummary({ userId }: { userId: string }) {
  const result = await prisma.$queryRaw<
    Array<{ status: string; _count: number }>
  >`
    SELECT status, COUNT(*) as _count
    FROM "Newsletter"
    WHERE "userId" = ${userId}
    GROUP BY status
  `;

  const resultObject = Object.fromEntries(
    result.map((item) => [item.status, item._count]),
  );

  return { result: resultObject };
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const result = await getNewsletterSummary({ userId: session.user.id });

  return NextResponse.json(result);
});
