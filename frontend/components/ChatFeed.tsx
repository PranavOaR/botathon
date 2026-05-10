'use client';

import { forwardRef, type ReactNode } from 'react';

interface ChatFeedProps {
  children: ReactNode;
}

const ChatFeed = forwardRef<HTMLDivElement, ChatFeedProps>(function ChatFeed(
  { children },
  ref,
) {
  return (
    <div className="chat-feed" ref={ref}>
      <div className="chat-feed__inner">{children}</div>
    </div>
  );
});

export default ChatFeed;
