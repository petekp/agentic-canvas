import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { getModel, streamSimple } from "@mariozechner/pi-ai";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toPiUserContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return [{ type: "text", text: "" }];
  }

  const blocks = [];
  for (const part of content) {
    if (!isObject(part) || typeof part.type !== "string") continue;
    if (part.type === "text" && typeof part.text === "string") {
      blocks.push({ type: "text", text: part.text });
      continue;
    }
    if (part.type === "file" && typeof part.mediaType === "string" && typeof part.data === "string") {
      if (part.mediaType.startsWith("image/")) {
        const marker = ";base64,";
        const data = part.data.includes(marker) ? part.data.split(marker)[1] : part.data;
        blocks.push({ type: "image", data, mimeType: part.mediaType });
      }
    }
  }

  return blocks.length > 0 ? blocks : [{ type: "text", text: "" }];
}

function toPiAssistantContent(content) {
  if (!Array.isArray(content)) return [];

  const blocks = [];
  for (const part of content) {
    if (!isObject(part) || typeof part.type !== "string") continue;

    if (part.type === "text" && typeof part.text === "string") {
      blocks.push({ type: "text", text: part.text });
      continue;
    }

    if (
      part.type === "tool-call" &&
      typeof part.toolCallId === "string" &&
      typeof part.toolName === "string"
    ) {
      const args = isObject(part.input) ? part.input : {};
      blocks.push({
        type: "toolCall",
        id: part.toolCallId,
        name: part.toolName,
        arguments: args,
      });
      continue;
    }
  }

  return blocks;
}

function toPiMessages(modelMessages) {
  if (!Array.isArray(modelMessages)) return [];

  const messages = [];

  for (const message of modelMessages) {
    if (!isObject(message) || typeof message.role !== "string") continue;

    if (message.role === "user") {
      messages.push({
        role: "user",
        content: toPiUserContent(message.content),
        timestamp: Date.now(),
      });
      continue;
    }

    if (message.role === "assistant") {
      const content = toPiAssistantContent(message.content);
      messages.push({
        role: "assistant",
        content,
        api: "openai-responses",
        provider: "openai",
        model: "gpt-4o",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: Date.now(),
      });
      continue;
    }

    if (message.role === "tool" && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (!isObject(part) || part.type !== "tool-result") continue;
        if (typeof part.toolCallId !== "string" || typeof part.toolName !== "string") continue;
        messages.push({
          role: "toolResult",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          content: [
            {
              type: "text",
              text: JSON.stringify(part.output ?? null),
            },
          ],
          details: part.output ?? null,
          isError: false,
          timestamp: Date.now(),
        });
      }
    }
  }

  return messages;
}

function toPiTools(toolSet) {
  if (!isObject(toolSet)) return undefined;

  const tools = [];
  for (const [name, tool] of Object.entries(toolSet)) {
    if (!isObject(tool)) continue;
    const description =
      typeof tool.description === "string" && tool.description.length > 0
        ? tool.description
        : `Frontend tool ${name}`;

    let parameters = { type: "object", additionalProperties: true };
    if (isObject(tool.inputSchema) && isObject(tool.inputSchema.jsonSchema)) {
      parameters = tool.inputSchema.jsonSchema;
    }

    tools.push({
      name,
      description,
      parameters,
    });
  }

  return tools.length > 0 ? tools : undefined;
}

function resolvePiModel(options) {
  const envProvider = process.env.PI_MONO_PROVIDER?.trim();
  const provider = envProvider && envProvider.length > 0 ? envProvider : "openai";

  const envModel = process.env.PI_MONO_MODEL?.trim();
  const requestModel =
    isObject(options.model) && typeof options.model.modelId === "string"
      ? options.model.modelId
      : undefined;

  const modelId = envModel && envModel.length > 0 ? envModel : requestModel ?? "gpt-4o";
  const model = getModel(provider, modelId);
  if (model) return model;
  return getModel("openai", "gpt-4o");
}

function getToolCallFromEvent(event) {
  if (!isObject(event)) return null;
  if (event.type === "toolcall_end" && isObject(event.toolCall)) {
    const toolCall = event.toolCall;
    if (
      typeof toolCall.id === "string" &&
      typeof toolCall.name === "string" &&
      isObject(toolCall.arguments)
    ) {
      return toolCall;
    }
  }

  if (
    typeof event.contentIndex === "number" &&
    isObject(event.partial) &&
    Array.isArray(event.partial.content)
  ) {
    const candidate = event.partial.content[event.contentIndex];
    if (
      isObject(candidate) &&
      candidate.type === "toolCall" &&
      typeof candidate.id === "string" &&
      typeof candidate.name === "string" &&
      isObject(candidate.arguments)
    ) {
      return candidate;
    }
  }

  return null;
}

function mapFinishReason(reason) {
  if (reason === "length") return "length";
  if (reason === "toolUse") return "tool-calls";
  return "stop";
}

