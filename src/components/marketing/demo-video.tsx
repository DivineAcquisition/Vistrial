'use client';

// ============================================
// DEMO VIDEO
// Video player component
// ============================================

import { useState } from 'react';
import { Play } from 'lucide-react';

export function DemoVideo() {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="relative rounded-2xl overflow-hidden shadow-2xl bg-gray-900 aspect-video">
        {!isPlaying ? (
          <>
            {/* Thumbnail */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-900/50 to-blue-600/50" />
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={() => setIsPlaying(true)}
                className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors group"
              >
                <Play className="h-8 w-8 text-blue-600 ml-1 group-hover:scale-110 transition-transform" />
              </button>
            </div>
            <div className="absolute bottom-6 left-6 right-6">
              <p className="text-white font-medium">
                Watch: How to generate $8,000+ from your dormant customer database
              </p>
              <p className="text-white/70 text-sm">2 minutes • No signup required</p>
            </div>
          </>
        ) : (
          <iframe
            src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1"
            title="Vistrial Demo"
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        )}
      </div>
    </div>
  );
}
