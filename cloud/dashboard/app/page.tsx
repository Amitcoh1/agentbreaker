import { redirect } from "next/navigation";

// "/" now belongs to the separate marketing app; this project is the dashboard. Send root to it.
export default function RootPage() {
  redirect("/dashboard");
}
