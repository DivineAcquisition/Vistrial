"use client";

import { Avatar } from "@/components/ui/heroui-avatar";

const PORTRAITS = {
  extraLarge:
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&h=200&q=80",
  square:
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&h=200&q=80",
  gradient:
    "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=200&h=200&q=80",
  online:
    "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&h=200&q=80",
};

export default function AvatarCustomStylesDemo() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center overflow-hidden bg-background p-8">
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          <Avatar.Image alt="Extra Large" src={PORTRAITS.extraLarge} />
          <Avatar.Fallback>XL</Avatar.Fallback>
        </Avatar>
        <Avatar className="rounded-lg">
          <Avatar.Image alt="Square Avatar" src={PORTRAITS.square} />
          <Avatar.Fallback>SQ</Avatar.Fallback>
        </Avatar>
        <Avatar className="bg-gradient-to-tr from-pink-500 to-yellow-500 p-0.5">
          <div className="relative size-full rounded-full bg-background p-0.5">
            <Avatar.Image alt="Gradient Border" className="rounded-full" src={PORTRAITS.gradient} />
          </div>
          <Avatar.Fallback>GB</Avatar.Fallback>
        </Avatar>
        <div className="relative">
          <Avatar>
            <Avatar.Image alt="Online User" src={PORTRAITS.online} />
            <Avatar.Fallback>ON</Avatar.Fallback>
          </Avatar>
          <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-background bg-emerald-500" />
        </div>
      </div>
    </div>
  );
}

export { AvatarCustomStylesDemo };
