import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain } from "viem";
export const hederaTestnet = defineChain({ id: 296, name: "Hedera Testnet", nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 8 }, rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_HEDERA_RPC ?? "https://testnet.hashio.io/api"] }, public: { http: [process.env.NEXT_PUBLIC_HEDERA_RPC ?? "https://testnet.hashio.io/api"] } }, blockExplorers: { default: { name: "HashScan", url: "https://hashscan.io/testnet" } }, testnet: true });
export const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "vestra-local-development";
export const wagmiAdapter = new WagmiAdapter({ projectId, networks: [hederaTestnet], ssr: false });
