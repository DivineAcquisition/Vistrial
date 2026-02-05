'use client';

// ============================================
// STATS COUNTER
// Animated statistics
// ============================================

import { useEffect, useState, useRef } from 'react';

interface Stat {
  value: number;
  suffix: string;
  label: string;
}

const stats: Stat[] = [
  { value: 2.4, suffix: 'M+', label: 'Messages Sent' },
  { value: 47, suffix: 'K+', label: 'Leads Reactivated' },
  { value: 8.2, suffix: 'M', label: 'Revenue Generated' },
  { value: 94, suffix: '%', label: 'Customer Satisfaction' },
];

export function StatsCounter() {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="grid grid-cols-2 md:grid-cols-4 gap-8">
      {stats.map((stat, index) => (
        <div key={index} className="text-center">
          <div className="text-4xl md:text-5xl font-bold mb-2">
            {isVisible ? (
              <CountUp value={stat.value} suffix={stat.suffix} />
            ) : (
              `0${stat.suffix}`
            )}
          </div>
          <div className="text-white/70">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

function CountUp({ value, suffix }: { value: number; suffix: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const increment = value / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(current);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  const displayValue = value >= 1 ? count.toFixed(1) : count.toFixed(0);

  return (
    <>
      {suffix.startsWith('$') ? '$' : ''}
      {displayValue}
      {suffix.replace('$', '')}
    </>
  );
}
