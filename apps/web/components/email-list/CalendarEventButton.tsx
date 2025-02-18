"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, XCircle } from "lucide-react";
import useSWR from "swr";
import type { AnalyzeCalendarResponse } from "@/app/api/analyze/calendar/route";
import {
  createCalendarEventAction,
  getAlternativeTimesAction,
  checkCalendarConflictsAction,
} from "@/utils/actions/calendar";
import { toastError, toastSuccess } from "@/components/Toast";
import { isActionError } from "@/utils/actions";
import { LoadingContent } from "@/components/LoadingContent";
import { MessageText } from "@/components/Typography";
import { CalendarConflictAlert } from "./CalendarConflictAlert";
import type { TimeProposal } from "@/app/api/calendar/suggest-times/route";
import type { CalendarEvent } from "@/app/api/calendar/check-conflicts/route";
import type { ParsedMessage } from "@/utils/types";
import { CalendarEventForm } from "./CalendarEventForm";

interface CalendarEventButtonProps {
  subject: string;
  content: string;
  onReply: (draftContent?: string) => void;
  message: ParsedMessage;
}

export const CalendarEventButton = ({
  subject,
  content,
  onReply,
  message,
}: CalendarEventButtonProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingAlternatives, setIsLoadingAlternatives] = useState(false);
  const [alternativesError, setAlternativesError] = useState<{
    error: string;
  }>();
  const [alternativeTimes, setAlternativeTimes] = useState<TimeProposal[]>([]);
  const [conflicts, setConflicts] = useState<{
    existingEvents: CalendarEvent[];
  }>();
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
  const [conflictError, setConflictError] = useState<string>();
  const [showModifyForm, setShowModifyForm] = useState(false);
  const [modifiedEvent, setModifiedEvent] = useState<{
    startTime: string;
    endTime: string;
  } | null>(null);
  const [eventCreated, setEventCreated] = useState(false);

  const {
    data: analysis,
    isLoading,
    error,
  } = useSWR<AnalyzeCalendarResponse>(
    message.labelIds?.includes("SENT")
      ? null
      : [`/api/analyze/calendar`, subject, content],
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
      suspense: false,
      keepPreviousData: false,
    },
  );

  const { data: eventCreatedData } = useSWR<{
    exists: boolean;
    event?: {
      summary: string;
      description: string;
      startTime: string;
      endTime: string;
      timeZone: string;
      attendees: string[];
    };
  }>(
    message.id ? [`/api/calendar/event-created`, message.id] : null,
    async ([url]) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: message.threadId,
          messageId: message.id,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to check event creation status");
      }
      return response.json();
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
    },
  );

  useEffect(() => {
    if (eventCreatedData?.exists) {
      setEventCreated(true);
    }
  }, [eventCreatedData]);

  useEffect(() => {
    let isMounted = true;

    async function checkConflicts() {
      if (
        !analysis?.shouldCreateEvent ||
        !analysis.suggestedEvent?.startTime ||
        !analysis.suggestedEvent.endTime
      ) {
        return;
      }

      if (!isMounted) return;
      setIsCheckingConflicts(true);

      try {
        const conflictCheck = await checkCalendarConflictsAction({
          startTime: analysis.suggestedEvent.startTime,
          endTime: analysis.suggestedEvent.endTime,
          timeZone: analysis.suggestedEvent.timeZone,
        });

        if (!isMounted) return;

        // Only treat it as an error if it has an error property
        if ("error" in conflictCheck && conflictCheck.error) {
          if (isMounted) {
            setConflictError(conflictCheck.error);
            setIsCheckingConflicts(false);
          }
          return;
        }

        // Clear any previous error
        if (isMounted) setConflictError(undefined);

        // At this point we know it's a successful response
        const response = conflictCheck as {
          hasConflicts: boolean;
          conflicts?: { existingEvents: CalendarEvent[] };
        };

        if (response.hasConflicts && response.conflicts) {
          if (isMounted) {
            setConflicts(response.conflicts);
          }

          if (isMounted) {
            setIsLoadingAlternatives(true);
            setAlternativesError(undefined);
            setAlternativeTimes([]);
          }

          const alternativesResult = await getAlternativeTimesAction({
            startTime: analysis.suggestedEvent.startTime,
            endTime: analysis.suggestedEvent.endTime,
            timeZone: analysis.suggestedEvent.timeZone,
            attendees: analysis.suggestedEvent.attendees || [],
            eventCategory: analysis.eventCategory?.category
              ? {
                  primary: analysis.eventCategory.category.primary,
                  confidence: analysis.eventCategory.category.confidence,
                }
              : undefined,
          });

          console.log("🔍 Alternatives result:", {
            hasError:
              "error" in alternativesResult && alternativesResult.error?.trim(),
            hasProposals:
              !("error" in alternativesResult) &&
              alternativesResult.proposals?.length > 0,
            proposalsCount: !("error" in alternativesResult)
              ? alternativesResult.proposals?.length
              : 0,
          });

          if (!isMounted) return;

          // Check if it's an error response (has error property with non-empty string)
          if (
            "error" in alternativesResult &&
            alternativesResult.error?.trim()
          ) {
            setAlternativesError({ error: alternativesResult.error });
            setAlternativeTimes([]);
          } else {
            // We have a successful response if we have proposals and either no error or empty error
            const proposals =
              "proposals" in alternativesResult &&
              Array.isArray(alternativesResult.proposals)
                ? alternativesResult.proposals
                : [];
            setAlternativesError(undefined);
            setAlternativeTimes(proposals);
          }
        } else {
          if (isMounted) {
            setConflicts(undefined);
            setConflictError(undefined);
            setAlternativesError(undefined);
            setAlternativeTimes([]);
          }
        }
      } catch (error) {
        if (isMounted) {
          setConflictError(
            "An unexpected error occurred checking for conflicts",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingAlternatives(false);
          setIsCheckingConflicts(false);
        }
      }
    }

    if (analysis?.shouldCreateEvent && analysis.suggestedEvent) {
      void checkConflicts();
    }

    return () => {
      isMounted = false;
    };
  }, [analysis]);

  const handleCreateEvent = async () => {
    if (!analysis?.suggestedEvent) return;

    setIsCreating(true);
    try {
      // Check for conflicts first
      const conflictCheck = await checkCalendarConflictsAction({
        startTime:
          analysis.suggestedEvent.startTime || new Date().toISOString(),
        endTime:
          analysis.suggestedEvent.endTime ||
          new Date(Date.now() + 3600000).toISOString(),
        timeZone: analysis.suggestedEvent.timeZone,
      });

      if (isActionError(conflictCheck) && conflictCheck.error) {
        toastError({
          title: "Failed to check calendar conflicts",
          description: conflictCheck.error,
        });
        return;
      }

      // If there are conflicts, show error and don't create event
      if (!isActionError(conflictCheck) && conflictCheck.hasConflicts) {
        toastError({
          title: "Calendar Conflict",
          description:
            "There are conflicts with existing events. Please choose an alternative time.",
        });
        return;
      }

      const result = await createCalendarEventAction({
        ...analysis.suggestedEvent,
        startTime:
          analysis.suggestedEvent.startTime || new Date().toISOString(),
        endTime:
          analysis.suggestedEvent.endTime ||
          new Date(Date.now() + 3600000).toISOString(),
        threadId: message.threadId,
        messageId: message.id,
      });

      if (isActionError(result) && result.error) {
        toastError({
          title: "Failed to create calendar event",
          description: result.error,
        });
      } else {
        toastSuccess({
          description: "Calendar event created!",
        });
        setModifiedEvent({
          startTime:
            analysis.suggestedEvent.startTime || new Date().toISOString(),
          endTime:
            analysis.suggestedEvent.endTime ||
            new Date(Date.now() + 3600000).toISOString(),
        });
        setEventCreated(true);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleProposedTimeSelect = useCallback(
    (proposal: TimeProposal) => {
      if (!analysis?.suggestedEvent) return;

      // Generate email content with the proposed time
      const proposedDate = new Date(proposal.startTime);
      const proposedTime = proposedDate.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      const proposedEndTime = new Date(proposal.endTime).toLocaleTimeString(
        [],
        {
          hour: "numeric",
          minute: "2-digit",
        },
      );

      // Create calendar event link
      const eventDetails = {
        ...analysis.suggestedEvent,
        startTime: proposal.startTime,
        endTime: proposal.endTime,
      };

      const calendarLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(eventDetails.summary)}&details=${encodeURIComponent(eventDetails.description)}&dates=${proposal.startTime.replace(/[-:]/g, "").replace(/\.\d{3}/, "")}\/${proposal.endTime.replace(/[-:]/g, "").replace(/\.\d{3}/, "")}&ctz=${encodeURIComponent(eventDetails.timeZone)}${eventDetails.attendees ? `&add=${eventDetails.attendees.map((email) => encodeURIComponent(email)).join(",")}` : ""}`;

      // Use proper HTML escaping for the link
      const proposalText = `<div>
        <p>I noticed a scheduling conflict for the proposed time. Would ${proposedDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "numeric", day: "numeric" })} from ${proposedTime} to ${proposedEndTime} work instead?</p>
        <p>I've checked my calendar and I'm available during this time slot.</p>
        <p>You can add this event to your calendar using this link: <a href="${calendarLink.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">Add to Google Calendar</a></p>
      </div>`;

      console.log("📝 Generated proposal text", {
        proposalText,
        date: proposedDate.toLocaleDateString(),
        time: proposedTime,
        endTime: proposedEndTime,
        hasLink: proposalText.includes("href="),
        linkPreview: calendarLink.slice(0, 100),
      });

      // Open reply panel with the proposal text
      onReply(proposalText);

      console.log("📤 Called onReply with proposal text", {
        textLength: proposalText.length,
        hasHtmlTags: proposalText.includes("<p>"),
        hasLink: proposalText.includes("href="),
        hasDiv: proposalText.includes("<div>"),
      });
    },
    [analysis?.suggestedEvent, onReply],
  );

  const handleModifyEvent = async (formData: {
    summary: string;
    description: string;
    date: Date;
    startTime: string;
    endTime: string;
    attendees?: string;
  }) => {
    if (!analysis?.suggestedEvent) return;

    setIsCreating(true);
    try {
      console.log("📅 Starting event modification", {
        originalStartTime: analysis.suggestedEvent.startTime,
        originalEndTime: analysis.suggestedEvent.endTime,
        formData: {
          date: formData.date,
          startTime: formData.startTime,
          endTime: formData.endTime,
        },
      });

      // Parse the time inputs (they come in 24h format from the time input)
      const [startHour, startMinute] = formData.startTime
        .split(":")
        .map(Number);
      const [endHour, endMinute] = formData.endTime.split(":").map(Number);

      console.log("⏰ Parsed time values", {
        start: { hour: startHour, minute: startMinute },
        end: { hour: endHour, minute: endMinute },
        isValid:
          !isNaN(startHour) &&
          !isNaN(startMinute) &&
          !isNaN(endHour) &&
          !isNaN(endMinute),
      });

      if (
        isNaN(startHour) ||
        isNaN(startMinute) ||
        isNaN(endHour) ||
        isNaN(endMinute)
      ) {
        toastError({
          title: "Invalid time format",
          description: "Please enter valid times in HH:MM format",
        });
        return;
      }

      const timeZone =
        analysis.suggestedEvent.timeZone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Create dates in the correct timezone
      const startDate = new Date(formData.date);
      startDate.setHours(startHour, startMinute, 0, 0);
      const startISOString = new Date(
        startDate.toLocaleString("en-US", { timeZone }),
      ).toISOString();

      const endDate = new Date(formData.date);
      endDate.setHours(endHour, endMinute, 0, 0);
      const endISOString = new Date(
        endDate.toLocaleString("en-US", { timeZone }),
      ).toISOString();

      console.log("🌍 Date conversion results", {
        timeZone,
        startDate: {
          original: startDate.toISOString(),
          converted: startISOString,
          localString: startDate.toLocaleString(),
        },
        endDate: {
          original: endDate.toISOString(),
          converted: endISOString,
          localString: endDate.toLocaleString(),
        },
      });

      // Validate that end time is after start time
      if (endDate <= startDate) {
        toastError({
          title: "Invalid time range",
          description: "End time must be after start time",
        });
        return;
      }

      // Check for conflicts
      console.log("🔍 Checking conflicts with params", {
        startTime: startISOString,
        endTime: endISOString,
        timeZone,
      });

      const conflictCheck = await checkCalendarConflictsAction({
        startTime: startISOString,
        endTime: endISOString,
        timeZone,
      });

      console.log("✅ Conflict check response", {
        isError: isActionError(conflictCheck),
        error: isActionError(conflictCheck) ? conflictCheck.error : undefined,
        hasConflicts:
          !isActionError(conflictCheck) && conflictCheck.hasConflicts,
        response: conflictCheck,
      });

      if (isActionError(conflictCheck) && conflictCheck.error) {
        toastError({
          title: "Failed to check calendar conflicts",
          description: conflictCheck.error,
        });
        return;
      }

      // If there are conflicts, show error and don't create event
      if (!isActionError(conflictCheck) && conflictCheck.hasConflicts) {
        toastError({
          title: "Calendar Conflict",
          description:
            "There are conflicts with existing events. Please choose a different time.",
        });
        return;
      }

      console.log("📅 Creating calendar event with params", {
        summary: formData.summary,
        description: formData.description,
        startTime: startISOString,
        endTime: endISOString,
        timeZone,
        hasAttendees: !!formData.attendees,
      });

      const result = await createCalendarEventAction({
        summary: formData.summary,
        description: formData.description,
        startTime: startISOString,
        endTime: endISOString,
        timeZone,
        attendees: formData.attendees
          ? formData.attendees.split(",").map((email) => email.trim())
          : undefined,
        threadId: message.threadId,
        messageId: message.id,
      });

      console.log("📅 Calendar event creation response", {
        isError: isActionError(result),
        error: isActionError(result) ? result.error : undefined,
        result,
      });

      if (isActionError(result) && result.error) {
        toastError({
          title: "Failed to create calendar event",
          description: result.error,
        });
      } else {
        toastSuccess({
          description: "Calendar event updated!",
        });
        setModifiedEvent({
          startTime: startISOString,
          endTime: endISOString,
        });
        setEventCreated(true);
        setShowModifyForm(false);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const renderContent = () => {
    if (error) {
      return (
        <MessageText className="text-destructive">
          Failed to analyze email
        </MessageText>
      );
    }

    if (!analysis?.shouldCreateEvent) {
      return analysis ? (
        <div className="mt-4 rounded-lg border border-green-100 bg-green-50/50 p-4">
          <div className="flex items-center gap-2 text-green-700">
            <XCircle className="h-4 w-4" />
            <MessageText>No calendar events detected</MessageText>
          </div>
        </div>
      ) : null;
    }

    // If event was already created, just show the success message
    if (eventCreatedData?.exists && eventCreatedData.event) {
      return (
        <div className="mt-4 rounded-lg border border-green-100 bg-green-50/50 p-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-green-700">
              <Calendar className="h-4 w-4" />
              <MessageText>✓ Event already added to calendar</MessageText>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-gray-900">
                {eventCreatedData.event.summary}
              </h3>
              <p className="text-sm text-gray-500">
                {eventCreatedData.event.description}
              </p>
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <Calendar className="h-4 w-4" />
                <time>
                  {new Date(
                    eventCreatedData.event.startTime,
                  ).toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "numeric",
                    day: "numeric",
                  })}{" "}
                  at{" "}
                  {new Date(
                    eventCreatedData.event.startTime,
                  ).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {eventCreatedData.event.endTime &&
                    ` - ${new Date(
                      eventCreatedData.event.endTime,
                    ).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`}
                </time>
              </div>
              {eventCreatedData.event.attendees?.length > 0 && (
                <p className="text-sm text-gray-500">
                  With: {eventCreatedData.event.attendees.join(", ")}
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (!analysis.suggestedEvent) {
      return null;
    }

    // Show conflicts even while checking - they might be from a previous check
    if (
      conflicts &&
      conflicts.existingEvents &&
      conflicts.existingEvents.length > 0
    ) {
      return (
        <CalendarConflictAlert
          conflicts={conflicts}
          onProposedTimeSelect={handleProposedTimeSelect}
          alternativeTimes={alternativeTimes}
          isLoadingAlternatives={isLoadingAlternatives}
          alternativesError={alternativesError}
        />
      );
    }

    if (conflictError) {
      return (
        <MessageText className="text-destructive">
          Error checking for conflicts: {conflictError}
        </MessageText>
      );
    }

    // Show checking state if we're actively checking
    if (isCheckingConflicts) {
      return <MessageText>Checking for calendar conflicts...</MessageText>;
    }

    return (
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
                  modifiedEvent?.startTime ||
                    analysis.suggestedEvent.startTime ||
                    new Date().toISOString(),
                ).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "numeric",
                  day: "numeric",
                })}{" "}
                at{" "}
                {new Date(
                  modifiedEvent?.startTime ||
                    analysis.suggestedEvent.startTime ||
                    new Date().toISOString(),
                ).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {(modifiedEvent?.endTime || analysis.suggestedEvent.endTime) &&
                  ` - ${new Date(
                    modifiedEvent?.endTime ||
                      analysis.suggestedEvent.endTime ||
                      new Date().toISOString(),
                  ).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}`}
              </time>
            </div>
            {analysis.suggestedEvent.attendees &&
              analysis.suggestedEvent.attendees.length > 0 && (
                <p className="text-sm text-gray-500">
                  With: {analysis.suggestedEvent.attendees.join(", ")}
                </p>
              )}
            {eventCreated && (
              <p className="mt-2 text-sm font-medium text-green-600">
                ✓ Added to calendar
              </p>
            )}
          </div>
          <div className="ml-4 flex space-x-2">
            <Button
              size="default"
              variant="outline"
              onClick={() => setShowModifyForm(true)}
              disabled={isCreating}
            >
              <Calendar className="mr-2 h-4 w-4" />
              Modify
            </Button>
            <Button
              size="default"
              onClick={handleCreateEvent}
              disabled={isCreating || eventCreated}
            >
              <Calendar className="mr-2 h-4 w-4" />
              {eventCreated ? "Added" : "Add to Calendar"}
            </Button>
          </div>
        </div>

        {analysis.suggestedEvent && showModifyForm && (
          <CalendarEventForm
            isOpen={showModifyForm}
            onClose={() => setShowModifyForm(false)}
            onSubmit={handleModifyEvent}
            initialValues={{
              summary: analysis.suggestedEvent.summary,
              description: analysis.suggestedEvent.description,
              date: new Date(analysis.suggestedEvent.startTime || new Date()),
              startTime: new Date(
                analysis.suggestedEvent.startTime || new Date(),
              ).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }),
              endTime: new Date(
                analysis.suggestedEvent.endTime ||
                  new Date(Date.now() + 3600000),
              ).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }),
              attendees: analysis.suggestedEvent.attendees,
            }}
          />
        )}
      </div>
    );
  };

  return (
    <LoadingContent loading={isLoading} error={error}>
      {renderContent()}
    </LoadingContent>
  );
};
