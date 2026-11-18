import type { ReactNode } from 'react';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6">
      {icon && <div className="text-text-faint mb-4">{icon}</div>}
      <h3 className="font-display text-[19px] font-extrabold tracking-[-0.03em] text-text">{title}</h3>
      {description && <p className="mt-2 max-w-[34ch] text-[15px] leading-relaxed text-text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
