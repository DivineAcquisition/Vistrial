'use client';

// ============================================
// STATS COUNTER
// Animated statistics display
// ============================================

import { useEffect, useState, useRef } from 'react';

interface Stat {
  value: number;
  suffix: string;
  label: string;
}

const stats: Stat[] = [
  { value: 847, suffix: 'K+', label: 'Messages Delivered' },
  { value: 15, suffix: '%', label: 'Average Response Rate' },
  { value: 2.4, suffix: 'M', label: 'Revenue Generated' },
  { value: 98, suffix: '%', label: 'Customer Satisfaction' },
];

function AnimatedNumber({
  value,
  suffix,
}: {
  value: number;
  suffix: string;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          const duration = 2000;
          const steps = 60;
          const increment = value / steps;
          let current = 0;

          const timer = setInterval(() => {
            current += increment;
            if (current >= value) {
              setDisplay(value);
              clearInterval(timer);
            } else {
              setDisplay(current);
            }
          }, duration / steps);
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [value, hasAnimated]);

  return (
    <div ref={ref} className="text-4xl sm:text-5xl font-bold text-white">
      {value === Math.floor(value) ? Math.floor(display) : display.toFixed(1)}
      {suffix}
    </div>
  );
}

export function StatsCounter() {
  return (
    <div className="text-center">
      <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-white">
        Trusted by home service businesses nationwide
      </h2>
      <p className="text-white/70 mb-12 max-w-2xl mx-auto">
        Join hundreds of cleaning, HVAC, plumbing, and landscaping companies already using Vistrial to reactivate their customer base.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
        {stats.map((stat) => (
          <div key={stat.label}>
            <AnimatedNumber value={stat.value} suffix={stat.suffix} />
            <p className="text-white/70 mt-2">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
