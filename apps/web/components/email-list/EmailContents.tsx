import { type SyntheticEvent, useCallback, useMemo, useState } from "react";
import { Loading } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { cn } from "@/utils";

function CollapsibleQuotedContent({ html }: { html: string }) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const srcDoc = useMemo(() => getIframeHtml(html), [html]);

  return (
    <div className="mt-4 border-l-2 border-gray-200 pl-4">
      <Button
        variant="ghost"
        size="sm"
        className="mb-2 h-6 text-xs text-gray-500 hover:text-gray-700"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {isCollapsed ? (
          <>
            <ChevronDownIcon className="mr-1 h-3 w-3" />
            Show quoted content
          </>
        ) : (
          <>
            <ChevronUpIcon className="mr-1 h-3 w-3" />
            Hide quoted content
          </>
        )}
      </Button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isCollapsed ? "max-h-0" : "max-h-[5000px]",
        )}
      >
        <iframe
          srcDoc={srcDoc}
          className="h-auto min-h-0 w-full"
          title="Quoted email content"
          onLoad={(event) => {
            if (event.currentTarget.contentWindow) {
              const height =
                event.currentTarget.contentWindow.document.documentElement
                  .scrollHeight;
              event.currentTarget.style.height = `${height + 5}px`;
            }
          }}
        />
      </div>
    </div>
  );
}

export function HtmlEmail({ html }: { html: string }) {
  const [isLoading, setIsLoading] = useState(true);

  // Split the HTML into main content and quoted parts
  const { mainContent, quotedParts } = useMemo(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Extract blockquotes
    const quotes = Array.from(doc.querySelectorAll("blockquote"));
    quotes.forEach((quote) => quote.remove());

    // Look for email quote patterns
    const content = doc.body.innerHTML;
    const parts = content.split(/(On .+wrote:)/g);

    if (parts.length > 1) {
      // First part is the main content
      const mainHtml = parts[0];

      // Rest are quoted parts
      const quotedHtml = parts.slice(1).join("");

      return {
        mainContent: mainHtml,
        quotedParts: [...quotes.map((q) => q.outerHTML), quotedHtml].filter(
          Boolean,
        ),
      };
    }

    return {
      mainContent: parts[0],
      quotedParts: quotes.map((q) => q.outerHTML),
    };
  }, [html]);

  const mainSrcDoc = useMemo(() => getIframeHtml(mainContent), [mainContent]);

  return (
    <div>
      {isLoading && <Loading />}
      <iframe
        srcDoc={mainSrcDoc}
        onLoad={(event) => {
          if (event.currentTarget.contentWindow) {
            const height =
              event.currentTarget.contentWindow.document.documentElement
                .scrollHeight;
            event.currentTarget.style.height = `${height + 5}px`;
            setIsLoading(false);
          }
        }}
        className="h-0 min-h-0 w-full"
        title="Email content preview"
      />
      {quotedParts.map((quotedHtml, index) => (
        <CollapsibleQuotedContent key={index} html={quotedHtml} />
      ))}
    </div>
  );
}

export function PlainEmail({ text }: { text: string }) {
  return <pre className="whitespace-pre-wrap">{text}</pre>;
}

function getIframeHtml(html: string) {
  // Always inject our default font styles with lower specificity
  // This ensures styled elements keep their fonts while unstyled ones get our defaults
  const defaultFontStyles = `
    <style>
      /* Base styles with low specificity */
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        margin: 0;
      }
    </style>
  `;

  let htmlWithHead = "";
  if (html.indexOf("</head>") === -1) {
    htmlWithHead = `<head>${defaultFontStyles}<base target="_blank"></head>${html}`;
  } else {
    htmlWithHead = html.replace(
      "</head>",
      `${defaultFontStyles}<base target="_blank" rel="noopener noreferrer"></head>`,
    );
  }

  return htmlWithHead;
}
