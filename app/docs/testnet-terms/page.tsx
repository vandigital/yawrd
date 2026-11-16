export const metadata = { title: "Provisional Testnet Terms of Service · Yawrd" };

export default function TestnetTerms() {
  return <article className="max-w-3xl space-y-6 text-sm leading-7 text-[#bed1c9]">
    <p className="text-[#8fe5d9]">Experimental Testnet · Provisional placeholder</p>
    <h1 className="text-3xl font-medium text-white">Yawrd Testnet Terms of Service</h1>
    <p>These provisional terms explain this testing experience. They have not been legally finalized, do not establish completed legal compliance and are not ready for Mainnet use.</p>
    <section><h2 className="text-xl text-white">Testing can fail</h2><p>Yawrd is experimental Testnet software. Features may fail, change or become unavailable. Drafts and testing data may be lost or reset. Use test accounts and Testnet tokens; do not rely on this flow for valuable assets or essential work.</p></section>
    <section><h2 className="text-xl text-white">No real-money rewards</h2><p>Real-money rewards are not being offered through this Testnet creation flow. Testnet balances and simulated rewards are for testing and are not a promise of payment.</p></section>
    <section><h2 className="text-xl text-white">Your wallet approvals</h2><p>Connecting a wallet and saving a draft intake do not initiate payment. Signing in asks you to approve an off-chain identity message. It costs no gas and grants no permission to spend Project Funds. Later deployment requires separate review and explicit wallet approval of network costs. Exact network deployment costs and any Yawrd setup fee will be confirmed before deployment. Reward funding is separate.</p></section>
    <section><h2 className="text-xl text-white">Consent during this test</h2><p>The checkbox records agreement only in the current browser experience; it is not a durable, wallet-associated consent record. Auditable, versioned consent and legal review are required before Mainnet.</p></section>
    <a href="/create" className="inline-flex min-h-11 items-center text-[#a9f1e9] underline">Return to Open a Yawrd</a>
  </article>;
}
