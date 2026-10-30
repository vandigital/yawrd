export default function YawrdNotFound() {
  return <main className="flex min-h-screen items-center justify-center bg-[#0d1716] px-5 py-16 text-[#e9f1ee]">
    <div className="w-full max-w-lg rounded-[24px] border border-[#5b918c]/35 bg-[#162521] p-6 sm:p-10">
      <p className="text-xs font-semibold text-[#c2dedd]">Yawrd · Public preview</p>
      <h1 className="mt-4 text-3xl font-medium tracking-tight text-white">Yawrd not found</h1>
      <p className="mt-4 text-sm leading-7 text-[#bed1c9]">There is no public preview for this project address. Check the link or explore the example Yawrd.</p>
      <a href="/yawrd/the-common-table" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[#c2dedd] px-5 py-3 text-sm font-semibold text-[#10211f] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c2dedd]">Explore the example</a>
    </div>
  </main>;
}
