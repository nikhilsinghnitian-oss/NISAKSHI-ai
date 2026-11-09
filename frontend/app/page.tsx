import { auth } from "@/auth";
import { redirect } from "next/navigation";
import CinematicLanding from "./components/CinematicLanding";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const session = await auth();
  if (session) redirect("/chat");

  return <CinematicLanding />;
}
