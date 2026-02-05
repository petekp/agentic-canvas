import type { AppendMessage } from "@assistant-ui/react";
import type {
  CreateUIMessage,
  UIDataTypes,
  UIMessage,
  UIMessagePart,
  UITools,
} from "ai";

type SafeMetadata = Record<string, unknown> | undefined;

function sanitizeMetadata(metadata: AppendMessage["metadata"] | undefined): SafeMetadata {
  if (!metadata) return undefined;
  try {
    return JSON.parse(JSON.stringify(metadata)) as SafeMetadata;
  } catch {
    return undefined;
  }
}

export function createUIMessageFromAppendMessage<UI_MESSAGE extends UIMessage = UIMessage>(
  message: AppendMessage
): CreateUIMessage<UI_MESSAGE> {
  const inputParts = [
    ...message.content.filter((c) => c.type !== "file"),
    ...(message.attachments?.flatMap((a) =>
      a.content.map((c) => ({
        ...c,
        filename: a.name,
      }))
    ) ?? []),
  ];

  const parts = inputParts.map((part): UIMessagePart<UIDataTypes, UITools> => {
    switch (part.type) {
      case "text":
        return {
          type: "text",
          text: part.text,
        };
      case "image":
        return {
          type: "file",
          url: part.image,
          ...(part.filename && { filename: part.filename }),
          mediaType: "image/png",
        };
      case "file":
        return {
          type: "file",
          url: part.data,
          mediaType: part.mimeType,
          ...(part.filename && { filename: part.filename }),
        };
      default:
        throw new Error(`Unsupported part type: ${part.type}`);
    }
  });

  const safeMetadata = sanitizeMetadata(message.metadata);

  return {
    role: message.role,
    parts,
    ...(safeMetadata ? { metadata: safeMetadata } : {}),
  } satisfies CreateUIMessage<UIMessage> as CreateUIMessage<UI_MESSAGE>;
}
