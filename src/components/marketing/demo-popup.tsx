'use client';

// ============================================
// DEMO BOOKING POPUP
// iClosed calendar widget in a modal
// ============================================

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RiCloseLine, RiCalendarLine } from '@remixicon/react';

interface DemoPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DemoPopup({ isOpen, onClose }: DemoPopupProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (isOpen && !isLoaded) {
      // Load the iClosed widget script
      const script = document.createElement('script');
      script.src = 'https://app.iclosed.io/assets/widget.js';
      script.async = true;
      script.onload = () => setIsLoaded(true);
      document.body.appendChild(script);

      return () => {
        // Cleanup script on unmount
        const existingScript = document.querySelector('script[src="https://app.iclosed.io/assets/widget.js"]');
        if (existingScript) {
          existingScript.remove();
        }
      };
    }
  }, [isOpen, isLoaded]);

  // Prevent body scroll when popup is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-3xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-brand-50 to-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
              <RiCalendarLine className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Book a Demo</h2>
              <p className="text-sm text-gray-500">See how Vistrial can grow your business</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900"
          >
            <RiCloseLine className="h-5 w-5" />
          </Button>
        </div>

        {/* iClosed Widget Container */}
        <div className="p-0">
          <div
            className="iclosed-widget"
            data-url="https://app.iclosed.io/e/vistrial/vistrial-demo"
            title="Vistrial Demo"
            style={{ width: '100%', height: '620px' }}
          />
        </div>
      </div>
    </div>
  );
}

// Hook for managing demo popup state
export function useDemoPopup() {
  const [isOpen, setIsOpen] = useState(false);

  const openDemoPopup = () => setIsOpen(true);
  const closeDemoPopup = () => setIsOpen(false);

  return {
    isOpen,
    openDemoPopup,
    closeDemoPopup,
  };
}

// Button component that opens the demo popup
interface DemoButtonProps {
  children?: React.ReactNode;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'xl' | 'icon';
  className?: string;
}

export function DemoButton({
  children = 'Book a Demo',
  variant = 'outline',
  size = 'default',
  className,
}: DemoButtonProps) {
  const { isOpen, openDemoPopup, closeDemoPopup } = useDemoPopup();

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={openDemoPopup}>
        {children}
      </Button>
      <DemoPopup isOpen={isOpen} onClose={closeDemoPopup} />
    </>
  );
}
