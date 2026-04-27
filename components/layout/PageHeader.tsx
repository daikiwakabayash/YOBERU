import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 border-b bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-gray-900 sm:text-xl">{title}</h1>
        {description && (
          <p className="mt-0.5 text-xs text-gray-500 sm:mt-1 sm:text-sm">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          {actions}
        </div>
      )}
    </div>
  );
}
