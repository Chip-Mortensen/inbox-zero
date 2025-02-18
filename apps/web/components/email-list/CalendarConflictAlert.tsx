import { Button } from "@/components/ui/button";
import { Calendar, AlertCircle, Clock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CalendarEvent } from "@/app/api/calendar/check-conflicts/route";
import type { TimeProposal } from "@/app/api/calendar/suggest-times/route";
import { LoadingContent } from "@/components/LoadingContent";
import { MessageText } from "@/components/Typography";
import { formatShortDate } from "@/utils/date";

interface CalendarConflictAlertProps {
  conflicts: {
    existingEvents: CalendarEvent[];
  };
  onProposedTimeSelect: (proposal: TimeProposal) => void;
  alternativeTimes: TimeProposal[];
  isLoadingAlternatives: boolean;
  alternativesError?: { error: string };
}

export function CalendarConflictAlert({
  conflicts,
  onProposedTimeSelect,
  alternativeTimes,
  isLoadingAlternatives,
  alternativesError,
}: CalendarConflictAlertProps) {
  // Sort alternative times chronologically
  const sortedAlternativeTimes = [...alternativeTimes].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Calendar Conflicts Detected</AlertTitle>
        <AlertDescription>
          There are scheduling conflicts with the following events:
        </AlertDescription>
      </Alert>

      <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4">
        {conflicts.existingEvents.map((event) => (
          <div key={event.id} className="mb-2 last:mb-0">
            <h4 className="font-medium text-destructive">{event.summary}</h4>
            <div className="flex items-center space-x-2 text-sm text-destructive/80">
              <Calendar className="h-4 w-4" />
              <time>
                {new Date(event.startTime).toLocaleString()} -{" "}
                {new Date(event.endTime).toLocaleTimeString()}
              </time>
            </div>
            {event.attendees.length > 0 && (
              <p className="text-sm text-destructive/80">
                With: {event.attendees.join(", ")}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg border p-4">
        <h3 className="mb-4 font-medium">Alternative Times</h3>
        {isLoadingAlternatives ? (
          <div className="flex items-center justify-center py-4">
            <MessageText>Loading alternative times...</MessageText>
          </div>
        ) : alternativesError?.error?.trim() ? (
          <MessageText>
            Unable to load alternative times. Please try suggesting a different
            time.
          </MessageText>
        ) : sortedAlternativeTimes.length > 0 ? (
          <div className="space-y-3">
            {sortedAlternativeTimes.map((proposal, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-md border bg-gray-50 p-3"
              >
                <div className="flex items-center space-x-3">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <div>
                    <time className="font-medium">
                      {new Date(proposal.startTime).toLocaleDateString()}
                    </time>
                    <div className="text-sm text-gray-600">
                      {new Date(proposal.startTime).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      -{" "}
                      {new Date(proposal.endTime).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => onProposedTimeSelect(proposal)}
                >
                  Propose Time
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <MessageText>No alternative times available</MessageText>
        )}
      </div>
    </div>
  );
}
