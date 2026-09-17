import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  const primaryEmail = user?.primaryEmailAddress?.emailAddress;

  if (primaryEmail !== "farhanahmad2106@gmail.com") {
    // Redirect non-admins back to the main user dashboard
    redirect("/");
  }

  // Render the admin page content if authorized
  return <>{children}</>;
}
