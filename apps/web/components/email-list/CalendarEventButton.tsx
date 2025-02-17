"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import useSWR from "swr";
import type { AnalyzeCalendarResponse } from "@/app/api/analyze/calendar/route";
import { createCalendarEventAction } from "@/utils/actions/calendar";
import { toastError, toastSuccess } from "@/components/Toast";
import { isActionError } from "@/utils/actions";
import { LoadingContent } from "@/components/LoadingContent";
import { MessageText } from "@/components/Typography";

interface CalendarEventButtonProps {
  subject: string;
  content: string;
}

export const CalendarEventButton = ({
  subject,
  content,
}: CalendarEventButtonProps) => {
  const [isCreating, setIsCreating] = useState(false);

  const {
    data: analysis,
    isLoading,
    error,
  } = useSWR<AnalyzeCalendarResponse>(
    [`/api/analyze/calendar`, subject, content],
    async ([url]) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, content }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to analyze email");
      }
      return response.json();
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
    },
  );

  const handleCreateEvent = async () => {
    if (!analysis?.suggestedEvent) return;

    setIsCreating(true);
    try {
      const result = await createCalendarEventAction({
        ...analysis.suggestedEvent,
        startTime:
          analysis.suggestedEvent.startTime || new Date().toISOString(),
        endTime:
          analysis.suggestedEvent.endTime ||
          new Date(Date.now() + 3600000).toISOString(),
      });

      if (isActionError(result)) {
        toastError({
          title: "Failed to create calendar event",
          description: result.error,
        });
      } else {
        toastSuccess({
          description: "Calendar event created!",
        });
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <LoadingContent loading={isLoading} error={error}>
      {error ? (
        <MessageText className="text-destructive">
          Failed to analyze email
        </MessageText>
      ) : analysis?.shouldCreateEvent && analysis.suggestedEvent ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-gray-900">
                {analysis.suggestedEvent.summary}
              </h3>
              <p className="text-sm text-gray-500">
                {analysis.suggestedEvent.description}
              </p>
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <Calendar className="h-4 w-4" />
                <time>
                  {new Date(
                    analysis.suggestedEvent.startTime || new Date(),
                  ).toLocaleString()}
                  {analysis.suggestedEvent.endTime &&
                    ` - ${new Date(analysis.suggestedEvent.endTime).toLocaleTimeString()}`}
                </time>
              </div>
              {analysis.suggestedEvent.attendees &&
                analysis.suggestedEvent.attendees.length > 0 && (
                  <p className="text-sm text-gray-500">
                    With: {analysis.suggestedEvent.attendees.join(", ")}
                  </p>
                )}
            </div>
            <Button
              size="default"
              onClick={handleCreateEvent}
              disabled={isCreating}
              className="ml-4"
            >
              <Calendar className="mr-2 h-4 w-4" />
              Add to Calendar
            </Button>
          </div>
        </div>
      ) : null}
    </LoadingContent>
  );
};
