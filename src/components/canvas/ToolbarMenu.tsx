"use client";

import type { ReactNode, ElementType } from "react";
import type { ButtonProps } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

function Root({ children }: { children: ReactNode }) {
  return <DropdownMenu>{children}</DropdownMenu>;
}

interface TriggerProps {
  icon?: ElementType<{ className?: string }>;
  label: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}

function Trigger({ icon: Icon, label, variant = "secondary", size = "sm" }: TriggerProps) {
  return (
    <DropdownMenuTrigger asChild>
      <Button variant={variant} size={size}>
        {Icon ? <Icon className="h-4 w-4 mr-1.5" /> : null}
        {label}
      </Button>
    </DropdownMenuTrigger>
  );
}

interface ContentProps {
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}

function Content({ children, align = "end", className = "w-56" }: ContentProps) {
  return (
    <DropdownMenuContent align={align} className={className}>
      {children}
    </DropdownMenuContent>
  );
}

export const ToolbarMenu = {
  Root,
  Trigger,
  Content,
  Item: DropdownMenuItem,
  Label: DropdownMenuLabel,
  Separator: DropdownMenuSeparator,
};
