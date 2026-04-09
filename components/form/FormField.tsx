"use client";

import { ReactElement } from "react";
import {
  FieldValues,
  Path,
  UseFormReturn,
  ControllerRenderProps,
  Controller,
} from "react-hook-form";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: string;
  required?: boolean;
  className?: string;
  children: (field: ControllerRenderProps<T, Path<T>>) => ReactElement;
}

export function FormField<T extends FieldValues>({
  form,
  name,
  label,
  required,
  className,
  children,
}: FormFieldProps<T>) {
  const error = form.formState.errors[name];

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={name}>
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </Label>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => children(field)}
      />
      {error && (
        <p className="text-xs text-red-600">{error.message as string}</p>
      )}
    </div>
  );
}
