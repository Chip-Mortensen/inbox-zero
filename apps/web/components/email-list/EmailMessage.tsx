import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
  ForwardIcon,
  ReplyIcon,
  ChevronsUpDownIcon,
  ChevronsDownUpIcon,
} from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import { extractNameFromEmail } from "@/utils/email";
import { formatShortDate } from "@/utils/date";
import { ComposeEmailFormLazy } from "@/app/(app)/compose/ComposeEmailFormLazy";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { ParsedMessage } from "@/utils/types";
import { forwardEmailHtml, forwardEmailSubject } from "@/utils/gmail/forward";
import { extractEmailReply } from "@/utils/parse/extract-reply.client";
import type { ReplyingToEmail } from "@/app/(app)/compose/ComposeEmailForm";
import { createReplyContent } from "@/utils/gmail/reply";
import { cn } from "@/utils";
import { generateReplyAction } from "@/utils/actions/generate-reply";
import type { ThreadMessage } from "@/components/email-list/types";
import { EmailDetails } from "@/components/email-list/EmailDetails";
import { HtmlEmail, PlainEmail } from "@/components/email-list/EmailContents";
import { EmailAttachments } from "@/components/email-list/EmailAttachments";
import { isActionError } from "@/utils/error";
import { Loading } from "@/components/Loading";
import { MessageText } from "@/components/Typography";
import { CalendarEventButton } from "./CalendarEventButton";

export function EmailMessage({
  message,
  refetch,
  showReplyButton,
  defaultShowReply,
  draftMessage,
  expanded,
  onExpand,
  onSendSuccess,
  generateNudge,
}: {
  message: ThreadMessage;
  draftMessage?: ThreadMessage;
  refetch: () => void;
  showReplyButton: boolean;
  defaultShowReply?: boolean;
  expanded: boolean;
  onExpand: () => void;
  onSendSuccess: (messageId: string, threadId: string) => void;
  generateNudge?: boolean;
}) {
  const [showReply, setShowReply] = useState(defaultShowReply || false);
  const [showDetails, setShowDetails] = useState(false);
  const [draftContent, setDraftContent] = useState<string>();

  const onReply = useCallback((content?: string) => {
    console.log("📨 EmailMessage.onReply called", { content });
    setDraftContent(content);
    setShowReply(true);
  }, []);

  const [showForward, setShowForward] = useState(false);
  const onForward = useCallback(() => setShowForward(true), []);

  const onCloseCompose = useCallback(() => {
    setShowReply(false);
    setShowForward(false);
    setDraftContent(undefined);
  }, []);

  const toggleDetails = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDetails((prev) => !prev);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't toggle if clicking on a button or link
      if (
        e.target instanceof HTMLElement &&
        (e.target.closest("button") || e.target.closest("a"))
      ) {
        return;
      }
      onExpand();
    },
    [onExpand],
  );

  return (
    <li
      className={cn(
        "bg-white p-4 shadow sm:rounded-lg",
        !expanded ? "cursor-pointer" : "cursor-default",
      )}
      onClick={handleClick}
    >
      <TopBar
        message={message}
        expanded={expanded}
        showDetails={showDetails}
        toggleDetails={toggleDetails}
        showReplyButton={showReplyButton}
        onReply={onReply}
        onForward={onForward}
      />

      {expanded && (
        <>
          {showDetails && <EmailDetails message={message} />}

          {message.textHtml ? (
            <HtmlEmail html={message.textHtml} />
          ) : (
            <PlainEmail text={message.textPlain || ""} />
          )}

          {message.attachments && <EmailAttachments message={message} />}

          <CalendarEventButton
            subject={message.headers.subject}
            content={message.textPlain || message.textHtml || ""}
            onReply={onReply}
            message={message}
          />

          {(showReply || showForward) && (
            <ReplyPanel
              message={message}
              refetch={refetch}
              onSendSuccess={onSendSuccess}
              onCloseCompose={onCloseCompose}
              defaultShowReply={defaultShowReply}
              showReply={showReply}
              draftMessage={draftMessage}
              generateNudge={generateNudge}
              draftContent={draftContent}
            />
          )}
        </>
      )}
    </li>
  );
}

