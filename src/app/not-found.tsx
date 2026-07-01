import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex-1 flex flex-col items-center justify-center bg-slate-950 text-center px-6">
      <p className="font-mono text-xs tracking-[0.3em] text-violet-400 mb-6 uppercase">
        Sotto
      </p>
      <h1 className="text-8xl md:text-9xl font-extrabold text-transparent bg-clip-text bg-linear-to-b from-white to-slate-600 leading-none">
        404
      </h1>
      <p className="text-slate-400 mt-6 mb-10 max-w-md">
        This page was sealed away — the route you&rsquo;re looking for
        doesn&rsquo;t exist or has moved.
      </p>
      <Link
        href="/"
        className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all"
      >
        Back to the Auction Console
      </Link>
    </main>
  );
}
