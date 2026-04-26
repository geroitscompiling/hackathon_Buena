import { Badge } from "#/components/ui/badge";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion";
import { Separator } from "#/components/ui/separator";
import { Wrench } from "lucide-react";
import type { CaseDetail } from "#/services/caseDetails";

type CaseDetailViewProps = {
	detail: CaseDetail;
};

export function CaseDetailView({ detail }: CaseDetailViewProps) {
	const latestRunId = detail.agentRuns.at(-1)?.id;
	const timelineEntriesByRun = new Map(
		detail.agentRuns.map((run) => [
			run.id,
			buildTranscriptEntries(run),
		]),
	);

	return (
		<div className="space-y-10">
			<section className="overflow-hidden rounded-[2rem] border border-border/60 bg-gradient-to-br from-background via-background to-muted/30 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.28)]">
				<div className="px-6 py-7 md:px-8 md:py-8">
					<div className="flex flex-wrap items-start justify-between gap-5">
						<div className="space-y-3">
							<p className="text-sm font-medium text-muted-foreground">Case</p>
							<p className="max-w-3xl text-base leading-7 text-muted-foreground">
								{detail.case.summary}
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							<Badge variant="outline" className="rounded-full bg-background/70 px-3 py-1">
								{detail.case.status}
							</Badge>
							{detail.case.closurePredicate ? (
								<Badge variant="secondary" className="rounded-full px-3 py-1">
									{detail.case.closurePredicate}
								</Badge>
							) : null}
						</div>
					</div>
					<div className="mt-8 grid gap-4 border-t border-border/60 pt-6 md:grid-cols-2 xl:grid-cols-4">
						<MetaBlock
							label="Scope"
							value={[
								detail.case.property.id,
								detail.case.house?.id,
								detail.case.apartment?.id,
							]
								.filter(Boolean)
								.join(" / ")}
						/>
						<MetaBlock
							label="Owner"
							value={detail.case.owner.name}
							subvalue={detail.case.owner.email ?? undefined}
						/>
						<MetaBlock
							label="Created"
							value={formatDateTime(detail.case.createdAt)}
						/>
						<MetaBlock
							label="Updated"
							value={formatDateTime(detail.case.updatedAt)}
						/>
					</div>
				</div>
			</section>

			<section className="space-y-4">
				<SectionHeading
					title="Evidence"
					description="Linked facts with source traceability for this case."
				/>
				<div className="space-y-3">
					{detail.evidence.length === 0 ? (
						<p className="rounded-[1.5rem] border border-dashed border-border/70 bg-muted/20 px-5 py-6 text-sm text-muted-foreground">
							No linked evidence facts for this case yet.
						</p>
					) : (
						detail.evidence.map((fact) => (
							<div
								key={fact.id}
								className="rounded-[1.5rem] border border-border/60 bg-background/70 px-5 py-5 shadow-[0_12px_34px_-28px_rgba(0,0,0,0.35)] backdrop-blur"
							>
								<div className="flex flex-wrap items-start justify-between gap-4">
									<div className="space-y-1.5">
										<p className="text-lg font-medium tracking-tight">
											{fact.key}: {fact.value}
										</p>
										<p className="text-sm text-muted-foreground">
											{fact.category}
										</p>
									</div>
									<div className="flex flex-wrap gap-2">
										<Badge
											variant={fact.isGoldStandard ? "secondary" : "outline"}
											className="rounded-full"
										>
											{fact.isGoldStandard ? "Gold" : "AI"}
										</Badge>
										<Badge variant="outline" className="rounded-full">
											Confidence {fact.confidenceScore.toFixed(2)}
										</Badge>
									</div>
								</div>
								<Separator className="my-4" />
								<div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
									<MetaBlock label="Source File" value={fact.source.fileId} />
									<MetaBlock label="Source Type" value={fact.source.fileType} />
									<MetaBlock
										label="Ingested"
										value={formatDateTime(fact.source.ingestionDate)}
									/>
									<MetaBlock
										label="Document Date"
										value={fact.source.documentDate ?? "n/a"}
									/>
								</div>
							</div>
						))
					)}
				</div>
			</section>

			<section className="space-y-5">
				<SectionHeading
					title="Agent Activity"
					description="A streamlined view of the assistant conversation and the tools it used."
				/>
				<div className="rounded-[2rem] border border-border/60 bg-background/80 px-5 py-3 shadow-[0_18px_44px_-34px_rgba(0,0,0,0.35)]">
					{detail.agentRuns.length === 0 ? (
						<p className="px-2 py-4 text-sm text-muted-foreground">
							No AI SDK agent runs have been recorded for this case yet.
						</p>
					) : (
						<Accordion type="single" collapsible defaultValue={latestRunId}>
							{detail.agentRuns
								.slice()
								.reverse()
								.map((run) => (
									<AccordionItem key={run.id} value={run.id}>
										<AccordionTrigger className="py-5 hover:no-underline">
											<div className="space-y-1">
												<p className="font-medium tracking-tight">Agent run</p>
												<p className="text-xs text-muted-foreground">
													{formatDateTime(run.startedAt)} • {run.status}
												</p>
											</div>
										</AccordionTrigger>
										<AccordionContent>
											<div className="space-y-6 pt-2">
												<div className="flex flex-wrap items-center gap-2 px-1">
													<Badge variant="outline" className="rounded-full">
														{run.status}
													</Badge>
													<Badge variant="secondary" className="rounded-full">
														{humanizeModel(run.model)}
													</Badge>
													{run.finalRecommendation ? (
														<Badge className="rounded-full">
															{humanizeAction(run.finalRecommendation.proposedAction)}
														</Badge>
													) : null}
												</div>

												<div className="space-y-3">
													<div className="flex items-center justify-between gap-3 px-1">
														<p className="text-sm font-medium tracking-tight">Conversation</p>
														{run.finalRecommendation ? (
															<p className="text-xs text-muted-foreground">
																Confidence {run.finalRecommendation.confidence.toFixed(2)}
															</p>
														) : null}
													</div>
													{(timelineEntriesByRun.get(run.id) ?? []).length === 0 ? (
														<p className="text-sm text-muted-foreground">
															No transcript messages recorded.
														</p>
													) : (
														<div className="space-y-3">
															{(timelineEntriesByRun.get(run.id) ?? []).map((entry) =>
																entry.type === "tool" ? (
																	<div key={entry.id} className="flex justify-start">
																		<details className="w-full max-w-3xl px-1 py-1">
																			<summary className="flex cursor-pointer list-none items-start gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-muted/20">
																				<span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
																					<Wrench className="h-3.5 w-3.5" />
																				</span>
																				<div className="min-w-0 flex-1">
																					<p className="text-sm leading-6 text-muted-foreground">
																						<span className="font-medium text-foreground">
																							{formatToolName(entry.toolCall.toolName)}
																						</span>
																						{" "}
																						{toolCallSummary(entry.toolCall.toolName)}
																					</p>
																				</div>
																				<span className="pt-0.5 text-xs text-muted-foreground">
																					{entry.toolCall.status}
																				</span>
																			</summary>
																			<div className="mt-3 space-y-4 pl-11">
																				<div className="rounded-[1rem] bg-muted/20 p-3">
																					<p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
																						Inputs
																					</p>
																					<pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
																						{prettyToolArgs(entry.toolCall.arguments)}
																					</pre>
																				</div>
																				{typeof entry.toolCall.result !== "undefined" &&
																				entry.toolCall.result !== null ? (
																					<div className="rounded-[1rem] bg-muted/20 p-3">
																						<p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
																							Result
																						</p>
																						<pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
																							{prettyToolResult(entry.toolCall.result)}
																						</pre>
																					</div>
																				) : null}
																			</div>
																		</details>
																	</div>
																) : (
																	<div
																		key={entry.id}
																		className={entry.message.role === "assistant" ? "flex justify-start" : "flex justify-end"}
																	>
																		<div
																			className={
																				entry.message.role === "assistant"
																					? "max-w-3xl rounded-[1.35rem] rounded-tl-md border border-border/60 bg-muted/20 px-4 py-3.5 shadow-[0_10px_24px_-22px_rgba(0,0,0,0.45)]"
																					: "max-w-3xl rounded-[1.35rem] rounded-tr-md bg-primary/92 px-4 py-3.5 text-primary-foreground shadow-[0_12px_28px_-22px_rgba(0,0,0,0.45)]"
																			}
																		>
																			<div className="mb-1 flex items-center gap-2">
																				<span
																					className={
																						entry.message.role === "assistant"
																							? "text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
																							: "text-[11px] font-medium uppercase tracking-wide text-primary-foreground/80"
																					}
																				>
																					{humanizeRole(entry.message.role)}
																				</span>
																			</div>
																			<p className="whitespace-pre-wrap break-words text-sm leading-6">
																				{prettyTranscriptMessage(entry.message.content)}
																			</p>
																		</div>
																	</div>
																),
															)}
														</div>
													)}
												</div>
											</div>
										</AccordionContent>
									</AccordionItem>
								))}
						</Accordion>
					)}
				</div>
			</section>

			<section className="space-y-4">
				<SectionHeading
					title="Guardrails"
					description="Closure governance decisions recorded independently from agent chat."
				/>
				<div className="space-y-3">
					{detail.guardrailTraces.length === 0 ? (
						<p className="rounded-[1.5rem] border border-dashed border-border/70 bg-muted/20 px-5 py-6 text-sm text-muted-foreground">
							No guardrail traces recorded for this case yet.
						</p>
					) : (
						detail.guardrailTraces.map((trace) => (
							<div
								key={trace.id}
								className="rounded-[1.5rem] border border-border/60 bg-background/70 px-5 py-5 shadow-[0_12px_34px_-28px_rgba(0,0,0,0.35)]"
							>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="space-y-1">
										<p className="font-medium tracking-tight">
											{trace.action} • {trace.reason}
										</p>
										<p className="text-sm leading-6 text-muted-foreground">
											{trace.contextSummary}
										</p>
									</div>
									<div className="flex flex-wrap gap-2">
										<Badge
											variant={
												trace.decision === "approved" ? "default" : "secondary"
											}
											className="rounded-full"
										>
											{trace.decision}
										</Badge>
										<Badge variant="outline" className="rounded-full">
											{trace.confidenceScore.toFixed(2)} /{" "}
											{trace.confidenceThreshold.toFixed(2)}
										</Badge>
									</div>
								</div>
								{trace.evidenceFactIds.length > 0 ? (
									<p className="mt-3 text-xs text-muted-foreground">
										Evidence: {trace.evidenceFactIds.join(", ")}
									</p>
								) : null}
							</div>
						))
					)}
				</div>
			</section>
		</div>
	);
}

