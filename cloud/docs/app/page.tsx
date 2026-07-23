import { redirect } from "next/navigation";

// This project only serves docs; send the root to the docs index.
export default function Home() {
  redirect("/docs");
}
