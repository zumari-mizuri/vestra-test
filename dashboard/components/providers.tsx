"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit/react";
import { WagmiProvider } from "wagmi";
import { wagmiAdapter, hederaTestnet, projectId } from "@/lib/wallet";
import { useState, type ReactNode } from "react";
createAppKit({
  adapters: [wagmiAdapter],
  networks: [hederaTestnet],
  projectId,
  metadata: {
    name: "Vestra",
    description: "Vestra RWA receipt dashboard",
    url: "http://localhost:3000",
    icons: [],
  },
  features: { analytics: false },
});
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
