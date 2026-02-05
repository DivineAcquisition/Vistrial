'use client';

// ============================================
// TESTIMONIAL CAROUSEL
// Customer testimonials
// ============================================

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, ChevronLeft, ChevronRight, Quote } from 'lucide-react';

const testimonials = [
  {
    name: 'Mike Thompson',
    business: 'Thompson Cleaning Services',
    location: 'Austin, TX',
    quote:
      "I had 2,400 past customers sitting in a spreadsheet doing nothing. First Vistrial campaign brought back 67 of them. That's over $15,000 in revenue from customers I'd basically forgotten about.",
    metric: '$15,200 revenue from first campaign',
    rating: 5,
  },
  {
    name: 'Sarah Chen',
    business: 'Pristine Home Services',
    location: 'Denver, CO',
    quote:
      "We used to spend $400-500 per new customer on Thumbtack. Now I just run a reactivation campaign when things slow down. My cost per booking went from $450 to about $12.",
    metric: '97% reduction in customer acquisition cost',
    rating: 5,
  },
  {
    name: 'James Rodriguez',
    business: 'Rodriguez HVAC',
    location: 'Phoenix, AZ',
    quote:
      "The voice drops are a game changer. People actually listen to them. Had a customer tell me 'I got your voicemail and figured it was time for my annual tune-up.' That's exactly what we want.",
    metric: '23% response rate on voice campaigns',
    rating: 5,
  },
  {
    name: 'Amanda Foster',
    business: 'Sparkle Squad Maids',
    location: 'Charlotte, NC',
    quote:
      "Setup took maybe 15 minutes. Uploaded my list, picked a template, and hit go. By the end of the week I had 12 new bookings. I'm not technical at all and I figured it out immediately.",
    metric: '12 bookings in first week',
    rating: 5,
  },
];

export function TestimonialCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);

  const next = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  };

  const prev = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  return (
    <div className="relative">
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {testimonials.map((testimonial, index) => (
            <div key={index} className="w-full flex-shrink-0 px-4">
              <Card className="max-w-3xl mx-auto">
                <CardContent className="pt-8 pb-8">
                  <Quote className="h-10 w-10 text-blue-200 mb-4" />
                  
                  <p className="text-xl mb-6 text-foreground leading-relaxed">
                    &ldquo;{testimonial.quote}&rdquo;
                  </p>

                  <div className="flex items-center gap-1 mb-4">
                    {Array.from({ length: testimonial.rating }).map((_, i) => (
                      <Star
                        key={i}
                        className="h-5 w-5 fill-yellow-400 text-yellow-400"
                      />
                    ))}
                  </div>

                  <div className="bg-green-50 text-green-700 rounded-lg px-4 py-2 inline-block mb-6 font-medium">
                    {testimonial.metric}
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
                      {testimonial.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold">{testimonial.name}</p>
                      <p className="text-muted-foreground text-sm">
                        {testimonial.business}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {testimonial.location}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-4 mt-8">
        <Button variant="outline" size="icon" onClick={prev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex gap-2">
          {testimonials.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentIndex ? 'bg-blue-600' : 'bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>

        <Button variant="outline" size="icon" onClick={next}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
