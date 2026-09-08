import {
	type McpServer,
	type CallToolResult,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { mcpActionReceiptSchema } from "@kharidyar/contracts";
import { mcpWriteScope } from "../auth/mcp-options";
import {
	mcpActionCatalog,
	mcpIdentifier,
	type ActionContext,
} from "./mcp-action-catalog";
import {
	readMcpAction,
	requestMcpAction,
	operationIdSchema,
} from "./mcp-action-service";
import { ApiError } from "./api-errors";

export function registerMcpWriteTools(server: McpServer, ctx: ActionContext) {
	const scheme = { type: "oauth2", scopes: ["wantkit:read", mcpWriteScope] };
	function failure(error: unknown): CallToolResult {
		return {
			isError: true,
			content: [
				{
					type: "text",
					text:
						error instanceof ApiError
							? error.status === 403 || error.status === 404
								? "This action or record is unavailable to this account. Check its current permissions and connection."
								: error.message
							: error instanceof z.ZodError
								? "Invalid action inputs. Read the tool schema and supply only its supported fields."
								: "The outcome could not be confirmed. Check the operation receipt and current records; do not retry with a new operation ID.",
				},
			],
		};
	}
	for (const definition of mcpActionCatalog) {
 if (definition.name === "prepare_visual_edit" && ctx.env.CHATGPT_VISUALS_ENABLED !== "true") continue;
		const schema = z
			.object({ operationId: operationIdSchema, arguments: definition.schema })
			.strict();
		// Publish accepted inputs while preserving all Zod transformations at runtime.
		const published = {
			"~standard": {
				...schema["~standard"],
				jsonSchema: {
					input: () => z.toJSONSchema(schema, { io: "input" }),
					output: () => z.toJSONSchema(schema, { io: "input" }),
				},
			},
		};
		server.registerTool(
			definition.name,
			{
				title: definition.title,
				description: definition.description,
				inputSchema: published,
				outputSchema: mcpActionReceiptSchema,
				annotations: {
					readOnlyHint: false,
					destructiveHint: definition.destructive,
					idempotentHint: true,
					openWorldHint: ["start_research", "prepare_visual_edit"].includes(definition.name),
				},
				_meta: { securitySchemes: [scheme] },
			},
			async (args): Promise<CallToolResult> => {
				if (!ctx.actor.scopes.includes(mcpWriteScope))
					return {
						isError: true,
						content: [
							{
								type: "text",
								text: "This connection has read-only access. Create a connection with write access in WantKit, then reconnect your assistant.",
							},
						],
						_meta: {
							"mcp/www_authenticate": [
								`Bearer resource_metadata="${ctx.env.BETTER_AUTH_URL}/.well-known/oauth-protected-resource/api/mcp", error="insufficient_scope", error_description="Enable write access in WantKit and reconnect", scope="wantkit:read wantkit:write"`,
							],
						},
					};
				try {
					const parsed = schema.parse(args);
					const result = await requestMcpAction(
						ctx,
						definition.name,
						parsed.operationId,
						parsed.arguments,
					);
					return {
						isError: ["failed", "unknown"].includes(result.status),
						structuredContent: result,
						content: [{ type: "text", text: JSON.stringify(result) }],
					};
				} catch (error) {
					return failure(error);
				}
			},
		);
	}
	server.registerTool(
		"read_action_receipt",
		{
			description:
				"Check one operation's result or pending approval. Never create another operation ID to retry an uncertain result.",
			inputSchema: z.object({ actionId: mcpIdentifier }).strict(),
			outputSchema: mcpActionReceiptSchema,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
			_meta: {
				securitySchemes: [{ type: "oauth2", scopes: ["wantkit:read"] }],
			},
		},
		async ({ actionId }) => {
			try {
				const result = await readMcpAction(ctx, actionId);
				return {
					structuredContent: result,
					content: [{ type: "text", text: JSON.stringify(result) }],
				};
			} catch (error) {
				return failure(error);
			}
		},
	);
}
