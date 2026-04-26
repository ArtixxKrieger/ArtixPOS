import { Building2, Check, ChevronDown, Globe } from "lucide-react";
import { useState } from "react";
import { useBranches, useSwitchBranch } from "@/hooks/use-admin";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function BranchSwitcher({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const { data: branches = [] } = useBranches();
  const switchBranch = useSwitchBranch();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  if (!user || user.role !== "owner") return null;
  if (!branches || branches.length < 2) return null;

  const activeId = user.activeBranchId ?? null;
  const activeBranch = branches.find((b) => b.id === activeId);
  const label = activeBranch ? activeBranch.name : "All Branches";

  const handleSwitch = async (branchId: number | null) => {
    if (branchId === activeId) {
      setOpen(false);
      return;
    }
    try {
      await switchBranch.mutateAsync(branchId);
      toast({
        title: branchId === null ? "Viewing all branches" : `Switched to ${branches.find((b) => b.id === branchId)?.name}`,
      });
      setOpen(false);
      // Hard refresh to ensure all queries refetch with the new active branch.
      setTimeout(() => window.location.reload(), 150);
    } catch (err: any) {
      toast({
        title: "Could not switch branch",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="button-branch-switcher"
          className={[
            "flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/60 transition-all",
            compact
              ? "px-2.5 py-1.5 text-[11px] font-medium"
              : "w-full px-3 py-2 text-[12px] font-medium",
          ].join(" ")}
        >
          {activeBranch ? (
            <Building2 className="h-3.5 w-3.5 shrink-0 text-violet-500" />
          ) : (
            <Globe className="h-3.5 w-3.5 shrink-0 text-violet-500" />
          )}
          <span className="flex-1 text-left truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56" data-testid="menu-branch-switcher">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Viewing
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => handleSwitch(null)}
          data-testid="branch-option-all"
          className="flex items-center gap-2 cursor-pointer"
        >
          <Globe className="h-3.5 w-3.5 shrink-0 text-violet-500" />
          <span className="flex-1">All Branches</span>
          {activeId === null && <Check className="h-3.5 w-3.5 text-violet-500" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {branches.map((b) => (
          <DropdownMenuItem
            key={b.id}
            onClick={() => handleSwitch(b.id)}
            data-testid={`branch-option-${b.id}`}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Building2 className="h-3.5 w-3.5 shrink-0 text-violet-500" />
            <span className="flex-1 truncate">{b.name}</span>
            {b.isMain && (
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">main</span>
            )}
            {activeId === b.id && <Check className="h-3.5 w-3.5 text-violet-500" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
