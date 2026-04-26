import { Link, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { CaseDetailView } from "#/components/CaseDetailView";
import { getCaseDetail, type CaseDetail } from "#/services/caseDetails";

const getCaseDetailById = createServerFn({
	method: "GET",
})
	.inputValidator((data) =>
		z.object({
			caseId: z.string().trim().min(1),
		}).parse(data),
	)
	.handler(async ({ data }) => {
		return getCaseDetail(undefined, data.caseId);
	});

export const Route = createFileRoute("/cases/$caseId")({
	component: CaseDetailPage,
	loader: async ({ params }) =>
		await getCaseDetailById({
			data: {
				caseId: params.caseId,
			},
		}),
});

function CaseDetailPage() {
	const loaderDetail = Route.useLoaderData();
	const { caseId } = Route.useParams();
	const [detail, setDetail] = useState(loaderDetail);

	useEffect(() => {
		setDetail(loaderDetail);
	}, [loaderDetail]);

	useEffect(() => {
		let cancelled = false;
		let eventSource: EventSource | null = null;
		let reconnectTimer: number | null = null;

		const connect = () => {
			if (cancelled) {
				return;
			}

			eventSource = new EventSource(`/api/cases/${caseId}/agent-stream`);
			eventSource.onmessage = (event) => {
				try {
					const chunk = JSON.parse(event.data) as {
						type?: string;
						data?: { detail?: CaseDetail };
					};

					if (
						chunk.type === "data-case-detail-update" &&
						chunk.data?.detail
					) {
						setDetail(chunk.data.detail);
					}
				} catch {
					/* ignore malformed chunks */
				}
			};
			eventSource.onerror = () => {
				eventSource?.close();
				eventSource = null;
				if (!cancelled) {
					reconnectTimer = window.setTimeout(connect, 1000);
				}
			};
		};

		connect();

		return () => {
			cancelled = true;
			eventSource?.close();
			if (reconnectTimer !== null) {
				window.clearTimeout(reconnectTimer);
			}
		};
	}, [caseId]);

	return (
		<main className="px-4 py-6 md:px-6">
			<section className="mb-6">
				<div>
					<Link
						to="/cases"
						className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground no-underline transition hover:text-foreground"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to cases
					</Link>
					<p className="mb-2 text-sm text-muted-foreground">Case Details</p>
					<h1 className="text-2xl font-semibold">{detail.case.title}</h1>
					<p className="mt-1 text-sm text-muted-foreground">{detail.case.id}</p>
				</div>
			</section>

			<CaseDetailView detail={detail} />
		</main>
	);
}
