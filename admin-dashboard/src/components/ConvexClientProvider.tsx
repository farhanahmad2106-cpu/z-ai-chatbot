"use client";

import { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ConvexProviderWithClerk 
      client={convex} 
      // @ts-expect-error - Clerk v5 UseAuth type mismatch with convex/react-clerk
      useAuth={useAuth}
    >
      {children}
    </ConvexProviderWithClerk>
  );
}