function TopBar({
  message,
  expanded,
  showDetails,
  toggleDetails,
  showReplyButton,
  onReply,
  onForward,
}: {
  message: ParsedMessage;
  expanded: boolean;
  showDetails: boolean;
  toggleDetails: (e: React.MouseEvent) => void;
  showReplyButton: boolean;
  onReply: (content?: string) => void;
  onForward: () => void;
}) {
  return (
    <div className="sm:flex sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <div className="flex items-center">
          <h3 className="text-base font-medium">
            <span className="text-gray-900">
              {extractNameFromEmail(message.headers.from)}
            </span>{" "}
            {expanded && <span className="text-gray-600">wrote</span>}
          </h3>
        </div>
        {expanded && (
          <Button
            variant="ghost"
            size="sm"
            className="size-6 p-0"
            onClick={toggleDetails}
          >
            {showDetails ? (
              <ChevronsDownUpIcon className="size-4" />
            ) : (
              <ChevronsUpDownIcon className="size-4" />
            )}
          </Button>
        )}
      </div>
      <div className="flex items-center space-x-2">
        <p className="mt-1 whitespace-nowrap text-sm text-gray-600 sm:ml-3 sm:mt-0">
          <time dateTime={message.headers.date}>
            {formatShortDate(new Date(message.headers.date))}
          </time>
        </p>
        {showReplyButton && (
          <div className="relative flex items-center">
            <Tooltip content="Reply">
              <Button variant="ghost" size="icon" onClick={() => onReply()}>
                <ReplyIcon className="h-4 w-4" />
                <span className="sr-only">Reply</span>
              </Button>
            </Tooltip>
            <Tooltip content="Forward">
              <Button variant="ghost" size="icon">
                <ForwardIcon className="h-4 w-4" onClick={onForward} />
                <span className="sr-only">Forward</span>
              </Button>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}

function ReplyPanel({
  message,
  refetch,
  onSendSuccess,
  onCloseCompose,
  defaultShowReply,
  showReply,
  draftMessage,
  generateNudge,
  draftContent,
}: {
  message: ParsedMessage;
  refetch: () => void;
  onSendSuccess: (messageId: string, threadId: string) => void;
  onCloseCompose: () => void;
  defaultShowReply?: boolean;
  showReply: boolean;
  draftMessage?: ThreadMessage;
  generateNudge?: boolean;
  draftContent?: string;
}) {
  const replyRef = useRef<HTMLDivElement>(null);

  const [isGeneratingNudge, setIsGeneratingNudge] = useState(false);
  const [nudge, setNudge] = useState<string | null>(null);

  useEffect(() => {
    async function loadNudge() {
      setIsGeneratingNudge(true);

      const isSent = message.labelIds?.includes("SENT");

      const result = await generateReplyAction({
        type: isSent ? "nudge" : "reply",
        messages: [
          {
            id: message.id,
            textHtml: message.textHtml,
            textPlain: message.textPlain,
            date: message.headers.date,
            from: message.headers.from,
            to: message.headers.to,
            subject: message.headers.subject,
          },
        ],
      });
      if (isActionError(result)) {
        console.error(result);
        setNudge("");
      } else {
        setNudge(result.text);
      }
      setIsGeneratingNudge(false);
    }

    if (generateNudge) loadNudge();
  }, [generateNudge, message]);

  const replyingToEmail: ReplyingToEmail = useMemo(() => {
    console.log("📝 Preparing replyingToEmail", {
      showReply,
      draftContent,
      hasNudge: !!nudge,
      hasDraftMessage: !!draftMessage,
      contentLength: draftContent?.length,
      contentPreview: draftContent?.slice(0, 50),
    });

    if (showReply) {
      if (draftMessage) {
        console.log("📤 Using draft message");
        return prepareDraftReplyEmail(draftMessage);
      }

      if (nudge) {
        console.log("📤 Using nudge");
        const nudgeHtml = nudge
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => `<p>${line}</p>`)
          .join("");
        return prepareReplyingToEmail(message, nudgeHtml);
      }

      if (draftContent) {
        console.log("📤 Using draft content", {
          contentLength: draftContent.length,
          contentPreview: draftContent.slice(0, 50),
        });
        return prepareReplyingToEmail(message, draftContent);
      }

      console.log("📤 Using empty content");
      return prepareReplyingToEmail(message);
    }
    return prepareForwardingEmail(message);
  }, [showReply, message, draftMessage, nudge, draftContent]);

  return (
    <>
      <Separator className="my-4" />

      <div ref={replyRef}>
        {isGeneratingNudge ? (
          <div className="flex items-center justify-center">
            <Loading />
            <MessageText>Generating reply...</MessageText>
            <Button
              className="ml-4"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsGeneratingNudge(false);
              }}
            >
              Skip
            </Button>
          </div>
        ) : (
          <ComposeEmailFormLazy
            replyingToEmail={replyingToEmail}
            refetch={refetch}
            onSuccess={(messageId, threadId) => {
              onSendSuccess(messageId, threadId);
              onCloseCompose();
            }}
            onDiscard={onCloseCompose}
          />
        )}
      </div>
    </>
  );
}

