import { cn } from "@/lib/utils";

interface ChipButtonProps {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "navigation";
}

export function ChipButton({
  label,
  icon,
  onClick,
  variant = "default",
}: ChipButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150 ease-in-out",
        variant === "default" &&
          "border-gray-300 text-gray-700 hover:border-[#E3000F] hover:bg-red-50 hover:text-[#E3000F]",
        variant === "navigation" &&
          "border-gray-300 text-gray-500 hover:border-gray-400 hover:bg-gray-50"
      )}
    >
      {icon && <span className="size-3.5">{icon}</span>}
      {label}
    </button>
  );
}