function SectionHeading({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="space-y-1 px-1">
			<h3 className="text-xl font-semibold tracking-tight">{title}</h3>
			<p className="text-sm leading-6 text-muted-foreground">{description}</p>
		</div>
	);
}

function MetaBlock({
	label,
	value,
	subvalue,
}: {
	label: string;
	value: string;
	subvalue?: string;
}) {
	return (
		<div>
			<p className="text-xs uppercase tracking-wide text-muted-foreground">
				{label}
			</p>
			<p className="mt-1 text-sm font-medium">{value}</p>
			{subvalue ? <p className="text-xs text-muted-foreground">{subvalue}</p> : null}
		</div>
	);
}

function formatDateTime(value: string) {
	return new Date(value).toLocaleString("en-GB", {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

function humanizeRole(role: string) {
	switch (role) {
		case "assistant":
			return "Assistant";
		case "user":
			return "Request";
		case "system":
			return "System";
		case "tool":
			return "Tool";
		default:
			return role;
	}
}

function humanizeAction(action: "close_case" | "keep_open") {
	return action === "close_case" ? "Recommended close" : "Recommended open";
}

function humanizeModel(model: string) {
	return model.replace(/^google\//, "").replace(/-/g, " ");
}

function formatToolName(name: string) {
	return name
		.split("_")
		.map((part) => part[0]?.toUpperCase() + part.slice(1))
		.join(" ");
}

function toolCallSummary(name: string) {
	switch (name) {
		case "get_case_context_bundle":
			return "Loaded the case summary, related cases, and relevant evidence.";
		case "get_related_cases":
			return "Looked for other similar cases in the same scope.";
		case "get_related_facts":
			return "Retrieved supporting facts connected to this case.";
		case "semantic_search":
			return "Searched the workspace semantically for relevant records.";
		default:
			return "Used an internal tool to gather more context.";
	}
}

function prettyToolArgs(value: unknown) {
	return JSON.stringify(value ?? {}, null, 2);
}

function prettyToolResult(value: unknown) {
	return JSON.stringify(stripVectorFields(value) ?? {}, null, 2);
}

function prettyTranscriptMessage(content: string) {
	const trimmedContent = content.trim();
	if (!trimmedContent.startsWith("{") && !trimmedContent.startsWith("[")) {
		return content;
	}

	try {
		return JSON.stringify(stripVectorFields(JSON.parse(trimmedContent)) ?? {}, null, 2);
	} catch {
		return content.replace(/\b(?:embedding|embeddings|vector|vectors)\b/gi, "[redacted]");
	}
}

function stripVectorFields(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(stripVectorFields);
	}

	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => !isVectorField(key))
				.map(([key, nestedValue]) => [key, stripVectorFields(nestedValue)]),
		);
	}

	return value;
}

function isVectorField(key: string) {
	return ["embedding", "embeddings", "vector", "vectors"].includes(
		key.toLowerCase(),
	);
}

function buildTranscriptEntries(run: CaseDetail["agentRuns"][number]) {
	return [
		...run.messages
			.filter(
				(message) =>
					message.role !== "tool" &&
					message.role !== "system" &&
					message.role !== "user",
			)
			.map((message) => ({
				type: "message" as const,
				id: message.id,
				stepIndex: message.stepIndex,
				createdAt: message.createdAt,
				message,
			})),
		...run.toolCalls.map((toolCall) => ({
			type: "tool" as const,
			id: toolCall.id,
			stepIndex: toolCall.stepIndex,
			createdAt: toolCall.createdAt,
			toolCall,
		})),
	].sort((left, right) => {
		if (left.stepIndex !== right.stepIndex) {
			return left.stepIndex - right.stepIndex;
		}

		return left.createdAt.localeCompare(right.createdAt);
	});
}