function buildRuntimeResponse(executor) {
  return {
    toUIMessageStreamResponse(init = {}) {
      const stream = createUIMessageStream({
        execute: async ({ writer }) => {
          await executor(writer);
        },
        onError: init.onError,
      });

      return createUIMessageStreamResponse({
        stream,
        status: init.status,
        statusText: init.statusText,
        headers: init.headers,
        consumeSseStream: init.consumeSseStream,
      });
    },
  };
}

export const piRuntimeEngine = {
  id: "external.pi-mono.runtime",
  stream(input) {
    const { options, context } = input;

    if (process.env.PI_MONO_DRY_RUN === "1") {
      context.emitPiEvent({
        type: "response.created",
        model: "pi-mono-dry-run",
      });

      return buildRuntimeResponse(async (writer) => {
        writer.write({ type: "start" });
        writer.write({ type: "text-start", id: "dry-0" });
        writer.write({ type: "text-delta", id: "dry-0", delta: "pi-mono dry run" });
        writer.write({ type: "text-end", id: "dry-0" });
        writer.write({ type: "finish", finishReason: "stop" });

        context.emitPiEvent({
          type: "response.output_text.delta",
          delta: "pi-mono dry run",
        });
        context.emitPiEvent({ type: "response.output_text.done" });
        context.emitPiEvent({ type: "response.completed" });
      });
    }

    const piModel = resolvePiModel(options);
    const piMessages = toPiMessages(options.messages);
    const piTools = toPiTools(options.tools);

    context.emitPiEvent({
      type: "response.created",
      model: piModel?.id,
    });

    return buildRuntimeResponse(async (writer) => {
      writer.write({ type: "start" });

      const startedText = new Set();
      const startedToolInputs = new Set();

      const stream = streamSimple(
        piModel,
        {
          systemPrompt: options.system,
          messages: piMessages,
          tools: piTools,
        },
        {
          signal: options.abortSignal,
          sessionId: context.session.sessionId,
        }
      );

      for await (const event of stream) {
        if (event.type === "text_start") {
          const textId = `txt-${event.contentIndex}`;
          startedText.add(textId);
          writer.write({ type: "text-start", id: textId });
          continue;
        }

        if (event.type === "text_delta") {
          const textId = `txt-${event.contentIndex}`;
          if (!startedText.has(textId)) {
            startedText.add(textId);
            writer.write({ type: "text-start", id: textId });
          }
          writer.write({
            type: "text-delta",
            id: textId,
            delta: event.delta,
          });
          context.emitPiEvent({
            type: "response.output_text.delta",
            delta: event.delta,
          });
          continue;
        }

        if (event.type === "text_end") {
          const textId = `txt-${event.contentIndex}`;
          if (!startedText.has(textId)) {
            startedText.add(textId);
            writer.write({ type: "text-start", id: textId });
          }
          writer.write({ type: "text-end", id: textId });
          continue;
        }

        if (event.type === "toolcall_start" || event.type === "toolcall_delta" || event.type === "toolcall_end") {
          const toolCall = getToolCallFromEvent(event);
          if (!toolCall) continue;

          if (!startedToolInputs.has(toolCall.id)) {
            startedToolInputs.add(toolCall.id);
            writer.write({
              type: "tool-input-start",
              toolCallId: toolCall.id,
              toolName: toolCall.name,
            });
          }

          if (event.type === "toolcall_delta" && typeof event.delta === "string" && event.delta.length > 0) {
            writer.write({
              type: "tool-input-delta",
              toolCallId: toolCall.id,
              inputTextDelta: event.delta,
            });
          }

          if (event.type === "toolcall_end") {
            writer.write({
              type: "tool-input-available",
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              input: toolCall.arguments,
            });
            context.emitPiEvent({
              type: "response.tool_call",
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              args: toolCall.arguments,
            });
            await context.appendToolLoopEvent({
              kind: "call",
              runId: context.runId,
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              args: toolCall.arguments,
              idempotencyKey: `${context.session.sessionId}:${toolCall.id}`,
            });
          }
          continue;
        }

        if (event.type === "done") {
          writer.write({ type: "finish", finishReason: mapFinishReason(event.reason) });
          context.emitPiEvent({ type: "response.output_text.done" });
          context.emitPiEvent({ type: "response.completed" });
          return;
        }

        if (event.type === "error") {
          if (event.reason === "aborted") {
            writer.write({ type: "abort", reason: event.error.errorMessage ?? "aborted" });
            context.emitPiEvent({
              type: "response.cancelled",
              reason: event.error.errorMessage ?? "aborted",
            });
          } else {
            writer.write({
              type: "error",
              errorText: event.error.errorMessage ?? "pi-mono stream error",
            });
            writer.write({ type: "finish", finishReason: "error" });
            context.emitPiEvent({
              type: "response.error",
              error: event.error.errorMessage ?? "pi-mono stream error",
              retryable: false,
            });
          }
          return;
        }
      }

      writer.write({ type: "finish", finishReason: "stop" });
      context.emitPiEvent({ type: "response.output_text.done" });
      context.emitPiEvent({ type: "response.completed" });
    });
  },
};

export default piRuntimeEngine;