const prepareReplyingToEmail = (
  message: ParsedMessage,
  content = "",
): ReplyingToEmail => {
  const sentFromUser = message.labelIds?.includes("SENT");

  console.log("📧 Preparing reply email", {
    hasContent: !!content,
    contentLength: content?.length,
    contentPreview: content?.slice(0, 100),
    hasHtmlTags: content?.includes("<"),
    hasLink: content?.includes("href="),
  });

  const { html } = createReplyContent({ message });

  const replyEmail = {
    // If following an email from yourself, use original recipients, otherwise reply to sender
    to: sentFromUser ? message.headers.to : message.headers.from,
    // If following an email from yourself, don't add "Re:" prefix
    subject: sentFromUser
      ? message.headers.subject
      : `Re: ${message.headers.subject}`,
    headerMessageId: message.headers["message-id"]!,
    threadId: message.threadId!,
    // Keep original CC
    cc: message.headers.cc,
    // Keep original BCC if available
    bcc: sentFromUser ? message.headers.bcc : "",
    references: message.headers.references,
    draftHtml: content || "",
    quotedContentHtml: html,
  };

  console.log("📧 Created reply email", {
    draftHtmlLength: replyEmail.draftHtml.length,
    draftHtmlPreview: replyEmail.draftHtml.slice(0, 100),
    hasHtmlTags: replyEmail.draftHtml.includes("<"),
    hasLink: replyEmail.draftHtml.includes("href="),
  });

  return replyEmail;
};

const prepareForwardingEmail = (message: ParsedMessage): ReplyingToEmail => ({
  to: "",
  subject: forwardEmailSubject(message.headers.subject),
  headerMessageId: "",
  threadId: message.threadId!,
  cc: "",
  references: "",
  draftHtml: forwardEmailHtml({ content: "", message }),
  quotedContentHtml: "",
});

function prepareDraftReplyEmail(draft: ParsedMessage): ReplyingToEmail {
  const splitHtml = extractEmailReply(draft.textHtml || "");

  return {
    to: draft.headers.to,
    subject: draft.headers.subject,
    headerMessageId: draft.headers["message-id"]!,
    threadId: draft.threadId!,
    cc: draft.headers.cc,
    bcc: draft.headers.bcc,
    references: draft.headers.references,
    draftHtml: splitHtml.draftHtml,
    quotedContentHtml: splitHtml.originalHtml,
  };
}
