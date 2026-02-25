export function AuthBrandPanel() {
  return (
    <div className="relative hidden h-full overflow-hidden bg-gradient-to-br from-[oklch(0.18_0.04_260)] via-[oklch(0.14_0.03_250)] to-[oklch(0.12_0.05_270)] lg:flex lg:flex-col lg:items-center lg:justify-center">
      {/* Floating decorative shapes */}
      <div className="pointer-events-none absolute inset-0">
        {/* Top-left cube cluster */}
        <div className="float-slow absolute left-[8%] top-[10%] h-16 w-16 rotate-12 rounded-xl bg-gradient-to-br from-blue-500/30 to-blue-700/20 backdrop-blur-sm" />
        <div className="float-medium absolute left-[15%] top-[6%] h-10 w-10 rotate-45 rounded-lg bg-gradient-to-br from-blue-400/25 to-cyan-500/15" />
        <div className="float-slow absolute left-[4%] top-[22%] h-8 w-8 rounded-full bg-blue-500/20" />

        {/* Top-right shapes */}
        <div className="float-medium absolute right-[10%] top-[8%] h-14 w-14 -rotate-12 rounded-xl bg-gradient-to-br from-indigo-500/25 to-purple-600/15 backdrop-blur-sm" />
        <div className="float-slow absolute right-[20%] top-[15%] h-8 w-8 rotate-45 rounded-lg bg-gradient-to-br from-blue-400/20 to-blue-600/10" />

        {/* Bottom-left shapes */}
        <div className="float-medium absolute bottom-[15%] left-[6%] h-12 w-12 rotate-12 rounded-xl bg-gradient-to-br from-cyan-500/25 to-blue-600/15" />
        <div className="float-slow absolute bottom-[25%] left-[18%] h-6 w-6 rounded-full bg-indigo-400/20" />

        {/* Bottom-right shapes */}
        <div className="float-slow absolute bottom-[10%] right-[8%] h-16 w-16 -rotate-6 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-600/15 backdrop-blur-sm" />
        <div className="float-medium absolute bottom-[22%] right-[18%] h-10 w-10 rotate-45 rounded-lg bg-gradient-to-br from-cyan-400/20 to-blue-500/10" />

        {/* Center scattered small dots */}
        <div className="float-slow absolute left-[35%] top-[35%] h-3 w-3 rounded-full bg-blue-400/25" />
        <div className="float-medium absolute right-[30%] top-[45%] h-4 w-4 rounded-full bg-cyan-400/20" />
        <div className="float-slow absolute left-[25%] bottom-[35%] h-3 w-3 rounded-full bg-indigo-400/15" />

        {/* Connecting lines / subtle grid */}
        <div className="absolute left-[20%] top-[40%] h-px w-32 rotate-[30deg] bg-gradient-to-r from-transparent via-blue-400/10 to-transparent" />
        <div className="absolute right-[25%] bottom-[40%] h-px w-28 -rotate-[20deg] bg-gradient-to-r from-transparent via-blue-400/10 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center px-8 text-center">
        {/* AI Brain Logo */}
        <div className="mb-8">
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Speech bubble shape */}
            <path
              d="M60 15C33 15 15 33 15 55C15 70 23 82 36 89L32 105L50 95C53 96 56 96 60 96C87 96 105 78 105 55C105 33 87 15 60 15Z"
              fill="oklch(0.22 0.04 260)"
              stroke="oklch(0.5 0.15 250)"
              strokeWidth="1.5"
            />
            {/* AI text */}
            <text
              x="60"
              y="62"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="oklch(0.7 0.18 250)"
              fontSize="28"
              fontWeight="700"
              fontFamily="system-ui, sans-serif"
            >
              AI
            </text>
            {/* Circuit dots around the bubble */}
            <circle cx="28" cy="30" r="3" fill="oklch(0.5 0.15 250)" opacity="0.6" />
            <circle cx="92" cy="30" r="3" fill="oklch(0.5 0.15 250)" opacity="0.6" />
            <circle cx="20" cy="60" r="2.5" fill="oklch(0.5 0.15 250)" opacity="0.4" />
            <circle cx="100" cy="60" r="2.5" fill="oklch(0.5 0.15 250)" opacity="0.4" />
            <circle cx="35" cy="95" r="2" fill="oklch(0.5 0.15 250)" opacity="0.3" />
            <circle cx="85" cy="90" r="2" fill="oklch(0.5 0.15 250)" opacity="0.3" />
            {/* Circuit lines */}
            <line x1="28" y1="33" x2="35" y2="40" stroke="oklch(0.5 0.15 250)" strokeWidth="0.8" opacity="0.3" />
            <line x1="92" y1="33" x2="85" y2="40" stroke="oklch(0.5 0.15 250)" strokeWidth="0.8" opacity="0.3" />
          </svg>
        </div>

        <h1 className="text-4xl font-bold tracking-tight text-white">
          Arinova Chat
        </h1>
        <p className="mt-3 text-lg text-blue-200/70">
          Start Your AI Journey Today
        </p>
      </div>
    </div>
  );
}
