import { createFileRoute } from "@tanstack/react-router";
import { DashboardApp } from "@/components/dashboard/app";
import { loadDashboard } from "@/lib/technocore/functions";

export const Route = createFileRoute("/")({
  loader: () => loadDashboard({ data: {} }),
  component: Home,
});

function Home() {
  const initial = Route.useLoaderData();
  return <DashboardApp initial={initial} />;
}
